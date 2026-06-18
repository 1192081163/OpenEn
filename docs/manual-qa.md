# OpenEn Manual QA

## Build

Run:

```bash
npm install
npm test
npm run typecheck
npm run build
npm run build:safari
```

Expected result: all commands pass `dist/manifest.json` and `dist-safari/manifest.json` exist.

## Load Extension

1. Open Chrome or Edge.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable Developer mode.
4. Click "Load unpacked".
5. Select repository `dist` directory.

Expected result: OpenEn appears in extension list without manifest errors.

## Selection Translation Without DeepSeek Key

1. Open normal web page article text.
2. Select word `lead` inside paragraph `She will lead design review tomorrow`.
3. Wait OpenEn popup.
4. 点击划词弹窗里的“翻译”。

Expected result: button changes “翻译中...”, then popup shows only `带领；主持`.

5. Select same `lead` in same paragraph again click “翻译”.

Expected result: same translation appears immediately page cache.

## DeepSeek Mode

1. Open extension popup.
2. Enter DeepSeek API key.
3. Keep model `deepseek-v4-flash`.
4. 点击“保存”。
5. Select `lead` inside paragraph `She will lead design review tomorrow`.
6. 点击划词弹窗里的“翻译”。

Expected result: popup shows Chinese translation DeepSeek.

7. Save invalid DeepSeek API key, select different word click “翻译”.

Expected result: popup shows “翻译失败，请重试” “重试” button.

## Save Vocabulary

1. 点击划词弹窗里的“加入生词本”。
2. Open extension popup.
3. 点击“生词本”。

Expected result: tooltip button changes “已加入”, saved word appears in vocabulary page.

4. Translate same word same page again.

Expected result: tooltip shows “已加入” instead another save action.

5. Translate save `leading` or `led` from same page.

Expected result: vocabulary page shows `lead`, existing `lead` entry updated instead duplicated.

## Highlight Saved Vocabulary

1. Save `lead` vocabulary, reload article page.
2. Confirm extension popup “高亮生词” checked.

Expected result: word `lead` highlighted in page text, but `leadership`, input boxes, code blocks are not highlighted.

3. Select the highlighted `lead`.

Expected result: tooltip immediately shows the saved old Chinese translation, shows “已加入”, and includes “重新翻译”.

4. 点击“重新翻译”。

Expected result: tooltip shows refreshed Chinese translation without changing saved vocabulary entry.

5. Select the highlighted `lead` again.

Expected result: tooltip still starts from the old saved translation instead of the refreshed temporary translation.

6. Uncheck “高亮生词” in extension popup.

Expected result: highlights disappear current tab shortly after setting saves.

7. Check “高亮生词” again append reveal more page text containing `lead`.

Expected result: newly added visible page text highlighted without refreshing page.

## Manage Export

1. Search saved word.
2. 点击“导出 JSON”。
3. 点击“导出 CSV”。
4. Delete saved word.

Expected result: search filters entries, both exported files download, both exported files contain `lead` Chinese translation, delete removes row.

## Clear DeepSeek Key

1. Open extension popup.
2. 点击“清除”。
3. Select `lead` again on test page.
4. 点击划词弹窗里的“翻译”。

Expected result: OpenEn returns local Chinese fallback mode shows `带领；主持`.
