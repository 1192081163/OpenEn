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

  // src/content/selectionContext.ts
  var MAX_CONTEXT_LENGTH = 1500;
  var CONTAINER_SELECTOR = "p, li, blockquote, article, section, div";
  var IGNORED_SELECTOR = "script, style, noscript, textarea, input";
  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }
  function capContext(text, selectedText, selectedTextStart) {
    const normalized = normalizeText(text);
    if (normalized.length <= MAX_CONTEXT_LENGTH) return normalized;
    if (!selectedText) return normalized.slice(0, MAX_CONTEXT_LENGTH).trim();
    const selectedIndex = selectedTextStart === void 0 ? normalized.indexOf(selectedText) : selectedTextStart;
    if (selectedIndex < 0) return normalized.slice(0, MAX_CONTEXT_LENGTH).trim();
    const contextBudgetAroundSelection = MAX_CONTEXT_LENGTH - selectedText.length;
    const idealStart = selectedIndex - Math.floor(contextBudgetAroundSelection / 2);
    const maxStart = normalized.length - MAX_CONTEXT_LENGTH;
    const start = Math.min(Math.max(idealStart, 0), maxStart);
    return normalized.slice(start, start + MAX_CONTEXT_LENGTH).trim();
  }
  function isIgnoredElement(element) {
    return element.matches(IGNORED_SELECTOR);
  }
  function hasIgnoredAncestor(node) {
    let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (current && current !== document.documentElement) {
      if (isIgnoredElement(current)) return true;
      current = current.parentElement;
    }
    return false;
  }
  function getSourceUrl() {
    return window.location.href;
  }
  function rangeIntersectsIgnoredElement(range) {
    if (hasIgnoredAncestor(range.startContainer) || hasIgnoredAncestor(range.endContainer)) {
      return true;
    }
    const commonElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!commonElement) return false;
    const ignoredElements = [
      ...isIgnoredElement(commonElement) ? [commonElement] : [],
      ...Array.from(commonElement.querySelectorAll(IGNORED_SELECTOR))
    ];
    return ignoredElements.some((element) => range.intersectsNode(element));
  }
  function collectTextSkippingIgnored(node, parts) {
    if (node.nodeType === Node.ELEMENT_NODE && isIgnoredElement(node)) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    Array.from(node.childNodes).forEach((child) => {
      collectTextSkippingIgnored(child, parts);
    });
  }
  function getTextContentSkippingIgnored(node) {
    const parts = [];
    collectTextSkippingIgnored(node, parts);
    return parts.join("");
  }
  function getTextBeforeRangeStartSkippingIgnored(range, contextElement) {
    const parts = [];
    let foundStart = false;
    const visit = (node) => {
      if (foundStart) return;
      if (node.nodeType === Node.ELEMENT_NODE && isIgnoredElement(node)) {
        return;
      }
      if (node === range.startContainer) {
        if (node.nodeType === Node.TEXT_NODE) {
          parts.push((node.textContent ?? "").slice(0, range.startOffset));
        } else {
          Array.from(node.childNodes).slice(0, range.startOffset).forEach((child) => {
            collectTextSkippingIgnored(child, parts);
          });
        }
        foundStart = true;
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent ?? "");
        return;
      }
      Array.from(node.childNodes).forEach(visit);
    };
    visit(contextElement);
    return parts.join("");
  }
  function getSelectedTextStartAfterNormalization(textBeforeSelection, selectionText, selectedText) {
    const normalizedThroughSelection = normalizeText(
      `${textBeforeSelection}${selectionText}`
    );
    return Math.max(normalizedThroughSelection.length - selectedText.length, 0);
  }
  function getSelectedTextStartInContext(range, contextElement, selectedText) {
    const textBeforeSelection = getTextBeforeRangeStartSkippingIgnored(
      range,
      contextElement
    );
    return getSelectedTextStartAfterNormalization(
      textBeforeSelection,
      range.toString(),
      selectedText
    );
  }
  function getSelectedTextStartInFallback(range, selectedText) {
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const textBeforeSelection = (range.startContainer.textContent ?? "").slice(
        0,
        range.startOffset
      );
      return getSelectedTextStartAfterNormalization(
        textBeforeSelection,
        range.toString(),
        selectedText
      );
    }
    if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
      const parts = [];
      Array.from(range.startContainer.childNodes).slice(0, range.startOffset).forEach((child) => {
        collectTextSkippingIgnored(child, parts);
      });
      return getSelectedTextStartAfterNormalization(
        parts.join(""),
        range.toString(),
        selectedText
      );
    }
    return void 0;
  }
  function findContextElement(range, selectedText) {
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    if (!startElement) return null;
    let current = startElement;
    while (current && current !== document.documentElement) {
      if (!isIgnoredElement(current) && current.matches(CONTAINER_SELECTOR)) {
        const text = normalizeText(getTextContentSkippingIgnored(current));
        if (text.includes(selectedText) && text.length >= selectedText.length) return current;
      }
      current = current.parentElement;
    }
    return null;
  }
  function extractSelectionContextFromRange(range) {
    const selectedText = normalizeText(range.toString());
    if (!selectedText) return null;
    if (selectedText.length > 120) return null;
    if (rangeIntersectsIgnoredElement(range)) return null;
    const contextElement = findContextElement(range, selectedText);
    const paragraphContext = contextElement ? capContext(
      getTextContentSkippingIgnored(contextElement) || selectedText,
      selectedText,
      getSelectedTextStartInContext(range, contextElement, selectedText)
    ) : capContext(
      getTextContentSkippingIgnored(range.startContainer) || selectedText,
      selectedText,
      getSelectedTextStartInFallback(range, selectedText)
    );
    return {
      selectedText,
      paragraphContext,
      sourceUrl: getSourceUrl(),
      pageTitle: document.title
    };
  }
  function extractSelectionContext(selection = window.getSelection()) {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    return extractSelectionContextFromRange(selection.getRangeAt(0));
  }

  // src/content/tooltip.ts
  var TOOLTIP_ATTR = "data-openen-tooltip";
  var TOOLTIP_WIDTH = 320;
  var TOOLTIP_HEIGHT = 156;
  var VIEWPORT_MARGIN = 8;
  var ANCHOR_GAP = 8;
  function removeExisting() {
    document.querySelectorAll(`[${TOOLTIP_ATTR}]`).forEach((node) => node.remove());
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function getViewportHeight() {
    return window.innerHeight || document.documentElement.clientHeight;
  }
  function getMaxTooltipHeight(viewportHeight) {
    return Math.max(0, viewportHeight - VIEWPORT_MARGIN * 2);
  }
  function positionHost(host, anchorRect, tooltipHeight = TOOLTIP_HEIGHT) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = getViewportHeight();
    const width = Math.min(TOOLTIP_WIDTH, Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2));
    const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
    const left = clamp(anchorRect.left, VIEWPORT_MARGIN, maxLeft);
    const maxHeight = getMaxTooltipHeight(viewportHeight);
    const height = Math.min(Math.max(tooltipHeight, TOOLTIP_HEIGHT), maxHeight);
    const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
    const bottomTop = anchorRect.bottom + ANCHOR_GAP;
    const preferredTop = bottomTop + height > viewportHeight - VIEWPORT_MARGIN ? anchorRect.top - height - ANCHOR_GAP : bottomTop;
    const top = clamp(preferredTop, VIEWPORT_MARGIN, maxTop);
    host.style.setProperty("position", "absolute", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("top", `${window.scrollY + top}px`, "important");
    host.style.setProperty("left", `${window.scrollX + left}px`, "important");
    host.style.setProperty("width", `${width}px`, "important");
    host.style.setProperty("max-width", `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`, "important");
    host.style.setProperty("max-height", `${maxHeight}px`, "important");
  }
  function button(label, attr) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.setAttribute(attr, "");
    element.className = "openen-button";
    element.style.display = "inline-flex";
    element.style.fontSize = "13px";
    return element;
  }
  function removeTranslationTooltip() {
    removeExisting();
  }
  function createTranslationTooltip(options) {
    removeExisting();
    const host = document.createElement("div");
    host.setAttribute(TOOLTIP_ATTR, "");
    positionHost(host, options.anchorRect);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
    :host {
      all: initial;
      box-sizing: border-box;
      contain: layout style paint;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    [data-openen-tooltip-panel] {
      width: 100%;
      max-width: 100%;
      padding: 10px;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
      background: #fff;
      color: #1f2328;
      font: 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .openen-title {
      font-weight: 700;
    }

    .openen-translation {
      margin-top: 6px;
    }

    .openen-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    .openen-button {
      align-items: center;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      background: #fff;
      color: #1f2328;
      font: 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 4px 8px;
      cursor: pointer;
    }
  `;
    const panel = document.createElement("div");
    const maxTooltipHeight = getMaxTooltipHeight(getViewportHeight());
    panel.setAttribute("data-openen-tooltip-panel", "");
    panel.style.boxSizing = "border-box";
    panel.style.maxHeight = `${maxTooltipHeight}px`;
    panel.style.overflowY = "auto";
    panel.style.overflowWrap = "anywhere";
    panel.style.width = "100%";
    const actions = document.createElement("div");
    actions.className = "openen-actions";
    const close = button("\u5173\u95ED", "data-openen-close");
    close.addEventListener("click", () => {
      removeExisting();
      options.onClose();
    });
    if (options.mode === "action") {
      const title = document.createElement("strong");
      title.className = "openen-title";
      title.textContent = options.selectedText;
      const translate = button("\u7FFB\u8BD1", "data-openen-translate");
      translate.addEventListener("click", options.onTranslate);
      panel.append(title);
      actions.append(translate, close);
    } else if (options.mode === "loading") {
      const title = document.createElement("strong");
      title.className = "openen-title";
      title.textContent = options.selectedText;
      const loading = button("\u7FFB\u8BD1\u4E2D...", "data-openen-translate");
      loading.disabled = true;
      panel.append(title);
      actions.append(loading, close);
    } else if (options.mode === "error") {
      const title = document.createElement("strong");
      title.className = "openen-title";
      title.textContent = options.selectedText;
      const message = document.createElement("div");
      message.className = "openen-translation";
      message.textContent = "\u7FFB\u8BD1\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
      const retry = button("\u91CD\u8BD5", "data-openen-retry");
      retry.addEventListener("click", options.onRetry);
      panel.append(title, message);
      actions.append(retry, close);
    } else {
      const translation = document.createElement("div");
      translation.className = "openen-translation";
      translation.textContent = options.result.translation;
      const save = button(options.saved ? "\u5DF2\u52A0\u5165" : "\u52A0\u5165\u751F\u8BCD\u672C", "data-openen-save");
      save.disabled = options.saved === true;
      if (!options.saved) save.addEventListener("click", options.onSave);
      if (options.onRefresh) {
        const refresh = button("\u91CD\u65B0\u7FFB\u8BD1", "data-openen-refresh");
        refresh.addEventListener("click", options.onRefresh);
        actions.append(refresh);
      }
      panel.append(translation);
      actions.append(save, close);
    }
    panel.append(actions);
    shadow.append(style, panel);
    document.body.append(host);
    positionHost(host, options.anchorRect, panel.getBoundingClientRect().height || maxTooltipHeight);
    return host;
  }

  // src/content/vocabularyHighlighter.ts
  var HIGHLIGHT_ATTRIBUTE = "data-openen-vocabulary-highlight";
  var HIGHLIGHT_SELECTOR = `[${HIGHLIGHT_ATTRIBUTE}]`;
  var HIGHLIGHT_STYLE_ID = "openen-vocabulary-highlight-style";
  var IGNORED_SELECTOR2 = [
    "script",
    "style",
    "noscript",
    "textarea",
    "input",
    "select",
    "option",
    "code",
    "pre",
    "[contenteditable='true']",
    "[contenteditable='']",
    "[data-openen-tooltip]",
    HIGHLIGHT_SELECTOR
  ].join(",");
  var SCAN_DEBOUNCE_MS = 80;
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function isHighlightSettings(value) {
    return isRecord(value) && typeof value.enabled === "boolean";
  }
  function isVocabularyEntry(value) {
    return isRecord(value) && typeof value.selectedText === "string" && (value.baseForm === void 0 || typeof value.baseForm === "string");
  }
  function isVocabularyHighlightSettingsMessage(value) {
    return isRecord(value) && value.type === "SAVE_VOCABULARY_HIGHLIGHT_SETTINGS" /* SaveVocabularyHighlightSettings */ && isRecord(value.payload) && typeof value.payload.enabled === "boolean";
  }
  function getRuntimeMessageBus() {
    if (!hasWebExtensionApi()) return void 0;
    return getWebExtensionApi().runtime.onMessage;
  }
  function normalizeTerm(term) {
    const normalized = term.trim().toLowerCase();
    return /^[a-z][a-z'-]+$/.test(normalized) ? normalized : void 0;
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function getHighlightRegex(terms) {
    if (terms.length === 0) return void 0;
    const escapedTerms = [...terms].sort((a, b) => b.length - a.length).map(escapeRegExp);
    return new RegExp(`\\b(${escapedTerms.join("|")})\\b`, "gi");
  }
  function hasIgnoredAncestor2(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest(IGNORED_SELECTOR2));
  }
  function textNodesUnder(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      return hasIgnoredAncestor2(root) ? [] : [root];
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent?.trim() || hasIgnoredAncestor2(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    return nodes;
  }
  function ensureHighlightStyle() {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `
    ${HIGHLIGHT_SELECTOR} {
      background: rgba(255, 214, 87, 0.42);
      border-bottom: 1px solid #9a6700;
      border-radius: 2px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
  `;
    document.documentElement.append(style);
  }
  function highlightTextNode(node, regex) {
    const text = node.textContent ?? "";
    regex.lastIndex = 0;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const matchText = match[0];
      const index = match.index ?? 0;
      if (index > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, index)));
      }
      const highlight = document.createElement("span");
      highlight.setAttribute(HIGHLIGHT_ATTRIBUTE, "true");
      highlight.textContent = matchText;
      fragment.append(highlight);
      lastIndex = index + matchText.length;
    }
    if (lastIndex < text.length) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
    }
    node.replaceWith(fragment);
  }
  function getVocabularyHighlightTerms(entries) {
    const terms = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      const baseForm = entry.baseForm ? normalizeTerm(entry.baseForm) : void 0;
      const selectedText = normalizeTerm(entry.selectedText);
      if (baseForm) terms.add(baseForm);
      if (selectedText) terms.add(selectedText);
    }
    return [...terms];
  }
  function applyVocabularyHighlights(root, terms) {
    const regex = getHighlightRegex(terms);
    if (!regex) return;
    ensureHighlightStyle();
    for (const node of textNodesUnder(root)) {
      highlightTextNode(node, regex);
    }
  }
  function clearVocabularyHighlights(root = document) {
    const highlights = Array.from(root.querySelectorAll(HIGHLIGHT_SELECTOR));
    for (const highlight of highlights) {
      highlight.replaceWith(document.createTextNode(highlight.textContent ?? ""));
    }
    if (root instanceof Node) root.normalize();
  }
  async function loadHighlightTerms(sendMessage) {
    const settingsResponse = await sendMessage({ type: "GET_VOCABULARY_HIGHLIGHT_SETTINGS" /* GetVocabularyHighlightSettings */ });
    if (!settingsResponse?.ok || !isHighlightSettings(settingsResponse.data)) return void 0;
    if (!settingsResponse.data.enabled) return [];
    const listResponse = await sendMessage({ type: "LIST_VOCABULARY" /* ListVocabulary */ });
    if (!listResponse?.ok || !Array.isArray(listResponse.data)) return void 0;
    return getVocabularyHighlightTerms(listResponse.data.filter(isVocabularyEntry));
  }
  function startVocabularyHighlighter(sendMessage, root = document.body) {
    let disposed = false;
    let terms = [];
    let scanTimer;
    const observer = new MutationObserver((mutations) => {
      if (disposed || terms.length === 0) return;
      if (!mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => !hasIgnoredAncestor2(node)))) return;
      if (scanTimer !== void 0) window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(() => {
        scanTimer = void 0;
        if (!disposed) applyVocabularyHighlights(root, terms);
      }, SCAN_DEBOUNCE_MS);
    });
    const refresh = async () => {
      let loadedTerms;
      try {
        loadedTerms = await loadHighlightTerms(sendMessage);
      } catch {
        return;
      }
      if (disposed || loadedTerms === void 0) return;
      clearVocabularyHighlights(root);
      terms = loadedTerms;
      if (terms.length > 0) {
        applyVocabularyHighlights(root, terms);
        observer.observe(root, { childList: true, subtree: true });
      } else {
        observer.disconnect();
      }
    };
    const runtimeMessageBus = getRuntimeMessageBus();
    const onRuntimeMessage = (message) => {
      if (isVocabularyHighlightSettingsMessage(message)) void refresh();
    };
    runtimeMessageBus?.addListener(onRuntimeMessage);
    void refresh();
    return () => {
      disposed = true;
      observer.disconnect();
      runtimeMessageBus?.removeListener?.(onRuntimeMessage);
      if (scanTimer !== void 0) window.clearTimeout(scanTimer);
      clearVocabularyHighlights(root);
    };
  }

  // src/content/contentScript.ts
  var TRANSLATION_CACHE_MAX_AGE_MS = 5 * 60 * 1e3;
  var VOCABULARY_HIGHLIGHT_SELECTOR = "[data-openen-vocabulary-highlight]";
  var translationCaches = /* @__PURE__ */ new WeakMap();
  function hasStringField(record, field) {
    return typeof record[field] === "string";
  }
  function isTranslationResult(value) {
    if (typeof value !== "object" || value === null) return false;
    const record = value;
    return hasStringField(record, "selectedText") && hasStringField(record, "translation") && hasStringField(record, "contextualMeaning") && hasStringField(record, "provider");
  }
  function isTranslationProviderName(value) {
    return value === "fake" || value === "deepseek" || value === "openai" || value === "external";
  }
  function isVocabularyEntry2(value) {
    if (typeof value !== "object" || value === null) return false;
    const record = value;
    return hasStringField(record, "id") && hasStringField(record, "selectedText") && (record.baseForm === void 0 || hasStringField(record, "baseForm")) && hasStringField(record, "translation") && hasStringField(record, "contextualMeaning") && hasStringField(record, "provider");
  }
  function getTranslationCache(sendMessage) {
    let cache = translationCaches.get(sendMessage);
    if (!cache) {
      cache = /* @__PURE__ */ new Map();
      translationCaches.set(sendMessage, cache);
    }
    return cache;
  }
  function getCacheKey(payload) {
    return [payload.sourceUrl, payload.selectedText.trim().toLowerCase(), payload.paragraphContext].join("\0");
  }
  function getCachedTranslation(payload, sendMessage) {
    const cache = getTranslationCache(sendMessage);
    const key = getCacheKey(payload);
    const cached = cache.get(key);
    if (!cached) return void 0;
    if (Date.now() - cached.cachedAt > TRANSLATION_CACHE_MAX_AGE_MS) {
      cache.delete(key);
      return void 0;
    }
    return cached.result;
  }
  function cacheTranslation(payload, result, sendMessage) {
    getTranslationCache(sendMessage).set(getCacheKey(payload), { result, cachedAt: Date.now() });
  }
  function savedLookupText(payload, result) {
    return (result.baseForm || payload.selectedText).trim().toLowerCase();
  }
  function selectedLookupText(payload) {
    return payload.selectedText.trim().toLowerCase();
  }
  function isMatchingVocabularyWord(entry, payload) {
    const lookup = selectedLookupText(payload);
    return entry.baseForm?.trim().toLowerCase() === lookup || entry.selectedText.trim().toLowerCase() === lookup;
  }
  function vocabularyEntryToTranslationResult(entry, selectedText) {
    const result = {
      selectedText,
      translation: entry.translation,
      contextualMeaning: entry.contextualMeaning,
      provider: isTranslationProviderName(entry.provider) ? entry.provider : "external"
    };
    if (entry.baseForm !== void 0) result.baseForm = entry.baseForm;
    if (entry.partOfSpeech !== void 0) result.partOfSpeech = entry.partOfSpeech;
    if (entry.example !== void 0) result.example = entry.example;
    return result;
  }
  async function findSavedVocabularyEntry(payload, sendMessage) {
    let response;
    try {
      response = await sendMessage({ type: "SEARCH_VOCABULARY" /* SearchVocabulary */, payload: { query: selectedLookupText(payload) } });
    } catch {
      return void 0;
    }
    if (!response?.ok || !Array.isArray(response.data)) return void 0;
    return response.data.filter(isVocabularyEntry2).find((entry) => isMatchingVocabularyWord(entry, payload));
  }
  function isMatchingSavedEntry(value, payload, result) {
    if (typeof value !== "object" || value === null) return false;
    const record = value;
    const lookup = savedLookupText(payload, result);
    const entryBaseForm = typeof record.baseForm === "string" ? record.baseForm.trim().toLowerCase() : "";
    const entrySelectedText = typeof record.selectedText === "string" ? record.selectedText.trim().toLowerCase() : "";
    return typeof record.sourceUrl === "string" && (entryBaseForm === lookup || entrySelectedText === lookup) && record.sourceUrl === payload.sourceUrl;
  }
  async function isVocabularySaved(payload, result, sendMessage) {
    let response;
    try {
      response = await sendMessage({ type: "SEARCH_VOCABULARY" /* SearchVocabulary */, payload: { query: savedLookupText(payload, result) } });
    } catch {
      return false;
    }
    return response?.ok === true && Array.isArray(response.data) && response.data.some((entry) => isMatchingSavedEntry(entry, payload, result));
  }
  async function saveVocabulary(payload, result, sendMessage) {
    try {
      const response = await sendMessage({
        type: "ADD_VOCABULARY" /* AddVocabulary */,
        payload: {
          entry: {
            ...result,
            paragraphContext: payload.paragraphContext,
            sourceUrl: payload.sourceUrl,
            pageTitle: payload.pageTitle
          }
        }
      });
      return response?.ok === true;
    } catch {
      return false;
    }
  }
  async function handleSelectionPayload(payload, anchorRect, sendMessage, options = {}) {
    if (options.isCurrent && !options.isCurrent()) return;
    if (options.preferSavedVocabulary) {
      const savedEntry = await findSavedVocabularyEntry(payload, sendMessage);
      if (options.isCurrent && !options.isCurrent()) return;
      if (savedEntry) {
        renderResultTooltip(
          payload,
          anchorRect,
          vocabularyEntryToTranslationResult(savedEntry, payload.selectedText),
          sendMessage,
          options,
          true,
          true
        );
        return;
      }
    }
    createTranslationTooltip({
      mode: "action",
      selectedText: payload.selectedText,
      anchorRect,
      onClose: removeTranslationTooltip,
      onTranslate: () => {
        void translateSelection(payload, anchorRect, sendMessage, options);
      }
    });
  }
  async function translateSelection(payload, anchorRect, sendMessage, options, behavior = {}) {
    if (options.isCurrent && !options.isCurrent()) return;
    const cachedResult = behavior.bypassCache ? void 0 : getCachedTranslation(payload, sendMessage);
    if (cachedResult) {
      renderResultTooltip(payload, anchorRect, cachedResult, sendMessage, options);
      return;
    }
    createTranslationTooltip({
      mode: "loading",
      selectedText: payload.selectedText,
      anchorRect,
      onClose: removeTranslationTooltip
    });
    let response;
    try {
      response = await sendMessage({ type: "TRANSLATE_SELECTION" /* TranslateSelection */, payload });
    } catch {
      renderRetryTooltip(payload, anchorRect, sendMessage, options, behavior);
      return;
    }
    if (!response?.ok || !isTranslationResult(response.data)) {
      renderRetryTooltip(payload, anchorRect, sendMessage, options, behavior);
      return;
    }
    if (options.isCurrent && !options.isCurrent()) return;
    const result = response.data;
    if (!behavior.bypassCache) cacheTranslation(payload, result, sendMessage);
    renderResultTooltip(payload, anchorRect, result, sendMessage, options, behavior.renderAsSaved === true, behavior.renderAsSaved === true);
  }
  function renderRetryTooltip(payload, anchorRect, sendMessage, options, behavior = {}) {
    if (options.isCurrent && !options.isCurrent()) return;
    createTranslationTooltip({
      mode: "error",
      selectedText: payload.selectedText,
      anchorRect,
      onClose: removeTranslationTooltip,
      onRetry: () => {
        void translateSelection(payload, anchorRect, sendMessage, options, behavior);
      }
    });
  }
  function renderResultTooltip(payload, anchorRect, result, sendMessage, options, saved = false, allowRefresh = false) {
    if (options.isCurrent && !options.isCurrent()) return;
    createTranslationTooltip({
      mode: "result",
      result,
      saved,
      anchorRect,
      onClose: removeTranslationTooltip,
      ...allowRefresh ? {
        onRefresh: () => {
          void translateSelection(payload, anchorRect, sendMessage, options, {
            bypassCache: true,
            renderAsSaved: true
          });
        }
      } : {},
      onSave: () => {
        void (async () => {
          if (options.isCurrent && !options.isCurrent()) return;
          const didSave = await saveVocabulary(payload, result, sendMessage);
          if (didSave && (!options.isCurrent || options.isCurrent())) {
            renderResultTooltip(payload, anchorRect, result, sendMessage, options, true);
          }
        })();
      }
    });
    if (!saved) {
      void (async () => {
        const isSaved = await isVocabularySaved(payload, result, sendMessage);
        if (isSaved && (!options.isCurrent || options.isCurrent())) {
          renderResultTooltip(payload, anchorRect, result, sendMessage, options, true);
        }
      })();
    }
  }
  function getAnchorRect(selection) {
    if (selection.rangeCount === 0) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return rect.width === 0 && rect.height === 0 ? null : rect;
  }
  function runtimeSendMessage(message) {
    return getWebExtensionApi().runtime.sendMessage(message);
  }
  function isCurrentSelection(payload) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return false;
    const currentPayload = extractSelectionContext(selection);
    return currentPayload?.selectedText === payload.selectedText && currentPayload.paragraphContext === payload.paragraphContext && currentPayload.sourceUrl === payload.sourceUrl && currentPayload.pageTitle === payload.pageTitle;
  }
  function hasVocabularyHighlightAncestor(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest(VOCABULARY_HIGHLIGHT_SELECTOR));
  }
  function rangeIntersectsVocabularyHighlight(range) {
    if (hasVocabularyHighlightAncestor(range.startContainer) || hasVocabularyHighlightAncestor(range.endContainer)) {
      return true;
    }
    const commonElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!commonElement) return false;
    return Array.from(commonElement.querySelectorAll(VOCABULARY_HIGHLIGHT_SELECTOR)).some(
      (element) => range.intersectsNode(element)
    );
  }
  function isVocabularyHighlightSelection(selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      if (rangeIntersectsVocabularyHighlight(selection.getRangeAt(index))) return true;
    }
    return false;
  }
  function startContentScript(sendMessage = runtimeSendMessage, options = {}) {
    let disposed = false;
    let generation = 0;
    let debounceTimer;
    const stopVocabularyHighlighter = options.enableVocabularyHighlighting === false ? void 0 : startVocabularyHighlighter(sendMessage);
    const clearDebounce = () => {
      if (debounceTimer !== void 0) {
        window.clearTimeout(debounceTimer);
        debounceTimer = void 0;
      }
    };
    const invalidate = () => {
      generation += 1;
      clearDebounce();
    };
    const dismiss = () => {
      invalidate();
      removeTranslationTooltip();
    };
    const onSelectionChange = () => {
      invalidate();
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        removeTranslationTooltip();
        return;
      }
      const requestGeneration = generation;
      debounceTimer = window.setTimeout(() => {
        debounceTimer = void 0;
        if (disposed || requestGeneration !== generation) return;
        const currentSelection = window.getSelection();
        if (!currentSelection || currentSelection.isCollapsed) {
          removeTranslationTooltip();
          return;
        }
        const payload = extractSelectionContext(currentSelection);
        const anchorRect = getAnchorRect(currentSelection);
        if (!payload || !anchorRect) return;
        void handleSelectionPayload(payload, anchorRect, sendMessage, {
          isCurrent: () => !disposed && requestGeneration === generation && isCurrentSelection(payload),
          preferSavedVocabulary: isVocabularyHighlightSelection(currentSelection)
        });
      }, 120);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      disposed = true;
      invalidate();
      removeTranslationTooltip();
      stopVocabularyHighlighter?.();
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", dismiss, true);
    };
  }
  function canAutoStart() {
    return typeof document !== "undefined" && hasWebExtensionApi();
  }
  if (canAutoStart()) {
    startContentScript();
  }
})();
//# sourceMappingURL=contentScript.js.map
