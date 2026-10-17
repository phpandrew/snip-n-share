@echo off
setlocal
cd /d "%~dp0"
title Snip n Share - commit and release

:: Every push to main is built and released by GitHub Actions; the patch number
:: counts up automatically. Pass a version only to start a new line:
::   release.bat                         commit + push (next patch)
::   release.bat "Fixed crop handles"    same, with that message
::   release.bat 0.2.0 "Big update"      set VERSION to 0.2.0 first

set /p CUR=<VERSION
set ARG1=%~1
set MSG=%~2
echo %ARG1%| findstr /r "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (set MSG=%~1& set ARG1=)

if not "%ARG1%"=="" (
    echo [*] Base version %CUR% -^> %ARG1%
    >VERSION echo %ARG1%
)

git add -A
git diff --cached --quiet && (echo [*] Nothing to commit. & goto :push)
if "%MSG%"=="" set /p MSG=What changed? 
if "%MSG%"=="" set MSG=Update
git commit -qm "%MSG%" || goto :fail

:push
echo [*] Pushing...
git push || goto :fail

echo.
echo [OK] Pushed. GitHub is building the release now (~2-5 min):
echo      https://github.com/phpandrew/snip-n-share/actions
echo      Installed copies then get it via Check for updates.
pause
exit /b 0

:fail
echo.
echo [!] Stopped.
pause
exit /b 1
