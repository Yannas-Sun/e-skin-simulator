@echo off
setlocal EnableExtensions
set "PATH=D:\study\programming\ArmGnuToolchain\bin;D:\study\programming\Ninja;D:\study\programming\CMake\bin;%PATH%"
set "ROOT=%~dp0..\..\.."
set "PROBE_UID=LU_2022_8888"

if /i "%~1"=="fsr1" (
  set "PROJECT=stm32\applications\fsr1"
  set "BUILD_NAME=ESKIN_FSR1"
)
if /i "%~1"=="fsr2" (
  set "PROJECT=stm32\applications\fsr2"
  set "BUILD_NAME=ESKIN_FSR2"
)
if /i "%~1"=="fsr1-adc" (
  set "PROJECT=stm32\tests\fsr1_adc_channel"
  set "BUILD_NAME=ESKIN_FSR1_ADC_CHANNEL"
)
if /i "%~1"=="acc-whoami" (
  set "PROJECT=stm32\tests\acc_a1_a5_whoami"
  set "BUILD_NAME=ESKIN_ACC_A1_A5_WHOAMI"
)
if /i "%~1"=="spi-pattern" (
  set "PROJECT=integration_tests\SPI_PATTERN_TEST\ESKIN_STM32_PATTERN"
  set "BUILD_NAME=ESKIN_SPI_PATTERN"
)

if not defined PROJECT goto usage
set "SOURCE=%ROOT%\%PROJECT%"
set "BUILD=D:\study\programming\builds\%BUILD_NAME%"

cmake --fresh -S "%SOURCE%" -B "%BUILD%" -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE="%SOURCE%\cmake\gcc-arm-none-eabi.cmake"
if errorlevel 1 exit /b 1
cmake --build "%BUILD%" -j 4
if errorlevel 1 exit /b 1
pyocd flash -W -u %PROBE_UID% -t stm32g474cetx -f 10k -M under-reset -O reset_type=hw -e sector "%BUILD%\ESKIN_STM32.elf"
if errorlevel 1 exit /b 1
pyocd reset -W -u %PROBE_UID% -t stm32g474cetx -f 10k -M under-reset -m hw
exit /b %errorlevel%

:usage
echo Usage: %~nx0 ^<fsr1^|fsr2^|fsr1-adc^|acc-whoami^|spi-pattern^>
exit /b 2
