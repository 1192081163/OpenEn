import { MessageType } from "../shared/messages";
import type { SelectionPayload, TranslationResult } from "../shared/types";
import { extractSelectionContext } from "./selectionContext";
import { createTranslationTooltip, removeTranslationTooltip } from "./tooltip";

type SendMessage = (message: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

function isTranslationResult(value: unknown): value is TranslationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "translation" in value &&
    "contextualMeaning" in value
  );
}

export async function handleSelectionPayload(
  payload: SelectionPayload,
  anchorRect: DOMRect,
  sendMessage: SendMessage
): Promise<void> {
  const response = await sendMessage({ type: MessageType.TranslateSelection, payload });
  if (!response.ok || !isTranslationResult(response.data)) return;
  const result = response.data;

  createTranslationTooltip({
    result,
    anchorRect,
    onClose: removeTranslationTooltip,
    onSave: () => {
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
      });
    }
  });
}

function getAnchorRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

function runtimeSendMessage(message: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return chrome.runtime.sendMessage(message);
}

document.addEventListener("selectionchange", () => {
  window.setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      removeTranslationTooltip();
      return;
    }

    const payload = extractSelectionContext(selection);
    const anchorRect = getAnchorRect(selection);
    if (!payload || !anchorRect) return;

    void handleSelectionPayload(payload, anchorRect, runtimeSendMessage);
  }, 120);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") removeTranslationTooltip();
});

document.addEventListener("scroll", removeTranslationTooltip, true);
