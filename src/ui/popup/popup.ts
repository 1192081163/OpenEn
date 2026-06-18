import { isTranslationSettingsView, isVocabularyHighlightSettingsView, MessageType } from "../../shared/messages";
import type { TranslationSettingsView, VocabularyEntry, VocabularyHighlightSettingsView } from "../../shared/types";
import { getWebExtensionApi, hasWebExtensionApi } from "../../shared/webExtensionApi";

interface RenderPopupOptions {
  entries: VocabularyEntry[];
  loadFailed?: boolean;
  openVocabulary(): void;
}

interface InitPopupOptions {
  sendMessage(message: unknown): Promise<unknown>;
  openOptionsPage(): void;
  notifyVocabularyHighlightSettingsChanged?(enabled: boolean): void;
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

function getHighlightToggle(): HTMLInputElement | undefined {
  return document.querySelector<HTMLInputElement>("#highlightVocabulary") ?? undefined;
}

function renderHighlightSettings(settings: VocabularyHighlightSettingsView): void {
  const toggle = getHighlightToggle();
  if (toggle) toggle.checked = settings.enabled;
}

async function loadAndRenderHighlightSettings(sendMessage: InitPopupOptions["sendMessage"]): Promise<void> {
  const response = await sendMessage({ type: MessageType.GetVocabularyHighlightSettings });
  if (isRecord(response) && response.ok === true && isVocabularyHighlightSettingsView(response.data)) {
    renderHighlightSettings(response.data);
  }
}

function bindHighlightToggle(
  sendMessage: InitPopupOptions["sendMessage"],
  notifyVocabularyHighlightSettingsChanged?: (enabled: boolean) => void
): void {
  const toggle = getHighlightToggle();
  if (!toggle) return;

  toggle.onchange = () => {
    const enabled = toggle.checked;
    void sendMessage({
      type: MessageType.SaveVocabularyHighlightSettings,
      payload: { enabled }
    }).then((response) => {
      if (isRecord(response) && response.ok === true && isVocabularyHighlightSettingsView(response.data)) {
        renderHighlightSettings(response.data);
        notifyVocabularyHighlightSettingsChanged?.(response.data.enabled);
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
  bindHighlightToggle(options.sendMessage, options.notifyVocabularyHighlightSettingsChanged);

  try {
    const response = await options.sendMessage({ type: MessageType.ListVocabulary });
    if (isVocabularyListResponse(response)) {
      renderPopup({ entries: response.data, openVocabulary });
      await loadAndRenderSettings(options.sendMessage);
      await loadAndRenderHighlightSettings(options.sendMessage);
      return;
    }
  } catch {
    // Render the same failure state for rejected extension messaging.
  }

  renderPopup({ entries: [], loadFailed: true, openVocabulary });
}

function notifyActiveTabVocabularyHighlightSettingsChanged(enabled: boolean): void {
  const tabsApi = getWebExtensionApi().tabs;
  if (!tabsApi) return;

  void tabsApi.query({ active: true, currentWindow: true }).then((tabs) => {
    const tabId = tabs[0]?.id;
    if (typeof tabId !== "number") return;
    void tabsApi.sendMessage(tabId, {
      type: MessageType.SaveVocabularyHighlightSettings,
      payload: { enabled }
    });
  });
}

async function init(): Promise<void> {
  const extensionApi = getWebExtensionApi();
  renderPopup({
    entries: [],
    openVocabulary: () => {
      void extensionApi.runtime.openOptionsPage();
    }
  });

  await initPopup({
    sendMessage: (message) => extensionApi.runtime.sendMessage(message),
    openOptionsPage: () => {
      void extensionApi.runtime.openOptionsPage();
    },
    notifyVocabularyHighlightSettingsChanged: notifyActiveTabVocabularyHighlightSettingsChanged
  });
}

function canAutoStartPopup(): boolean {
  return hasWebExtensionApi();
}

if (canAutoStartPopup()) {
  void init();
}
