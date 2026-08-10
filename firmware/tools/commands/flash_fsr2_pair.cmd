@echo off
setlocal
set "ROOT=%~dp0..\.."
if "%~1"=="" (set "PORT=COM9") else (set "PORT=%~1")

echo [STM32] Building and flashing the complete FSR2 16x16 firmware...
call "%~dp0original\flash_stm32_project.cmd" fsr2
if errorlevel 1 exit /b 1

echo [Teensy] Building and uploading ESKIN_SPI_USB_BRIDGE...
call "%~dp0upload_teensy_sketch.cmd" ^
  "%ROOT%\teensy\applications\ESKIN_SPI_USB_BRIDGE" ^
  "%PORT%" "TEENSY_ESKIN_SPI_USB_BRIDGE"
if errorlevel 1 exit /b 1

echo [GUI] Waiting for the Teensy USB serial port to reconnect...
timeout /t 2 /nobreak >nul
echo [GUI] Opening the complete FSR2 16x16 heatmap on %PORT%...
python -u "%ROOT%\teensy\applications\ESKIN_SPI_USB_BRIDGE\live_fsr_heatmap.py" ^
  --port "%PORT%" --region fsr2
exit /b %errorlevel%
