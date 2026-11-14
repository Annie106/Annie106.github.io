@echo off
chcp 65001 >nul
cd /d "%~dp0.."
set PYTHONIOENCODING=utf-8

echo.
echo ==== First-time setup (run once) ====
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js not found. Install it first: https://nodejs.org/
  goto end
)
echo [OK] Node.js found

set PY=
python --version >nul 2>nul && set PY=python
if not defined PY py --version >nul 2>nul && set PY=py
if not defined PY (
  echo [X] Python not found. Install it from https://www.python.org/downloads/
  echo     Remember to tick "Add Python to PATH" during setup.
  echo     If you see "python" open the Microsoft Store, that is a stub,
  echo     not a real install.
  goto end
)
%PY% --version
echo [OK] Python found

echo.
echo ---- Installing icon tools (fonttools + brotli) ----
%PY% -m pip install --quiet --upgrade fonttools brotli
if errorlevel 1 (
  echo [X] pip install failed. Check the network and retry.
  goto end
)
echo [OK] fonttools / brotli installed

echo.
echo ---- Rebuilding icon subset ----
%PY% tools\subset-icons.py
if errorlevel 1 goto end

echo.
echo ---- Installing git hook (auto rebuild on commit) ----
if exist ".git\hooks" (
  copy /Y "tools\hooks\pre-commit" ".git\hooks\pre-commit" >nul
  echo [OK] pre-commit hook installed
) else (
  echo [!] Not a git repo root, skipped hook.
)

echo.
node tools\check-icons.js
echo.
echo ==== Done. Build with: node tools/build-site.js ====

:end
echo.
echo Press any key to close this window . . .
pause >nul