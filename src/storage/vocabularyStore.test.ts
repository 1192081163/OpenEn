import type { VocabularyEntry } from "../shared/types";
import { createVocabularyStore, type StorageAreaLike } from "./vocabularyStore";

const STORAGE_KEY = "openen:vocabulary";

function cloneValue<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createMemoryStorage(initialValue?: unknown): StorageAreaLike {
  const data = new Map<string, unknown>();
  if (initialValue !== undefined) data.set(STORAGE_KEY, initialValue);
  return {
    async get(key: string) {
      return { [key]: data.get(key) };
    },
    async set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    }
  };
}

function createDelayedMemoryStorage(): StorageAreaLike {
  const data = new Map<string, unknown>();
  return {
    async get(key: string) {
      await delay();
      return { [key]: cloneValue(data.get(key)) };
    },
    async set(values: Record<string, unknown>) {
      await delay();
      for (const [key, value] of Object.entries(values)) data.set(key, cloneValue(value));
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

  it("updates duplicate base form from the same source URL", async () => {
    const store = createVocabularyStore(createMemoryStorage());
    await store.add(entry({ id: "first", selectedText: "leading", baseForm: "lead", translation: "old" }));
    await store.add(entry({ id: "second", selectedText: "led", baseForm: "lead", translation: "new" }));

    const entries = await store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("first");
    expect(entries[0]?.selectedText).toBe("led");
    expect(entries[0]?.baseForm).toBe("lead");
    expect(entries[0]?.translation).toBe("new");
  });

  it("searches and deletes entries", async () => {
    const store = createVocabularyStore(createMemoryStorage());
    await store.add(entry({ id: "a", selectedText: "lead" }));
    await store.add(entry({ id: "b", selectedText: "context", translation: "context meaning", pageTitle: "Context Article" }));
    await store.add(entry({ id: "c", selectedText: "leading", baseForm: "lead", sourceUrl: "https://example.com/c" }));

    expect((await store.search("lead")).map((item) => item.id)).toEqual(["a", "c"]);
    expect((await store.search("context")).map((item) => item.id)).toEqual(["b"]);
    await store.delete("b");
    expect((await store.list()).map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("serializes concurrent writes so entries are not dropped", async () => {
    const store = createVocabularyStore(createDelayedMemoryStorage());

    await Promise.all([
      store.add(entry({ id: "a", selectedText: "alpha", sourceUrl: "https://example.com/a" })),
      store.add(entry({ id: "b", selectedText: "beta", sourceUrl: "https://example.com/b" }))
    ]);

    expect((await store.list()).map((item) => item.id).sort()).toEqual(["a", "b"]);
  });

  it("filters malformed stored entries before reading or mutating", async () => {
    const store = createVocabularyStore(
      createMemoryStorage([
        null,
        { id: "partial", selectedText: "partial" },
        { ...entry({ id: "non-string" }), translation: 42 },
        entry({ id: "valid", selectedText: "valid" })
      ])
    );

    expect((await store.list()).map((item) => item.id)).toEqual(["valid"]);
    expect((await store.search("valid")).map((item) => item.id)).toEqual(["valid"]);

    await store.add(entry({ id: "new", selectedText: "new", sourceUrl: "https://example.com/new" }));
    await store.delete("valid");

    expect((await store.list()).map((item) => item.id)).toEqual(["new"]);
  });

  it("keeps stored entries missing optional vocabulary fields", async () => {
    const { partOfSpeech: _partOfSpeech, example: _example, ...withoutOptionalFields } = entry({
      id: "without-optional",
      selectedText: "optional"
    });
    const store = createVocabularyStore(
      createMemoryStorage([
        withoutOptionalFields,
        { ...entry({ id: "invalid-part-of-speech" }), partOfSpeech: 42 },
        { ...entry({ id: "invalid-example" }), example: false }
      ])
    );

    const entries = await store.list();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("without-optional");
    expect(entries[0]).not.toHaveProperty("partOfSpeech");
    expect(entries[0]).not.toHaveProperty("example");
  });

  it("keeps different entries with duplicate ids by assigning a suffix", async () => {
    const store = createVocabularyStore(createMemoryStorage());

    await store.add(entry({ id: "same", selectedText: "lead", sourceUrl: "https://example.com/a" }));
    const added = await store.add(entry({ id: "same", selectedText: "open", sourceUrl: "https://example.com/b" }));

    expect(added.id).toBe("same-1");
    expect((await store.list()).map((item) => item.id).sort()).toEqual(["same", "same-1"]);
  });
});
