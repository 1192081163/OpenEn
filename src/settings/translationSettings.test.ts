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
