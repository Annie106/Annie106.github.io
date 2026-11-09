@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ==== Icon check ====
echo.

node tools\check-icons.js
set RESULT=%ERRORLEVEL%

echo.
if "%RESULT%"=="0" (
  echo [OK] No problems found.
) else (
  echo [FAILED] See the messages above.
)

echo.
pause
