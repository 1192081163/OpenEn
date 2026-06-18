import { getWebExtensionApi } from "../shared/webExtensionApi";

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
  return createTranslationSettingsStore(getWebExtensionApi().storage.local);
}
