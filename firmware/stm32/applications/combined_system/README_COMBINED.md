# E-SKIN combined STM32 firmware

This application scans FSR1, FSR2, and the nine LIS2DH12 accelerometers in one
continuous loop. It preserves the established FSR mappings:

- FSR1: `frame[MUX1][ADC1]`
- FSR2: reverse MUX2 selection and transpose ADC2 into the logical display map
- ACC: CD74HC154 decoder indices 0..8 correspond to physical ACC1..ACC9

ACC XYZ data is read every acquisition frame. To avoid nine redundant identity
transactions per frame, one ACC receives a `WHO_AM_I` health check every
100 ms; all nine are therefore covered in approximately 0.9 s. A failed axis
payload is still rejected immediately, and a failed device is reinitialized
when its health-check slot arrives. All-zero and all-`0xFF` axis payloads are
rejected.

## First-stage speed configuration

| Item | Active value | Previous value | Safe fallback |
|---|---:|---:|---:|
| FSR MUX settle | 100 us | 1 ms per array/row | 200 or 500 us |
| FSR scan | both MUXes enabled and acquired per shared address | two separate 16-row scans | separate scans |
| ACC SPI2 | 500 kHz (`16 MHz / 32`) | 62.5 kHz (`/256`) | 250 kHz (`/64`) |
| ACC identity check | one device / 100 ms | every device / every frame | one device / 200 ms |
| Host SPI (Teensy master) | 100 kHz | 1 MHz trial | 100 kHz verified bring-up |

The optimized STM32 acquisition target is approximately 25-50 scans/s before
Host transport. At the current conservative 100 kHz Host setting, transferring
1188 bytes takes approximately 95 ms, so the end-to-end source rate is limited
to about 10 frames/s. Read the actual rate from the combined GUI's `source fps`;
`display fps` measures Matplotlib rendering and may remain lower.

After this configuration is stable, test one step at a time: 500 kHz Host SPI
with the current waits, 50 us FSR settle, 1 MHz ACC SPI, and then faster Host
SPI. These values may reach approximately
40-80 frame/s. DMA/double buffering plus an 80-170 MHz STM32 system clock is a
later phase for approximately 80-150 frame/s and requires new timing tests.

The STM32 sends one 1188-byte `ESK1` frame through SPI3. CRC32 protects the full
frame against the frame shifts and impossible values observed with the earlier
unprotected 515-byte transport.

## Build and flash

Connect DAPLink SWDIO, SWCLK, nRESET, GND and target reference voltage. Then run:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_combined.cmd"
```

To build/flash STM32, compile/upload the matching Teensy bridge, and then open
the Combined GUI automatically, use:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_combined_pair.cmd" COM9
```

The script uses the installed CMake, Ninja and Arm GNU Toolchain under
`D:\study\programming`, builds in the short path
`D:\study\programming\builds\ESKIN_COMBINED_SYSTEM`, and flashes at 10 kHz
under reset with pyOCD.

Manual flash of an existing ELF:

```powershell
pyocd flash -t stm32g474cetx -f 10k -M under-reset -e sector `
  "D:\study\programming\builds\ESKIN_COMBINED_SYSTEM\ESKIN_STM32.elf"
pyocd reset -t stm32g474cetx -f 10k -M under-reset -m hw
```

The generated `.ioc` remains the original CubeMX base. The additional FSR2
PB1/PB2/PB11 GPIO configuration is performed by `CombinedAcquisition_Init()`;
regenerating CubeMX code can replace `main.c`, so retain the USER modifications
and `combined_acquisition.c`.
