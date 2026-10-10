@echo off
setlocal
cd /d "%~dp0"
title Snip n Share - release

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set CUR=%%v

set VER=%~1
set MSG=%~2
if "%VER%"=="" (
    echo Current version: %CUR%
    set /p VER=New version ^(e.g. 0.1.3^): 
)
if "%VER%"=="" (echo [!] No version entered. & goto :fail)
if "%VER%"=="%CUR%" (echo [!] %VER% is already the current version - pick a higher one. & goto :fail)
if "%MSG%"=="" set /p MSG=Commit message for your changes ^(Enter for "v%VER%"^): 
if "%MSG%"=="" set MSG=v%VER%

git rev-parse -q --verify "refs/tags/v%VER%" >nul && (echo [!] Tag v%VER% already exists. & goto :fail)

git add -A
git diff --cached --quiet || (echo [*] Committing your changes... & git commit -qm "%MSG%" || goto :fail)

echo [*] Bumping version %CUR% -^> %VER%
call npm version %VER% --no-git-tag-version --allow-same-version >nul || goto :fail
git add package.json package-lock.json
git commit -qm "Release v%VER%" || goto :fail
git tag v%VER% || goto :fail

echo [*] Pushing...
git push || goto :fail
git push origin v%VER% || goto :fail

echo.
echo [OK] v%VER% pushed. GitHub is building it now (~2-5 min):
echo      https://github.com/phpandrew/snip-n-share/actions
echo      Then installed copies get it via Check for updates.
pause
exit /b 0

:fail
echo.
echo [!] Release stopped.
pause
exit /b 1
