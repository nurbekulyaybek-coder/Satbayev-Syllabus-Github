@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py configure_ai.py
) else (
  python configure_ai.py
)
pause
