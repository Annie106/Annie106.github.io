@echo off
chcp 65001 >nul
cd /d "%~dp0.."
set PYTHONIOENCODING=utf-8
set RESULT=0

echo.
echo ==== Rebuild icon subset ====
echo Working dir: %CD%
echo.

rem Do NOT check with "where python": Windows ships a Store alias stub
rem that resolves but exits 9009. Run --version to be sure.
set PY=
python --version >nul 2>nul && set PY=python
if not defined PY py --version >nul 2>nul && set PY=py

if not defined PY goto nopython
echo Using: %PY%

rem 依赖没装就顺手装上（首次会花十几秒，之后这句是空跑）
%PY% -c "import fontTools, brotli" >nul 2>nul
if errorlevel 1 (
  echo Installing fonttools + brotli for the first time ...
  %PY% -m pip install --quiet --upgrade fonttools brotli
  if errorlevel 1 goto pipfailed
)

%PY% tools\subset-icons.py
if errorlevel 1 goto gensubsetfailed

echo.
node tools\check-icons.js
if errorlevel 1 goto checkfailed

echo.
echo [OK] Icon subset rebuilt and verified.
goto end

:nopython
set RESULT=1
echo [X] Python not found on this machine.
echo.
echo     Install from https://www.python.org/downloads/
echo     and tick "Add Python to PATH" during setup,
echo     then run tools\setup.bat once.
echo.
echo     Without Python you can still commit: the pre-commit
echo     hook skips, and the deploy workflow rebuilds the icon
echo     subset automatically on GitHub.
goto end

:gensubsetfailed
set RESULT=1
echo.
echo [FAILED] Subset generation failed ^(exit code %ERRORLEVEL%^). Common causes:
echo   - fonttools missing:      %PY% -m pip install fonttools brotli
echo   - unknown icon name:      check the name on remixicon.com
echo   - one-off fix:            run tools\setup.bat
goto end

:pipfailed
set RESULT=1
echo.
echo [FAILED] Could not install fonttools / brotli.
echo     Check the network, or run by hand: %PY% -m pip install fonttools brotli
goto end

:checkfailed
set RESULT=1
echo.
echo [FAILED] Icon check failed ^(exit code %ERRORLEVEL%^), see messages above.
goto end

:end
echo.
echo Press any key to close this window . . .
pause >nul
exit /b %RESULT%
