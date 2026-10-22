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
- The custom upload host must be `https://` (plain `http://` only for localhost), and redirects are never followed, so the API key can't be sent to another host.
- Dropbox tokens never leave the main process; renderers only see "connected".
- GitHub Actions are pinned to commit SHAs (Dependabot keeps the pins current).

## Known limitations

- Until Azure Trusted Signing is configured (README → "Code signing"), the installer is unsigned:
  Windows SmartScreen warns on first install and updates are protected only by HTTPS to GitHub and
  the sha512 in `latest.yml`. Keep the GitHub account behind 2FA: anyone who can push to `main` can
  ship a release to every installed copy. Once signing is on, installed copies also verify the
  signer name of every update before installing it.
- Captures (and thumbnails) are kept unencrypted in `%APPDATA%\snip-n-share\history`; use
  History → Clear all, or turn off "Keep a local copy", if that's a concern on a shared machine.
