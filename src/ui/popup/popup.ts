import { MessageType } from "../../shared/messages";
import type { VocabularyEntry } from "../../shared/types";

interface RenderPopupOptions {
  entries: VocabularyEntry[];
  openVocabulary(): void;
}

export function renderPopup(options: RenderPopupOptions): void {
  const list = document.querySelector<HTMLUListElement>("#recentWords");
  const openButton = document.querySelector<HTMLButtonElement>("#openVocabulary");
  if (!list || !openButton) return;

  list.replaceChildren();
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
    const item = document.createElement("li");
    item.textContent = "No saved words yet.";
    list.append(item);
  }

  openButton.addEventListener("click", options.openVocabulary);
}

async function init(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: MessageType.ListVocabulary });
  const entries = response?.ok && Array.isArray(response.data) ? (response.data as VocabularyEntry[]) : [];
  renderPopup({
    entries,
    openVocabulary: () => chrome.runtime.openOptionsPage()
  });
}

if (typeof chrome !== "undefined") {
  void init();
}
