import { MessageType } from "../shared/messages";
import type { VocabularyEntry } from "../shared/types";
import { getWebExtensionApi, hasWebExtensionApi } from "../shared/webExtensionApi";

type MessageResponse = { ok: boolean; data?: unknown; error?: string };
type SendMessage = (message: unknown) => Promise<MessageResponse | undefined>;

const HIGHLIGHT_ATTRIBUTE = "data-openen-vocabulary-highlight";
const HIGHLIGHT_SELECTOR = `[${HIGHLIGHT_ATTRIBUTE}]`;
const HIGHLIGHT_STYLE_ID = "openen-vocabulary-highlight-style";
const IGNORED_SELECTOR = [
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
const SCAN_DEBOUNCE_MS = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHighlightSettings(value: unknown): value is { enabled: boolean } {
  return isRecord(value) && typeof value.enabled === "boolean";
}

function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  return (
    isRecord(value) &&
    typeof value.selectedText === "string" &&
    (value.baseForm === undefined || typeof value.baseForm === "string")
  );
}

function isVocabularyHighlightSettingsMessage(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === MessageType.SaveVocabularyHighlightSettings &&
    isRecord(value.payload) &&
    typeof value.payload.enabled === "boolean"
  );
}

function getRuntimeMessageBus() {
  if (!hasWebExtensionApi()) return undefined;
  return getWebExtensionApi().runtime.onMessage;
}

function normalizeTerm(term: string): string | undefined {
  const normalized = term.trim().toLowerCase();
  return /^[a-z][a-z'-]+$/.test(normalized) ? normalized : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHighlightRegex(terms: string[]): RegExp | undefined {
  if (terms.length === 0) return undefined;
  const escapedTerms = [...terms].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`\\b(${escapedTerms.join("|")})\\b`, "gi");
}

function hasIgnoredAncestor(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(element?.closest(IGNORED_SELECTOR));
}

function textNodesUnder(root: Node): Text[] {
  if (root.nodeType === Node.TEXT_NODE) {
    return hasIgnoredAncestor(root) ? [] : [root as Text];
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim() || hasIgnoredAncestor(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function ensureHighlightStyle(): void {
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

function highlightTextNode(node: Text, regex: RegExp): void {
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

export function getVocabularyHighlightTerms(entries: VocabularyEntry[]): string[] {
  const terms = new Set<string>();
  for (const entry of entries) {
    const baseForm = entry.baseForm ? normalizeTerm(entry.baseForm) : undefined;
    const selectedText = normalizeTerm(entry.selectedText);
    if (baseForm) terms.add(baseForm);
    if (selectedText) terms.add(selectedText);
  }
  return [...terms];
}

export function applyVocabularyHighlights(root: Node, terms: string[]): void {
  const regex = getHighlightRegex(terms);
  if (!regex) return;
  ensureHighlightStyle();
  for (const node of textNodesUnder(root)) {
    highlightTextNode(node, regex);
  }
}

export function clearVocabularyHighlights(root: ParentNode = document): void {
  const highlights = Array.from(root.querySelectorAll(HIGHLIGHT_SELECTOR));
  for (const highlight of highlights) {
    highlight.replaceWith(document.createTextNode(highlight.textContent ?? ""));
  }
  if (root instanceof Node) root.normalize();
}

async function loadHighlightTerms(sendMessage: SendMessage): Promise<string[] | undefined> {
  const settingsResponse = await sendMessage({ type: MessageType.GetVocabularyHighlightSettings });
  if (!settingsResponse?.ok || !isHighlightSettings(settingsResponse.data)) return undefined;
  if (!settingsResponse.data.enabled) return [];

  const listResponse = await sendMessage({ type: MessageType.ListVocabulary });
  if (!listResponse?.ok || !Array.isArray(listResponse.data)) return undefined;
  return getVocabularyHighlightTerms(listResponse.data.filter(isVocabularyEntry));
}

export function startVocabularyHighlighter(sendMessage: SendMessage, root: HTMLElement = document.body): () => void {
  let disposed = false;
  let terms: string[] = [];
  let scanTimer: number | undefined;

  const observer = new MutationObserver((mutations) => {
    if (disposed || terms.length === 0) return;
    if (!mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => !hasIgnoredAncestor(node)))) return;

    if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = undefined;
      if (!disposed) applyVocabularyHighlights(root, terms);
    }, SCAN_DEBOUNCE_MS);
  });

  const refresh = async (): Promise<void> => {
    let loadedTerms: string[] | undefined;
    try {
      loadedTerms = await loadHighlightTerms(sendMessage);
    } catch {
      return;
    }
    if (disposed || loadedTerms === undefined) return;

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
  const onRuntimeMessage = (message: unknown): void => {
    if (isVocabularyHighlightSettingsMessage(message)) void refresh();
  };
  runtimeMessageBus?.addListener(onRuntimeMessage);

  void refresh();

  return () => {
    disposed = true;
    observer.disconnect();
    runtimeMessageBus?.removeListener?.(onRuntimeMessage);
    if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    clearVocabularyHighlights(root);
  };
}
