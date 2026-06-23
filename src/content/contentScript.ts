import { isSaveTranslationBubbleSettingsMessage, isTranslationBubbleSettingsView, MessageType } from "../shared/messages";
import type {
  SelectionPayload,
  TranslationProviderName,
  TranslationResult,
  VocabularyEntry
} from "../shared/types";
import { getWebExtensionApi, hasWebExtensionApi } from "../shared/webExtensionApi";
import { extractSelectionContext } from "./selectionContext";
import { createTranslationTooltip, removeTranslationTooltip } from "./tooltip";
import { startVocabularyHighlighter } from "./vocabularyHighlighter";

type MessageResponse = { ok: boolean; data?: unknown; error?: string };
type SendMessage = (message: unknown) => Promise<MessageResponse | undefined>;
type CachedTranslation = { result: TranslationResult; cachedAt: number };

const TRANSLATION_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const VOCABULARY_HIGHLIGHT_SELECTOR = "[data-openen-vocabulary-highlight]";
const translationCaches = new WeakMap<SendMessage, Map<string, CachedTranslation>>();

interface HandleSelectionOptions {
  isCurrent?(): boolean;
  preferSavedVocabulary?: boolean;
}

interface StartContentScriptOptions {
  enableVocabularyHighlighting?: boolean;
  enableTranslationBubble?: boolean;
  loadTranslationBubbleSettings?: boolean;
}

interface TranslateSelectionBehavior {
  bypassCache?: boolean;
  renderAsSaved?: boolean;
}

function hasStringField(record: Record<string, unknown>, field: string): boolean {
  return typeof record[field] === "string";
}

function isTranslationResult(value: unknown): value is TranslationResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    hasStringField(record, "selectedText") &&
    (record.baseForm === undefined || hasStringField(record, "baseForm")) &&
    hasStringField(record, "translation") &&
    (record.partOfSpeech === undefined || hasStringField(record, "partOfSpeech")) &&
    hasStringField(record, "contextualMeaning") &&
    (record.example === undefined || hasStringField(record, "example")) &&
    (record.phrase === undefined || hasStringField(record, "phrase")) &&
    hasStringField(record, "provider")
  );
}

function isTranslationProviderName(value: unknown): value is TranslationProviderName {
  return value === "fake" || value === "deepseek" || value === "openai" || value === "external";
}

function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    hasStringField(record, "id") &&
    hasStringField(record, "selectedText") &&
    (record.baseForm === undefined || hasStringField(record, "baseForm")) &&
    hasStringField(record, "translation") &&
    hasStringField(record, "contextualMeaning") &&
    (record.phrase === undefined || hasStringField(record, "phrase")) &&
    hasStringField(record, "provider")
  );
}

function getTranslationCache(sendMessage: SendMessage): Map<string, CachedTranslation> {
  let cache = translationCaches.get(sendMessage);
  if (!cache) {
    cache = new Map();
    translationCaches.set(sendMessage, cache);
  }
  return cache;
}

function getCacheKey(payload: SelectionPayload): string {
  return [payload.sourceUrl, payload.selectedText.trim().toLowerCase(), payload.paragraphContext].join("\u0000");
}

function getCachedTranslation(payload: SelectionPayload, sendMessage: SendMessage): TranslationResult | undefined {
  const cache = getTranslationCache(sendMessage);
  const key = getCacheKey(payload);
  const cached = cache.get(key);
  if (!cached) return undefined;
  if (Date.now() - cached.cachedAt > TRANSLATION_CACHE_MAX_AGE_MS) {
    cache.delete(key);
    return undefined;
  }
  return cached.result;
}

function cacheTranslation(payload: SelectionPayload, result: TranslationResult, sendMessage: SendMessage): void {
  getTranslationCache(sendMessage).set(getCacheKey(payload), { result, cachedAt: Date.now() });
}

function savedLookupText(payload: SelectionPayload, result: TranslationResult): string {
  return (result.baseForm || payload.selectedText).trim().toLowerCase();
}

function selectedLookupText(payload: SelectionPayload): string {
  return payload.selectedText.trim().toLowerCase();
}

function isMatchingVocabularyWord(entry: VocabularyEntry, payload: SelectionPayload): boolean {
  const lookup = selectedLookupText(payload);
  return entry.baseForm?.trim().toLowerCase() === lookup || entry.selectedText.trim().toLowerCase() === lookup;
}

function vocabularyEntryToTranslationResult(entry: VocabularyEntry, selectedText: string): TranslationResult {
  const result: TranslationResult = {
    selectedText,
    translation: entry.translation,
    contextualMeaning: entry.contextualMeaning,
    provider: isTranslationProviderName(entry.provider) ? entry.provider : "external"
  };

  if (entry.baseForm !== undefined) result.baseForm = entry.baseForm;
  if (entry.partOfSpeech !== undefined) result.partOfSpeech = entry.partOfSpeech;
  if (entry.example !== undefined) result.example = entry.example;
  if (entry.phrase !== undefined) result.phrase = entry.phrase;
  return result;
}

async function findSavedVocabularyEntry(
  payload: SelectionPayload,
  sendMessage: SendMessage
): Promise<VocabularyEntry | undefined> {
  let response: MessageResponse | undefined;
  try {
    response = await sendMessage({ type: MessageType.SearchVocabulary, payload: { query: selectedLookupText(payload) } });
  } catch {
    return undefined;
  }

  if (!response?.ok || !Array.isArray(response.data)) return undefined;
  return response.data.filter(isVocabularyEntry).find((entry) => isMatchingVocabularyWord(entry, payload));
}

function isMatchingSavedEntry(value: unknown, payload: SelectionPayload, result: TranslationResult): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const lookup = savedLookupText(payload, result);
  const entryBaseForm = typeof record.baseForm === "string" ? record.baseForm.trim().toLowerCase() : "";
  const entrySelectedText = typeof record.selectedText === "string" ? record.selectedText.trim().toLowerCase() : "";
  return (
    typeof record.sourceUrl === "string" &&
    (entryBaseForm === lookup || entrySelectedText === lookup) &&
    record.sourceUrl === payload.sourceUrl
  );
}

async function isVocabularySaved(payload: SelectionPayload, result: TranslationResult, sendMessage: SendMessage): Promise<boolean> {
  let response: MessageResponse | undefined;
  try {
    response = await sendMessage({ type: MessageType.SearchVocabulary, payload: { query: savedLookupText(payload, result) } });
  } catch {
    return false;
  }

  return response?.ok === true && Array.isArray(response.data) && response.data.some((entry) => isMatchingSavedEntry(entry, payload, result));
}

async function saveVocabulary(
  payload: SelectionPayload,
  result: TranslationResult,
  sendMessage: SendMessage
): Promise<boolean> {
  try {
    const response = await sendMessage({
      type: MessageType.AddVocabulary,
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

export async function handleSelectionPayload(
  payload: SelectionPayload,
  anchorRect: DOMRect,
  sendMessage: SendMessage,
  options: HandleSelectionOptions = {}
): Promise<void> {
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

async function translateSelection(
  payload: SelectionPayload,
  anchorRect: DOMRect,
  sendMessage: SendMessage,
  options: HandleSelectionOptions,
  behavior: TranslateSelectionBehavior = {}
): Promise<void> {
  if (options.isCurrent && !options.isCurrent()) return;

  const cachedResult = behavior.bypassCache ? undefined : getCachedTranslation(payload, sendMessage);
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

  let response: MessageResponse | undefined;
  try {
    response = await sendMessage({ type: MessageType.TranslateSelection, payload });
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

function renderRetryTooltip(
  payload: SelectionPayload,
  anchorRect: DOMRect,
  sendMessage: SendMessage,
  options: HandleSelectionOptions,
  behavior: TranslateSelectionBehavior = {}
): void {
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

function renderResultTooltip(
  payload: SelectionPayload,
  anchorRect: DOMRect,
  result: TranslationResult,
  sendMessage: SendMessage,
  options: HandleSelectionOptions,
  saved = false,
  allowRefresh = false
): void {
  if (options.isCurrent && !options.isCurrent()) return;

  createTranslationTooltip({
    mode: "result",
    result,
    saved,
    anchorRect,
    onClose: removeTranslationTooltip,
    ...(allowRefresh
      ? {
          onRefresh: () => {
            void translateSelection(payload, anchorRect, sendMessage, options, {
              bypassCache: true,
              renderAsSaved: true
            });
          }
        }
      : {}),
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

function getAnchorRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

function runtimeSendMessage(message: unknown): Promise<MessageResponse | undefined> {
  return getWebExtensionApi().runtime.sendMessage(message) as Promise<MessageResponse | undefined>;
}

function isCurrentSelection(payload: SelectionPayload): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;

  const currentPayload = extractSelectionContext(selection);
  return (
    currentPayload?.selectedText === payload.selectedText &&
    currentPayload.paragraphContext === payload.paragraphContext &&
    currentPayload.sourceUrl === payload.sourceUrl &&
    currentPayload.pageTitle === payload.pageTitle
  );
}

function hasVocabularyHighlightAncestor(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(element?.closest(VOCABULARY_HIGHLIGHT_SELECTOR));
}

function rangeIntersectsVocabularyHighlight(range: Range): boolean {
  if (hasVocabularyHighlightAncestor(range.startContainer) || hasVocabularyHighlightAncestor(range.endContainer)) {
    return true;
  }

  const commonElement =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  if (!commonElement) return false;

  return Array.from(commonElement.querySelectorAll(VOCABULARY_HIGHLIGHT_SELECTOR)).some((element) =>
    range.intersectsNode(element)
  );
}

function isVocabularyHighlightSelection(selection: Selection): boolean {
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (rangeIntersectsVocabularyHighlight(selection.getRangeAt(index))) return true;
  }
  return false;
}

export function startContentScript(
  sendMessage: SendMessage = runtimeSendMessage,
  options: StartContentScriptOptions = {}
): () => void {
  let disposed = false;
  let generation = 0;
  let debounceTimer: number | undefined;
  let translationBubbleEnabled = options.enableTranslationBubble !== false;
  const stopVocabularyHighlighter =
    options.enableVocabularyHighlighting === false ? undefined : startVocabularyHighlighter(sendMessage);

  const clearDebounce = (): void => {
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
  };

  const invalidate = (): void => {
    generation += 1;
    clearDebounce();
  };

  const dismiss = (): void => {
    invalidate();
    removeTranslationTooltip();
  };

  const setTranslationBubbleEnabled = (enabled: boolean): void => {
    translationBubbleEnabled = enabled;
    if (!enabled) dismiss();
  };

  if (options.loadTranslationBubbleSettings === true) {
    void sendMessage({ type: MessageType.GetTranslationBubbleSettings }).then((response) => {
      if (disposed) return;
      if (response?.ok === true && isTranslationBubbleSettingsView(response.data)) {
        setTranslationBubbleEnabled(response.data.enabled);
      }
    });
  }

  let removeRuntimeMessageListener: (() => void) | undefined;
  try {
    const runtime = getWebExtensionApi().runtime;
    if (runtime.onMessage) {
      const onRuntimeMessage = (message: unknown): void => {
        if (isSaveTranslationBubbleSettingsMessage(message)) {
          setTranslationBubbleEnabled(message.payload.enabled);
        }
      };
      runtime.onMessage.addListener(onRuntimeMessage);
      removeRuntimeMessageListener = () => {
        runtime.onMessage?.removeListener?.(onRuntimeMessage);
      };
    }
  } catch {
    // Content-script tests and non-extension previews may not expose runtime events.
  }

  const onSelectionChange = (): void => {
    invalidate();
    if (!translationBubbleEnabled) {
      removeTranslationTooltip();
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      removeTranslationTooltip();
      return;
    }

    const requestGeneration = generation;

    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
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
        isCurrent: () =>
          !disposed && requestGeneration === generation && isCurrentSelection(payload),
        preferSavedVocabulary: isVocabularyHighlightSelection(currentSelection)
      });
    }, 120);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
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
    removeRuntimeMessageListener?.();
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("scroll", dismiss, true);
  };
}

function canAutoStart(): boolean {
  return (
    typeof document !== "undefined" &&
    hasWebExtensionApi()
  );
}

if (canAutoStart()) {
  startContentScript(runtimeSendMessage, { loadTranslationBubbleSettings: true });
}
