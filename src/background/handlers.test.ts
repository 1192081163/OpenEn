import type { TranslationProvider } from "../providers/translationProvider";
import { MessageType } from "../shared/messages";
import type { TranslationResult, VocabularyEntry } from "../shared/types";
import type { TranslationBubbleSettingsStore } from "../settings/translationBubbleSettings";
import type { TranslationSettingsStore } from "../settings/translationSettings";
import type { VocabularyHighlightSettingsStore } from "../settings/vocabularyHighlightSettings";
import type { VocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler, type BackgroundResponse } from "./handlers";

function createProvider(translate?: TranslationProvider["translate"]): TranslationProvider {
  return {
    async translate(request): Promise<TranslationResult> {
      if (translate) return translate(request);

      return {
        selectedText: request.selectedText,
        translation: "translated",
        contextualMeaning: `meaning ${request.paragraphContext}`,
        provider: "fake"
      };
    }
  };
}

function createVocabularyEntry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    id: "entry-1",
    selectedText: "lead",
    translation: "translated",
    contextualMeaning: "guide",
    paragraphContext: "She will lead review.",
    sourceUrl: "https://example.com",
    pageTitle: "Example",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake",
    ...overrides
  };
}

function createStore(initialEntries: VocabularyEntry[] = []): VocabularyStore {
  const entries = [...initialEntries];
  return {
    async add(entry) {
      entries.push(entry);
      return entry;
    },
    async list() {
      return entries;
    },
    async search(query) {
      return entries.filter((entry) => entry.selectedText.includes(query));
    },
    async delete(id) {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) entries.splice(index, 1);
    }
  };
}

function createSettingsStore(overrides: Partial<TranslationSettingsStore> = {}): TranslationSettingsStore {
  return {
    async load() {
      return {
        provider: "local",
        deepseek: { apiKey: "", model: "deepseek-v4-flash" }
      };
    },
    async saveDeepSeek(input) {
      return {
        provider: "deepseek",
        deepseek: { apiKey: input.apiKey, model: input.model ?? "deepseek-v4-flash" }
      };
    },
    async clearDeepSeek() {
      return {
        provider: "local",
        deepseek: { apiKey: "", model: "deepseek-v4-flash" }
      };
    },
    ...overrides
  };
}

function createHighlightSettingsStore(
  overrides: Partial<VocabularyHighlightSettingsStore> = {}
): VocabularyHighlightSettingsStore {
  return {
    async load() {
      return { enabled: true };
    },
    async save(input) {
      return { enabled: input.enabled };
    },
    ...overrides
  };
}

function createTranslationBubbleSettingsStore(
  overrides: Partial<TranslationBubbleSettingsStore> = {}
): TranslationBubbleSettingsStore {
  return {
    async load() {
      return { enabled: true };
    },
    async save(input) {
      return { enabled: input.enabled };
    },
    ...overrides
  };
}

describe("background handler", () => {
  it("exposes failure-aware response types for known messages", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });

    const translateResponse = await handler({
      type: MessageType.TranslateSelection,
      payload: {
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        sourceUrl: "https://example.com",
        pageTitle: "Example"
      }
    });

    expect(translateResponse.ok).toBe(true);
    const response: BackgroundResponse<TranslationResult> = translateResponse;
    expect(response.ok).toBe(true);
  });

  it("translates selected text", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });

    const response = await handler({
      type: MessageType.TranslateSelection,
      payload: {
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        sourceUrl: "https://example.com",
        pageTitle: "Example"
      }
    });

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);
    expect(response.data.translation).toBe("translated");
  });

  it("saves and lists vocabulary entries", async () => {
    const store = createStore();
    const handler = createBackgroundHandler({ provider: createProvider(), store });

    const saveResponse = await handler({
      type: MessageType.AddVocabulary,
      payload: {
        entry: {
          selectedText: "lead",
          translation: "translated",
          contextualMeaning: "guide",
          phrase: "lead a review",
          paragraphContext: "She will lead review.",
          sourceUrl: "https://example.com",
          pageTitle: "Example",
          provider: "fake"
        }
      }
    });
    expect(saveResponse.ok).toBe(true);

    const listResponse = await handler({ type: MessageType.ListVocabulary });
    expect(listResponse.ok).toBe(true);
    if (!listResponse.ok) throw new Error(listResponse.error);
    expect(listResponse.data).toHaveLength(1);
    expect(listResponse.data[0]?.selectedText).toBe("lead");
    expect(listResponse.data[0]?.phrase).toBe("lead a review");
  });

  it("returns failure for unsupported messages", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });

    const response = await handler({ type: "UNKNOWN_MESSAGE" });

    expect(response).toEqual({ ok: false, error: "Unsupported message" });
  });

  it("returns failure for incomplete vocabulary entries", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });

    const response = await handler({ type: MessageType.AddVocabulary, payload: { entry: { selectedText: "lead" } } });

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error("Expected add vocabulary to fail");
    expect(response.error).toBe("Missing required vocabulary fields");
  });

  it("returns failure when provider fails", async () => {
    const handler = createBackgroundHandler({
      provider: createProvider(async () => {
        throw new Error("provider unavailable");
      }),
      store: createStore()
    });

    const response = await handler({
      type: MessageType.TranslateSelection,
      payload: {
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        sourceUrl: "https://example.com",
        pageTitle: "Example"
      }
    });

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error("Expected translate selection to fail");
    expect(response.error).toBe("provider unavailable");
  });

  it("returns an empty list successfully", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });

    const response = await handler({ type: MessageType.ListVocabulary });

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);
    expect(response.data).toEqual([]);
  });

  it("exports vocabulary as json and csv", async () => {
    const entry = createVocabularyEntry();
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore([entry]) });

    const jsonResponse = await handler({ type: MessageType.ExportVocabulary, payload: { format: "json" } });
    expect(jsonResponse.ok).toBe(true);
    if (!jsonResponse.ok) throw new Error(jsonResponse.error);
    expect(JSON.parse(jsonResponse.data)).toEqual([entry]);

    const csvResponse = await handler({ type: MessageType.ExportVocabulary, payload: { format: "csv" } });
    expect(csvResponse.ok).toBe(true);
    if (!csvResponse.ok) throw new Error(csvResponse.error);
    expect(csvResponse.data).toContain("selectedText,baseForm,translation,partOfSpeech,contextualMeaning");
    expect(csvResponse.data).toContain("lead,,translated,,guide");
  });

  it("loads translation settings without returning the api key", async () => {
    const settingsStore = createSettingsStore({
      load: vi.fn().mockResolvedValue({
        provider: "deepseek",
        deepseek: { apiKey: "sk-test", model: "deepseek-v4-flash" }
      })
    });
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore(), settingsStore });

    const response = await handler({ type: MessageType.GetTranslationSettings });

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);
    expect(response.data).toEqual({
      provider: "deepseek",
      deepseek: { hasApiKey: true, apiKey: "", model: "deepseek-v4-flash" }
    });
  });

  it("saves deepseek settings", async () => {
    const settingsStore = createSettingsStore({ saveDeepSeek: vi.fn(createSettingsStore().saveDeepSeek) });
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore(), settingsStore });

    const response = await handler({
      type: MessageType.SaveDeepSeekSettings,
      payload: { apiKey: "sk-test", model: "deepseek-v4-flash" }
    });

    expect(response.ok).toBe(true);
    expect(settingsStore.saveDeepSeek).toHaveBeenCalledWith({ apiKey: "sk-test", model: "deepseek-v4-flash" });
  });

  it("clears deepseek settings", async () => {
    const settingsStore = createSettingsStore({ clearDeepSeek: vi.fn(createSettingsStore().clearDeepSeek) });
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore(), settingsStore });

    const response = await handler({ type: MessageType.ClearDeepSeekSettings });

    expect(response.ok).toBe(true);
    expect(settingsStore.clearDeepSeek).toHaveBeenCalledOnce();
  });

  it("loads vocabulary highlight settings", async () => {
    const highlightSettingsStore = createHighlightSettingsStore();
    const handler = createBackgroundHandler({
      provider: createProvider(),
      store: createStore(),
      highlightSettingsStore
    });

    const response = await handler({ type: MessageType.GetVocabularyHighlightSettings });

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);
    expect(response.data).toEqual({ enabled: true });
  });

  it("saves vocabulary highlight settings", async () => {
    const highlightSettingsStore = createHighlightSettingsStore({
      save: vi.fn(createHighlightSettingsStore().save)
    });
    const handler = createBackgroundHandler({
      provider: createProvider(),
      store: createStore(),
      highlightSettingsStore
    });

    const response = await handler({
      type: MessageType.SaveVocabularyHighlightSettings,
      payload: { enabled: false }
    });

    expect(response.ok).toBe(true);
    expect(highlightSettingsStore.save).toHaveBeenCalledWith({ enabled: false });
  });

  it("loads and saves translation bubble settings", async () => {
    const translationBubbleSettingsStore = createTranslationBubbleSettingsStore({
      load: vi.fn().mockResolvedValue({ enabled: false }),
      save: vi.fn(createTranslationBubbleSettingsStore().save)
    });
    const handler = createBackgroundHandler({
      provider: createProvider(),
      store: createStore(),
      translationBubbleSettingsStore
    });

    const loadResponse = await handler({ type: MessageType.GetTranslationBubbleSettings });
    const saveResponse = await handler({
      type: MessageType.SaveTranslationBubbleSettings,
      payload: { enabled: true }
    });

    expect(loadResponse).toEqual({ ok: true, data: { enabled: false } });
    expect(saveResponse).toEqual({ ok: true, data: { enabled: true } });
    expect(translationBubbleSettingsStore.save).toHaveBeenCalledWith({ enabled: true });
  });
});
