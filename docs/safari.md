# Safari Build

OpenEn keeps the Chrome/Edge build in `dist` and writes a Safari-ready WebExtension build to `dist-safari`.

## Build

```bash
npm run build:safari
```

If the Xcode project exists, this also syncs WebExtension resources into:

```text
safari/OpenEnSafari/OpenEn/Shared (Extension)/Resources
```

Expected output:

- `dist-safari/manifest.json`
- `dist-safari/background/serviceWorker.js`
- `dist-safari/content/contentScript.js`
- `dist-safari/ui/popup/popup.html`
- `dist-safari/ui/vocabulary/vocabulary.html`

## Update Existing Xcode Project

After the Xcode project has been created once, normal local updates are automatic after:

```bash
npm run build:safari
```

If `dist-safari` already exists and only resources need copying, run:

```bash
npm run safari:sync
```

Then rerun the macOS app target in Xcode so Safari loads the updated extension bundle.

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

Replace `com.example.openen` with your Apple Developer bundle identifier before signing and distributing.

## Local Safari Test

1. Open the generated Xcode project.
2. Select the macOS app scheme.
3. Configure signing if Xcode asks for it.
4. Run the app from Xcode.
5. In Safari, enable the extension in Settings > Extensions.
6. Grant website access when Safari asks.

For local unsigned testing, enable Safari's Develop menu and Allow Unsigned Extensions if needed.

## Notes

- Safari uses the same extension resources as the Chrome conversion, but they are packaged inside the app.
- `dist-safari` intentionally omits `activeTab`; current-tab refresh is best effort through available `tabs` APIs.
- Runtime uses the shared `browser` / `chrome` compatibility layer, so Safari can use promise-style `browser.*` APIs while Chrome and Edge continue to work.
