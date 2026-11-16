@echo off
chcp 65001 >nul
python "F:\Codync\发版工\work\z15\_fix4.py" > "F:\Codync\发版工\work\z15\_py6.out" 2>&1
echo %ERRORLEVEL% > "F:\Codync\发版工\work\z15\_py6.exit"
