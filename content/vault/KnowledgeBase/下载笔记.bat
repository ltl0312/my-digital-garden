@echo off
chcp 65001 >nul
title 笔记下载 · 云服务器 → E:\KnowledgeBase
set "BASH=C:\Users\ZhuanZ\.workbuddy\binaries\PortableGit\versions\1.2.0\bin\bash.exe"
"%BASH%" -lc "cd /e/KnowledgeBase/_sync && ./sync-notes.sh down"
echo.
pause
