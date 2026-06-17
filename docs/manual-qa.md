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
5. Select the repository `dist` directory.

Expected result: OpenEn appears in the extension list without manifest errors.

## Selection Translation Without DeepSeek Key

1. Open a normal web page with article text.
2. Select word `lead` inside paragraph `She will lead design review tomorrow`.
3. Wait for the OpenEn popup.

Expected result: popup appears near the selected text and shows `带领；主持`.

## DeepSeek Mode

1. Open the extension popup.
2. Enter a DeepSeek API key.
3. Keep model `deepseek-v4-flash`.
4. 点击“保存”。
5. Select `lead` inside paragraph `She will lead design review tomorrow`.

Expected result: popup shows a Chinese translation and contextual Chinese explanation from DeepSeek.

## Save Vocabulary

1. 点击划词弹窗里的“加入生词本”。
2. Open the extension popup.
3. Click "Vocabulary".

Expected result: saved word appears in the vocabulary page.

## Manage And Export

1. Search saved word.
2. 点击“导出 JSON”。
3. 点击“导出 CSV”。
4. Delete saved word.

Expected result: search filters entries, both exported files download, both exported files contain `lead` and a Chinese translation, and delete removes the row.

## Clear DeepSeek Key

1. Open the extension popup.
2. 点击“清除”。
3. Select `lead` again on the test page.

Expected result: OpenEn returns to local Chinese fallback mode and shows `带领；主持`.
