import { getWebExtensionApi } from "../shared/webExtensionApi";

export const VOCABULARY_HIGHLIGHT_SETTINGS_KEY = "openen:vocabulary-highlight-settings";

export interface VocabularyHighlightSettingsStorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface VocabularyHighlightSettings {
  enabled: boolean;
}

export interface VocabularyHighlightSettingsStore {
  load(): Promise<VocabularyHighlightSettings>;
  save(input: VocabularyHighlightSettings): Promise<VocabularyHighlightSettings>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getDefaultVocabularyHighlightSettings(): VocabularyHighlightSettings {
  return { enabled: true };
}

function normalizeStoredSettings(value: unknown): VocabularyHighlightSettings {
  if (!isRecord(value) || typeof value.enabled !== "boolean") {
    return getDefaultVocabularyHighlightSettings();
  }
  return { enabled: value.enabled };
}

export async function loadVocabularyHighlightSettings(
  storage: VocabularyHighlightSettingsStorageLike
): Promise<VocabularyHighlightSettings> {
  const values = await storage.get(VOCABULARY_HIGHLIGHT_SETTINGS_KEY);
  return normalizeStoredSettings(values[VOCABULARY_HIGHLIGHT_SETTINGS_KEY]);
}

export async function saveVocabularyHighlightSettings(
  storage: VocabularyHighlightSettingsStorageLike,
  input: VocabularyHighlightSettings
): Promise<VocabularyHighlightSettings> {
  const settings = { enabled: input.enabled };
  await storage.set({ [VOCABULARY_HIGHLIGHT_SETTINGS_KEY]: settings });
  return settings;
}

export function createVocabularyHighlightSettingsStore(
  storage: VocabularyHighlightSettingsStorageLike
): VocabularyHighlightSettingsStore {
  return {
    load: () => loadVocabularyHighlightSettings(storage),
    save: (input) => saveVocabularyHighlightSettings(storage, input)
  };
}

export function createChromeVocabularyHighlightSettingsStore(): VocabularyHighlightSettingsStore {
  return createVocabularyHighlightSettingsStore(getWebExtensionApi().storage.local);
}
