# DeepSeek English-to-Chinese Translation Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add personal-use DeepSeek English-to-Chinese translation while keeping a local Chinese fallback when no API key is configured.

**Architecture:** Keep the existing message and content-script flow. Add settings storage for provider configuration, add a DeepSeek provider behind the existing `TranslationProvider` interface, and choose the provider in the background service worker based on stored settings. The popup becomes the small settings surface for saving and clearing the DeepSeek API key.

**Tech Stack:** TypeScript, Manifest V3, Chrome extension APIs, esbuild, Vitest, jsdom.

---

### Task 1: Add Translation Provider Types And Chinese Fake Provider

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/providers/chineseFakeTranslationProvider.ts`
- Create: `src/providers/chineseFakeTranslationProvider.test.ts`

- [ ] **Step 1: Write failing tests for Chinese fallback behavior**

Create `src/providers/chineseFakeTranslationProvider.test.ts`:

```ts
import { createChineseFakeTranslationProvider } from "./chineseFakeTranslationProvider";

describe("createChineseFakeTranslationProvider", () => {
  it("translates lead as a verb using paragraph context", async () => {
    const provider = createChineseFakeTranslationProvider();

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(result).toMatchObject({
      selectedText: "lead",
      translation: "带领；主持",
      partOfSpeech: "动词",
      contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
      provider: "fake"
    });
  });

  it("translates lead as a metal using paragraph context", async () => {
    const provider = createChineseFakeTranslationProvider();

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "The old pipe contained lead paint and heavy metal residue.",
      targetLang: "zh-CN"
    });

    expect(result).toMatchObject({
      selectedText: "lead",
      translation: "铅",
      partOfSpeech: "名词",
      contextualMeaning: "在这段话中，lead 表示一种有毒的重金属。",
      provider: "fake"
    });
  });

  it("returns a Chinese fallback for unknown selected text", async () => {
    const provider = createChineseFakeTranslationProvider();

    const result = await provider.translate({
      selectedText: "review",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(result.translation).toBe("review 的中文释义");
    expect(result.contextualMeaning).toContain("基于上下文");
    expect(result.provider).toBe("fake");
  });
});
```

- [ ] **Step 2: Run provider test and verify RED**

Run:

```bash
npm test -- src/providers/chineseFakeTranslationProvider.test.ts
```

Expected: FAIL because `src/providers/chineseFakeTranslationProvider.ts` does not exist.

- [ ] **Step 3: Allow DeepSeek provider type and implement Chinese fake provider**

Modify `src/shared/types.ts`:

```ts
export type TranslationProviderName = "fake" | "deepseek" | "openai" | "external";

export interface TranslationResult {
  selectedText: string;
  translation: string;
  partOfSpeech?: string;
  contextualMeaning: string;
  example?: string;
  confidence?: number;
  provider: TranslationProviderName;
}
```

Create `src/providers/chineseFakeTranslationProvider.ts`:

```ts
import type { TranslationRequest, TranslationResult } from "../shared/types";
import type { TranslationProvider } from "./translationProvider";

function firstSentence(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.{1,160}?[.!?])(\s|$)/);
  return match?.[1] ?? normalized.slice(0, 160);
}

function translateLead(context: string): TranslationResult {
  const lowerContext = context.toLowerCase();

  if (/\b(pipe|metal|paint|battery|poison|plumbing|residue)\b/.test(lowerContext)) {
    return {
      selectedText: "lead",
      translation: "铅",
      partOfSpeech: "名词",
      contextualMeaning: "在这段话中，lead 表示一种有毒的重金属。",
      example: "The pipe contained lead. 这根管道含有铅。",
      confidence: 0.9,
      provider: "fake"
    };
  }

  return {
    selectedText: "lead",
    translation: "带领；主持",
    partOfSpeech: "动词",
    contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
    example: "She will lead the review. 她将主持这次评审。",
    confidence: 0.9,
    provider: "fake"
  };
}

export function createChineseFakeTranslationProvider(): TranslationProvider {
  return {
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      const selectedText = request.selectedText.trim();
      const paragraphContext = request.paragraphContext.trim();

      if (selectedText.toLowerCase() === "lead") return translateLead(paragraphContext);

      return {
        selectedText,
        translation: `${selectedText} 的中文释义`,
        contextualMeaning: `基于上下文：${firstSentence(paragraphContext)}`,
        example: `${selectedText} 可以结合原文语境理解。`,
        confidence: 0.5,
        provider: "fake"
      };
    }
  };
}
```

- [ ] **Step 4: Run provider test and verify GREEN**

Run:

```bash
npm test -- src/providers/chineseFakeTranslationProvider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Chinese fallback**

Run:

```bash
git add src/shared/types.ts src/providers/chineseFakeTranslationProvider.ts src/providers/chineseFakeTranslationProvider.test.ts
git commit -m "feat: add chinese fallback translation provider"
```

### Task 2: Add Translation Settings Storage

**Files:**
- Create: `src/settings/translationSettings.ts`
- Create: `src/settings/translationSettings.test.ts`

- [ ] **Step 1: Write failing settings storage tests**

Create `src/settings/translationSettings.test.ts`:

```ts
import {
  clearDeepSeekApiKey,
  createTranslationSettingsStore,
  getDefaultTranslationSettings,
  loadTranslationSettings,
  saveDeepSeekSettings,
  type SettingsStorageLike
} from "./translationSettings";

const SETTINGS_KEY = "openen:translation-settings";

function createMemoryStorage(initial?: unknown): SettingsStorageLike {
  const data = new Map<string, unknown>();
  if (initial !== undefined) data.set(SETTINGS_KEY, initial);

  return {
    async get(key: string) {
      return { [key]: data.get(key) };
    },
    async set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    }
  };
}

describe("translationSettings", () => {
  it("loads default local provider settings when storage is empty", async () => {
    const settings = await loadTranslationSettings(createMemoryStorage());

    expect(settings).toEqual(getDefaultTranslationSettings());
  });

  it("saves DeepSeek api key and trims the model", async () => {
    const storage = createMemoryStorage();
    const saved = await saveDeepSeekSettings(storage, {
      apiKey: " sk-test ",
      model: " deepseek-v4-pro "
    });

    expect(saved).toEqual({
      provider: "deepseek",
      deepseek: {
        apiKey: "sk-test",
        model: "deepseek-v4-pro"
      }
    });
    expect(await loadTranslationSettings(storage)).toEqual(saved);
  });

  it("uses deepseek-v4-flash when model is blank", async () => {
    const storage = createMemoryStorage();

    const saved = await saveDeepSeekSettings(storage, {
      apiKey: "sk-test",
      model: " "
    });

    expect(saved.deepseek.model).toBe("deepseek-v4-flash");
  });

  it("clears the api key and returns to local provider", async () => {
    const storage = createMemoryStorage({
      provider: "deepseek",
      deepseek: { apiKey: "sk-test", model: "deepseek-v4-pro" }
    });

    const cleared = await clearDeepSeekApiKey(storage);

    expect(cleared).toEqual(getDefaultTranslationSettings());
    expect(await loadTranslationSettings(storage)).toEqual(getDefaultTranslationSettings());
  });

  it("ignores malformed stored settings", async () => {
    const settings = await loadTranslationSettings(
      createMemoryStorage({ provider: "deepseek", deepseek: { apiKey: 42, model: null } })
    );

    expect(settings).toEqual(getDefaultTranslationSettings());
  });

  it("creates a chrome-backed settings store", () => {
    const storage = createMemoryStorage();
    const store = createTranslationSettingsStore(storage);

    expect(store.load).toBeInstanceOf(Function);
    expect(store.saveDeepSeek).toBeInstanceOf(Function);
    expect(store.clearDeepSeek).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 2: Run settings test and verify RED**

Run:

```bash
npm test -- src/settings/translationSettings.test.ts
```

Expected: FAIL because `src/settings/translationSettings.ts` does not exist.

- [ ] **Step 3: Implement settings storage**

Create `src/settings/translationSettings.ts`:

```ts
export const TRANSLATION_SETTINGS_KEY = "openen:translation-settings";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export interface SettingsStorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface TranslationSettings {
  provider: "local" | "deepseek";
  deepseek: {
    apiKey: string;
    model: string;
  };
}

export interface TranslationSettingsStore {
  load(): Promise<TranslationSettings>;
  saveDeepSeek(input: { apiKey: string; model?: string }): Promise<TranslationSettings>;
  clearDeepSeek(): Promise<TranslationSettings>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getDefaultTranslationSettings(): TranslationSettings {
  return {
    provider: "local",
    deepseek: {
      apiKey: "",
      model: DEFAULT_DEEPSEEK_MODEL
    }
  };
}

function normalizeStoredSettings(value: unknown): TranslationSettings {
  if (!isRecord(value) || value.provider !== "deepseek" || !isRecord(value.deepseek)) {
    return getDefaultTranslationSettings();
  }

  const apiKey = typeof value.deepseek.apiKey === "string" ? value.deepseek.apiKey.trim() : "";
  const model =
    typeof value.deepseek.model === "string" && value.deepseek.model.trim()
      ? value.deepseek.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;

  if (!apiKey) return getDefaultTranslationSettings();

  return {
    provider: "deepseek",
    deepseek: { apiKey, model }
  };
}

export async function loadTranslationSettings(storage: SettingsStorageLike): Promise<TranslationSettings> {
  const values = await storage.get(TRANSLATION_SETTINGS_KEY);
  return normalizeStoredSettings(values[TRANSLATION_SETTINGS_KEY]);
}

export async function saveDeepSeekSettings(
  storage: SettingsStorageLike,
  input: { apiKey: string; model?: string }
): Promise<TranslationSettings> {
  const apiKey = input.apiKey.trim();
  const model = input.model?.trim() || DEFAULT_DEEPSEEK_MODEL;
  const settings: TranslationSettings = apiKey
    ? { provider: "deepseek", deepseek: { apiKey, model } }
    : getDefaultTranslationSettings();

  await storage.set({ [TRANSLATION_SETTINGS_KEY]: settings });
  return settings;
}

export async function clearDeepSeekApiKey(storage: SettingsStorageLike): Promise<TranslationSettings> {
  const settings = getDefaultTranslationSettings();
  await storage.set({ [TRANSLATION_SETTINGS_KEY]: settings });
  return settings;
}

export function createTranslationSettingsStore(storage: SettingsStorageLike): TranslationSettingsStore {
  return {
    load: () => loadTranslationSettings(storage),
    saveDeepSeek: (input) => saveDeepSeekSettings(storage, input),
    clearDeepSeek: () => clearDeepSeekApiKey(storage)
  };
}

export function createChromeTranslationSettingsStore(): TranslationSettingsStore {
  return createTranslationSettingsStore(chrome.storage.local);
}
```

- [ ] **Step 4: Run settings test and verify GREEN**

Run:

```bash
npm test -- src/settings/translationSettings.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit settings storage**

Run:

```bash
git add src/settings/translationSettings.ts src/settings/translationSettings.test.ts
git commit -m "feat: add translation settings storage"
```

### Task 3: Add DeepSeek Provider

**Files:**
- Create: `src/providers/deepseekTranslationProvider.ts`
- Create: `src/providers/deepseekTranslationProvider.test.ts`

- [ ] **Step 1: Write failing DeepSeek provider tests**

Create `src/providers/deepseekTranslationProvider.test.ts`:

```ts
import { createDeepSeekTranslationProvider } from "./deepseekTranslationProvider";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("createDeepSeekTranslationProvider", () => {
  it("sends a JSON-mode chat completion request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                translation: "带领",
                partOfSpeech: "动词",
                contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
                example: "She will lead the review. 她将主持这次评审。",
                confidence: 0.93
              })
            }
          }
        ]
      })
    );

    const provider = createDeepSeekTranslationProvider({
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      fetchImpl
    });

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer sk-test",
      "content-type": "application/json"
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      stream: false,
      temperature: 0.2,
      thinking: { type: "disabled" }
    });
    expect(JSON.stringify(body.messages)).toContain("json");
    expect(JSON.stringify(body.messages)).toContain("She will lead design review tomorrow.");
    expect(result).toEqual({
      selectedText: "lead",
      translation: "带领",
      partOfSpeech: "动词",
      contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
      example: "She will lead the review. 她将主持这次评审。",
      confidence: 0.93,
      provider: "deepseek"
    });
  });

  it("rejects non-2xx responses without exposing the api key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createJsonResponse({ error: { message: "bad key" } }, 401));
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-secret", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translate({
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        targetLang: "zh-CN"
      })
    ).rejects.toThrow("DeepSeek request failed with status 401");
  });

  it("rejects invalid model JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [{ finish_reason: "stop", message: { content: "not json" } }]
      })
    );
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translate({
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        targetLang: "zh-CN"
      })
    ).rejects.toThrow("DeepSeek returned invalid JSON");
  });

  it("rejects truncated responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            finish_reason: "length",
            message: { content: JSON.stringify({ translation: "带领", contextualMeaning: "说明" }) }
          }
        ]
      })
    );
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translate({
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        targetLang: "zh-CN"
      })
    ).rejects.toThrow("DeepSeek response was truncated");
  });

  it("rejects responses missing required fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translation: "" }) } }]
      })
    );
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translate({
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        targetLang: "zh-CN"
      })
    ).rejects.toThrow("DeepSeek response missing required fields");
  });
});
```

- [ ] **Step 2: Run DeepSeek provider test and verify RED**

Run:

```bash
npm test -- src/providers/deepseekTranslationProvider.test.ts
```

Expected: FAIL because `src/providers/deepseekTranslationProvider.ts` does not exist.

- [ ] **Step 3: Implement DeepSeek provider**

Create `src/providers/deepseekTranslationProvider.ts`:

```ts
import type { TranslationRequest, TranslationResult } from "../shared/types";
import type { TranslationProvider } from "./translationProvider";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface DeepSeekProviderOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

interface DeepSeekJsonResult {
  translation?: unknown;
  partOfSpeech?: unknown;
  contextualMeaning?: unknown;
  example?: unknown;
  confidence?: unknown;
}

function clampConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseDeepSeekContent(content: string): DeepSeekJsonResult {
  try {
    return JSON.parse(content) as DeepSeekJsonResult;
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }
}

function buildMessages(request: TranslationRequest): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content:
        "You are a precise English-to-Simplified-Chinese dictionary translator. Output only json. " +
        "Return valid JSON with translation, partOfSpeech, contextualMeaning, example, and confidence."
    },
    {
      role: "user",
      content: JSON.stringify({
        instruction:
          "Translate the selected English text into Simplified Chinese using the paragraph context. Output json only.",
        selectedText: request.selectedText,
        paragraphContext: request.paragraphContext,
        targetLang: request.targetLang,
        exampleJson: {
          translation: "带领",
          partOfSpeech: "动词",
          contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
          example: "She will lead the review. 她将主持这次评审。",
          confidence: 0.9
        }
      })
    }
  ];
}

export function createDeepSeekTranslationProvider(options: DeepSeekProviderOptions): TranslationProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      const response = await fetchImpl(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          messages: buildMessages(request),
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          stream: false,
          temperature: 0.2,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
      };
      const choice = payload.choices?.[0];

      if (choice?.finish_reason === "length") {
        throw new Error("DeepSeek response was truncated");
      }

      const content = choice?.message?.content;
      if (!content) {
        throw new Error("DeepSeek returned empty content");
      }

      const parsed = parseDeepSeekContent(content);
      const translation = optionalString(parsed.translation);
      const contextualMeaning = optionalString(parsed.contextualMeaning);

      if (!translation || !contextualMeaning) {
        throw new Error("DeepSeek response missing required fields");
      }

      return {
        selectedText: request.selectedText,
        translation,
        partOfSpeech: optionalString(parsed.partOfSpeech),
        contextualMeaning,
        example: optionalString(parsed.example),
        confidence: clampConfidence(parsed.confidence),
        provider: "deepseek"
      };
    }
  };
}
```

- [ ] **Step 4: Run DeepSeek provider test and verify GREEN**

Run:

```bash
npm test -- src/providers/deepseekTranslationProvider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit DeepSeek provider**

Run:

```bash
git add src/providers/deepseekTranslationProvider.ts src/providers/deepseekTranslationProvider.test.ts
git commit -m "feat: add deepseek translation provider"
```

### Task 4: Add Provider Factory And Wire Background Service Worker

**Files:**
- Create: `src/providers/providerFactory.ts`
- Create: `src/providers/providerFactory.test.ts`
- Modify: `src/background/serviceWorker.ts`

- [ ] **Step 1: Write failing provider factory tests**

Create `src/providers/providerFactory.test.ts`:

```ts
import { createTranslationProviderFromSettings } from "./providerFactory";

describe("createTranslationProviderFromSettings", () => {
  it("uses Chinese fake provider when settings are local", async () => {
    const provider = createTranslationProviderFromSettings({
      provider: "local",
      deepseek: { apiKey: "", model: "deepseek-v4-flash" }
    });

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(result.translation).toBe("带领；主持");
    expect(result.provider).toBe("fake");
  });

  it("uses DeepSeek provider when api key is configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify({ translation: "带领", contextualMeaning: "说明" }) }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const provider = createTranslationProviderFromSettings(
      {
        provider: "deepseek",
        deepseek: { apiKey: "sk-test", model: "deepseek-v4-flash" }
      },
      { fetchImpl }
    );

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(result.provider).toBe("deepseek");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run provider factory test and verify RED**

Run:

```bash
npm test -- src/providers/providerFactory.test.ts
```

Expected: FAIL because `src/providers/providerFactory.ts` does not exist.

- [ ] **Step 3: Implement provider factory**

Create `src/providers/providerFactory.ts`:

```ts
import type { TranslationSettings } from "../settings/translationSettings";
import { createChineseFakeTranslationProvider } from "./chineseFakeTranslationProvider";
import { createDeepSeekTranslationProvider } from "./deepseekTranslationProvider";
import type { TranslationProvider } from "./translationProvider";

interface ProviderFactoryOptions {
  fetchImpl?: typeof fetch;
}

export function createTranslationProviderFromSettings(
  settings: TranslationSettings,
  options: ProviderFactoryOptions = {}
): TranslationProvider {
  if (settings.provider === "deepseek" && settings.deepseek.apiKey.trim()) {
    return createDeepSeekTranslationProvider({
      apiKey: settings.deepseek.apiKey,
      model: settings.deepseek.model,
      fetchImpl: options.fetchImpl
    });
  }

  return createChineseFakeTranslationProvider();
}
```

- [ ] **Step 4: Run provider factory test and verify GREEN**

Run:

```bash
npm test -- src/providers/providerFactory.test.ts
```

Expected: PASS.

- [ ] **Step 5: Modify background service worker to load settings per translation**

Modify `src/background/serviceWorker.ts`:

```ts
import { createTranslationProviderFromSettings } from "../providers/providerFactory";
import { createChromeTranslationSettingsStore } from "../settings/translationSettings";
import { createChromeVocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler } from "./handlers";

const settingsStore = createChromeTranslationSettingsStore();

const handleMessage = createBackgroundHandler({
  provider: {
    async translate(request) {
      const settings = await settingsStore.load();
      return createTranslationProviderFromSettings(settings).translate(request);
    }
  },
  store: createChromeVocabularyStore()
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npm test -- src/providers/providerFactory.test.ts src/background/handlers.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit provider wiring**

Run:

```bash
git add src/providers/providerFactory.ts src/providers/providerFactory.test.ts src/background/serviceWorker.ts
git commit -m "feat: choose translation provider from settings"
```

### Task 5: Add Settings Messages And Popup Controls

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `src/background/handlers.ts`
- Modify: `src/background/handlers.test.ts`
- Modify: `src/ui/popup/popup.html`
- Modify: `src/ui/popup/popup.css`
- Modify: `src/ui/popup/popup.ts`
- Modify: `src/ui/popup/popup.test.ts`

- [ ] **Step 1: Add failing tests for settings messages and popup controls**

Modify `src/background/handlers.test.ts` with tests:

```ts
it("loads translation settings", async () => {
  const settingsStore = {
    load: vi.fn().mockResolvedValue({
      provider: "deepseek",
      deepseek: { apiKey: "sk-test", model: "deepseek-v4-flash" }
    }),
    saveDeepSeek: vi.fn(),
    clearDeepSeek: vi.fn()
  };
  const handler = createBackgroundHandler({ provider: createProvider(), store: createStore(), settingsStore });

  const response = await handler({ type: MessageType.GetTranslationSettings });

  expect(response.ok).toBe(true);
  if (!response.ok) throw new Error(response.error);
  expect(response.data.provider).toBe("deepseek");
  expect(response.data.deepseek.apiKey).toBe("");
  expect(response.data.deepseek.hasApiKey).toBe(true);
});

it("saves deepseek settings", async () => {
  const settingsStore = {
    load: vi.fn(),
    saveDeepSeek: vi.fn().mockResolvedValue({
      provider: "deepseek",
      deepseek: { apiKey: "sk-test", model: "deepseek-v4-flash" }
    }),
    clearDeepSeek: vi.fn()
  };
  const handler = createBackgroundHandler({ provider: createProvider(), store: createStore(), settingsStore });

  const response = await handler({
    type: MessageType.SaveDeepSeekSettings,
    payload: { apiKey: "sk-test", model: "deepseek-v4-flash" }
  });

  expect(response.ok).toBe(true);
  expect(settingsStore.saveDeepSeek).toHaveBeenCalledWith({ apiKey: "sk-test", model: "deepseek-v4-flash" });
});

it("clears deepseek settings", async () => {
  const settingsStore = {
    load: vi.fn(),
    saveDeepSeek: vi.fn(),
    clearDeepSeek: vi.fn().mockResolvedValue({
      provider: "local",
      deepseek: { apiKey: "", model: "deepseek-v4-flash" }
    })
  };
  const handler = createBackgroundHandler({ provider: createProvider(), store: createStore(), settingsStore });

  const response = await handler({ type: MessageType.ClearDeepSeekSettings });

  expect(response.ok).toBe(true);
  expect(settingsStore.clearDeepSeek).toHaveBeenCalledOnce();
});
```

Modify `src/ui/popup/popup.test.ts` with tests:

```ts
it("renders provider settings and saves deepseek key", async () => {
  document.body.innerHTML = `
    <main>
      <button id="openVocabulary"></button>
      <form id="translationSettings">
        <span id="providerStatus"></span>
        <input id="deepseekApiKey" />
        <input id="deepseekModel" />
        <button id="saveDeepSeek" type="submit"></button>
        <button id="clearDeepSeek" type="button"></button>
      </form>
      <ul id="recentWords"></ul>
    </main>
  `;
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, data: entries })
    .mockResolvedValueOnce({
      ok: true,
      data: { provider: "local", deepseek: { hasApiKey: false, model: "deepseek-v4-flash", apiKey: "" } }
    })
    .mockResolvedValueOnce({
      ok: true,
      data: { provider: "deepseek", deepseek: { hasApiKey: true, model: "deepseek-v4-flash", apiKey: "" } }
    });

  await initPopup({ sendMessage, openOptionsPage: vi.fn() });

  (document.querySelector("#deepseekApiKey") as HTMLInputElement).value = "sk-test";
  (document.querySelector("#deepseekModel") as HTMLInputElement).value = "deepseek-v4-flash";
  (document.querySelector("#translationSettings") as HTMLFormElement).dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true })
  );
  await Promise.resolve();

  expect(sendMessage).toHaveBeenCalledWith({
    type: MessageType.SaveDeepSeekSettings,
    payload: { apiKey: "sk-test", model: "deepseek-v4-flash" }
  });
  expect(document.body.textContent).toContain("DeepSeek enabled");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- src/background/handlers.test.ts src/ui/popup/popup.test.ts
```

Expected: FAIL because message types, handler settings dependency, and popup controls do not exist.

- [ ] **Step 3: Add settings messages**

Modify `src/shared/messages.ts`:

```ts
import type { ExportFormat, SelectionPayload, TranslationSettingsView, VocabularyEntry } from "./types";

export enum MessageType {
  TranslateSelection = "TRANSLATE_SELECTION",
  AddVocabulary = "ADD_VOCABULARY",
  ListVocabulary = "LIST_VOCABULARY",
  SearchVocabulary = "SEARCH_VOCABULARY",
  DeleteVocabulary = "DELETE_VOCABULARY",
  ExportVocabulary = "EXPORT_VOCABULARY",
  GetTranslationSettings = "GET_TRANSLATION_SETTINGS",
  SaveDeepSeekSettings = "SAVE_DEEPSEEK_SETTINGS",
  ClearDeepSeekSettings = "CLEAR_DEEPSEEK_SETTINGS"
}

export interface GetTranslationSettingsMessage {
  type: MessageType.GetTranslationSettings;
}

export interface SaveDeepSeekSettingsMessage {
  type: MessageType.SaveDeepSeekSettings;
  payload: { apiKey: string; model?: string };
}

export interface ClearDeepSeekSettingsMessage {
  type: MessageType.ClearDeepSeekSettings;
}
```

Also add validators for the new message shapes and include the new interfaces in `OpenEnMessage`.

Modify `src/shared/types.ts`:

```ts
export interface TranslationSettingsView {
  provider: "local" | "deepseek";
  deepseek: {
    hasApiKey: boolean;
    apiKey: "";
    model: string;
  };
}
```

- [ ] **Step 4: Add settings handling to background handler**

Modify `src/background/handlers.ts`:

```ts
import type { TranslationSettings, TranslationSettingsStore } from "../settings/translationSettings";
```

Extend `HandlerDependencies`:

```ts
settingsStore?: TranslationSettingsStore;
```

Add a sanitizer:

```ts
function toSettingsView(settings: TranslationSettings): TranslationSettingsView {
  return {
    provider: settings.provider,
    deepseek: {
      hasApiKey: Boolean(settings.deepseek.apiKey),
      apiKey: "",
      model: settings.deepseek.model
    }
  };
}
```

Handle the messages:

```ts
if (isGetTranslationSettingsMessage(message)) {
  if (!dependencies.settingsStore) return failure("Translation settings unavailable");
  return success(toSettingsView(await dependencies.settingsStore.load()));
}

if (isSaveDeepSeekSettingsMessage(message)) {
  if (!dependencies.settingsStore) return failure("Translation settings unavailable");
  return success(toSettingsView(await dependencies.settingsStore.saveDeepSeek(message.payload)));
}

if (isClearDeepSeekSettingsMessage(message)) {
  if (!dependencies.settingsStore) return failure("Translation settings unavailable");
  return success(toSettingsView(await dependencies.settingsStore.clearDeepSeek()));
}
```

- [ ] **Step 5: Wire settings store into service worker**

Modify `src/background/serviceWorker.ts`:

```ts
const handleMessage = createBackgroundHandler({
  provider: {
    async translate(request) {
      const settings = await settingsStore.load();
      return createTranslationProviderFromSettings(settings).translate(request);
    }
  },
  store: createChromeVocabularyStore(),
  settingsStore
});
```

- [ ] **Step 6: Add popup settings markup and behavior**

Modify `src/ui/popup/popup.html` to include a compact settings form between header and recent words:

```html
<form id="translationSettings" autocomplete="off">
  <div id="providerStatus">Local Chinese fallback</div>
  <label>
    DeepSeek API key
    <input id="deepseekApiKey" type="password" placeholder="sk-..." />
  </label>
  <label>
    Model
    <input id="deepseekModel" type="text" value="deepseek-v4-flash" />
  </label>
  <div class="settings-actions">
    <button id="saveDeepSeek" type="submit">Save</button>
    <button id="clearDeepSeek" type="button">Clear</button>
  </div>
</form>
```

Modify `src/ui/popup/popup.ts` so `initPopup`:

- sends `GET_TRANSLATION_SETTINGS` after listing vocabulary;
- renders status as `DeepSeek enabled` when `provider === "deepseek"` and `hasApiKey`;
- never fills the API key input with the stored key;
- sends `SAVE_DEEPSEEK_SETTINGS` on submit;
- sends `CLEAR_DEEPSEEK_SETTINGS` when clear is clicked.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/background/handlers.test.ts src/ui/popup/popup.test.ts src/shared/messages.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit settings UI and messages**

Run:

```bash
git add src/shared/messages.ts src/shared/types.ts src/background/handlers.ts src/background/handlers.test.ts src/background/serviceWorker.ts src/ui/popup/popup.html src/ui/popup/popup.css src/ui/popup/popup.ts src/ui/popup/popup.test.ts
git commit -m "feat: configure deepseek from popup"
```

### Task 6: Update Manifest, Existing Expectations, And Manual QA

**Files:**
- Modify: `public/manifest.json`
- Modify: `src/manifest.test.ts`
- Modify: `src/content/contentScript.test.ts`
- Modify: `src/content/tooltip.test.ts`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: Write failing manifest expectation**

Modify `src/manifest.test.ts`:

```ts
expect(manifest.host_permissions).toContain("https://api.deepseek.com/*");
```

- [ ] **Step 2: Run manifest test and verify RED**

Run:

```bash
npm test -- src/manifest.test.ts
```

Expected: FAIL because `host_permissions` does not include DeepSeek.

- [ ] **Step 3: Add DeepSeek host permission**

Modify `public/manifest.json`:

```json
"host_permissions": ["https://api.deepseek.com/*"]
```

- [ ] **Step 4: Update old English fake expectations to Chinese**

Update test fixtures that expected `lead as guide` only where they represent default local behavior:

```ts
translation: "带领；主持",
contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
provider: "fake"
```

Keep tests that deliberately assert arbitrary provider responses unchanged.

- [ ] **Step 5: Update manual QA**

Modify `docs/manual-qa.md` so expected no-key selection translation is Chinese and add DeepSeek-key steps:

```markdown
## Selection Translation
Select `lead` inside `She will lead design review tomorrow`.
Expected result: popup appears near selected text and shows `带领；主持`.

## DeepSeek Mode
Open the extension popup, enter a DeepSeek API key, keep model `deepseek-v4-flash`, and save.
Select `lead` again.
Expected result: popup shows a Chinese translation from DeepSeek and saved vocabulary entry records provider `deepseek`.
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/manifest.test.ts src/content/contentScript.test.ts src/content/tooltip.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit manifest and QA updates**

Run:

```bash
git add public/manifest.json src/manifest.test.ts src/content/contentScript.test.ts src/content/tooltip.test.ts docs/manual-qa.md
git commit -m "docs: update qa for deepseek chinese translation"
```

### Task 7: Final Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: PASS with all test files passing.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS and generated files include `dist/manifest.json`, `dist/content/contentScript.js`, `dist/background/serviceWorker.js`, `dist/ui/popup/popup.html`, and `dist/ui/vocabulary/vocabulary.html`.

- [ ] **Step 4: Verify generated extension files exist**

Run:

```bash
test -f dist/manifest.json
test -f dist/content/contentScript.js
test -f dist/background/serviceWorker.js
test -f dist/ui/popup/popup.html
test -f dist/ui/vocabulary/vocabulary.html
```

Expected: all commands exit 0.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes.
