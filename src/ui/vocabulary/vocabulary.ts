import { MessageType } from "../../shared/messages";
import type { ExportFormat, VocabularyEntry } from "../../shared/types";
import { getWebExtensionApi, hasWebExtensionApi } from "../../shared/webExtensionApi";

interface RenderOptions {
  entries: VocabularyEntry[];
  loadFailed?: boolean;
  onSearch(query: string): void;
  onDelete(id: string): void;
  onExport(format: ExportFormat): void;
}

interface LoadEntriesResult {
  entries: VocabularyEntry[];
  loadFailed: boolean;
}

type VocabularyRuntimeMessage =
  | { type: MessageType.ListVocabulary }
  | { type: MessageType.SearchVocabulary; payload: { query: string } }
  | { type: MessageType.DeleteVocabulary; payload: { id: string } }
  | { type: MessageType.ExportVocabulary; payload: { format: ExportFormat } };

type SendMessage = (message: VocabularyRuntimeMessage) => Promise<unknown>;

const LOAD_FAILURE_TEXT = "Unable to load saved words.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVocabularyListResponse(value: unknown): value is { ok: true; data: VocabularyEntry[] } {
  return isRecord(value) && value.ok === true && Array.isArray(value.data);
}

function getSafeHttpUrl(sourceUrl: string): URL | null {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function renderVocabularyPage(options: RenderOptions): void {
  let tbody = document.querySelector<HTMLTableSectionElement>("#entries");
  const search = document.querySelector<HTMLInputElement>("#search");
  const exportJson = document.querySelector<HTMLButtonElement>("#exportJson");
  const exportCsv = document.querySelector<HTMLButtonElement>("#exportCsv");
  if (!search || !exportJson || !exportCsv) return;

  if (!tbody) {
    const table = document.querySelector<HTMLTableElement>("table") ?? document.createElement("table");
    tbody = document.createElement("tbody");
    tbody.id = "entries";
    table.append(tbody);
    if (!table.isConnected) document.body.append(table);
  }

  tbody.replaceChildren();
  search.oninput = () => options.onSearch(search.value);
  exportJson.onclick = () => options.onExport("json");
  exportCsv.onclick = () => options.onExport("csv");

  if (options.loadFailed) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "error";
    cell.textContent = LOAD_FAILURE_TEXT;
    row.append(cell);
    tbody.append(row);
    return;
  }

  for (const entry of options.entries) {
    const row = document.createElement("tr");

      const wordCell = document.createElement("td");
      const word = document.createElement("strong");
      word.textContent = entry.baseForm || entry.selectedText;
    const meaning = document.createElement("div");
    meaning.textContent = entry.contextualMeaning;
    wordCell.append(word, meaning);

    const translationCell = document.createElement("td");
    translationCell.textContent = entry.translation;

    const sourceCell = document.createElement("td");
    const sourceText = entry.pageTitle || entry.sourceUrl;
    const sourceUrl = getSafeHttpUrl(entry.sourceUrl);
    if (sourceUrl) {
      const source = document.createElement("a");
      source.href = sourceUrl.href;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = sourceText;
      sourceCell.append(source);
    } else {
      sourceCell.textContent = sourceText;
    }

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.dataset.deleteId = entry.id;
    deleteButton.textContent = "删除";
    deleteButton.onclick = () => options.onDelete(entry.id);
    actionCell.append(deleteButton);

    row.append(wordCell, translationCell, sourceCell, actionCell);
    tbody.append(row);
  }

  if (options.entries.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No saved words.";
    row.append(cell);
    tbody.append(row);
  }
}

function downloadText(filename: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadEntries(sendMessage: SendMessage, query = ""): Promise<LoadEntriesResult> {
  try {
    const response = await sendMessage(
      query ? { type: MessageType.SearchVocabulary, payload: { query } } : { type: MessageType.ListVocabulary }
    );
    return isVocabularyListResponse(response) ? { entries: response.data, loadFailed: false } : { entries: [], loadFailed: true };
  } catch {
    return { entries: [], loadFailed: true };
  }
}

async function init(): Promise<void> {
  const extensionApi = getWebExtensionApi();
  await initVocabularyPage({ sendMessage: (message) => extensionApi.runtime.sendMessage(message) });
}

export async function initVocabularyPage(options: { sendMessage: SendMessage }): Promise<void> {
  let requestGeneration = 0;

  function renderState(state: LoadEntriesResult): void {
    renderVocabularyPage({
      entries: state.entries,
      loadFailed: state.loadFailed,
      onSearch: (nextQuery) => void refresh(nextQuery),
      onDelete: (id) => {
        void handleDelete(id);
      },
      onExport: (format) => {
        void handleExport(format);
      }
    });
  }

  async function refresh(query = ""): Promise<void> {
    const generation = ++requestGeneration;
    const state = await loadEntries(options.sendMessage, query);
    if (generation !== requestGeneration) return;
    renderState(state);
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await options.sendMessage({ type: MessageType.DeleteVocabulary, payload: { id } });
      await refresh((document.querySelector<HTMLInputElement>("#search")?.value ?? "").trim());
    } catch {
      renderState({ entries: [], loadFailed: true });
    }
  }

  async function handleExport(format: ExportFormat): Promise<void> {
    try {
      const response = await options.sendMessage({ type: MessageType.ExportVocabulary, payload: { format } });
      if (isRecord(response) && response.ok === true && typeof response.data === "string") {
        downloadText(`openen-vocabulary.${format}`, response.data, format === "json" ? "application/json" : "text/csv");
      }
    } catch {
      return;
    }
  }

  await refresh();
}

function hasExtensionRuntime(): boolean {
  return hasWebExtensionApi();
}

if (hasExtensionRuntime()) {
  void init();
}
