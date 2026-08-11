# E-SKIN combined STM32 firmware

This STM32G474 application acquires FSR1, FSR2, and nine LIS2DH12
accelerometers, packs one fixed 1188-byte `ESK1` record, calculates IEEE
CRC32, and serves the record to a Teensy 4.1 over SPI3 slave DMA.

## Current 700 packet/s configuration

| Item | Active value |
|---|---:|
| STM32 SYSCLK / HCLK | 80 MHz |
| APB1 / APB2 | 80 MHz / 80 MHz |
| ADC SPI1 | 10 MHz |
| ACC SPI2 | 10 MHz |
| Host SPI3 | slave, Mode 0, 10 MHz SCK supplied by Teensy |
| MUX settling | 100 us |
| FSR work per output packet | one shared MUX address across FSR1 + FSR2 |
| Output packet rate | 700 packets/s target; 700.181/s measured for 60 s |
| Complete 16-address FSR refresh | 43.76 Hz |
| ACC XYZ refresh | 100 Hz |
| CRC | table-driven IEEE CRC32 |
| Host transfer | full-duplex DMA, two STM32 frame buffers |

`700 packets/s` does not mean every FSR cell is sampled 700 times/s. Each
packet carries persistent 16x16 matrices, but only one MUX address (one row in
each FSR matrix, 32 ADC values total) is newly acquired. Sixteen packets make
one complete FSR refresh, so the measured complete refresh rate is
`700.181 / 16 = 43.76 Hz`. ACC data is refreshed every 10 ms and retained in
the intervening packets.

Frame flag bit `0x08` marks rolling-MUX mode. The first ACC record's two
reserved bytes report the updated MUX address and address count. Reserved
fields in ACC records 1..4 report FSR, ACC, pack/CRC, and DMA-wait times in
microseconds. The GUI displays the current MUX address.

SPI3 uses ping-pong buffers. Before arming the next transfer, firmware waits
for PA15/NSS to be high and stable for 50 us. This guard is required in the
Release build: without it, STM32 could abort/reinitialise SPI3 while Teensy
still held CS low, producing alternating DMA timeouts and stale frame prefixes.

The final 60-second result had 41,331 completed transactions, zero CRC/magic/
header/USB-short/NSS-release errors, and 100% acceptance. See
`docs/updates/2026-08-10-700hz/PROGRESS_UPDATE.md` for all attempts and raw
evidence.

## Data mappings

- FSR1: `frame[MUX1][ADC1]`
- FSR2: reverse MUX2 selection and transpose ADC2 into the logical display map
- ACC: CD74HC154 decoder indices 0..8 map to physical ACC1..ACC9

One ACC receives a `WHO_AM_I` health check every 100 ms, covering all nine in
about 0.9 s. Invalid all-zero/all-`0xFF` axis payloads are rejected, and a
device is reinitialised when its health-check slot fails.

## Build and flash

Connect DAPLink SWDIO, SWCLK, nRESET, GND and target reference voltage. Build
and flash the STM32 Release firmware with:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_combined.cmd"
```

Build/flash STM32, compile/upload the matching Teensy bridge, and open the GUI:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_combined_pair.cmd" COM9
```

The STM32 build is intentionally `Release`; the 700 Hz timing result is not a
Debug-build result. The script builds under
`D:\study\programming\builds\ESKIN_COMBINED_SYSTEM` and flashes with pyOCD.

The additional FSR2 PB1/PB2/PB11 GPIO setup is performed by
`CombinedAcquisition_Init()`. CubeMX regeneration can replace `main.c`, so
retain its USER changes and `combined_acquisition.c`.
