import { MessageType } from "../../shared/messages";
import type { VocabularyEntry } from "../../shared/types";

interface RenderPopupOptions {
  entries: VocabularyEntry[];
  loadFailed?: boolean;
  openVocabulary(): void;
}

interface InitPopupOptions {
  sendMessage(message: { type: MessageType.ListVocabulary }): Promise<unknown>;
  openOptionsPage(): void;
}

const LOAD_FAILURE_TEXT = "Unable to load saved words.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVocabularyListResponse(value: unknown): value is { ok: true; data: VocabularyEntry[] } {
  return isRecord(value) && value.ok === true && Array.isArray(value.data);
}

function appendListMessage(list: HTMLUListElement, text: string, className?: string): void {
  const item = document.createElement("li");
  if (className) item.className = className;
  item.textContent = text;
  list.append(item);
}

export function renderPopup(options: RenderPopupOptions): void {
  const list = document.querySelector<HTMLUListElement>("#recentWords");
  const openButton = document.querySelector<HTMLButtonElement>("#openVocabulary");
  if (!list || !openButton) return;

  list.replaceChildren();
  openButton.onclick = options.openVocabulary;

  if (options.loadFailed) {
    appendListMessage(list, LOAD_FAILURE_TEXT, "error");
    return;
  }

  for (const entry of options.entries.slice(0, 5)) {
    const item = document.createElement("li");
    const word = document.createElement("strong");
    word.textContent = entry.selectedText;
    const translation = document.createElement("div");
    translation.className = "translation";
    translation.textContent = entry.translation;
    item.append(word, translation);
    list.append(item);
  }

  if (options.entries.length === 0) {
    appendListMessage(list, "No saved words yet.");
  }
}

export async function initPopup(options: InitPopupOptions): Promise<void> {
  const openVocabulary = () => options.openOptionsPage();

  try {
    const response = await options.sendMessage({ type: MessageType.ListVocabulary });
    if (isVocabularyListResponse(response)) {
      renderPopup({ entries: response.data, openVocabulary });
      return;
    }
  } catch {
    // Render the same failure state for rejected extension messaging.
  }

  renderPopup({ entries: [], loadFailed: true, openVocabulary });
}

async function init(): Promise<void> {
  renderPopup({
    entries: [],
    openVocabulary: () => chrome.runtime.openOptionsPage()
  });

  await initPopup({
    sendMessage: (message) => chrome.runtime.sendMessage(message),
    openOptionsPage: () => chrome.runtime.openOptionsPage()
  });
}

function canAutoStartPopup(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.sendMessage === "function" &&
    typeof chrome.runtime?.openOptionsPage === "function"
  );
}

if (canAutoStartPopup()) {
  void init();
}
