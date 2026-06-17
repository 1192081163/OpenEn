import type { VocabularyEntry } from "../shared/types";
import { createVocabularyStore, type StorageAreaLike } from "./vocabularyStore";

function createMemoryStorage(): StorageAreaLike {
  const data = new Map<string, unknown>();
  return {
    async get(key: string) {
      return { [key]: data.get(key) };
    },
    async set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    }
  };
}

function entry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    id: "entry-1",
    selectedText: "lead",
    translation: "lead as guide",
    partOfSpeech: "verb",
    contextualMeaning: "guide an activity",
    example: "She will lead the review.",
    paragraphContext: "She will lead the design review tomorrow.",
    sourceUrl: "https://example.com/a",
    pageTitle: "A",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake",
    ...overrides
  };
}

describe("vocabulary store", () => {
  it("adds and lists entries newest first", async () => {
    const store = createVocabularyStore(createMemoryStorage());
    await store.add(entry({ id: "old", createdAt: "2026-06-16T00:00:00.000Z" }));
    await store.add(entry({ id: "new", createdAt: "2026-06-17T00:00:00.000Z", selectedText: "open" }));

    expect((await store.list()).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("updates duplicate selected text from the same source URL", async () => {
    const store = createVocabularyStore(createMemoryStorage());
    await store.add(entry({ id: "first", translation: "old" }));
    await store.add(entry({ id: "second", translation: "new" }));

    const entries = await store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("first");
    expect(entries[0]?.translation).toBe("new");
  });

  it("searches and deletes entries", async () => {
    const store = createVocabularyStore(createMemoryStorage());
    await store.add(entry({ id: "a", selectedText: "lead" }));
    await store.add(entry({ id: "b", selectedText: "context", pageTitle: "Context Article" }));

    expect((await store.search("context")).map((item) => item.id)).toEqual(["b"]);
    await store.delete("b");
    expect((await store.list()).map((item) => item.id)).toEqual(["a"]);
  });
});
