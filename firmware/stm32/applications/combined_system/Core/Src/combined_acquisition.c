#include "combined_acquisition.h"
#include "main.h"

#include <string.h>

extern SPI_HandleTypeDef hspi1;
extern SPI_HandleTypeDef hspi2;
extern SPI_HandleTypeDef hspi3;
extern void Combined_ReinitializeHostSPI(void);

#define FSR_ROWS 16U
#define FSR_COLS 16U
#define ACC_COUNT 9U

#define MAX11633_RESET_ALL 0x10U
#define MAX11633_SETUP 0x64U
#define MAX11633_SCAN_0_TO_15 0xF8U
#define ADC_TIMEOUT_MS 5U
#define FSR_MUX_SETTLE_US 100U

#define ACC_WHO_REG 0x0FU
#define ACC_WHO_EXPECTED 0x33U
#define ACC_CTRL1_REG 0x20U
#define ACC_CTRL4_REG 0x23U
#define ACC_OUT_X_L_REG 0x28U
#define ACC_CTRL1_VALUE 0x57U
#define ACC_CTRL4_VALUE 0x88U
#define ACC_READ 0x80U
#define ACC_INCREMENT 0x40U
#define ACC_TIMEOUT_MS 10U
#define ACC_HEALTH_SLOT_MS 100U

#define COMBINED_MAGIC_0 0x45U /* E */
#define COMBINED_MAGIC_1 0x53U /* S */
#define COMBINED_MAGIC_2 0x4BU /* K */
#define COMBINED_MAGIC_3 0x31U /* 1 */
#define COMBINED_VERSION 1U
#define HEADER_BYTES 16U
#define FSR_BYTES (FSR_ROWS * FSR_COLS * 2U)
#define ACC_RECORD_BYTES 16U
#define ACC_BYTES (ACC_COUNT * ACC_RECORD_BYTES)
#define CRC_BYTES 4U
#define COMBINED_FRAME_BYTES (HEADER_BYTES + (2U * FSR_BYTES) + ACC_BYTES + CRC_BYTES)
#define HOST_TIMEOUT_MS 1500U

enum
{
  ACC_STATUS_OK = 0U,
  ACC_STATUS_BAD_ID = 1U,
  ACC_STATUS_SPI_ERROR = 2U,
  ACC_STATUS_CONFIG_ERROR = 3U,
  ACC_STATUS_DATA_ERROR = 4U
};

typedef struct
{
  uint8_t who;
  uint8_t status;
  int16_t x;
  int16_t y;
  int16_t z;
  uint8_t ctrl1;
  uint8_t ctrl4;
  uint16_t spi_error;
  uint8_t idle_miso;
  uint8_t command_rx;
  uint8_t ready;
} AccSample;

static uint16_t fsr1[FSR_ROWS][FSR_COLS];
static uint16_t fsr2[FSR_ROWS][FSR_COLS];
static AccSample acc[ACC_COUNT];
static uint8_t host_tx[COMBINED_FRAME_BYTES];
static uint8_t host_rx[COMBINED_FRAME_BYTES];
static uint32_t sequence;
static uint32_t last_acc_health_ms;
static uint8_t acc_health_cursor;

static void delay_us(uint32_t microseconds)
{
  const uint32_t cycles_per_us = SystemCoreClock / 1000000U;
  const uint32_t cycles = cycles_per_us * microseconds;
  const uint32_t started = DWT->CYCCNT;
  while ((DWT->CYCCNT - started) < cycles) { __NOP(); }
}

static void delay_us_init(void)
{
  CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
  DWT->CYCCNT = 0U;
  DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
}

static void put_u16(uint8_t *buffer, uint32_t *offset, uint16_t value)
{
  buffer[(*offset)++] = (uint8_t)value;
  buffer[(*offset)++] = (uint8_t)(value >> 8U);
}

static void put_u32(uint8_t *buffer, uint32_t *offset, uint32_t value)
{
  put_u16(buffer, offset, (uint16_t)value);
  put_u16(buffer, offset, (uint16_t)(value >> 16U));
}

static uint32_t crc32_ieee(const uint8_t *data, uint32_t length)
{
  uint32_t crc = 0xFFFFFFFFU;
  for (uint32_t i = 0U; i < length; ++i)
  {
    crc ^= data[i];
    for (uint8_t bit = 0U; bit < 8U; ++bit)
    {
      const uint32_t mask = (uint32_t)-(int32_t)(crc & 1U);
      crc = (crc >> 1U) ^ (0xEDB88320U & mask);
    }
  }
  return ~crc;
}

static void select_mux(uint8_t channel)
{
  HAL_GPIO_WritePin(GPIOA, MUX_S0_Pin,
                    (channel & 0x01U) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOA, MUX_S1_Pin,
                    (channel & 0x02U) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOA, MUX_S2_Pin,
                    (channel & 0x04U) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOA, MUX_S3_Pin,
                    (channel & 0x08U) ? GPIO_PIN_SET : GPIO_PIN_RESET);
}

static HAL_StatusTypeDef adc_init(uint16_t cs_pin)
{
  uint8_t command = MAX11633_RESET_ALL;
  HAL_GPIO_WritePin(GPIOB, cs_pin, GPIO_PIN_RESET);
  HAL_StatusTypeDef status =
      HAL_SPI_Transmit(&hspi1, &command, 1U, ADC_TIMEOUT_MS);
  HAL_GPIO_WritePin(GPIOB, cs_pin, GPIO_PIN_SET);
  if (status != HAL_OK)
  {
    return status;
  }
  HAL_Delay(1U);
  command = MAX11633_SETUP;
  HAL_GPIO_WritePin(GPIOB, cs_pin, GPIO_PIN_RESET);
  status = HAL_SPI_Transmit(&hspi1, &command, 1U, ADC_TIMEOUT_MS);
  HAL_GPIO_WritePin(GPIOB, cs_pin, GPIO_PIN_SET);
  HAL_Delay(1U);
  return status;
}

static HAL_StatusTypeDef adc_read16(uint16_t cs_pin, uint16_t eoc_pin,
                                    uint16_t samples[FSR_COLS])
{
  uint8_t command = MAX11633_SCAN_0_TO_15;
  uint8_t rx[FSR_COLS * 2U] = {0U};
  HAL_GPIO_WritePin(GPIOB, cs_pin, GPIO_PIN_RESET);
  HAL_StatusTypeDef status =
      HAL_SPI_Transmit(&hspi1, &command, 1U, ADC_TIMEOUT_MS);
  HAL_GPIO_WritePin(GPIOB, cs_pin, GPIO_PIN_SET);
  if (status != HAL_OK)
  {
    return status;
  }

  const uint32_t start = HAL_GetTick();
  while (HAL_GPIO_ReadPin(GPIOB, eoc_pin) == GPIO_PIN_SET)
  {
    if ((HAL_GetTick() - start) >= ADC_TIMEOUT_MS)
    {
      return HAL_TIMEOUT;
    }
  }

  HAL_GPIO_WritePin(GPIOB, cs_pin, GPIO_PIN_RESET);
  status = HAL_SPI_Receive(&hspi1, rx, sizeof(rx), ADC_TIMEOUT_MS);
  HAL_GPIO_WritePin(GPIOB, cs_pin, GPIO_PIN_SET);
  if (status != HAL_OK)
  {
    return status;
  }
  for (uint8_t i = 0U; i < FSR_COLS; ++i)
  {
    samples[i] = (uint16_t)((((uint16_t)rx[2U * i] << 8U) |
                             rx[2U * i + 1U]) & 0x0FFFU);
  }
  return HAL_OK;
}

static uint8_t scan_fsr_both(void)
{
  uint16_t values1[FSR_COLS];
  uint16_t values2[FSR_COLS];
  uint8_t fsr1_ok = 1U;
  uint8_t fsr2_ok = 1U;

  /*
   * Both analogue MUXes share the same four address lines but have separate
   * enables and ADCs. Enable both after each address change, wait once, then
   * acquire both arrays. FSR2 keeps its established reversed/transposed map.
   */
  for (uint8_t mux_address = 0U; mux_address < FSR_ROWS; ++mux_address)
  {
    select_mux(mux_address);
    HAL_GPIO_WritePin(GPIOA, MUX_EN1_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, MUX_EN2_Pin, GPIO_PIN_RESET);
    delay_us(FSR_MUX_SETTLE_US);

    HAL_StatusTypeDef status1 = HAL_ERROR;
    HAL_StatusTypeDef status2 = HAL_ERROR;
    if (fsr1_ok != 0U)
    {
      status1 = adc_read16(ADC_CS1_Pin, ADC_EOC1_Pin, values1);
    }
    if (fsr2_ok != 0U)
    {
      status2 = adc_read16(ADC_CS2_Pin, ADC_EOC2_Pin, values2);
    }
    HAL_GPIO_WritePin(GPIOA, MUX_EN1_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(GPIOB, MUX_EN2_Pin, GPIO_PIN_SET);

    if (status1 != HAL_OK)
    {
      fsr1_ok = 0U;
    }
    else
    {
      memcpy(fsr1[mux_address], values1, sizeof(values1));
    }

    if (status2 != HAL_OK)
    {
      fsr2_ok = 0U;
    }
    else
    {
      const uint8_t mux_index = (uint8_t)(15U - mux_address);
      for (uint8_t adc_index = 0U; adc_index < FSR_COLS; ++adc_index)
      {
        fsr2[adc_index][mux_index] = values2[adc_index];
      }
    }
  }

  if (fsr1_ok == 0U) { memset(fsr1, 0, sizeof(fsr1)); }
  if (fsr2_ok == 0U) { memset(fsr2, 0, sizeof(fsr2)); }
  return (uint8_t)((fsr1_ok != 0U ? 0x01U : 0U) |
                   (fsr2_ok != 0U ? 0x02U : 0U));
}

static void acc_deselect(void)
{
  HAL_GPIO_WritePin(ACC_ENABLE_GPIO_Port, ACC_ENABLE_Pin, GPIO_PIN_SET);
}

static void acc_select(uint8_t index)
{
  acc_deselect();
  HAL_GPIO_WritePin(ACC_ADDR0_GPIO_Port, ACC_ADDR0_Pin,
                    (index & 1U) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(ACC_ADDR1_GPIO_Port, ACC_ADDR1_Pin,
                    (index & 2U) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(ACC_ADDR2_GPIO_Port, ACC_ADDR2_Pin,
                    (index & 4U) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(ACC_ADDR3_GPIO_Port, ACC_ADDR3_Pin,
                    (index & 8U) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  for (volatile uint32_t delay = 0U; delay < 64U; ++delay) { __NOP(); }
  HAL_GPIO_WritePin(ACC_ENABLE_GPIO_Port, ACC_ENABLE_Pin, GPIO_PIN_RESET);
  for (volatile uint32_t delay = 0U; delay < 64U; ++delay) { __NOP(); }
}

static HAL_StatusTypeDef acc_transfer(uint8_t index, uint8_t *tx,
                                      uint8_t *rx, uint16_t size)
{
  acc_select(index);
  acc[index].idle_miso =
      (HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_14) == GPIO_PIN_SET) ? 1U : 0U;
  HAL_StatusTypeDef status =
      HAL_SPI_TransmitReceive(&hspi2, tx, rx, size, ACC_TIMEOUT_MS);
  acc[index].command_rx = rx[0];
  acc[index].spi_error = (uint16_t)(HAL_SPI_GetError(&hspi2) & 0xFFFFU);
  acc_deselect();
  return status;
}

static HAL_StatusTypeDef acc_read_reg(uint8_t index, uint8_t reg,
                                      uint8_t *value)
{
  uint8_t tx[2] = {(uint8_t)(ACC_READ | (reg & 0x3FU)), 0U};
  uint8_t rx[2] = {0U};
  HAL_StatusTypeDef status = acc_transfer(index, tx, rx, sizeof(tx));
  if (status == HAL_OK) { *value = rx[1]; }
  return status;
}

static HAL_StatusTypeDef acc_write_reg(uint8_t index, uint8_t reg,
                                       uint8_t value)
{
  uint8_t tx[2] = {(uint8_t)(reg & 0x3FU), value};
  uint8_t rx[2] = {0U};
  return acc_transfer(index, tx, rx, sizeof(tx));
}

static HAL_StatusTypeDef acc_init_one(uint8_t index)
{
  uint8_t identity = 0U;
  acc[index].ready = 0U;
  if (acc_read_reg(index, ACC_WHO_REG, &identity) != HAL_OK)
  {
    acc[index].status = ACC_STATUS_SPI_ERROR;
    return HAL_ERROR;
  }
  acc[index].who = identity;
  if (identity != ACC_WHO_EXPECTED)
  {
    acc[index].status = ACC_STATUS_BAD_ID;
    return HAL_ERROR;
  }
  if ((acc_write_reg(index, ACC_CTRL1_REG, ACC_CTRL1_VALUE) != HAL_OK) ||
      (acc_write_reg(index, ACC_CTRL4_REG, ACC_CTRL4_VALUE) != HAL_OK))
  {
    acc[index].status = ACC_STATUS_CONFIG_ERROR;
    return HAL_ERROR;
  }
  HAL_Delay(2U);
  if ((acc_read_reg(index, ACC_CTRL1_REG, &acc[index].ctrl1) != HAL_OK) ||
      (acc_read_reg(index, ACC_CTRL4_REG, &acc[index].ctrl4) != HAL_OK) ||
      (acc[index].ctrl1 != ACC_CTRL1_VALUE) ||
      (acc[index].ctrl4 != ACC_CTRL4_VALUE))
  {
    acc[index].status = ACC_STATUS_CONFIG_ERROR;
    return HAL_ERROR;
  }
  acc[index].status = ACC_STATUS_OK;
  acc[index].ready = 1U;
  return HAL_OK;
}

static HAL_StatusTypeDef acc_read_axes(uint8_t index)
{
  uint8_t tx[7] = {(uint8_t)(ACC_READ | ACC_INCREMENT | ACC_OUT_X_L_REG),
                   0U, 0U, 0U, 0U, 0U, 0U};
  uint8_t rx[7] = {0U};
  HAL_StatusTypeDef status = acc_transfer(index, tx, rx, sizeof(tx));
  if (status != HAL_OK)
  {
    return status;
  }
  uint8_t all_zero = 1U;
  uint8_t all_ff = 1U;
  for (uint8_t i = 1U; i < 7U; ++i)
  {
    all_zero &= (rx[i] == 0U) ? 1U : 0U;
    all_ff &= (rx[i] == 0xFFU) ? 1U : 0U;
  }
  if ((all_zero != 0U) || (all_ff != 0U))
  {
    return HAL_ERROR;
  }
  acc[index].x = (int16_t)(((int16_t)(((uint16_t)rx[2] << 8U) | rx[1])) >> 4U);
  acc[index].y = (int16_t)(((int16_t)(((uint16_t)rx[4] << 8U) | rx[3])) >> 4U);
  acc[index].z = (int16_t)(((int16_t)(((uint16_t)rx[6] << 8U) | rx[5])) >> 4U);
  return HAL_OK;
}

static void scan_acc(void)
{
  for (uint8_t index = 0U; index < ACC_COUNT; ++index)
  {
    if (acc[index].ready == 0U) { continue; }
    if (acc_read_axes(index) != HAL_OK)
    {
      acc[index].status = ACC_STATUS_DATA_ERROR;
      acc[index].ready = 0U;
      acc[index].x = acc[index].y = acc[index].z = 0;
    }
    else
    {
      acc[index].status = ACC_STATUS_OK;
    }
  }

  /*
   * WHO_AM_I is a health check, not sample data. Check or recover one device
   * every 100 ms so all nine devices are covered in about 0.9 s without
   * paying nine identity transactions on every acquisition frame.
   */
  if ((HAL_GetTick() - last_acc_health_ms) >= ACC_HEALTH_SLOT_MS)
  {
    const uint8_t index = acc_health_cursor;
    if (acc[index].ready == 0U)
    {
      (void)acc_init_one(index);
    }
    else
    {
      uint8_t identity = 0U;
      if ((acc_read_reg(index, ACC_WHO_REG, &identity) != HAL_OK) ||
          (identity != ACC_WHO_EXPECTED))
      {
        acc[index].who = identity;
        acc[index].status = (identity == ACC_WHO_EXPECTED) ?
                            ACC_STATUS_SPI_ERROR : ACC_STATUS_BAD_ID;
        acc[index].ready = 0U;
        acc[index].x = acc[index].y = acc[index].z = 0;
      }
    }
    acc_health_cursor = (uint8_t)((index + 1U) % ACC_COUNT);
    last_acc_health_ms = HAL_GetTick();
  }
}

static void pack_frame(uint8_t flags)
{
  uint32_t offset = 0U;
  host_tx[offset++] = COMBINED_MAGIC_0;
  host_tx[offset++] = COMBINED_MAGIC_1;
  host_tx[offset++] = COMBINED_MAGIC_2;
  host_tx[offset++] = COMBINED_MAGIC_3;
  host_tx[offset++] = COMBINED_VERSION;
  host_tx[offset++] = flags;
  put_u16(host_tx, &offset, COMBINED_FRAME_BYTES);
  put_u32(host_tx, &offset, sequence++);
  put_u32(host_tx, &offset, HAL_GetTick());

  for (uint8_t row = 0U; row < FSR_ROWS; ++row)
    for (uint8_t col = 0U; col < FSR_COLS; ++col)
      put_u16(host_tx, &offset, fsr1[row][col]);
  for (uint8_t row = 0U; row < FSR_ROWS; ++row)
    for (uint8_t col = 0U; col < FSR_COLS; ++col)
      put_u16(host_tx, &offset, fsr2[row][col]);

  for (uint8_t i = 0U; i < ACC_COUNT; ++i)
  {
    host_tx[offset++] = acc[i].who;
    host_tx[offset++] = acc[i].status;
    put_u16(host_tx, &offset, (uint16_t)acc[i].x);
    put_u16(host_tx, &offset, (uint16_t)acc[i].y);
    put_u16(host_tx, &offset, (uint16_t)acc[i].z);
    host_tx[offset++] = acc[i].ctrl1;
    host_tx[offset++] = acc[i].ctrl4;
    put_u16(host_tx, &offset, acc[i].spi_error);
    host_tx[offset++] = acc[i].idle_miso;
    host_tx[offset++] = acc[i].command_rx;
    host_tx[offset++] = 0U;
    host_tx[offset++] = 0U;
  }
  const uint32_t crc = crc32_ieee(host_tx, offset);
  put_u32(host_tx, &offset, crc);
}

static HAL_StatusTypeDef send_frame(void)
{
  /*
   * A repeated two-byte prefix before ESK1 showed that SPI3 retained stale TX
   * state between slave transactions. Reset the peripheral before publishing
   * HOST_IRQ so the first master clock always shifts host_tx[0].
   */
  (void)HAL_SPI_Abort(&hspi3);
  Combined_ReinitializeHostSPI();
  HAL_GPIO_WritePin(GPIOB, HOST_IRQ_Pin, GPIO_PIN_SET);
  HAL_StatusTypeDef status = HAL_SPI_TransmitReceive(
      &hspi3, host_tx, host_rx, COMBINED_FRAME_BYTES, HOST_TIMEOUT_MS);
  HAL_GPIO_WritePin(GPIOB, HOST_IRQ_Pin, GPIO_PIN_RESET);
  return status;
}

void CombinedAcquisition_Init(void)
{
  GPIO_InitTypeDef gpio = {0};
  delay_us_init();
  HAL_GPIO_WritePin(GPIOA, MUX_EN1_Pin, GPIO_PIN_SET);
  HAL_GPIO_WritePin(GPIOB, ADC_CS1_Pin | ADC_CS2_Pin | MUX_EN2_Pin,
                    GPIO_PIN_SET);
  HAL_GPIO_WritePin(GPIOB, HOST_IRQ_Pin, GPIO_PIN_RESET);

  gpio.Pin = ADC_CS2_Pin | MUX_EN2_Pin;
  gpio.Mode = GPIO_MODE_OUTPUT_PP;
  gpio.Pull = GPIO_NOPULL;
  gpio.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOB, &gpio);
  gpio.Pin = ADC_EOC2_Pin;
  gpio.Mode = GPIO_MODE_INPUT;
  HAL_GPIO_Init(GPIOB, &gpio);

  acc_deselect();
  (void)adc_init(ADC_CS1_Pin);
  (void)adc_init(ADC_CS2_Pin);
  HAL_Delay(1000U);
  memset(acc, 0, sizeof(acc));
  for (uint8_t i = 0U; i < ACC_COUNT; ++i)
  {
    (void)acc_init_one(i);
  }
  last_acc_health_ms = HAL_GetTick();
}

void CombinedAcquisition_RunOnce(void)
{
  uint8_t flags = scan_fsr_both();
  scan_acc();
  flags |= 0x04U;
  pack_frame(flags);
  if (send_frame() != HAL_OK)
  {
    HAL_GPIO_WritePin(GPIOB, HOST_IRQ_Pin, GPIO_PIN_RESET);
    (void)HAL_SPI_Abort(&hspi3);
    Combined_ReinitializeHostSPI();
    HAL_Delay(10U);
  }
}
