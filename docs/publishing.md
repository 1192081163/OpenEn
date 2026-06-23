# Publishing

OpenEn can ship to Chromium browsers first and defer Safari until Apple Developer Program cost is justified.

## Build Store Packages

```bash
npm run package:all
```

Outputs:

- `release/openen-chrome-v0.1.0.zip`
- `release/openen-edge-v0.1.0.zip`

Run one target when needed:

```bash
npm run package:chrome
npm run package:edge
```

The zip contents start at the extension root, so `manifest.json` is not nested under `dist/`.

## Versioning

Before submitting an update, bump both:

- `package.json` `version`
- `public/manifest.json` `version`

The manifest test verifies they match.

## Chrome Web Store

Chrome Web Store requires a developer account and a one-time registration fee. Upload `release/openen-chrome-v<version>.zip` as the package.

Use the same short description, screenshots, privacy disclosure, and permission explanation as the final listing copy. Current extension permissions are `storage`, `activeTab`, and DeepSeek host access.

## Microsoft Edge Add-ons

Microsoft Edge Add-ons registration is free. Upload `release/openen-edge-v<version>.zip`.

Edge accepts the same Chromium build, so this path is the lowest-cost public release channel.

## Safari

Safari distribution can wait. App Store distribution and Developer ID notarized distribution both require Apple Developer Program membership. Local development can continue with `npm run build:safari`.
