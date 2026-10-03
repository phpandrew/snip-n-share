@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
    echo Usage: release.bat 0.1.2  [commit message]
    echo Bumps package.json, commits, tags v0.1.2, pushes. GitHub Actions builds and publishes the release.
    exit /b 1
)
set VER=%~1
set MSG=%~2
if "%MSG%"=="" set MSG=v%VER%

git diff --quiet || (echo [*] Committing working changes first... & git add -A & git commit -qm "%MSG%")

call npm version %VER% --no-git-tag-version --allow-same-version >nul || (echo [!] version bump failed & exit /b 1)
git add package.json package-lock.json
git commit -qm "Release v%VER%"
git tag v%VER% || (echo [!] tag v%VER% already exists & exit /b 1)
git push && git push origin v%VER% || (echo [!] push failed & exit /b 1)

echo.
echo [OK] v%VER% pushed. Build: https://github.com/phpandrew/snip-n-share/actions
echo      Release will appear at https://github.com/phpandrew/snip-n-share/releases in ~5 min.
