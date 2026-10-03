# Snip n Share

Hotkey → freeze screen → drag a box → (optional) block-out / blur → upload → URL on clipboard → toast.

Electron app for Windows. Uploads to your own host (`g84.bid/snsupload.php`) or Dropbox.

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

1. Create the GitHub repo and set `build.publish.owner` / `repo` in `package.json`.
2. Bump `version` in `package.json`, commit, then:
   ```
   git tag v0.1.1
   git push origin main --tags
   ```
3. `.github/workflows/release.yml` builds on `windows-latest` and attaches
   `SnipNShare-Setup-0.1.1.exe` + `latest.yml` to a GitHub Release.
   The installed app checks that release feed (Settings → Updates, or on startup).

The release is created as a draft by electron-builder — publish it on GitHub when you're ready.

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
| Editor  | B / U                  | Box tool / Blur tool         |
| Editor  | Ctrl+Z                 | Undo                         |
| Editor  | Enter                  | Upload & copy URL            |
| Editor  | Ctrl+C / Ctrl+S / Esc  | Copy image / Save / Cancel   |

## Layout

```
src/main/        main process: tray, hotkey, capture, upload, history, updater
src/preload/     contextBridge APIs for each window
src/renderer/    overlay (selection), editor (box/blur), settings (tabs)
server/          snsupload.php for g84.bid
assets/          icons
```

Settings and history live in `%APPDATA%\snip-n-share\` (`settings.json`, `history.json`, `history\`).
