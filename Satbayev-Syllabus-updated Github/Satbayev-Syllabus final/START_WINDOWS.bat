@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py server.py --open
) else (
  python server.py --open
)
if errorlevel 1 (
  echo Python 3.10+ is required. See README.md.
  pause
)
