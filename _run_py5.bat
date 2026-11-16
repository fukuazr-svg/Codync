@echo off
chcp 65001 >nul
python "F:\Codync\发版工\work\z15\_fix3.py" > "F:\Codync\发版工\work\z15\_py5.out" 2>&1
echo %ERRORLEVEL% > "F:\Codync\发版工\work\z15\_py5.exit"
