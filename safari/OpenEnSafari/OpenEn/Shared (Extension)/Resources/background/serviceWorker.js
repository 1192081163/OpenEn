// src/providers/chineseFakeTranslationProvider.ts
function firstSentence(text) {
  const normalized = text.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.{1,160}?[.!?])(\s|$)/);
  return match?.[1] ?? normalized.slice(0, 160);
}
function normalizeBaseForm(selectedText) {
  const lower = selectedText.toLowerCase();
  if (lower === "lead" || lower === "leads" || lower === "leading" || lower === "led") return "lead";
  return lower;
}
function translateLead(selectedText, context) {
  const lowerContext = context.toLowerCase();
  if (/\b(pipe|metal|paint|battery|poison|plumbing|residue)\b/.test(lowerContext)) {
    return {
      selectedText,
      baseForm: "lead",
      translation: "\u94C5",
      partOfSpeech: "\u540D\u8BCD",
      contextualMeaning: "\u5728\u8FD9\u6BB5\u8BDD\u4E2D\uFF0Clead \u8868\u793A\u4E00\u79CD\u6709\u6BD2\u7684\u91CD\u91D1\u5C5E\u3002",
      example: "The pipe contained lead. \u8FD9\u6839\u7BA1\u9053\u542B\u6709\u94C5\u3002",
      confidence: 0.9,
      provider: "fake"
    };
  }
  return {
    selectedText,
    baseForm: "lead",
    translation: "\u5E26\u9886\uFF1B\u4E3B\u6301",
    partOfSpeech: "\u52A8\u8BCD",
    contextualMeaning: "\u5728\u8FD9\u6BB5\u8BDD\u4E2D\uFF0Clead \u8868\u793A\u5E26\u9886\u6216\u4E3B\u6301\u67D0\u9879\u6D3B\u52A8\u3002",
    example: "She will lead review. \u5979\u5C06\u4E3B\u6301\u8FD9\u6B21\u8BC4\u5BA1\u3002",
    confidence: 0.9,
    provider: "fake"
  };
}
function createChineseFakeTranslationProvider() {
  return {
    async translate(request) {
      const selectedText = request.selectedText.trim();
      const paragraphContext = request.paragraphContext.trim();
      const baseForm = normalizeBaseForm(selectedText);
      if (baseForm === "lead") return translateLead(selectedText, paragraphContext);
      return {
        selectedText,
        baseForm,
        translation: `${selectedText} \u7684\u4E2D\u6587\u91CA\u4E49`,
        contextualMeaning: `\u57FA\u4E8E\u4E0A\u4E0B\u6587\uFF1A${firstSentence(paragraphContext)}`,
        example: `${selectedText} \u53EF\u4EE5\u7ED3\u5408\u539F\u6587\u8BED\u5883\u7406\u89E3\u3002`,
        confidence: 0.5,
        provider: "fake"
      };
    }
  };
}

// src/providers/deepseekTranslationProvider.ts
var DEEPSEEK_BASE_URL = "https://api.deepseek.com";
function clampConfidence(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return void 0;
  return Math.min(1, Math.max(0, value));
}
function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function parseDeepSeekContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }
}
function buildMessages(request) {
  return [
    {
      role: "system",
      content: "You are a precise English-to-Simplified-Chinese dictionary translator. Output only json. Return valid JSON with baseForm, translation, partOfSpeech, contextualMeaning, example, and confidence."
    },
    {
      role: "user",
      content: JSON.stringify({
        instruction: "Translate the selected English text into Simplified Chinese using the paragraph context. Output json only.",
        selectedText: request.selectedText,
        paragraphContext: request.paragraphContext,
        targetLang: request.targetLang,
        exampleJson: {
          baseForm: "lead",
          translation: "\u5E26\u9886",
          partOfSpeech: "\u52A8\u8BCD",
          contextualMeaning: "\u5728\u8FD9\u6BB5\u8BDD\u4E2D\uFF0Clead \u8868\u793A\u5E26\u9886\u6216\u4E3B\u6301\u67D0\u9879\u6D3B\u52A8\u3002",
          example: "She will lead the review. \u5979\u5C06\u4E3B\u6301\u8FD9\u6B21\u8BC4\u5BA1\u3002",
          confidence: 0.9
        }
      })
    }
  ];
}
function createDeepSeekTranslationProvider(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async translate(request) {
      const response = await fetchImpl(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          messages: buildMessages(request),
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          stream: false,
          temperature: 0.2,
          max_tokens: 500
        })
      });
      if (!response.ok) {
        throw new Error(`DeepSeek request failed with status ${response.status}`);
      }
      const payload = await response.json();
      const choice = payload.choices?.[0];
      if (choice?.finish_reason === "length") {
        throw new Error("DeepSeek response was truncated");
      }
      const content = choice?.message?.content;
      if (!content) {
        throw new Error("DeepSeek returned empty content");
      }
      const parsed = parseDeepSeekContent(content);
      const baseForm = optionalString(parsed.baseForm);
      const translation = optionalString(parsed.translation);
      const contextualMeaning = optionalString(parsed.contextualMeaning);
      const partOfSpeech = optionalString(parsed.partOfSpeech);
      const example = optionalString(parsed.example);
      const confidence = clampConfidence(parsed.confidence);
      if (!translation || !contextualMeaning) {
        throw new Error("DeepSeek response missing required fields");
      }
      return {
        selectedText: request.selectedText,
        ...baseForm ? { baseForm } : {},
        translation,
        contextualMeaning,
        ...partOfSpeech ? { partOfSpeech } : {},
        ...example ? { example } : {},
        ...confidence !== void 0 ? { confidence } : {},
        provider: "deepseek"
      };
    }
  };
}

// src/providers/providerFactory.ts
function createTranslationProviderFromSettings(settings, options = {}) {
  if (settings.provider === "deepseek" && settings.deepseek.apiKey.trim()) {
    return createDeepSeekTranslationProvider({
      apiKey: settings.deepseek.apiKey,
      model: settings.deepseek.model,
      ...options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}
    });
  }
  return createChineseFakeTranslationProvider();
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
  const extensionApi2 = {
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
    extensionApi2.tabs = {
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
  return extensionApi2;
}

// src/settings/translationSettings.ts
var TRANSLATION_SETTINGS_KEY = "openen:translation-settings";
var DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function getDefaultTranslationSettings() {
  return {
    provider: "local",
    deepseek: {
      apiKey: "",
      model: DEFAULT_DEEPSEEK_MODEL
    }
  };
}
function normalizeStoredSettings(value) {
  if (!isRecord(value) || value.provider !== "deepseek" || !isRecord(value.deepseek)) {
    return getDefaultTranslationSettings();
  }
  const apiKey = typeof value.deepseek.apiKey === "string" ? value.deepseek.apiKey.trim() : "";
  const model = typeof value.deepseek.model === "string" && value.deepseek.model.trim() ? value.deepseek.model.trim() : DEFAULT_DEEPSEEK_MODEL;
  if (!apiKey) return getDefaultTranslationSettings();
  return {
    provider: "deepseek",
    deepseek: { apiKey, model }
  };
}
async function loadTranslationSettings(storage) {
  const values = await storage.get(TRANSLATION_SETTINGS_KEY);
  return normalizeStoredSettings(values[TRANSLATION_SETTINGS_KEY]);
}
async function saveDeepSeekSettings(storage, input) {
  const apiKey = input.apiKey.trim();
  const model = input.model?.trim() || DEFAULT_DEEPSEEK_MODEL;
  const settings = apiKey ? { provider: "deepseek", deepseek: { apiKey, model } } : getDefaultTranslationSettings();
  await storage.set({ [TRANSLATION_SETTINGS_KEY]: settings });
  return settings;
}
async function clearDeepSeekApiKey(storage) {
  const settings = getDefaultTranslationSettings();
  await storage.set({ [TRANSLATION_SETTINGS_KEY]: settings });
  return settings;
}
function createTranslationSettingsStore(storage) {
  return {
    load: () => loadTranslationSettings(storage),
    saveDeepSeek: (input) => saveDeepSeekSettings(storage, input),
    clearDeepSeek: () => clearDeepSeekApiKey(storage)
  };
}
function createChromeTranslationSettingsStore() {
  return createTranslationSettingsStore(getWebExtensionApi().storage.local);
}

// src/settings/vocabularyHighlightSettings.ts
var VOCABULARY_HIGHLIGHT_SETTINGS_KEY = "openen:vocabulary-highlight-settings";
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function getDefaultVocabularyHighlightSettings() {
  return { enabled: true };
}
function normalizeStoredSettings2(value) {
  if (!isRecord2(value) || typeof value.enabled !== "boolean") {
    return getDefaultVocabularyHighlightSettings();
  }
  return { enabled: value.enabled };
}
async function loadVocabularyHighlightSettings(storage) {
  const values = await storage.get(VOCABULARY_HIGHLIGHT_SETTINGS_KEY);
  return normalizeStoredSettings2(values[VOCABULARY_HIGHLIGHT_SETTINGS_KEY]);
}
async function saveVocabularyHighlightSettings(storage, input) {
  const settings = { enabled: input.enabled };
  await storage.set({ [VOCABULARY_HIGHLIGHT_SETTINGS_KEY]: settings });
  return settings;
}
function createVocabularyHighlightSettingsStore(storage) {
  return {
    load: () => loadVocabularyHighlightSettings(storage),
    save: (input) => saveVocabularyHighlightSettings(storage, input)
  };
}
function createChromeVocabularyHighlightSettingsStore() {
  return createVocabularyHighlightSettingsStore(getWebExtensionApi().storage.local);
}

// src/storage/vocabularyStore.ts
var STORAGE_KEY = "openen:vocabulary";
function isStringRecord(value) {
  return typeof value === "object" && value !== null;
}
function isOptionalString(value) {
  return value === void 0 || typeof value === "string";
}
function isVocabularyEntry(value) {
  if (!isStringRecord(value)) return false;
  return typeof value.id === "string" && typeof value.selectedText === "string" && isOptionalString(value.baseForm) && typeof value.translation === "string" && isOptionalString(value.partOfSpeech) && typeof value.contextualMeaning === "string" && isOptionalString(value.example) && typeof value.paragraphContext === "string" && typeof value.sourceUrl === "string" && typeof value.pageTitle === "string" && typeof value.createdAt === "string" && typeof value.provider === "string";
}
function sortNewestFirst(entries) {
  return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
function matchesQuery(entry, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [entry.selectedText, entry.baseForm ?? "", entry.translation, entry.pageTitle, entry.contextualMeaning].join(" ").toLowerCase().includes(needle);
}
function duplicateKey(entry) {
  return (entry.baseForm || entry.selectedText).trim().toLowerCase();
}
function createUniqueId(id, entries) {
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
function createVocabularyStore(storageArea) {
  let writeQueue = Promise.resolve();
  async function readEntries() {
    const result = await storageArea.get(STORAGE_KEY);
    const value = result[STORAGE_KEY];
    return Array.isArray(value) ? value.filter(isVocabularyEntry) : [];
  }
  async function writeEntries(entries) {
    await storageArea.set({ [STORAGE_KEY]: entries });
  }
  async function runSerialized(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }
  return {
    async add(entry) {
      return runSerialized(async () => {
        const entries = await readEntries();
        const entryKey = duplicateKey(entry);
        const duplicateIndex = entries.findIndex((item) => duplicateKey(item) === entryKey && item.sourceUrl === entry.sourceUrl);
        if (duplicateIndex >= 0) {
          const existing = entries[duplicateIndex];
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
    async list() {
      return sortNewestFirst(await readEntries());
    },
    async search(query) {
      return sortNewestFirst((await readEntries()).filter((entry) => matchesQuery(entry, query)));
    },
    async delete(id) {
      await runSerialized(async () => {
        await writeEntries((await readEntries()).filter((entry) => entry.id !== id));
      });
    }
  };
}
function createChromeVocabularyStore() {
  return createVocabularyStore(getWebExtensionApi().storage.local);
}

// src/shared/messages.ts
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function hasString(record, key) {
  return typeof record[key] === "string";
}
function hasOptionalString(record, key) {
  return !Object.prototype.hasOwnProperty.call(record, key) || typeof record[key] === "string";
}
var vocabularyEntryStringFields = [
  "id",
  "selectedText",
  "baseForm",
  "translation",
  "partOfSpeech",
  "contextualMeaning",
  "example",
  "paragraphContext",
  "sourceUrl",
  "pageTitle",
  "createdAt",
  "provider"
];
function hasValidKnownVocabularyEntryFields(entry) {
  return vocabularyEntryStringFields.every(
    (field) => !Object.prototype.hasOwnProperty.call(entry, field) || typeof entry[field] === "string"
  );
}
function isTranslateSelectionMessage(value) {
  return isRecord3(value) && value.type === "TRANSLATE_SELECTION" /* TranslateSelection */ && isRecord3(value.payload) && hasString(value.payload, "selectedText") && hasString(value.payload, "paragraphContext") && hasString(value.payload, "sourceUrl") && hasString(value.payload, "pageTitle");
}
function isAddVocabularyMessage(value) {
  return isRecord3(value) && value.type === "ADD_VOCABULARY" /* AddVocabulary */ && isRecord3(value.payload) && isRecord3(value.payload.entry) && hasValidKnownVocabularyEntryFields(value.payload.entry);
}
function isListVocabularyMessage(value) {
  return isRecord3(value) && value.type === "LIST_VOCABULARY" /* ListVocabulary */;
}
function isSearchVocabularyMessage(value) {
  return isRecord3(value) && value.type === "SEARCH_VOCABULARY" /* SearchVocabulary */ && isRecord3(value.payload) && hasString(value.payload, "query");
}
function isDeleteVocabularyMessage(value) {
  return isRecord3(value) && value.type === "DELETE_VOCABULARY" /* DeleteVocabulary */ && isRecord3(value.payload) && hasString(value.payload, "id");
}
function isExportVocabularyMessage(value) {
  return isRecord3(value) && value.type === "EXPORT_VOCABULARY" /* ExportVocabulary */ && isRecord3(value.payload) && (value.payload.format === "json" || value.payload.format === "csv");
}
function isGetTranslationSettingsMessage(value) {
  return isRecord3(value) && value.type === "GET_TRANSLATION_SETTINGS" /* GetTranslationSettings */;
}
function isSaveDeepSeekSettingsMessage(value) {
  return isRecord3(value) && value.type === "SAVE_DEEPSEEK_SETTINGS" /* SaveDeepSeekSettings */ && isRecord3(value.payload) && hasString(value.payload, "apiKey") && hasOptionalString(value.payload, "model");
}
function isClearDeepSeekSettingsMessage(value) {
  return isRecord3(value) && value.type === "CLEAR_DEEPSEEK_SETTINGS" /* ClearDeepSeekSettings */;
}
function isGetVocabularyHighlightSettingsMessage(value) {
  return isRecord3(value) && value.type === "GET_VOCABULARY_HIGHLIGHT_SETTINGS" /* GetVocabularyHighlightSettings */;
}
function isSaveVocabularyHighlightSettingsMessage(value) {
  return isRecord3(value) && value.type === "SAVE_VOCABULARY_HIGHLIGHT_SETTINGS" /* SaveVocabularyHighlightSettings */ && isRecord3(value.payload) && typeof value.payload.enabled === "boolean";
}

// src/storage/exportVocabulary.ts
var CSV_COLUMNS = [
  "selectedText",
  "baseForm",
  "translation",
  "partOfSpeech",
  "contextualMeaning",
  "example",
  "paragraphContext",
  "sourceUrl",
  "pageTitle",
  "createdAt",
  "provider"
];
function csvCell(value) {
  const text = String(value ?? "");
  const neutralizedText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(neutralizedText)) return `"${neutralizedText.replace(/"/g, '""')}"`;
  return neutralizedText;
}
function exportVocabularyAsJson(entries) {
  return JSON.stringify(entries, null, 2);
}
function exportVocabularyAsCsv(entries) {
  const header = CSV_COLUMNS.join(",");
  const rows = entries.map((entry) => CSV_COLUMNS.map((column) => csvCell(entry[column])).join(","));
  return [header, ...rows].join("\n");
}

// src/background/handlers.ts
function success(data) {
  return { ok: true, data };
}
function failure(error) {
  return { ok: false, error };
}
function toSettingsView(settings) {
  return {
    provider: settings.provider,
    deepseek: {
      hasApiKey: Boolean(settings.deepseek.apiKey),
      apiKey: "",
      model: settings.deepseek.model
    }
  };
}
function completeEntry(partial, now, id) {
  const { selectedText, translation, contextualMeaning, paragraphContext, sourceUrl } = partial;
  if (!selectedText || !translation || !contextualMeaning || !paragraphContext || !sourceUrl) {
    throw new Error("Missing required vocabulary fields");
  }
  const entry = {
    id: partial.id ?? id,
    selectedText,
    translation,
    contextualMeaning,
    paragraphContext,
    sourceUrl,
    pageTitle: partial.pageTitle ?? "",
    createdAt: partial.createdAt ?? now.toISOString(),
    provider: partial.provider ?? "fake"
  };
  if (partial.baseForm !== void 0) entry.baseForm = partial.baseForm;
  if (partial.partOfSpeech !== void 0) entry.partOfSpeech = partial.partOfSpeech;
  if (partial.example !== void 0) entry.example = partial.example;
  return entry;
}
function createBackgroundHandler(dependencies) {
  const now = dependencies.now ?? (() => /* @__PURE__ */ new Date());
  const idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());
  const handleMessage2 = async (message) => {
    try {
      if (isTranslateSelectionMessage(message)) {
        const result = await dependencies.provider.translate({
          selectedText: message.payload.selectedText,
          paragraphContext: message.payload.paragraphContext,
          targetLang: "zh-CN"
        });
        return success(result);
      }
      if (isAddVocabularyMessage(message)) {
        const entry = completeEntry(message.payload.entry, now(), idFactory());
        return success(await dependencies.store.add(entry));
      }
      if (isListVocabularyMessage(message)) return success(await dependencies.store.list());
      if (isSearchVocabularyMessage(message)) return success(await dependencies.store.search(message.payload.query));
      if (isDeleteVocabularyMessage(message)) {
        await dependencies.store.delete(message.payload.id);
        return success({ id: message.payload.id });
      }
      if (isExportVocabularyMessage(message)) {
        const entries = await dependencies.store.list();
        return success(message.payload.format === "json" ? exportVocabularyAsJson(entries) : exportVocabularyAsCsv(entries));
      }
      if (isGetTranslationSettingsMessage(message)) {
        if (!dependencies.settingsStore) return failure("Translation settings unavailable");
        return success(toSettingsView(await dependencies.settingsStore.load()));
      }
      if (isSaveDeepSeekSettingsMessage(message)) {
        if (!dependencies.settingsStore) return failure("Translation settings unavailable");
        return success(toSettingsView(await dependencies.settingsStore.saveDeepSeek(message.payload)));
      }
      if (isClearDeepSeekSettingsMessage(message)) {
        if (!dependencies.settingsStore) return failure("Translation settings unavailable");
        return success(toSettingsView(await dependencies.settingsStore.clearDeepSeek()));
      }
      if (isGetVocabularyHighlightSettingsMessage(message)) {
        if (!dependencies.highlightSettingsStore) return failure("Vocabulary highlight settings unavailable");
        return success(await dependencies.highlightSettingsStore.load());
      }
      if (isSaveVocabularyHighlightSettingsMessage(message)) {
        if (!dependencies.highlightSettingsStore) return failure("Vocabulary highlight settings unavailable");
        return success(await dependencies.highlightSettingsStore.save(message.payload));
      }
      return failure("Unsupported message");
    } catch (error) {
      return failure(error instanceof Error ? error.message : "Unknown background error");
    }
  };
  return handleMessage2;
}

// src/background/serviceWorker.ts
var extensionApi = getWebExtensionApi();
var settingsStore = createChromeTranslationSettingsStore();
var highlightSettingsStore = createChromeVocabularyHighlightSettingsStore();
var handleMessage = createBackgroundHandler({
  provider: {
    async translate(request) {
      const settings = await settingsStore.load();
      return createTranslationProviderFromSettings(settings).translate(request);
    }
  },
  store: createChromeVocabularyStore(),
  settingsStore,
  highlightSettingsStore
});
extensionApi.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
//# sourceMappingURL=serviceWorker.js.map
