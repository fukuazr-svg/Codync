@echo off
chcp 65001 >nul
cd /d "F:\Codync\发版工\work\z15\host"
cargo +1.99.1 check --all-targets > "F:\Codync\发版工\work\z15\fcheck.out" 2>&1
echo %ERRORLEVEL% > "F:\Codync\发版工\work\z15\fcheck.exit"
