# Security

Please report vulnerabilities privately through
[GitHub's private vulnerability reporting](https://github.com/phpandrew/snip-n-share/security/advisories/new)
rather than a public issue.

## How this repo is checked

- **Dependabot** watches npm packages and GitHub Actions and opens pull requests for updates and security fixes.
- **CodeQL** scans the JavaScript and the workflows on every push, every pull request and weekly.
- **CI** builds every pull request on Windows and blocks newly added dependencies with known high-severity vulnerabilities.

## Hardening in the app

- All windows run sandboxed with context isolation, no Node integration and a strict Content-Security-Policy.
- Windows cannot open pop-ups or navigate away; only `http`/`https` links are ever passed to the OS.
- The g84.bid API key and Dropbox tokens are encrypted at rest with Windows DPAPI (`safeStorage`).
- Server-provided text (upload URLs) is rendered as text, never HTML.
