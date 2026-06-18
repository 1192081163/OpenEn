# Safari Build

OpenEn keeps the Chrome/Edge build in `dist` and writes a Safari-ready WebExtension build to `dist-safari`.

## Build

```bash
npm run build:safari
```

Expected output:

- `dist-safari/manifest.json`
- `dist-safari/background/serviceWorker.js`
- `dist-safari/content/contentScript.js`
- `dist-safari/ui/popup/popup.html`
- `dist-safari/ui/vocabulary/vocabulary.html`

## Convert To Xcode

Run this on a Mac with Xcode command-line tools installed:

```bash
xcrun safari-web-extension-converter dist-safari \
  --project-location safari/OpenEnSafari \
  --app-name OpenEn \
  --bundle-identifier com.example.openen \
  --copy-resources \
  --swift \
  --no-open
```

Replace `com.example.openen` with your Apple Developer bundle identifier before signing or distributing.

## Local Safari Test

1. Open the generated Xcode project.
2. Select the macOS app scheme.
3. Configure signing if Xcode asks for it.
4. Run the app from Xcode.
5. In Safari, enable the extension in Settings > Extensions.
6. Grant website access when Safari asks.

For local unsigned testing, enable Safari's Develop menu and Allow Unsigned Extensions if needed.

## Notes

- Safari uses the same extension resources as Chrome after conversion, but it is packaged inside an app.
- `dist-safari` intentionally omits `activeTab`; current-tab refresh is best effort through `tabs` when available.
- The runtime uses a shared `browser` / `chrome` compatibility layer, so Safari can use promise-style `browser.*` APIs while Chrome and Edge continue to work.
