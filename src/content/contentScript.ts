import { MessageType } from "../shared/messages";
import type { SelectionPayload, TranslationResult } from "../shared/types";
import { extractSelectionContext } from "./selectionContext";
import { createTranslationTooltip, removeTranslationTooltip } from "./tooltip";

type MessageResponse = { ok: boolean; data?: unknown; error?: string };
type SendMessage = (message: unknown) => Promise<MessageResponse | undefined>;

interface HandleSelectionOptions {
  isCurrent?(): boolean;
}

function hasStringField(record: Record<string, unknown>, field: string): boolean {
  return typeof record[field] === "string";
}

function isTranslationResult(value: unknown): value is TranslationResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    hasStringField(record, "selectedText") &&
    hasStringField(record, "translation") &&
    hasStringField(record, "contextualMeaning") &&
    hasStringField(record, "provider")
  );
}

function saveVocabulary(
  payload: SelectionPayload,
  result: TranslationResult,
  sendMessage: SendMessage
): void {
  void sendMessage({
    type: MessageType.AddVocabulary,
    payload: {
      entry: {
        ...result,
        paragraphContext: payload.paragraphContext,
        sourceUrl: payload.sourceUrl,
        pageTitle: payload.pageTitle
      }
    }
  }).catch(() => undefined);
}

export async function handleSelectionPayload(
  payload: SelectionPayload,
  anchorRect: DOMRect,
  sendMessage: SendMessage,
  options: HandleSelectionOptions = {}
): Promise<void> {
  let response: MessageResponse | undefined;
  try {
    response = await sendMessage({ type: MessageType.TranslateSelection, payload });
  } catch {
    return;
  }

  if (!response?.ok || !isTranslationResult(response.data)) return;
  if (options.isCurrent && !options.isCurrent()) return;

  const result = response.data;
  createTranslationTooltip({
    result,
    anchorRect,
    onClose: removeTranslationTooltip,
    onSave: () => {
      saveVocabulary(payload, result, sendMessage);
    }
  });
}

function getAnchorRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

function runtimeSendMessage(message: unknown): Promise<MessageResponse | undefined> {
  return chrome.runtime.sendMessage(message);
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

export function startContentScript(sendMessage: SendMessage = runtimeSendMessage): () => void {
  let disposed = false;
  let generation = 0;
  let debounceTimer: number | undefined;

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

  const onSelectionChange = (): void => {
    invalidate();
    const requestGeneration = generation;

    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      if (disposed || requestGeneration !== generation) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        removeTranslationTooltip();
        return;
      }

      const payload = extractSelectionContext(selection);
      const anchorRect = getAnchorRect(selection);
      if (!payload || !anchorRect) return;

      void handleSelectionPayload(payload, anchorRect, sendMessage, {
        isCurrent: () =>
          !disposed && requestGeneration === generation && isCurrentSelection(payload)
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
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("scroll", dismiss, true);
  };
}

function canAutoStart(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.sendMessage === "function"
  );
}

if (canAutoStart()) {
  startContentScript();
}
