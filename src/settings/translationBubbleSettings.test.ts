import {
  createTranslationBubbleSettingsStore,
  getDefaultTranslationBubbleSettings,
  loadTranslationBubbleSettings,
  saveTranslationBubbleSettings,
  type TranslationBubbleSettingsStorageLike
} from "./translationBubbleSettings";

const SETTINGS_KEY = "openen:translation-bubble-settings";

function createMemoryStorage(initial?: unknown): TranslationBubbleSettingsStorageLike {
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

describe("translationBubbleSettings", () => {
  it("loads enabled defaults when storage is empty", async () => {
    expect(await loadTranslationBubbleSettings(createMemoryStorage())).toEqual(
      getDefaultTranslationBubbleSettings()
    );
  });

  it("saves disabled settings", async () => {
    const storage = createMemoryStorage();

    const saved = await saveTranslationBubbleSettings(storage, { enabled: false });

    expect(saved).toEqual({ enabled: false });
    expect(await loadTranslationBubbleSettings(storage)).toEqual({ enabled: false });
  });

  it("ignores malformed stored settings", async () => {
    expect(await loadTranslationBubbleSettings(createMemoryStorage({ enabled: "no" }))).toEqual(
      getDefaultTranslationBubbleSettings()
    );
  });

  it("creates storage-backed settings store", async () => {
    const store = createTranslationBubbleSettingsStore(createMemoryStorage());

    await expect(store.save({ enabled: false })).resolves.toEqual({ enabled: false });
    await expect(store.load()).resolves.toEqual({ enabled: false });
  });
});
