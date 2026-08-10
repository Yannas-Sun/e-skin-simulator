# E-SKIN combined monitor

This Teensy 4.1 application bridges one integrity-checked STM32 frame containing
both 16 x 16 FSR arrays and all nine accelerometers. The binary protocol uses a
four-byte `ESK1` magic, version, acquisition flags, frame length, 32-bit sequence,
STM32 timestamp, both raw ADC matrices, nine ACC records, and CRC32.

Host SPI is currently set to the conservative **100 kHz** bring-up timing
with IRQ/CS/hold waits of **1000/1000/100 us**. This isolates the Host link after
the 1 MHz plus 100/100/50 us trial produced no valid-frame LED. STM32-side FSR
and ACC acquisition optimizations remain active. Increase only one Host
parameter at a time after CRC-valid hardware operation is confirmed: first
test 500 kHz with the stable waits, then shorten waits, then test 1 MHz.

## Built-in LED warning and serial diagnostics

On Teensy 4.1, `LED_BUILTIN` and the default SPI SCK are both GPIO13. The
onboard LED therefore flashes during Host SPI clock activity and cannot be used
as a valid-frame indicator. The bridge no longer configures or writes that pin
as an LED GPIO.

Once per second the bridge emits an ASCII line alongside the binary stream:

```text
#ESKDBG irq=... ok=... magic=... header=... crc=... usb_off=... usb_short=... release_timeout=... irq_level=...
```

Close the Python GUI before opening Arduino Serial Monitor. A rising `irq`
count proves GPIO2 detects STM32 HOST_IRQ. `magic`, `header`, or `crc` identifies
the exact rejected-frame stage. Diagnostic lines do not alter the `ESK1` frame
format; the Python parser skips them while searching for the next frame magic.

## Arduino IDE

Install **Teensyduino / Teensy boards**, select **Teensy 4.1**, USB type
**Serial**, open `ESKIN_COMBINED_BRIDGE.ino`, then Upload. `SPI` and USB Serial
are built into the Teensy core; no third-party Arduino library is required.

## Monitor

```powershell
python -m pip install pyserial numpy matplotlib
& "D:\study\programming\ESKIN\firmware\tools\commands\start_combined_monitor.cmd" COM9 all
python -u live_combined_monitor.py --port COM9
```

Use the **All / FSR1 / FSR2 / ACC** selector in the right side of the window,
or choose the initial panel from the command line:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\start_combined_monitor.cmd" COM9 fsr1
python -u live_combined_monitor.py --port COM9 --view acc
```

The two FSR panels use the original hexagonal PCB shape, physical transpose,
left-right mirror, and R/C numbering. The ACC panel uses the original mirrored
3 x 3 physical layout and 3D vector orientation.

See `docs/COMMAND_REFERENCE.md` for every GUI flag and all centralized commands.

Offline verification and display:

```powershell
python live_combined_monitor.py --self-test
python live_combined_monitor.py --demo
python live_combined_monitor.py --demo --view fsr2
```
