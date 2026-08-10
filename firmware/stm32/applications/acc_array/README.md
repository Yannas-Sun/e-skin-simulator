# STM32 ACC Application

This is the maintained ACC streaming application for the 9 installed LIS2DH12
accelerometers on SPI2. It supports either the complete array or a persistent
single-ACC mode selected when the STM32 image is compiled and flashed.

## Build and flash

Use the CMD launcher so Windows PowerShell execution policy does not block the
workflow:

```powershell
# Permanently run only ACC3 until another image is flashed.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_array.cmd" 3

# Prompt for the selected ACC.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_array.cmd"

# Restore the complete A1..A9 stream.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_array.cmd" 0
```

In single-ACC mode the firmware does not initialise, retry, select, or read any
other sensor. The Host SPI frame remains 515 bytes for Teensy compatibility:
only the selected ACC row is populated and all other ACC rows are zero.

### Manual full-array build

```powershell
cmake --build "D:\study\programming\builds\ESKIN_ACC_SPI_ARRAY_20260729"

pyocd flash `
  -t stm32g474cetx `
  -f 10k `
  -M under-reset `
  -e sector `
  "D:\study\programming\builds\ESKIN_ACC_SPI_ARRAY_20260729\ESKIN_STM32.elf"
```

The diagnostic SPI2 clock is currently 62.5 kHz and uses mode 3.

## Read the result

The production Teensy `ESKIN_SPI_USB_BRIDGE` may remain installed.

```powershell
python `
  "..\..\..\teensy\tests\ACC_SPI_ARRAY_TEST\read_acc_array.py" `
  --port COM9 `
  --frames 100 `
  --summary-only
```

A sensor passes only when:

- `WHO_AM_I` is `0x33`;
- status is `OK`;
- `CTRL1` is `0x57`;
- `CTRL4` is `0x88`;
- X/Y/Z respond to orientation changes.

Do not use XYZ values from a row marked `CONFIG_ERROR`.

## 2026-08-01 nine-device correction and test

The firmware, command-line reader, and 3D GUI were corrected to use the nine
devices present in ACC revision 2.2. A 10 kHz under-reset flash succeeded on
the second attempt after a hardware reset. A 100-frame COM9 test produced no
sequence gaps at 20.58 frames/s:

- ACC2, ACC4, ACC5, ACC7, and ACC8: `WHO_AM_I=0x33`, configuration readback
  `CTRL1=0x57` and `CTRL4=0x88`, with valid XYZ data;
- ACC1, ACC6, and ACC9: `WHO_AM_I=0xFF` (`BAD_ID`);
- ACC3: `WHO_AM_I=0x00` (`BAD_ID`).

The old apparent responses from ACC10..ACC16 were not real devices and must
not be used for fault analysis.

## Automatic recovery

The current image waits 1000 ms after startup, attempts each installed ACC up
to five times, verifies `WHO_AM_I`, `CTRL1`, and `CTRL4`, and then streams the
diagnostic frame even if only part of the array is ready. One failed sensor is
retried each second in round-robin order. A runtime XYZ SPI failure marks only
that sensor offline and puts it back into the retry queue.

The verified 2026-08-01 image remained stable across 300 frames and a hardware
reset at approximately 18.4 frames/s with zero frame gaps. ACC1, ACC2, ACC4,
ACC7, and ACC8 passed; ACC3, ACC5, ACC6, and ACC9 remained `BAD_ID` and require
individual physical-branch checks.
