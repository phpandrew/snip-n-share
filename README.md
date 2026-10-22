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

## Code signing (Azure Trusted Signing)

Unsigned builds trigger Windows SmartScreen on install. The release workflow signs the installer
automatically once the Azure secrets below exist; until then builds are simply unsigned.

Azure Trusted Signing is Microsoft's cloud signing service (Basic plan US$9.99/month, 5,000
signatures). Individuals in the US and Canada can be validated with government ID; the certificate
is issued in your legal name and the key never leaves Azure. One-time setup, ~30 minutes plus the
identity-validation wait:

1. **Azure account** at portal.azure.com with a payment method on the subscription.
2. **Trusted Signing account** → search "Trusted Signing" in the portal → Create. Region East US or
   West US (closest with the service), SKU **Basic**. Note the **Account URI** on its Overview page,
   e.g. `https://eus.codesigning.azure.net` — that's `AZURE_SIGN_ENDPOINT`.
3. **Identity validation** (on the account) → New identity → **Individual**. Legal name, address,
   email; you'll be sent to a verification partner to scan your ID. Usually a day or two.
4. **Certificate profile** → Create → type **Public Trust**, pick the validated identity, name it
   e.g. `snip-n-share` — that's `AZURE_SIGN_PROFILE`. The account name is `AZURE_SIGN_ACCOUNT`.
5. **App registration** for GitHub: Microsoft Entra ID → App registrations → New (`snip-n-share-ci`).
   Copy the **Application (client) ID** → `AZURE_CLIENT_ID` and **Directory (tenant) ID** →
   `AZURE_TENANT_ID`. Certificates & secrets → New client secret (expiry 24 months) → copy the
   **Value** immediately → `AZURE_CLIENT_SECRET`.
6. **Give the app signing rights:** Trusted Signing account → Access control (IAM) → Add role
   assignment → role **Trusted Signing Certificate Profile Signer** → assign to `snip-n-share-ci`.
7. **GitHub secrets:** repo → Settings → Secrets and variables → Actions → New repository secret,
   for each of `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGN_ENDPOINT`,
   `AZURE_SIGN_ACCOUNT`, `AZURE_SIGN_PROFILE`, and `AZURE_SIGN_PUBLISHER` = the name exactly as
   validated in step 3 (the certificate's CN, e.g. `Andrew Lyle`).
8. Push a release. The job log shows `Code signing: ON`, and the "Verify signature" step prints the
   signer; the installer's Properties → Digital Signatures tab shows your name.

`AZURE_SIGN_PUBLISHER` matters beyond cosmetics: the installed app checks that each downloaded
update is signed by that name before installing it, so a compromised GitHub account alone can no
longer push a malicious update. Existing unsigned installs accept the first signed update normally.

SmartScreen reputation still builds up over the first few weeks of downloads, but with a validated
identity it clears far faster than an unsigned app and the "Unknown publisher" box is gone from day one.

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
