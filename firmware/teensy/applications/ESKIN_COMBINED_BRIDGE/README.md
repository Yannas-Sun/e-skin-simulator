# E-SKIN combined Teensy bridge

The Teensy 4.1 is the Host SPI master and USB bridge for the STM32 combined
firmware. It waits for STM32 IRQ, clocks one 1188-byte `ESK1` frame from SPI3,
checks the active protocol rules, and queues accepted frames for non-blocking
USB Serial output to the Python GUI.

## Active settings

| Setting | Value |
|---|---:|
| Teensy CPU | 600 MHz default (`F_CPU=600000000`) |
| Host SPI | hardware LPSPI, Mode 0 |
| SCK | 10 MHz |
| Maximum requested transfer rate | 700 frames/s |
| Minimum pacing period | 1428 us |
| IRQ settle / CS setup / CS hold | 50 / 10 / 10 us |
| USB queue | 16 x 1188-byte frames |
| Current STM32 producer rate | 238.475 complete fresh cycles/s |

The Teensy controls Host SCK. The STM32 is the SPI slave and determines when a
new frame becomes ready through IRQ. A 700/s Teensy pacing limit therefore does
not make a slower STM32 producer run at 700/s.

## Protocol validation

The bridge accepts both protocol versions:

- v1 always carries and checks IEEE CRC32.
- v2 carries CRC32 only when flag `0x10` is set. The current STM32 sets it when
  `sequence % 32 == 0`; other v2 frames must have a zero trailer.

Every transaction checks magic, supported version, declared length, the v2 CRC
cadence, zero skipped-CRC trailer, and sequence continuity. A sampled frame is
also CRC-checked. Bad frames are not queued. Unchecked v2 payloads are explicitly
unverified; a later sampled CRC cannot validate them retroactively.

Diagnostics report IRQ count, accepted frames, sequence/CRC/magic/header
errors, CRC checked/skipped totals, release timeouts, USB queue drops, queue
high-water mark, and Teensy `millis()`. The capture tool reports CRC error rate
using checked frames as its denominator and also reports CRC coverage.

The current 30-second experiment delivered 6,916 accepted frames at
238.475/s, with zero sequence or transport errors and 3.123% CRC coverage. See
`docs/updates/2026-08-11-full-scan-700hz/PROGRESS_UPDATE.md` for complete
evidence. The last stable 700.181 packets/s rolling-acquisition release remains
available at commit `5468ec8`.

## Upload and monitor

Complete paired deployment of the current source:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_combined_pair.cmd" COM9
```

Open only the GUI after firmware is already installed:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\start_combined_monitor.cmd" COM9 all
```

Parser/protocol self-test without hardware:

```powershell
python -B "D:\study\programming\ESKIN\firmware\teensy\applications\ESKIN_COMBINED_BRIDGE\live_combined_monitor.py" --self-test
```
