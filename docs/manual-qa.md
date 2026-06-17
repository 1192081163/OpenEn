# OpenEn Manual QA

## Build

Run:

```bash
npm install
npm test
npm run typecheck
npm run build
```

Expected result: all commands pass and `dist/manifest.json` exists.

## Load Extension

1. Open Chrome or Edge.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable Developer mode.
4. Click "Load unpacked".
5. Select the `dist` directory from this repository.

Expected result: OpenEn appears in the extension list without manifest errors.

## Selection Translation

1. Open a normal web page with article text.
2. Select the word `lead` inside a paragraph such as `She will lead the design review tomorrow`.
3. Wait for the OpenEn popup.

Expected result: popup appears near the selected text and shows `lead as guide`.

## Save Vocabulary

1. Click "Add to vocabulary" in the selection popup.
2. Open the extension popup.
3. Click "Vocabulary".

Expected result: the saved word appears in the vocabulary page.

## Manage And Export

1. Search for the saved word.
2. Export JSON.
3. Export CSV.
4. Delete the saved word.

Expected result: search filters entries, both exported files download, both exported files contain `lead` and `lead as guide`, and delete removes the row.
