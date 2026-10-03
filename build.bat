@echo off
setlocal
cd /d "%~dp0"
title Snip n Share - build

:: ---------- Node.js: install if missing ----------
where node >nul 2>&1 && goto :node_ok
if exist "%ProgramFiles%\nodejs\node.exe" (set "PATH=%ProgramFiles%\nodejs;%PATH%" & goto :node_ok)

echo [*] Node.js not found - installing LTS...
where winget >nul 2>&1
if %errorlevel%==0 (
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent
) else (
    echo [*] winget not available, downloading MSI from nodejs.org...
    curl -L -o "%TEMP%\node-lts.msi" "https://nodejs.org/dist/latest-v22.x/node-v22.20.0-x64.msi" || (echo [!] Download failed & pause & exit /b 1)
    msiexec /i "%TEMP%\node-lts.msi" /qn /norestart || (echo [!] Node install failed & pause & exit /b 1)
)
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
where node >nul 2>&1 || (echo [!] Node installed but not on PATH yet - close this window, open a new one and run build.bat again. & pause & exit /b 1)
:node_ok
for /f "delims=" %%v in ('node -v') do echo [*] Node %%v

:: ---------- Optional version bump: build.bat 0.1.1 ----------
if not "%~1"=="" (
    echo [*] Setting version to %~1
    call npm version %~1 --no-git-tag-version --allow-same-version >nul || (echo [!] version bump failed & pause & exit /b 1)
)

:: ---------- Dependencies: install if missing or package.json changed ----------
set NEED_INSTALL=0
if not exist node_modules\electron\dist\electron.exe set NEED_INSTALL=1
if not exist package-lock.json set NEED_INSTALL=1
for /f %%i in ('forfiles /m package.json /c "cmd /c echo @fdate@ftime"') do set PKG_T=%%i
if exist node_modules\.install-stamp (
    for /f "usebackq delims=" %%i in ("node_modules\.install-stamp") do if not "%%i"=="%PKG_T%" set NEED_INSTALL=1
) else set NEED_INSTALL=1

if "%NEED_INSTALL%"=="1" (
    echo [*] Installing dependencies...
    call npm install --no-audit --no-fund || (echo [!] npm install failed & pause & exit /b 1)
    echo %PKG_T%> node_modules\.install-stamp
) else (
    echo [*] Dependencies up to date
)

:: ---------- Build ----------
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VER=%%v
echo [*] Building Snip n Share v%VER% ...
call npm run dist || (echo [!] Build failed & pause & exit /b 1)

echo.
echo [OK] dist\SnipNShare-Setup-%VER%.exe
start "" explorer.exe "%~dp0dist"
pause
