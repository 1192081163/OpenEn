import type { SelectionPayload } from "../shared/types";

const MAX_CONTEXT_LENGTH = 1500;
const CONTAINER_SELECTOR = "p, li, blockquote, article, section, div";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function capContext(text: string, selectedText?: string): string {
  const normalized = normalizeText(text);
  if (normalized.length <= MAX_CONTEXT_LENGTH) return normalized;

  if (!selectedText) return normalized.slice(0, MAX_CONTEXT_LENGTH).trim();

  const selectedIndex = normalized.indexOf(selectedText);
  if (selectedIndex < 0) return normalized.slice(0, MAX_CONTEXT_LENGTH).trim();

  const contextBudgetAroundSelection = MAX_CONTEXT_LENGTH - selectedText.length;
  const idealStart = selectedIndex - Math.floor(contextBudgetAroundSelection / 2);
  const maxStart = normalized.length - MAX_CONTEXT_LENGTH;
  const start = Math.min(Math.max(idealStart, 0), maxStart);

  return normalized.slice(start, start + MAX_CONTEXT_LENGTH).trim();
}

function isIgnoredElement(element: Element): boolean {
  return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(element.tagName);
}

function hasIgnoredAncestor(node: Node): boolean {
  let current: Element | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;

  while (current && current !== document.documentElement) {
    if (isIgnoredElement(current)) return true;
    current = current.parentElement;
  }

  return false;
}

function getSourceUrl(): string {
  try {
    const url = new URL(window.location.href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return window.location.href;
  }
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
  if (hasIgnoredAncestor(range.startContainer) || hasIgnoredAncestor(range.endContainer)) return null;

  const contextElement = findContextElement(range, selectedText);
  const paragraphContext = contextElement
    ? capContext(contextElement.textContent ?? selectedText, selectedText)
    : capContext(range.startContainer.textContent ?? selectedText, selectedText);

  return {
    selectedText,
    paragraphContext,
    sourceUrl: getSourceUrl(),
    pageTitle: document.title
  };
}

export function extractSelectionContext(selection: Selection | null = window.getSelection()): SelectionPayload | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return extractSelectionContextFromRange(selection.getRangeAt(0));
}
