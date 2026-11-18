@echo off
rem One-click new post. All prompts live in tools\new-post.js --ask:
rem cmd is unreliable with non-ASCII inside a UTF-8 .bat (and splits arguments
rem on commas), so this file stays ASCII and only passes the title through.
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :no_node

rem Optional:  new-post.bat "Title"   -- skips the title question, still asks for tags
node tools\new-post.js --ask "%~1"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" echo   [X] Failed - see the messages above.
pause >nul
exit /b %RESULT%

:no_node
echo.
echo   [X] Node.js not found.
echo       Install the LTS build from https://nodejs.org/ then reopen this window.
echo.
pause >nul
exit /b 1
