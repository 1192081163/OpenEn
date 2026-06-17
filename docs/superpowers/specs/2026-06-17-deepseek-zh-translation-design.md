# DeepSeek English-to-Chinese Translation Design

Date: 2026-06-17
Status: Design approved for personal-use implementation; ready implementation planning after user reviews written spec.

## Goal

Convert OpenEn from the current English-to-English fake translation loop into an English-to-Chinese selection translator, and add a personal-use DeepSeek provider that can be enabled with a user-supplied API key stored locally in the browser extension.

## Confirmed Decisions

- Target language: Simplified Chinese.
- Provider mode: personal-use DeepSeek integration in the extension background service worker.
- API key storage: `chrome.storage.local`.
- Default behavior without a configured key: keep the extension usable with a deterministic local Chinese fake provider.
- Public distribution security is out of scope for this iteration. A hosted backend should be used before distributing this extension to other users.

## External API Basis

DeepSeek's current API documentation describes an OpenAI-compatible API with base URL `https://api.deepseek.com` and Chat Completions endpoint `/chat/completions`. The current model list includes `deepseek-v4-flash` and `deepseek-v4-pro`; `deepseek-chat` and `deepseek-reasoner` are documented as deprecated after 2026-07-24 15:59 UTC. This design uses `deepseek-v4-flash` by default because selection translation benefits more from low latency than extended reasoning.

DeepSeek JSON Output requires `response_format: { "type": "json_object" }` and a prompt that explicitly asks for JSON and shows the expected shape. The provider will use that mode and validate the response before returning data to the content script.

References:

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/guides/json_mode

## User Experience

The existing selection flow stays the same: the user selects English text on a web page, the tooltip appears near the selection, and the user can save the entry to the vocabulary book.

The visible content changes to Chinese:

- `translation`: concise Chinese translation for the selected word or phrase.
- `partOfSpeech`: Chinese-readable part of speech when useful, such as `动词` or `名词`.
- `contextualMeaning`: short Chinese explanation of the meaning in the selected paragraph.
- `example`: optional short English example with Chinese meaning if the provider supplies it.

The popup/settings surface should expose:

- current provider status: local fake provider or DeepSeek;
- a field to save a DeepSeek API key;
- an optional model field defaulting to `deepseek-v4-flash`;
- a way to clear the API key and return to local fake mode.

No account login, sync, paid usage tracking, streaming UI, or Safari support is included in this iteration.

## Architecture

Keep the existing provider boundary:

- `contentScript` continues to extract selected text and paragraph context.
- `background` continues to receive `TRANSLATE_SELECTION` and call a `TranslationProvider`.
- Providers remain replaceable behind `TranslationProvider`.
- Vocabulary storage remains local and stores the provider string on each entry.

Add these focused units:

- `src/settings/translationSettings.ts`: load, save, clear, and validate translation settings in `chrome.storage.local`.
- `src/providers/deepseekTranslationProvider.ts`: call DeepSeek Chat Completions, request JSON output, parse and validate the response.
- `src/providers/chineseFakeTranslationProvider.ts`: deterministic local English-to-Chinese fallback.
- `src/providers/providerFactory.ts`: choose DeepSeek when a key is configured, otherwise use local Chinese fake provider.

Modify these existing units:

- `public/manifest.json`: add host permission for `https://api.deepseek.com/*`.
- `src/shared/types.ts`: allow `provider` values for `fake` and `deepseek`, while keeping stored vocabulary provider as a string for compatibility.
- `src/background/serviceWorker.ts`: construct the provider through settings-aware factory.
- `src/ui/popup/*`: add minimal provider/key controls without turning the popup into a large settings app.
- tests and manual QA docs to cover Chinese output and DeepSeek configuration.

## DeepSeek Request Shape

The provider will send a non-streaming request:

```json
{
  "model": "deepseek-v4-flash",
  "messages": [
    {
      "role": "system",
      "content": "You are a precise English-to-Simplified-Chinese dictionary translator. Output only JSON."
    },
    {
      "role": "user",
      "content": "json request containing selectedText and paragraphContext"
    }
  ],
  "thinking": { "type": "disabled" },
  "response_format": { "type": "json_object" },
  "stream": false,
  "temperature": 0.2,
  "max_tokens": 500
}
```

Expected JSON content:

```json
{
  "translation": "带领",
  "partOfSpeech": "动词",
  "contextualMeaning": "在这段话中，lead 表示带领或主持某项活动。",
  "example": "She will lead the review. 她将主持这次评审。",
  "confidence": 0.9
}
```

The provider returns the existing `TranslationResult` shape and sets:

- `selectedText` from the original request, not from the model response;
- `provider` to `deepseek`;
- `confidence` clamped to 0 through 1 when present.

## Error Handling

- Missing API key: provider factory uses Chinese fake provider.
- Network failure, non-2xx response, invalid JSON, missing translation, or empty response: return a failure to the content script. The content script already suppresses failed translations, so a later iteration can add visible retry/error UI.
- DeepSeek content filtered or length-truncated responses: treat as provider failure because the structured result cannot be trusted.
- API key is never written to logs, test snapshots, exported vocabulary, or the page context.

## Privacy And Security

This personal-use implementation stores the API key in `chrome.storage.local`, which is acceptable for local use but not a secure distribution model. Selected text and paragraph context are sent to DeepSeek only when DeepSeek mode is enabled by saving a key. Without a key, no page text leaves the browser because the local fake provider is used.

Before any public release, replace direct extension-to-DeepSeek calls with a backend service that holds the key server-side, applies rate limiting, and avoids exposing provider credentials to extension users.

## Testing Strategy

Automated tests should cover:

- Chinese fake provider returns context-sensitive Chinese translations for `lead`.
- translation settings save/load/clear without leaking key in unrelated data structures.
- provider factory chooses fake without a key and DeepSeek with a key.
- DeepSeek provider constructs the documented request shape.
- DeepSeek provider parses valid JSON into `TranslationResult`.
- DeepSeek provider rejects invalid JSON, missing translation, non-2xx response, and length-truncated responses.
- manifest includes `https://api.deepseek.com/*` host permission.
- popup settings controls can save and clear provider configuration.

Manual Chrome QA should cover:

1. Load unpacked extension from `dist`.
2. Confirm no-key mode still translates `lead` to Chinese locally.
3. Save a DeepSeek API key in the popup.
4. Select `lead` in `She will lead design review tomorrow`.
5. Confirm tooltip shows Chinese translation and contextual Chinese explanation.
6. Add to vocabulary and confirm the entry stores provider `deepseek`.
7. Clear the key and confirm local fallback still works.

## Non-Goals

- Building a backend service.
- Supporting Safari.
- Adding user accounts or cloud sync.
- Implementing streaming translation UI.
- Supporting multi-provider pricing or usage dashboards.
- Solving API key security for public distribution.
