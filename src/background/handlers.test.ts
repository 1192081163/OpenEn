import type { TranslationProvider } from "../providers/translationProvider";
import { MessageType } from "../shared/messages";
import type { TranslationResult, VocabularyEntry } from "../shared/types";
import type { VocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler, type BackgroundResponse } from "./handlers";

function createProvider(translate?: TranslationProvider["translate"]): TranslationProvider {
  return {
    async translate(request): Promise<TranslationResult> {
      if (translate) return translate(request);

      return {
        selectedText: request.selectedText,
        translation: "translated",
        contextualMeaning: `meaning from ${request.paragraphContext}`,
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
    paragraphContext: "She will lead the review.",
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

describe("background handler", () => {
  it("exposes failure-aware response types for known messages", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });
    const translateResponse = await handler({
      type: MessageType.TranslateSelection,
      payload: {
        selectedText: "lead",
        paragraphContext: "She will lead the review.",
        sourceUrl: "https://example.com",
        pageTitle: "Example"
      }
    });
    const addResponse = await handler({
      type: MessageType.AddVocabulary,
      payload: { entry: { selectedText: "lead" } }
    });
    const listResponse = await handler({ type: MessageType.ListVocabulary });
    const searchResponse = await handler({ type: MessageType.SearchVocabulary, payload: { query: "lead" } });
    const deleteResponse = await handler({ type: MessageType.DeleteVocabulary, payload: { id: "entry-1" } });
    const exportResponse = await handler({ type: MessageType.ExportVocabulary, payload: { format: "csv" } });

    expectTypeOf(translateResponse).toEqualTypeOf<BackgroundResponse<TranslationResult>>();
    expectTypeOf(addResponse).toEqualTypeOf<BackgroundResponse<VocabularyEntry>>();
    expectTypeOf(listResponse).toEqualTypeOf<BackgroundResponse<VocabularyEntry[]>>();
    expectTypeOf(searchResponse).toEqualTypeOf<BackgroundResponse<VocabularyEntry[]>>();
    expectTypeOf(deleteResponse).toEqualTypeOf<BackgroundResponse<{ id: string }>>();
    expectTypeOf(exportResponse).toEqualTypeOf<BackgroundResponse<string>>();
  });

  it("translates a selection with zh-CN target language", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });
    const response = await handler({
      type: MessageType.TranslateSelection,
      payload: {
        selectedText: "lead",
        paragraphContext: "She will lead the review.",
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
          paragraphContext: "She will lead the review.",
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
  });

  it("returns failure for unsupported messages", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });
    const response = await handler({ type: "UNKNOWN_MESSAGE" });

    expect(response).toEqual({ ok: false, error: "Unsupported message" });
  });

  it("returns failure for incomplete vocabulary entries", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });
    const response = await handler({
      type: MessageType.AddVocabulary,
      payload: { entry: { selectedText: "lead" } }
    });

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error("Expected add vocabulary to fail");
    expect(response.error).toBe("Missing required vocabulary fields");
  });

  it("returns failure when the provider fails", async () => {
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
        paragraphContext: "She will lead the review.",
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
    expect(csvResponse.data).toContain("selectedText,translation,partOfSpeech,contextualMeaning");
    expect(csvResponse.data).toContain("lead,translated,,guide");
  });
});
