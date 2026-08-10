@echo off
setlocal
set "PATH=D:\study\programming\ArmGnuToolchain\bin;D:\study\programming\Ninja;D:\study\programming\CMake\bin;%PATH%"
set "ROOT=%~dp0..\..\.."
set "SOURCE=%ROOT%\stm32\applications\combined_system"
set "BUILD=D:\study\programming\builds\ESKIN_COMBINED_SYSTEM"
set "PROBE_UID=LU_2022_8888"

cmake --fresh -S "%SOURCE%" -B "%BUILD%" -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE="%SOURCE%\cmake\gcc-arm-none-eabi.cmake"
if errorlevel 1 exit /b 1
cmake --build "%BUILD%" -j 4
if errorlevel 1 exit /b 1
echo [3/3] Flashing STM32 through DAPLink at 10 kHz...
pyocd flash -W -u %PROBE_UID% -t stm32g474cetx -f 10k -M under-reset -O reset_type=hw -e sector "%BUILD%\ESKIN_STM32.elf"
if errorlevel 1 exit /b 1
pyocd reset -W -u %PROBE_UID% -t stm32g474cetx -f 10k -M under-reset -m hw
endlocal
