# SPI Pattern Test

This isolated test is kept separate from the production STM32 firmware.

The GPIO-only stage has passed: Teensy GPIO 2 reads `1` while the STM32 drives `HOST_IRQ` high. The active SPI stage transmits one byte, `0x55` (`01010101`), after the Teensy detects `HOST_IRQ`.

STM32 SPI3 wiring: PA15/NSS -> Teensy CS (10), PB3/SCK -> Teensy SCK (13), PB4/MISO -> Teensy MISO (12), PB5/MOSI -> Teensy MOSI (11), PB8/HOST_IRQ -> Teensy GPIO 2, and common GND. Use 3.3 V logic only.

The standalone `stm32_spi_pattern_test.c` file is an integration reference and is not part of a CMake target. The directly buildable test implementation is in `ESKIN_STM32_PATTERN/Core/Src/main.c`. The matching Teensy program is `teensy_spi_pattern_receiver/teensy_spi_pattern_receiver.ino`.

Build and flash both processors with one command (defaults to `COM9`):

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_spi_pattern_test.cmd" COM9
```

This first flashes the STM32 pattern firmware through DAPLink, then compiles
and uploads the matching Teensy 4.1 receiver through Arduino CLI. The command
stops immediately if either stage fails. After a successful upload it waits
for the USB port to reconnect and automatically opens the 115200 baud serial
monitor. Press `Ctrl+C` to exit the monitor.

Expected Teensy output for each transaction:

```text
RX: 0x55  bits=01010101  PASS
```

This test only validates the SPI3 electrical path and basic master/slave timing. It does not validate the ADC, MUX, FSR scan, or the production 515-byte frame protocol.

## Validated run: 2026-07-25

The intermittent HOST_SCK/CLK problem was reported resolved after the connector contact/rework investigation. The complete test programs were then restored on both devices.

- STM32 build: PASS, RAM 1792 bytes, Flash 10060 bytes.
- STM32 flash: PASS at 100 kHz SWD with `under-reset`; 10240 bytes erased and 10240 bytes programmed.
- STM32 runtime check: `PC = 0x08000794`, confirming execution from user Flash.
- STM32 SPI3 pin check: PB3/SCK, PB4/MISO, and PB5/MOSI were all in AF6 mode.
- Teensy 4.1 compile and upload: PASS using Teensy core 1.62.0.
- USB serial validation: eight consecutive `RX: 0x55 bits=01010101 PASS` lines were captured from COM9.

The Teensy configures GPIO2/HOST_IRQ as `INPUT_PULLDOWN` because STM32 PB8 also acts as BOOT0. An external approximately 10 kOhm pull-down remains the recommended permanent solution for deterministic simultaneous power-up.
