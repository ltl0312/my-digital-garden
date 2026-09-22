@echo off
title Garden Notes - Upload to Cloud
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0.sync\garden-sync.ps1" -Mode up
echo.
pause
