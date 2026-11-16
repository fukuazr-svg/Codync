@echo off
chcp 65001 >nul
cd /d "F:\Codync\发版工\work\z15\host"
cargo +1.99.1 fmt > "F:\Codync\发版工\work\z15\ffmt.out" 2>&1
echo %ERRORLEVEL% > "F:\Codync\发版工\work\z15\ffmt.exit"
