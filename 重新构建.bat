@echo off
rem Rebuild the site. The menu and all messages live in tools\build-watch.js:
rem cmd mangles non-ASCII inside a UTF-8 .bat, so this file stays ASCII.
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :no_node

rem Arguments skip the menu:
rem     rebuild.bat build    one build
rem     rebuild.bat watch    rebuild on every save
node tools\build-watch.js %~1
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" echo   [X] Build failed - see the messages above.
pause >nul
exit /b %RESULT%

:no_node
echo.
echo   [X] Node.js not found.
echo       Install the LTS build from https://nodejs.org/ then reopen this window.
echo.
pause >nul
exit /b 1
