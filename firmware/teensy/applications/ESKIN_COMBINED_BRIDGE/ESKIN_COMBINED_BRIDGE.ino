/* E-SKIN combined FSR1 + FSR2 + 9-ACC bridge for Teensy 4.1. */
#include <Arduino.h>
#include <SPI.h>

constexpr uint8_t STM32_CS_PIN = 10;
constexpr uint8_t STM32_IRQ_PIN = 2;
constexpr uint32_t USB_BAUD = 2000000;
// Isolation fallback after the 1 MHz/short-setup trial produced no valid LED.
// Keep STM32 acquisition optimizations active while returning only the Host
// link to the last known stable timing. Re-test faster values one step at a
// time after valid CRC frames are restored.
constexpr uint32_t SPI_HZ = 100000;
constexpr uint32_t IRQ_SETTLE_US = 1000;
constexpr uint32_t CS_SETUP_US = 1000;
constexpr uint32_t CS_HOLD_US = 100;
constexpr uint32_t IRQ_RELEASE_TIMEOUT_MS = 1500;
constexpr size_t FRAME_BYTES = 1188;
constexpr size_t MAX_PREFIX_BYTES = 8;
constexpr uint8_t MAGIC[4] = {0x45, 0x53, 0x4B, 0x31};

uint8_t frame[FRAME_BYTES];

enum class FrameResult : uint8_t {
  Ok,
  BadMagic,
  BadHeader,
  BadCrc,
  UsbUnavailable,
  UsbShortWrite,
  Count
};

uint32_t resultCounts[static_cast<size_t>(FrameResult::Count)] = {};
uint32_t irqCount = 0;
uint32_t irqReleaseTimeoutCount = 0;
uint32_t lastDiagnosticMs = 0;
uint32_t lastWireCrc = 0;
uint32_t lastCalculatedCrc = 0;
uint32_t lastDiscardedPrefix = 0;

uint32_t readU32LE(const uint8_t *value) {
  return (uint32_t)value[0] | ((uint32_t)value[1] << 8U) |
         ((uint32_t)value[2] << 16U) | ((uint32_t)value[3] << 24U);
}

uint32_t crc32Ieee(const uint8_t *data, size_t length) {
  uint32_t crc = 0xFFFFFFFFU;
  for (size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; ++bit) {
      const uint32_t mask = 0U - (crc & 1U);
      crc = (crc >> 1U) ^ (0xEDB88320U & mask);
    }
  }
  return ~crc;
}

bool waitForLevel(uint8_t pin, uint8_t level, uint32_t timeoutMs) {
  const uint32_t start = millis();
  while (digitalRead(pin) != level) {
    if ((millis() - start) >= timeoutMs) return false;
    yield();
  }
  return true;
}

FrameResult readCombinedFrame() {
  delayMicroseconds(IRQ_SETTLE_US);
  SPI.beginTransaction(SPISettings(SPI_HZ, MSBFIRST, SPI_MODE0));
  digitalWrite(STM32_CS_PIN, LOW);
  delayMicroseconds(CS_SETUP_US);

  /*
   * Search for ESK1 inside the first few clocks without releasing nCS. If the
   * STM32 peripheral exposed stale FIFO bytes first, discard only that prefix
   * and then clock the entire 1188-byte logical frame in the same transaction.
   */
  size_t clocks = 0;
  size_t matched = 0;
  while (matched < sizeof(MAGIC) && clocks < MAX_PREFIX_BYTES) {
    const uint8_t value = SPI.transfer(0x00);
    ++clocks;
    if (value == MAGIC[matched]) {
      frame[matched++] = value;
    } else if (value == MAGIC[0]) {
      frame[0] = value;
      matched = 1;
    } else {
      matched = 0;
    }
  }

  if (matched == sizeof(MAGIC)) {
    lastDiscardedPrefix = clocks - sizeof(MAGIC);
    for (size_t i = sizeof(MAGIC); i < FRAME_BYTES; ++i) {
      frame[i] = SPI.transfer(0x00);
    }
  } else {
    lastDiscardedPrefix = clocks;
    while (clocks < FRAME_BYTES) {
      (void)SPI.transfer(0x00);
      ++clocks;
    }
  }
  delayMicroseconds(CS_HOLD_US);
  digitalWrite(STM32_CS_PIN, HIGH);
  SPI.endTransaction();

  if (matched != sizeof(MAGIC)) return FrameResult::BadMagic;
  const uint16_t declared = (uint16_t)frame[6] | ((uint16_t)frame[7] << 8U);
  if (frame[4] != 1U || declared != FRAME_BYTES) return FrameResult::BadHeader;
  lastWireCrc = readU32LE(&frame[FRAME_BYTES - 4U]);
  lastCalculatedCrc = crc32Ieee(frame, FRAME_BYTES - 4U);
  if (lastCalculatedCrc != lastWireCrc) return FrameResult::BadCrc;

  if (!Serial) return FrameResult::UsbUnavailable;
  if (Serial.write(frame, FRAME_BYTES) != FRAME_BYTES) {
    return FrameResult::UsbShortWrite;
  }
  return FrameResult::Ok;
}

void printDiagnostics() {
  const uint32_t now = millis();
  if (!Serial || (now - lastDiagnosticMs) < 1000U) return;
  lastDiagnosticMs = now;
  Serial.printf(
      "#ESKDBG irq=%lu ok=%lu magic=%lu header=%lu crc=%lu "
      "usb_off=%lu usb_short=%lu release_timeout=%lu irq_level=%u\r\n",
      (unsigned long)irqCount,
      (unsigned long)resultCounts[static_cast<size_t>(FrameResult::Ok)],
      (unsigned long)resultCounts[static_cast<size_t>(FrameResult::BadMagic)],
      (unsigned long)resultCounts[static_cast<size_t>(FrameResult::BadHeader)],
      (unsigned long)resultCounts[static_cast<size_t>(FrameResult::BadCrc)],
      (unsigned long)resultCounts[static_cast<size_t>(FrameResult::UsbUnavailable)],
      (unsigned long)resultCounts[static_cast<size_t>(FrameResult::UsbShortWrite)],
      (unsigned long)irqReleaseTimeoutCount,
      digitalRead(STM32_IRQ_PIN) == HIGH ? 1U : 0U);
  Serial.printf(
      "#ESKFIRST %02X %02X %02X %02X %02X %02X %02X %02X "
      "%02X %02X %02X %02X %02X %02X %02X %02X\r\n",
      frame[0], frame[1], frame[2], frame[3],
      frame[4], frame[5], frame[6], frame[7],
      frame[8], frame[9], frame[10], frame[11],
      frame[12], frame[13], frame[14], frame[15]);
  Serial.printf("#ESKCRC wire=%08lX calc=%08lX spi_hz=%lu\r\n",
                (unsigned long)lastWireCrc,
                (unsigned long)lastCalculatedCrc,
                (unsigned long)SPI_HZ);
  Serial.printf("#ESKALIGN discarded_prefix=%lu\r\n",
                (unsigned long)lastDiscardedPrefix);
}

void setup() {
  pinMode(STM32_CS_PIN, OUTPUT);
  digitalWrite(STM32_CS_PIN, HIGH);
  pinMode(STM32_IRQ_PIN, INPUT_PULLDOWN);
  // Teensy 4.1 LED_BUILTIN is pin 13, which is also the default SPI SCK pin.
  // Never drive it as a status GPIO while the Host SPI bus is active.
  SPI.begin();
  Serial.begin(USB_BAUD);
}

void loop() {
  if (digitalRead(STM32_IRQ_PIN) == HIGH) {
    ++irqCount;
    const FrameResult result = readCombinedFrame();
    ++resultCounts[static_cast<size_t>(result)];
    if (!waitForLevel(STM32_IRQ_PIN, LOW, IRQ_RELEASE_TIMEOUT_MS)) {
      ++irqReleaseTimeoutCount;
    }
  }
  printDiagnostics();
}
