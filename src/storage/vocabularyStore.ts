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

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  if (!isStringRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.selectedText === "string" &&
    typeof value.translation === "string" &&
    isOptionalString(value.partOfSpeech) &&
    typeof value.contextualMeaning === "string" &&
    isOptionalString(value.example) &&
    typeof value.paragraphContext === "string" &&
    typeof value.sourceUrl === "string" &&
    typeof value.pageTitle === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.provider === "string"
  );
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

function createUniqueId(id: string, entries: VocabularyEntry[]): string {
  const usedIds = new Set(entries.map((entry) => entry.id));
  if (!usedIds.has(id)) return id;

  let suffix = 1;
  let candidate = `${id}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${id}-${suffix}`;
  }
  return candidate;
}

export function createVocabularyStore(storageArea: StorageAreaLike): VocabularyStore {
  let writeQueue = Promise.resolve();

  async function readEntries(): Promise<VocabularyEntry[]> {
    const result = await storageArea.get(STORAGE_KEY);
    const value = result[STORAGE_KEY];
    return Array.isArray(value) ? value.filter(isVocabularyEntry) : [];
  }

  async function writeEntries(entries: VocabularyEntry[]): Promise<void> {
    await storageArea.set({ [STORAGE_KEY]: entries });
  }

  async function runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  return {
    async add(entry: VocabularyEntry): Promise<VocabularyEntry> {
      return runSerialized(async () => {
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

        const entryToAdd = { ...entry, id: createUniqueId(entry.id, entries) };
        entries.push(entryToAdd);
        await writeEntries(entries);
        return entryToAdd;
      });
    },

    async list(): Promise<VocabularyEntry[]> {
      return sortNewestFirst(await readEntries());
    },

    async search(query: string): Promise<VocabularyEntry[]> {
      return sortNewestFirst((await readEntries()).filter((entry) => matchesQuery(entry, query)));
    },

    async delete(id: string): Promise<void> {
      await runSerialized(async () => {
        await writeEntries((await readEntries()).filter((entry) => entry.id !== id));
      });
    }
  };
}

export function createChromeVocabularyStore(): VocabularyStore {
  return createVocabularyStore(chrome.storage.local);
}
