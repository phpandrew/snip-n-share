# Snip n Share

Hotkey → freeze screen → drag a box → (optional) block-out / blur → upload → URL on clipboard → toast.

Electron app for Windows. Uploads to your own host (`g84.bid/snsupload.php`) or Dropbox.

## About

Created by Andrew Lyle — [@phpandrew](https://github.com/phpandrew).

## Run from source

```
npm install
npm start
```

## Build the installer (.exe)

```
npm run dist
```

Produces `dist/SnipNShare-Setup-<version>.exe` (NSIS installer, per-user, with uninstaller).

## Releases + in-app updates

Every push to `main` is built and released by `.github/workflows/release.yml`
(Windows runner → `SnipNShare-Setup-X.Y.Z.exe`, `.blockmap`, `latest.yml` on a GitHub Release).
Installed copies pick it up on startup or from About → Check for updates.

Version numbers:

- `VERSION` (repo root) is the base, e.g. `0.1.3`.
- If that version isn't released yet, it's used as-is. Otherwise the patch counts up from the
  newest release in that line: 0.1.4, 0.1.5, …
- To start a new line, set `VERSION` to `0.2.0` (or `1.0.0`) and push.

Not every push needs a release:

- Commits that only touch `*.md`, `*.bat`, `.gitignore` or `server/` don't build.
- Put `[skip release]` in a commit message to skip that one.
- The workflow can also be run by hand from the Actions tab.

`release.bat` commits everything and pushes (`release.bat "message"`, or
`release.bat 0.2.0 "message"` to set a new base version). `build.bat` builds locally.

## Your own host (g84.bid)

1. Copy `server/snsupload.php` to the web root → `https://g84.bid/snsupload.php`.
2. Edit `API_KEY` at the top (`openssl rand -hex 24`).
3. `mkdir i` next to it, writable by PHP (`chown www-data:www-data i`).
4. nginx: serve `/i/` statically, deny PHP execution there:
   ```
   location /i/ { location ~ \.php$ { return 404; } }
   ```
5. In the app: Settings → Upload → Custom host → URL `https://g84.bid/snsupload.php`, paste the key, click **Test**.

Images land at `https://g84.bid/i/<8 random chars>.jpg|png`.

## Dropbox

1. https://www.dropbox.com/developers/apps → Create app → Scoped access → App folder (or Full Dropbox).
2. Permissions tab: `files.content.write`, `sharing.write`, `sharing.read`, `account_info.read` → Submit.
3. Settings tab: copy the **App key** into the app (Settings → Upload → Dropbox).
4. Click **Connect**, approve in the browser, paste the code back, click **Finish**.

A long-lived refresh token is stored; short-lived access tokens are refreshed automatically.
Share links are rewritten `?dl=0` → `?raw=1` so they load as the image directly.

## Keys

| Where   | Key                    | Action                       |
|---------|------------------------|------------------------------|
| Global  | Ctrl + Alt + PrtScn    | Start capture (configurable) |
| Overlay | drag / click / Esc     | select / whole monitor / cancel |
| Editor  | P H A R B T N U C      | Pen, Highlighter, Arrow, Rectangle, solid Box, Text, Numbered step, blUr, Crop |
| Editor  | 1–8                    | Colour swatches              |
| Editor  | [ / ]                  | Smaller / bigger (blur: weaker / stronger) |
| Editor  | Ctrl+Z / Ctrl+Y        | Undo / Redo                  |
| Editor  | Enter                  | Upload & copy URL (in Crop: apply crop) |
| Editor  | Ctrl+C / Ctrl+S / Esc  | Copy image / Save / Cancel   |

Colour and size changes apply to the annotation you just drew until you switch tools.
Tool, colour, size, blur strength and output format are remembered between captures.
Tools can be hidden in Settings → General → Editor tools.

## Layout

```
src/main/        main process: tray, hotkey, capture, upload, history, updater
src/preload/     contextBridge APIs for each window
src/renderer/    overlay (selection), editor (box/blur), settings (tabs)
server/          snsupload.php for g84.bid
assets/          icons
```

Settings and history live in `%APPDATA%\snip-n-share\` (`settings.json`, `history.json`, `history\`).
