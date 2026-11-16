@echo off
chcp 65001 >nul
set "PATH=C:\Users\60546\AppData\Local\Python\bin;%PATH%"
cd /d "F:\Codync\发版工\work\z15"
git rev-parse HEAD > "F:\Codync\发版工\work\z15\ghead.out" 2>&1
echo %ERRORLEVEL% > "F:\Codync\发版工\work\z15\ghead.exit"
