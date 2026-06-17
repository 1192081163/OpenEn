import type { VocabularyEntry } from "../shared/types";

const STORAGE_KEY = "openen:vocabulary";

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface VocabularyStore {
  add(entry: VocabularyEntry): Promise<VocabularyEntry>;
  list(): Promise<VocabularyEntry[]>;
  search(query: string): Promise<VocabularyEntry[]>;
  delete(id: string): Promise<void>;
}

function sortNewestFirst(entries: VocabularyEntry[]): VocabularyEntry[] {
  return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function matchesQuery(entry: VocabularyEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [entry.selectedText, entry.translation, entry.pageTitle, entry.contextualMeaning]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function createVocabularyStore(storageArea: StorageAreaLike): VocabularyStore {
  async function readEntries(): Promise<VocabularyEntry[]> {
    const result = await storageArea.get(STORAGE_KEY);
    const value = result[STORAGE_KEY];
    return Array.isArray(value) ? (value as VocabularyEntry[]) : [];
  }

  async function writeEntries(entries: VocabularyEntry[]): Promise<void> {
    await storageArea.set({ [STORAGE_KEY]: entries });
  }

  return {
    async add(entry: VocabularyEntry): Promise<VocabularyEntry> {
      const entries = await readEntries();
      const duplicateIndex = entries.findIndex(
        (item) => item.selectedText.toLowerCase() === entry.selectedText.toLowerCase() && item.sourceUrl === entry.sourceUrl
      );

      if (duplicateIndex >= 0) {
        const existing = entries[duplicateIndex]!;
        const updated = { ...existing, ...entry, id: existing.id, createdAt: existing.createdAt };
        entries[duplicateIndex] = updated;
        await writeEntries(entries);
        return updated;
      }

      entries.push(entry);
      await writeEntries(entries);
      return entry;
    },

    async list(): Promise<VocabularyEntry[]> {
      return sortNewestFirst(await readEntries());
    },

    async search(query: string): Promise<VocabularyEntry[]> {
      return sortNewestFirst((await readEntries()).filter((entry) => matchesQuery(entry, query)));
    },

    async delete(id: string): Promise<void> {
      await writeEntries((await readEntries()).filter((entry) => entry.id !== id));
    }
  };
}

export function createChromeVocabularyStore(): VocabularyStore {
  return createVocabularyStore(chrome.storage.local);
}
