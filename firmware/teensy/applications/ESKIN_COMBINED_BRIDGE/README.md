# ESKIN combined Teensy bridge

The Teensy 4.1 is the Host SPI master and USB bridge for the STM32 combined
firmware. It waits for the STM32 IRQ, clocks one 1188-byte `ESK1` frame from
SPI3, validates its IEEE CRC32, and queues valid frames for non-blocking USB
Serial output to the Python GUI.

## Active settings

| Setting | Value |
|---|---:|
| Teensy CPU | 600 MHz default Teensy 4.1 build (`F_CPU=600000000`) |
| Host SPI | hardware LPSPI, Mode 0 |
| SCK | 10 MHz |
| Target transfer rate | 700 frames/s |
| Transfer period | 1428 us integer pacing |
| IRQ settle / CS setup / CS hold | 50 / 10 / 10 us |
| USB queue | 16 x 1188-byte frames |

The Teensy controls Host SCK. The STM32 is the SPI slave and cannot select that
clock rate. The 700 Hz pacing prevents a faster producer from overflowing the
sustained USB path; without pacing, the same Release firmware produced about
883 transactions/s but dropped queued USB frames.

Only CRC-valid frames enter the USB queue. Diagnostics report IRQ count,
accepted frames, CRC/magic/header errors, release timeouts, USB queue drops,
queue high-water mark, and Teensy `millis()` so the capture tool can calculate
rates over the actual diagnostic interval.

At 700 packets/s the STM32 updates one shared FSR MUX address per packet, so a
complete 16-address FSR refresh is 43.76 Hz. ACC samples are refreshed at
100 Hz. See `docs/updates/2026-08-10-700hz/PROGRESS_UPDATE.md` for the complete
attempt history and final 60-second validation.

## Upload and monitor

Complete paired deployment:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_combined_pair.cmd" COM9
```

Open only the GUI after firmware is already installed:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\start_combined_monitor.cmd" COM9 all
```

Parser/CRC self-test without hardware:

```powershell
python -B "D:\study\programming\ESKIN\firmware\teensy\applications\ESKIN_COMBINED_BRIDGE\live_combined_monitor.py" --self-test
```
