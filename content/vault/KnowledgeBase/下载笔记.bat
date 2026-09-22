@echo off
title Garden Notes - Download from Cloud
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0.sync\garden-sync.ps1" -Mode down
echo.
pause
