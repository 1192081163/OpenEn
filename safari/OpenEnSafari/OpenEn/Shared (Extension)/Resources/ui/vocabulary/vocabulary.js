"use strict";
(() => {
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

  // src/ui/vocabulary/vocabulary.ts
  var LOAD_FAILURE_TEXT = "Unable to load saved words.";
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function isVocabularyListResponse(value) {
    return isRecord(value) && value.ok === true && Array.isArray(value.data);
  }
  function getSafeHttpUrl(sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }
  function renderVocabularyPage(options) {
    let tbody = document.querySelector("#entries");
    const search = document.querySelector("#search");
    const exportJson = document.querySelector("#exportJson");
    const exportCsv = document.querySelector("#exportCsv");
    if (!search || !exportJson || !exportCsv) return;
    if (!tbody) {
      const table = document.querySelector("table") ?? document.createElement("table");
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
      deleteButton.textContent = "\u5220\u9664";
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
  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function loadEntries(sendMessage, query = "") {
    try {
      const response = await sendMessage(
        query ? { type: "SEARCH_VOCABULARY" /* SearchVocabulary */, payload: { query } } : { type: "LIST_VOCABULARY" /* ListVocabulary */ }
      );
      return isVocabularyListResponse(response) ? { entries: response.data, loadFailed: false } : { entries: [], loadFailed: true };
    } catch {
      return { entries: [], loadFailed: true };
    }
  }
  async function init() {
    const extensionApi = getWebExtensionApi();
    await initVocabularyPage({ sendMessage: (message) => extensionApi.runtime.sendMessage(message) });
  }
  async function initVocabularyPage(options) {
    let requestGeneration = 0;
    function renderState(state) {
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
    async function refresh(query = "") {
      const generation = ++requestGeneration;
      const state = await loadEntries(options.sendMessage, query);
      if (generation !== requestGeneration) return;
      renderState(state);
    }
    async function handleDelete(id) {
      try {
        await options.sendMessage({ type: "DELETE_VOCABULARY" /* DeleteVocabulary */, payload: { id } });
        await refresh((document.querySelector("#search")?.value ?? "").trim());
      } catch {
        renderState({ entries: [], loadFailed: true });
      }
    }
    async function handleExport(format) {
      try {
        const response = await options.sendMessage({ type: "EXPORT_VOCABULARY" /* ExportVocabulary */, payload: { format } });
        if (isRecord(response) && response.ok === true && typeof response.data === "string") {
          downloadText(`openen-vocabulary.${format}`, response.data, format === "json" ? "application/json" : "text/csv");
        }
      } catch {
        return;
      }
    }
    await refresh();
  }
  function hasExtensionRuntime() {
    return hasWebExtensionApi();
  }
  if (hasExtensionRuntime()) {
    void init();
  }
})();
