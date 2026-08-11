# E-SKIN firmware

This directory contains the STM32G474 and Teensy 4.1 firmware, Windows command
launchers, PC visualisation tools, integration tests, and the chronological
bring-up record for the E-SKIN module.

## Current system

The complete module contains:

- two independent 16 x 16 FSR matrices through MUX1/ADC1 and MUX2/ADC2;
- nine LIS2DH12 accelerometers on the shared SPI2 bus;
- an STM32G474 acquisition controller;
- a Teensy 4.1 SPI-to-USB bridge;
- Python GUIs for the complete module and standalone FSR tests.

The combined protocol is an integrity-checked 1188-byte `ESK1` frame with
CRC32. The current bridge uses **10 MHz Teensy hardware Mode-0 SPI**, STM32 SPI3
full-duplex DMA, two ping-pong frame buffers and a 16-frame Teensy USB queue.
The accepted output is paced to **700 complete packets/s**.

The combined STM32 firmware is now configured for an **80 MHz SYSCLK/HCLK**
from the 16 MHz HSI through the PLL. APB1 and APB2 both run at 80 MHz; ADC SPI1
and ACC SPI2 run at 10 MHz. FSR acquisition is rolling: one shared MUX address
(32 values across both arrays) is updated per packet, so a complete 16-row
matrix refresh is approximately 43.76 Hz. ACC samples update at 100 Hz.

Latest report: [`docs/updates/2026-08-10-700hz/PROGRESS_UPDATE.md`](docs/updates/2026-08-10-700hz/PROGRESS_UPDATE.md).
It records every 700 Hz attempt, the rolling-scan data-freshness semantics and
the final 60-second hardware acceptance result.

Standalone FSR GUIs display the unmodified 12-bit ADC values (`0..4095`). They
do not load calibration files or apply normalisation. Historical calibration
files are retained only for traceability.

Current hardware observation (2026-08-09): FSR2 responds normally. FSR1
transport remains continuous at approximately 25 fps with zero sequence gaps,
but all 256 raw ADC values are only `0` or `1`. This single open observation is
recorded in [`docs/FSR_TEST_ERROR.md`](docs/FSR_TEST_ERROR.md).

## Quick start on Windows

Close every existing serial monitor or GUI that owns the Teensy COM port before
uploading or starting another monitor. The test PC currently enumerates the
Teensy as `COM9`; replace it if Windows assigns another port.

Complete module: build/flash STM32, upload Teensy, then open the combined GUI:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_combined_pair.cmd" COM9
```

Open the combined GUI manually after both processors are already programmed:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\start_combined_monitor.cmd" COM9 all
```

Standalone FSR tests:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_fsr1_pair.cmd" COM9
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_fsr2_pair.cmd" COM9
```

See [`tools/commands/README.md`](tools/commands/README.md) for every launcher and
[`docs/COMMAND_REFERENCE.md`](docs/COMMAND_REFERENCE.md) for command-line flags.

## Directory layout

```text
firmware/
|-- docs/                         workflow, command reference, test error
|-- integration_tests/            paired STM32/Teensy integration tests
|-- stm32/
|   |-- applications/
|   |   |-- fsr1/                 standalone FSR1 raw acquisition
|   |   |-- fsr2/                 standalone FSR2 raw acquisition
|   |   |-- acc_array/            nine-ACC application
|   |   `-- combined_system/      FSR1 + FSR2 + nine ACCs
|   |-- tests/                    hardware-isolation firmware
|   `-- archive/                  preserved legacy workspace
|-- teensy/
|   |-- applications/
|   |   |-- ESKIN_SPI_USB_BRIDGE/ standalone FSR bridge and GUI
|   |   `-- ESKIN_COMBINED_BRIDGE/combined bridge and GUI
|   `-- tests/                    Teensy and PC-side diagnostics
`-- tools/commands/               centralized Windows launchers
```

## Toolchain assumptions

- STM32 target: `stm32g474cetx`.
- DAPLink UID: `LU_2022_8888`.
- STM32 programming: pyOCD, 10 kHz SWD, connect under reset, hardware reset.
- Teensy board: `teensy:avr:teensy41`, Teensy core 1.62.0.
- Arduino CLI: `D:\study\programming\ArduinoCLI\arduino-cli.exe`.
- CMake, Ninja and Arm GNU Toolchain are installed under
  `D:\study\programming` on the test PC.
- Fresh STM32 builds are placed under `D:\study\programming\builds` because
  copied in-tree CMake caches contain obsolete absolute paths.

Generated STM32 build trees, `.arduino-build`, Python caches, and live raw
captures are intentionally excluded from Git. Source, scripts, historical
calibration records, and documentation remain versioned.

## Documentation policy

Current operational instructions belong in this README, the nearest component
README, and `docs/COMMAND_REFERENCE.md`. `docs/WORKFLOW.md` is chronological;
older entries deliberately retain the paths and results that were valid when
the experiment was performed. Files named `README.before_*.md` are archived
snapshots and are not current operating instructions.

Chronological progress reports are indexed in
[`docs/updates/README.md`](docs/updates/README.md).
