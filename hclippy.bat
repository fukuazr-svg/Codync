@echo off
chcp 65001 >nul
set "PATH=C:\Users\60546\AppData\Local\Python\bin;%PATH%"
cd /d "F:\Codync\发版工\work\z15\host"
cargo +1.99.1 clippy --all-targets -- -D warnings > "F:\Codync\发版工\work\z15\hclippy.out" 2>&1
echo %ERRORLEVEL% > "F:\Codync\发版工\work\z15\hclippy.exit"
