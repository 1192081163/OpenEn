import type { SelectionPayload } from "../shared/types";

const MAX_CONTEXT_LENGTH = 1500;
const CONTAINER_SELECTOR = "p, li, blockquote, article, section, div";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function capContext(text: string): string {
  const normalized = normalizeText(text);
  return normalized.length > MAX_CONTEXT_LENGTH ? normalized.slice(0, MAX_CONTEXT_LENGTH).trim() : normalized;
}

function isIgnoredElement(element: Element): boolean {
  return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(element.tagName);
}

function findContextElement(range: Range, selectedText: string): Element | null {
  const startElement =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;

  if (!startElement) return null;

  let current: Element | null = startElement;
  while (current && current !== document.documentElement) {
    if (!isIgnoredElement(current) && current.matches(CONTAINER_SELECTOR)) {
      const text = normalizeText(current.textContent ?? "");
      if (text.includes(selectedText) && text.length >= selectedText.length) return current;
    }
    current = current.parentElement;
  }

  return null;
}

export function extractSelectionContextFromRange(range: Range): SelectionPayload | null {
  const selectedText = normalizeText(range.toString());
  if (!selectedText) return null;
  if (selectedText.length > 120) return null;

  const contextElement = findContextElement(range, selectedText);
  const paragraphContext = contextElement
    ? capContext(contextElement.textContent ?? selectedText)
    : capContext(range.startContainer.textContent ?? selectedText);

  return {
    selectedText,
    paragraphContext,
    sourceUrl: window.location.href,
    pageTitle: document.title
  };
}

export function extractSelectionContext(selection: Selection | null = window.getSelection()): SelectionPayload | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return extractSelectionContextFromRange(selection.getRangeAt(0));
}
