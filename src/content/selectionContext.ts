import type { SelectionPayload } from "../shared/types";

const MAX_CONTEXT_LENGTH = 1500;
const CONTAINER_SELECTOR = "p, li, blockquote, article, section, div";
const IGNORED_SELECTOR = "script, style, noscript, textarea, input";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function capContext(text: string, selectedText?: string, selectedTextStart?: number): string {
  const normalized = normalizeText(text);
  if (normalized.length <= MAX_CONTEXT_LENGTH) return normalized;

  if (!selectedText) return normalized.slice(0, MAX_CONTEXT_LENGTH).trim();

  const selectedIndex =
    selectedTextStart === undefined ? normalized.indexOf(selectedText) : selectedTextStart;
  if (selectedIndex < 0) return normalized.slice(0, MAX_CONTEXT_LENGTH).trim();

  const contextBudgetAroundSelection = MAX_CONTEXT_LENGTH - selectedText.length;
  const idealStart = selectedIndex - Math.floor(contextBudgetAroundSelection / 2);
  const maxStart = normalized.length - MAX_CONTEXT_LENGTH;
  const start = Math.min(Math.max(idealStart, 0), maxStart);

  return normalized.slice(start, start + MAX_CONTEXT_LENGTH).trim();
}

function isIgnoredElement(element: Element): boolean {
  return element.matches(IGNORED_SELECTOR);
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
  return window.location.href;
}

function rangeIntersectsIgnoredElement(range: Range): boolean {
  if (hasIgnoredAncestor(range.startContainer) || hasIgnoredAncestor(range.endContainer)) {
    return true;
  }

  const commonElement =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;

  if (!commonElement) return false;

  const ignoredElements = [
    ...(isIgnoredElement(commonElement) ? [commonElement] : []),
    ...Array.from(commonElement.querySelectorAll(IGNORED_SELECTOR))
  ];

  return ignoredElements.some((element) => range.intersectsNode(element));
}

function getSelectedTextStartInContext(
  range: Range,
  contextElement: Element,
  selectedText: string
): number {
  const beforeSelectionRange = document.createRange();
  beforeSelectionRange.selectNodeContents(contextElement);
  beforeSelectionRange.setEnd(range.startContainer, range.startOffset);

  const normalizedThroughSelection = normalizeText(
    `${beforeSelectionRange.toString()}${range.toString()}`
  );
  beforeSelectionRange.detach();

  return Math.max(normalizedThroughSelection.length - selectedText.length, 0);
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
  if (rangeIntersectsIgnoredElement(range)) return null;

  const contextElement = findContextElement(range, selectedText);
  const paragraphContext = contextElement
    ? capContext(
        contextElement.textContent ?? selectedText,
        selectedText,
        getSelectedTextStartInContext(range, contextElement, selectedText)
      )
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
