"use strict";
(() => {
  // src/shared/messages.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function isTranslationSettingsView(value) {
    return isRecord(value) && (value.provider === "local" || value.provider === "deepseek") && isRecord(value.deepseek) && typeof value.deepseek.hasApiKey === "boolean" && value.deepseek.apiKey === "" && typeof value.deepseek.model === "string";
  }
  function isVocabularyHighlightSettingsView(value) {
    return isRecord(value) && typeof value.enabled === "boolean";
  }

  // src/shared/webExtensionApi.ts
  function hasUsableCapability(api) {
    return Boolean(
      api?.runtime?.sendMessage || api?.runtime?.openOptionsPage || api?.runtime?.onMessage || api?.storage?.local
    );
  }
  function getRawApi() {
    const globals = globalThis;
    if (hasUsableCapability(globals.browser)) {
      return { api: globals.browser, promiseFirst: true };
    }
    if (hasUsableCapability(globals.chrome)) {
      return { api: globals.chrome, promiseFirst: false };
    }
    return void 0;
  }
  function runtimeError(api) {
    const message = api.runtime?.lastError?.message;
    return message ? new Error(message) : void 0;
  }
  function isPromiseLike(value) {
    return typeof value === "object" && value !== null && typeof value.then === "function";
  }
  function chromeCallback(api, run) {
    return new Promise((resolve, reject) => {
      const callback = (value) => {
        const error = runtimeError(api);
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      };
      const returned = run(callback);
      if (isPromiseLike(returned)) {
        Promise.resolve(returned).then(resolve, reject);
      }
    });
  }
  function hasWebExtensionApi() {
    return getRawApi() !== void 0;
  }
  function getWebExtensionApi() {
    const raw = getRawApi();
    if (!raw) throw new Error("WebExtension API unavailable");
    const { api, promiseFirst } = raw;
    const runtime = api.runtime;
    const storage = api.storage?.local;
    if (!runtime) throw new Error("WebExtension API unavailable");
    const runtimeApi = {
      sendMessage(message) {
        if (!runtime.sendMessage) return Promise.reject(new Error("WebExtension runtime messaging unavailable"));
        if (promiseFirst) return Promise.resolve(runtime.sendMessage(message));
        return chromeCallback(api, (callback) => {
          runtime.sendMessage?.(message, callback);
        });
      },
      openOptionsPage() {
        if (!runtime.openOptionsPage) return Promise.resolve();
        if (promiseFirst) return Promise.resolve(runtime.openOptionsPage()).then(() => void 0);
        return chromeCallback(api, (callback) => {
          runtime.openOptionsPage?.(callback);
        });
      }
    };
    if (runtime.onMessage) runtimeApi.onMessage = runtime.onMessage;
    const extensionApi = {
      runtime: runtimeApi,
      storage: {
        local: {
          get(key) {
            if (!storage) return Promise.reject(new Error("WebExtension storage unavailable"));
            if (promiseFirst) return Promise.resolve(storage.get(key));
            return chromeCallback(api, (callback) => {
              storage.get(key, callback);
            });
          },
          set(values) {
            if (!storage) return Promise.reject(new Error("WebExtension storage unavailable"));
            if (promiseFirst) return Promise.resolve(storage.set(values));
            return chromeCallback(api, (callback) => {
              storage.set(values, callback);
            });
          }
        }
      }
    };
    if (api.tabs?.query && api.tabs.sendMessage) {
      extensionApi.tabs = {
        query(queryInfo) {
          if (promiseFirst) return Promise.resolve(api.tabs?.query?.(queryInfo) ?? []);
          return chromeCallback(api, (callback) => {
            api.tabs?.query?.(queryInfo, callback);
          });
        },
        sendMessage(tabId, message) {
          if (promiseFirst) return Promise.resolve(api.tabs?.sendMessage?.(tabId, message));
          return chromeCallback(api, (callback) => {
            api.tabs?.sendMessage?.(tabId, message, callback);
          });
        }
      };
    }
    return extensionApi;
  }

  // src/ui/popup/popup.ts
  var LOAD_FAILURE_TEXT = "Unable to load saved words.";
  var DEFAULT_MODEL = "deepseek-v4-flash";
  function isRecord2(value) {
    return typeof value === "object" && value !== null;
  }
  function isVocabularyListResponse(value) {
    return isRecord2(value) && value.ok === true && Array.isArray(value.data);
  }
  function appendListMessage(list, text, className) {
    const item = document.createElement("li");
    if (className) item.className = className;
    item.textContent = text;
    list.append(item);
  }
  function getSettingsElements() {
    const form = document.querySelector("#translationSettings");
    const status = document.querySelector("#providerStatus");
    const apiKey = document.querySelector("#deepseekApiKey");
    const model = document.querySelector("#deepseekModel");
    const clear = document.querySelector("#clearDeepSeek");
    if (!form || !status || !apiKey || !model || !clear) return void 0;
    return { form, status, apiKey, model, clear };
  }
  function renderSettings(settings) {
    const elements = getSettingsElements();
    if (!elements) return;
    elements.status.textContent = settings.provider === "deepseek" && settings.deepseek.hasApiKey ? "DeepSeek \u5DF2\u542F\u7528" : "\u672C\u5730\u4E2D\u6587\u6A21\u5F0F";
    elements.model.value = settings.deepseek.model || DEFAULT_MODEL;
    elements.apiKey.value = "";
  }
  async function loadAndRenderSettings(sendMessage) {
    const response = await sendMessage({ type: "GET_TRANSLATION_SETTINGS" /* GetTranslationSettings */ });
    if (isRecord2(response) && response.ok === true && isTranslationSettingsView(response.data)) {
      renderSettings(response.data);
    }
  }
  function bindSettingsForm(sendMessage) {
    const elements = getSettingsElements();
    if (!elements) return;
    elements.form.onsubmit = (event) => {
      event.preventDefault();
      const apiKey = elements.apiKey.value.trim();
      const model = elements.model.value.trim() || DEFAULT_MODEL;
      void sendMessage({
        type: "SAVE_DEEPSEEK_SETTINGS" /* SaveDeepSeekSettings */,
        payload: { apiKey, model }
      }).then((response) => {
        if (isRecord2(response) && response.ok === true && isTranslationSettingsView(response.data)) {
          renderSettings(response.data);
        }
      });
    };
    elements.clear.onclick = () => {
      void sendMessage({ type: "CLEAR_DEEPSEEK_SETTINGS" /* ClearDeepSeekSettings */ }).then((response) => {
        if (isRecord2(response) && response.ok === true && isTranslationSettingsView(response.data)) {
          renderSettings(response.data);
        }
      });
    };
  }
  function getHighlightToggle() {
    return document.querySelector("#highlightVocabulary") ?? void 0;
  }
  function renderHighlightSettings(settings) {
    const toggle = getHighlightToggle();
    if (toggle) toggle.checked = settings.enabled;
  }
  async function loadAndRenderHighlightSettings(sendMessage) {
    const response = await sendMessage({ type: "GET_VOCABULARY_HIGHLIGHT_SETTINGS" /* GetVocabularyHighlightSettings */ });
    if (isRecord2(response) && response.ok === true && isVocabularyHighlightSettingsView(response.data)) {
      renderHighlightSettings(response.data);
    }
  }
  function bindHighlightToggle(sendMessage, notifyVocabularyHighlightSettingsChanged) {
    const toggle = getHighlightToggle();
    if (!toggle) return;
    toggle.onchange = () => {
      const enabled = toggle.checked;
      void sendMessage({
        type: "SAVE_VOCABULARY_HIGHLIGHT_SETTINGS" /* SaveVocabularyHighlightSettings */,
        payload: { enabled }
      }).then((response) => {
        if (isRecord2(response) && response.ok === true && isVocabularyHighlightSettingsView(response.data)) {
          renderHighlightSettings(response.data);
          notifyVocabularyHighlightSettingsChanged?.(response.data.enabled);
        }
      });
    };
  }
  function renderPopup(options) {
    const list = document.querySelector("#recentWords");
    const openButton = document.querySelector("#openVocabulary");
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
  async function initPopup(options) {
    const openVocabulary = () => options.openOptionsPage();
    bindSettingsForm(options.sendMessage);
    bindHighlightToggle(options.sendMessage, options.notifyVocabularyHighlightSettingsChanged);
    try {
      const response = await options.sendMessage({ type: "LIST_VOCABULARY" /* ListVocabulary */ });
      if (isVocabularyListResponse(response)) {
        renderPopup({ entries: response.data, openVocabulary });
        await loadAndRenderSettings(options.sendMessage);
        await loadAndRenderHighlightSettings(options.sendMessage);
        return;
      }
    } catch {
    }
    renderPopup({ entries: [], loadFailed: true, openVocabulary });
  }
  function notifyActiveTabVocabularyHighlightSettingsChanged(enabled) {
    const tabsApi = getWebExtensionApi().tabs;
    if (!tabsApi) return;
    void tabsApi.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      if (typeof tabId !== "number") return;
      void tabsApi.sendMessage(tabId, {
        type: "SAVE_VOCABULARY_HIGHLIGHT_SETTINGS" /* SaveVocabularyHighlightSettings */,
        payload: { enabled }
      });
    });
  }
  async function init() {
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
  function canAutoStartPopup() {
    return hasWebExtensionApi();
  }
  if (canAutoStartPopup()) {
    void init();
  }
})();
//# sourceMappingURL=popup.js.map
