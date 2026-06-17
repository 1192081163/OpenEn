import { MessageType } from "../../shared/messages";
import type { ExportFormat, VocabularyEntry } from "../../shared/types";

interface RenderOptions {
  entries: VocabularyEntry[];
  onSearch(query: string): void;
  onDelete(id: string): void;
  onExport(format: ExportFormat): void;
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
  for (const entry of options.entries) {
    const row = document.createElement("tr");

    const wordCell = document.createElement("td");
    const word = document.createElement("strong");
    word.textContent = entry.selectedText;
    const meaning = document.createElement("div");
    meaning.textContent = entry.contextualMeaning;
    wordCell.append(word, meaning);

    const translationCell = document.createElement("td");
    translationCell.textContent = entry.translation;

    const sourceCell = document.createElement("td");
    const source = document.createElement("a");
    source.rel = "noreferrer";
    source.href = entry.sourceUrl;
    source.textContent = entry.pageTitle || entry.sourceUrl;
    sourceCell.append(source);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.dataset.deleteId = entry.id;
    deleteButton.textContent = "Delete";
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

  search.oninput = () => options.onSearch(search.value);
  exportJson.onclick = () => options.onExport("json");
  exportCsv.onclick = () => options.onExport("csv");
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

async function loadEntries(query = ""): Promise<VocabularyEntry[]> {
  const response = await chrome.runtime.sendMessage(
    query ? { type: MessageType.SearchVocabulary, payload: { query } } : { type: MessageType.ListVocabulary }
  );
  return response?.ok && Array.isArray(response.data) ? (response.data as VocabularyEntry[]) : [];
}

async function init(): Promise<void> {
  async function refresh(query = ""): Promise<void> {
    renderVocabularyPage({
      entries: await loadEntries(query),
      onSearch: (nextQuery) => void refresh(nextQuery),
      onDelete: async (id) => {
        await chrome.runtime.sendMessage({ type: MessageType.DeleteVocabulary, payload: { id } });
        await refresh((document.querySelector<HTMLInputElement>("#search")?.value ?? "").trim());
      },
      onExport: async (format) => {
        const response = await chrome.runtime.sendMessage({ type: MessageType.ExportVocabulary, payload: { format } });
        if (response?.ok && typeof response.data === "string") {
          downloadText(`openen-vocabulary.${format}`, response.data, format === "json" ? "application/json" : "text/csv");
        }
      }
    });
  }

  await refresh();
}

function hasChromeRuntime(): boolean {
  return typeof chrome !== "undefined" && typeof chrome.runtime?.sendMessage === "function";
}

if (hasChromeRuntime()) {
  void init();
}
