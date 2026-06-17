# OpenEn Browser Extension Design

Date: 2026-06-17
Status: Design approved by user; ready for implementation planning after user reviews this written spec.

## Goal

Build the first usable version of a browser extension for contextual word translation and vocabulary capture. The extension should let a user select a word or phrase on a web page, infer meaning from the selected text's paragraph, show a lightweight translation popup, and optionally save the item to a local vocabulary book.

## Confirmed Decisions

- Target browser for v1: Chrome and Edge using Manifest V3.
- Safari is a later target. Core logic should avoid unnecessary Chrome-only coupling so it can be wrapped as a Safari Web Extension later.
- Translation backend for v1: local fake data behind a replaceable translation provider interface.
- Context strategy: use the selected text's containing paragraph as context.
- Vocabulary book: stored locally in browser extension storage.
- Export: support JSON and CSV.
- Visual style: system-native, minimal, and low interruption.
- Out of scope for v1: real AI API integration, account login, cloud sync, review scheduling, mobile Safari, Firefox, and a full spaced-repetition learning system.

## User Experience

### Selection Translation

When the user selects text on a supported web page, the content script detects the selection and extracts:

- `selectedText`: the exact selected word or phrase.
- `paragraphContext`: the closest meaningful paragraph or text block containing the selection.
- `sourceUrl`: current page URL.
- `pageTitle`: current document title.

The extension shows a small floating popup near the selection. The popup should feel like a browser-native utility surface, not a heavy app panel. It contains:

- selected text;
- translation;
- part of speech when available;
- contextual explanation based on the paragraph;
- a short example sentence when available;
- an "Add to vocabulary" action;
- a close action.

The popup should not permanently alter the host page. It should be removed when the user clicks elsewhere, presses Escape, scrolls far away, or changes the selection.

### Vocabulary Book

The extension popup shows a compact entry point and recent saved words. The full `vocabularyPage` provides vocabulary management. V1 should include:

- list saved entries;
- search by word, translation, or source page title;
- delete an entry;
- export entries as JSON;
- export entries as CSV.

No account or sync behavior is included in v1.

## Architecture

Use a small WebExtension codebase rather than a large framework for v1.

Primary units:

- `manifest.json`: Chrome/Edge Manifest V3 configuration.
- `contentScript`: runs on web pages, observes selection, extracts paragraph context, renders and manages the floating translation popup.
- `backgroundServiceWorker`: receives translation and vocabulary messages, calls providers, coordinates storage, and keeps privileged extension APIs out of page context.
- `translationProvider`: replaceable interface. V1 implementation returns local fake data; future implementation can call OpenAI or another translation API.
- `vocabularyStore`: wrapper around `chrome.storage.local` for add/list/delete/search/export operations.
- `popupPage`: compact extension popup for opening the vocabulary page and showing recent entries.
- `vocabularyPage`: full vocabulary management UI, exposed through the extension options page and from the popup.

Recommended initial structure:

```text
src/
  background/
    serviceWorker.ts
  content/
    contentScript.ts
    selectionContext.ts
    tooltip.ts
  providers/
    translationProvider.ts
    fakeTranslationProvider.ts
  storage/
    vocabularyStore.ts
  ui/
    popup/
    vocabulary/
  shared/
    types.ts
manifest.json
```

## Data Flow

1. User selects a word or phrase on a page.
2. `contentScript` validates the selection and extracts the nearest paragraph context.
3. `contentScript` sends `TRANSLATE_SELECTION` to `backgroundServiceWorker`.
4. `backgroundServiceWorker` calls `translationProvider.translate(...)`.
5. `backgroundServiceWorker` returns a structured translation result.
6. `contentScript` renders the floating popup.
7. If the user clicks "Add to vocabulary", `contentScript` sends `SAVE_VOCABULARY_ENTRY`.
8. `backgroundServiceWorker` writes the entry through `vocabularyStore`.
9. Vocabulary UI reads from `vocabularyStore` and handles search, delete, and export.

## Translation Provider Contract

The provider boundary should be designed for later AI integration.

```ts
export interface TranslationRequest {
  selectedText: string;
  paragraphContext: string;
  sourceLang?: string;
  targetLang: string;
}

export interface TranslationResult {
  selectedText: string;
  translation: string;
  partOfSpeech?: string;
  contextualMeaning: string;
  example?: string;
  confidence?: number;
  provider: "fake" | "openai" | "external";
}

export interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
```

V1 fake behavior can use a small local dictionary for known words and a deterministic fallback for unknown text. It should still consume `paragraphContext` so tests and future providers exercise the same call path.

Default language behavior for v1: source language is auto-detected by the provider when possible, and target language is Simplified Chinese (`zh-CN`).

## Vocabulary Data Model

```ts
export interface VocabularyEntry {
  id: string;
  selectedText: string;
  translation: string;
  partOfSpeech?: string;
  contextualMeaning: string;
  example?: string;
  paragraphContext: string;
  sourceUrl: string;
  pageTitle: string;
  createdAt: string;
  provider: string;
}
```

Duplicate handling for v1: if the same `selectedText` is saved from the same `sourceUrl`, update the existing entry's translation fields and keep a single entry. If the same word appears on different pages, store separate entries because context can change meaning.

## Context Extraction

The extractor should start from the active selection range and walk up the DOM to find the closest useful text container. Preferred containers include `p`, `li`, `blockquote`, `article`, `section`, and readable `div` blocks. It should reject empty text, script/style content, and very short containers that do not contain the selected text.

If no useful paragraph is found, fallback to the selection's surrounding text node content. Cap context length to a practical limit, such as 1,500 characters, to avoid storing excessive page text.

## Error Handling

- If selection is empty or too long, do not show the popup.
- If paragraph context cannot be found, show a result using selected text only.
- If translation provider fails, show a compact error state with a retry action.
- If saving vocabulary fails, keep the popup open and show a small failure message.
- If export has no entries, export an empty valid JSON array or CSV with headers.

## Privacy And Permissions

Use the narrowest practical permissions for v1:

- `storage` for local vocabulary.
- Static content scripts on `http://*/*` and `https://*/*` pages so selection translation works without clicking the extension icon first.
- No network permissions are required for the fake provider.

The extension should not send page content to any external service in v1. Future AI integration must make the provider behavior explicit and should include user-facing API key or service configuration before network calls are enabled.

## Visual Direction

The floating popup should use restrained browser-utility styling:

- small surface near selection;
- neutral colors;
- compact typography;
- subtle border and shadow;
- clear icon or text actions;
- no decorative hero, marketing layout, or heavy card composition.

The vocabulary page can be denser and more tool-like: search input at the top, entries in a simple list or table, export actions in the toolbar, and delete actions per row.

## Testing Strategy

Automated tests should cover:

- paragraph context extraction from common HTML structures;
- translation provider contract and fake provider fallback;
- vocabulary add, update, list, delete, search;
- JSON and CSV export formatting;
- message contract between content script and background service worker where practical.

Manual browser checks should cover:

- loading the unpacked extension in Chrome or Edge;
- selecting a word on a normal article page;
- popup placement and dismissal;
- adding a vocabulary entry;
- viewing, searching, deleting, and exporting vocabulary entries.

## Implementation Notes

Keep v1 intentionally small. The central quality bar is a reliable product loop:

select text -> get paragraph-aware fake translation -> save vocabulary -> manage and export saved entries.

Do not add real AI integration until this loop is stable and testable.
