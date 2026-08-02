@echo off
REM ---------------------------------------------------------------------------
REM  XP POS - one-click deployment for a client box.
REM
REM  Right-click this file and choose "Run as administrator" so the firewall
REM  rule can be added automatically. Double-clicking also works, but you will
REM  have to open the firewall port by hand afterwards.
REM
REM  -ExecutionPolicy Bypass is what lets this run on a stock Windows machine,
REM  where the default policy blocks unsigned .ps1 files outright.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
echo.
pause
