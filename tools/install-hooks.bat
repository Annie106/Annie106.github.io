@echo off
chcp 65001 >nul
cd /d "%~dp0.."

if not exist ".git\hooks" (
  echo.
  echo [X] Not a git repository root: .git\hooks not found.
  echo.
echo Press any key to close this window . . .
pause >nul
  exit /b 1
)

copy /Y "tools\hooks\pre-commit" ".git\hooks\pre-commit" >nul
if errorlevel 1 (
  echo.
  echo [FAILED] Could not copy the hook. Run this file from the project folder.
) else (
  echo.
  echo [OK] pre-commit hook installed.
  echo      From now on, committing will rebuild the icon subset automatically.
)

echo.
echo Press any key to close this window . . .
pause >nul