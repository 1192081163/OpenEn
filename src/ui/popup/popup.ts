import { isTranslationSettingsView, MessageType } from "../../shared/messages";
import type { TranslationSettingsView, VocabularyEntry } from "../../shared/types";

interface RenderPopupOptions {
  entries: VocabularyEntry[];
  loadFailed?: boolean;
  openVocabulary(): void;
}

interface InitPopupOptions {
  sendMessage(message: unknown): Promise<unknown>;
  openOptionsPage(): void;
}

const LOAD_FAILURE_TEXT = "Unable to load saved words.";
const DEFAULT_MODEL = "deepseek-v4-flash";

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

function getSettingsElements():
  | {
      form: HTMLFormElement;
      status: HTMLElement;
      apiKey: HTMLInputElement;
      model: HTMLInputElement;
      clear: HTMLButtonElement;
    }
  | undefined {
  const form = document.querySelector<HTMLFormElement>("#translationSettings");
  const status = document.querySelector<HTMLElement>("#providerStatus");
  const apiKey = document.querySelector<HTMLInputElement>("#deepseekApiKey");
  const model = document.querySelector<HTMLInputElement>("#deepseekModel");
  const clear = document.querySelector<HTMLButtonElement>("#clearDeepSeek");

  if (!form || !status || !apiKey || !model || !clear) return undefined;

  return { form, status, apiKey, model, clear };
}

function renderSettings(settings: TranslationSettingsView): void {
  const elements = getSettingsElements();
  if (!elements) return;

  elements.status.textContent =
    settings.provider === "deepseek" && settings.deepseek.hasApiKey ? "DeepSeek 已启用" : "本地中文模式";
  elements.model.value = settings.deepseek.model || DEFAULT_MODEL;
  elements.apiKey.value = "";
}

async function loadAndRenderSettings(sendMessage: InitPopupOptions["sendMessage"]): Promise<void> {
  const response = await sendMessage({ type: MessageType.GetTranslationSettings });
  if (isRecord(response) && response.ok === true && isTranslationSettingsView(response.data)) {
    renderSettings(response.data);
  }
}

function bindSettingsForm(sendMessage: InitPopupOptions["sendMessage"]): void {
  const elements = getSettingsElements();
  if (!elements) return;

  elements.form.onsubmit = (event) => {
    event.preventDefault();
    const apiKey = elements.apiKey.value.trim();
    const model = elements.model.value.trim() || DEFAULT_MODEL;

    void sendMessage({
      type: MessageType.SaveDeepSeekSettings,
      payload: { apiKey, model }
    }).then((response) => {
      if (isRecord(response) && response.ok === true && isTranslationSettingsView(response.data)) {
        renderSettings(response.data);
      }
    });
  };

  elements.clear.onclick = () => {
    void sendMessage({ type: MessageType.ClearDeepSeekSettings }).then((response) => {
      if (isRecord(response) && response.ok === true && isTranslationSettingsView(response.data)) {
        renderSettings(response.data);
      }
    });
  };
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

  bindSettingsForm(options.sendMessage);

  try {
    const response = await options.sendMessage({ type: MessageType.ListVocabulary });
    if (isVocabularyListResponse(response)) {
      renderPopup({ entries: response.data, openVocabulary });
      await loadAndRenderSettings(options.sendMessage);
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
