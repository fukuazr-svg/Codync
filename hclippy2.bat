@echo off
chcp 65001 >nul
cd /d "F:\Codync\发版工\work\z15\host"
cargo +1.99.1 clippy --all-targets -- -D warnings > "F:\Codync\发版工\work\z15\hclippy2.out" 2>&1
echo %ERRORLEVEL% > "F:\Codync\发版工\work\z15\hclippy2.exit"
