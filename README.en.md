# OpenEn

English | [简体中文](README.md)

OpenEn is a browser extension for English reading. It lets you select English text, manually translate it into Chinese, save words to a local vocabulary book, and highlight saved words on web pages.

## Features

- Shows Chinese action buttons after text selection, then translates only after you click "Translate"
- Supports DeepSeek translation settings, with the API key stored in browser extension storage
- Includes a local Chinese fallback mode for development and testing without an API key
- Saves, searches, deletes, and exports vocabulary entries as JSON or CSV
- Normalizes word forms, so variants like `leading` and `led` can map back to `lead`
- Highlights saved English words on web pages
- Uses the saved translation first when selecting a highlighted word, with support for refreshing the translation
- Supports Chrome / Edge Manifest V3
- Includes Safari Web Extension build support

## Install Dependencies

```bash
npm install
```

## Local Debugging In Chrome / Edge

```bash
npm run build
```

Then open:

- Chrome: `chrome://extensions`
- Edge: `edge://extensions`

Enable Developer mode, click "Load unpacked", and select the `dist` directory in this repository.

## Local Debugging In Safari

Build the Safari WebExtension resources:

```bash
npm run build:safari
```

Generate or update the Xcode project:

```bash
xcrun safari-web-extension-converter dist-safari \
  --project-location safari/OpenEnSafari \
  --app-name OpenEn \
  --bundle-identifier com.example.openen \
  --copy-resources \
  --swift \
  --no-open
```

Replace `com.example.openen` with your own bundle identifier. Open the generated Xcode project, select the macOS app scheme and `My Mac`, then run the app.

If the local extension does not appear in Safari, enable "Allow unsigned extensions" in Safari's developer settings and run the macOS app again.

See [docs/safari.md](docs/safari.md) for more details.

## DeepSeek Configuration

Open the extension popup, enter your DeepSeek API key, and save it. OpenEn does not store API keys in this repository. The key is saved only in the browser's local extension storage.

The default model is:

```text
deepseek-v4-flash
```

## Common Commands

```bash
npm test
npm run typecheck
npm run build
npm run build:safari
```

## Releases

Keep the version number aligned in these files:

- `package.json`
- `public/manifest.json`
- `public/manifest.safari.json`

Chrome / Edge releases use `dist`. Safari releases require `npm run build:safari` first, then `safari-web-extension-converter` to update the Xcode project.

## Security

Do not commit real API keys, browser profiles, or Xcode user state. See [SECURITY.md](SECURITY.md) for reporting guidance.

## License

OpenEn is released under the [MIT License](LICENSE).
