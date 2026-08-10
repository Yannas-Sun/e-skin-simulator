@echo off
setlocal
set "ROOT=%~dp0..\..\.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\stm32\tests\acc_sck_slow\flash_acc_sck_slow.ps1"
exit /b %errorlevel%
