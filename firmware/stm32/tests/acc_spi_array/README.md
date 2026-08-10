# STM32 ACC SPI Array Test

This isolated test scans the 9 installed LIS2DH12 accelerometers on the shared
SPI2 bus. Decoder addresses 0..8 select `nCS_1`..`nCS_9`; addresses 9..15 are
not populated on the current ACC flex. The 16x16 Host SPI frame is retained for
compatibility, with unused rows cleared to zero. It reuses the production Host
SPI and Teensy USB transport so ACC bring-up does not disturb the working FSR
applications.

## Build and flash

### Select one ACC automatically

Use the helper script to configure, build, and flash either one ACC or the
complete array. The selected number is compiled into the STM32 image, so no
runtime command channel or Teensy reflash is required.

```powershell
# Test only physical ACC5.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_spi_test.cmd" 5

# Omit the number to receive an interactive 0..9 prompt.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_spi_test.cmd"

# Restore the original nine-device scan.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_spi_test.cmd" 0
```

The `.cmd` launcher uses `ExecutionPolicy Bypass` for its child PowerShell
process only. It works even when Windows blocks direct execution of local
`.ps1` files and does not change the user or machine execution policy.

Selection `0` scans A1..A9. Selections `1`..`9` initialise, retry, and read
only that ACC; all other rows in the existing transport frame remain zero.
The PC reader therefore remains compatible and can focus on the selected row:

```powershell
python "..\..\..\teensy\tests\ACC_SPI_ARRAY_TEST\read_acc_array.py" `
  --port COM9 --sensor 5 --frames 100
```

### Manual build and flash

```powershell
cmake `
  -S . `
  -B "D:\study\programming\builds\ESKIN_ACC_SINGLE" `
  -G Ninja `
  -DCMAKE_BUILD_TYPE=Debug `
  -DACC_SELECTED=5 `
  --toolchain ".\cmake\gcc-arm-none-eabi.cmake"

cmake --build "D:\study\programming\builds\ESKIN_ACC_SINGLE" --parallel

pyocd flash `
  -t stm32g474cetx `
  -f 10k `
  -M under-reset `
  -e sector `
  "D:\study\programming\builds\ESKIN_ACC_SINGLE\ESKIN_STM32.elf"
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
