import {
  createVocabularyHighlightSettingsStore,
  getDefaultVocabularyHighlightSettings,
  loadVocabularyHighlightSettings,
  saveVocabularyHighlightSettings,
  type VocabularyHighlightSettingsStorageLike
} from "./vocabularyHighlightSettings";

const SETTINGS_KEY = "openen:vocabulary-highlight-settings";

function createMemoryStorage(initial?: unknown): VocabularyHighlightSettingsStorageLike {
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

describe("vocabularyHighlightSettings", () => {
  it("loads enabled defaults when storage is empty", async () => {
    expect(await loadVocabularyHighlightSettings(createMemoryStorage())).toEqual(
      getDefaultVocabularyHighlightSettings()
    );
  });

  it("saves disabled settings", async () => {
    const storage = createMemoryStorage();

    const saved = await saveVocabularyHighlightSettings(storage, { enabled: false });

    expect(saved).toEqual({ enabled: false });
    expect(await loadVocabularyHighlightSettings(storage)).toEqual({ enabled: false });
  });

  it("ignores malformed stored settings", async () => {
    expect(await loadVocabularyHighlightSettings(createMemoryStorage({ enabled: "yes" }))).toEqual(
      getDefaultVocabularyHighlightSettings()
    );
  });

  it("creates chrome-backed settings store", async () => {
    const storage = createMemoryStorage();
    const store = createVocabularyHighlightSettingsStore(storage);

    await expect(store.save({ enabled: false })).resolves.toEqual({ enabled: false });
    await expect(store.load()).resolves.toEqual({ enabled: false });
  });
});
