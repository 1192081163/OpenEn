import type { TranslationProvider } from "../providers/translationProvider";
import { MessageType } from "../shared/messages";
import type { TranslationResult, VocabularyEntry } from "../shared/types";
import type { VocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler } from "./handlers";

function createProvider(): TranslationProvider {
  return {
    async translate(request): Promise<TranslationResult> {
      return {
        selectedText: request.selectedText,
        translation: "translated",
        contextualMeaning: `meaning from ${request.paragraphContext}`,
        provider: "fake"
      };
    }
  };
}

function createStore(): VocabularyStore {
  const entries: VocabularyEntry[] = [];
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
    expect(listResponse.data).toHaveLength(1);
    expect(listResponse.data[0].selectedText).toBe("lead");
  });
});
