# ACC1 / ACC5 WHO_AM_I Isolation Test

This STM32G474 test uses only decoder addresses 0 and 4:

1. select ACC1 and read `WHO_AM_I` (`0x0F`) exactly 100 times;
2. deselect every ACC;
3. select ACC5 and read `WHO_AM_I` exactly 100 times;
4. transmit the raw results through the established 515-byte Host SPI frame.

The other seven ACC addresses are never selected. Every register transaction
releases nCS before the next read.

## Frame layout

The 16x16 payload is treated as a flat array of 256 unsigned 12-bit words.

- words `0..99`: ACC1 raw results;
- words `100..199`: ACC5 raw results;
- words `200..215`: magic `0xA15`, pass/error counters, MISO and SPI diagnostics;
- words `216..255`: reserved and zero.

A normal successful read is `0x033`. A value in `0x100..0x10F` represents a
STM32 HAL SPI error rather than a sensor response.

Use the normal Teensy application bridge and the matching PC reader in:

```text
teensy/tests/ACC_A1_A5_WHOAMI_TEST/read_a1_a5_whoami.py
```

## Build

The maintained one-command build/flash entry is:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_stm32_project.cmd" acc-whoami
```

Manual build commands are retained below for toolchain debugging.

```powershell
& "D:\study\programming\CMake\bin\cmake.exe" -S . -B "D:\study\programming\builds\ESKIN_ACC_A1_A5_WHOAMI" -G Ninja `
  -DCMAKE_BUILD_TYPE=Debug `
  -DCMAKE_TOOLCHAIN_FILE=".\cmake\gcc-arm-none-eabi.cmake" `
  -DTOOLCHAIN_PREFIX="D:/study/programming/ArmGnuToolchain/bin/arm-none-eabi-" `
  -DCMAKE_MAKE_PROGRAM="D:\study\programming\Ninja\ninja.exe" `
  -DCMAKE_C_COMPILER="D:\study\programming\ArmGnuToolchain\bin\arm-none-eabi-gcc.exe" `
  -DCMAKE_CXX_COMPILER="D:\study\programming\ArmGnuToolchain\bin\arm-none-eabi-g++.exe"
& "D:\study\programming\CMake\bin\cmake.exe" --build "D:\study\programming\builds\ESKIN_ACC_A1_A5_WHOAMI"
```

## Flash

```powershell
pyocd flash -t stm32g474cetx -f 10k -M under-reset `
  "D:\study\programming\builds\ESKIN_ACC_A1_A5_WHOAMI\ESKIN_STM32.elf"
pyocd reset -t stm32g474cetx -f 10k -M under-reset -m hw
```
