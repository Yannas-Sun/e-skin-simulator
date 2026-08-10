@echo off
setlocal
set "ROOT=%~dp0..\.."
if "%~1"=="" (set "PORT=COM9") else (set "PORT=%~1")

echo [STM32] Building and flashing the 0x55 SPI pattern firmware...
call "%~dp0original\flash_stm32_project.cmd" spi-pattern
if errorlevel 1 exit /b 1

echo [Teensy] Building and uploading the matching SPI receiver...
call "%~dp0upload_teensy_sketch.cmd" ^
  "%ROOT%\integration_tests\SPI_PATTERN_TEST\teensy_spi_pattern_receiver" ^
  "%PORT%" "TEENSY_SPI_PATTERN_RECEIVER"
if errorlevel 1 exit /b 1

echo [Monitor] Opening the SPI pattern test output...
call "%~dp0monitor_teensy_serial.cmd" "%PORT%" 115200
exit /b %errorlevel%
