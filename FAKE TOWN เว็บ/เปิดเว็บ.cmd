@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
  node preview.mjs
) else (
  "C:\Users\CPUMAX\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" preview.mjs
)
pause