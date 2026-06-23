import { getWebExtensionApi } from "../shared/webExtensionApi";

export const TRANSLATION_BUBBLE_SETTINGS_KEY = "openen:translation-bubble-settings";

export interface TranslationBubbleSettingsStorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface TranslationBubbleSettings {
  enabled: boolean;
}

export interface TranslationBubbleSettingsStore {
  load(): Promise<TranslationBubbleSettings>;
  save(input: TranslationBubbleSettings): Promise<TranslationBubbleSettings>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getDefaultTranslationBubbleSettings(): TranslationBubbleSettings {
  return { enabled: true };
}

function normalizeStoredSettings(value: unknown): TranslationBubbleSettings {
  if (!isRecord(value) || typeof value.enabled !== "boolean") {
    return getDefaultTranslationBubbleSettings();
  }
  return { enabled: value.enabled };
}

export async function loadTranslationBubbleSettings(
  storage: TranslationBubbleSettingsStorageLike
): Promise<TranslationBubbleSettings> {
  const values = await storage.get(TRANSLATION_BUBBLE_SETTINGS_KEY);
  return normalizeStoredSettings(values[TRANSLATION_BUBBLE_SETTINGS_KEY]);
}

export async function saveTranslationBubbleSettings(
  storage: TranslationBubbleSettingsStorageLike,
  input: TranslationBubbleSettings
): Promise<TranslationBubbleSettings> {
  const settings = { enabled: input.enabled };
  await storage.set({ [TRANSLATION_BUBBLE_SETTINGS_KEY]: settings });
  return settings;
}

export function createTranslationBubbleSettingsStore(
  storage: TranslationBubbleSettingsStorageLike
): TranslationBubbleSettingsStore {
  return {
    load: () => loadTranslationBubbleSettings(storage),
    save: (input) => saveTranslationBubbleSettings(storage, input)
  };
}

export function createChromeTranslationBubbleSettingsStore(): TranslationBubbleSettingsStore {
  return createTranslationBubbleSettingsStore(getWebExtensionApi().storage.local);
}
