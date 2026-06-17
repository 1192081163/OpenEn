import type { TranslationResult } from "../shared/types";

const TOOLTIP_ATTR = "data-openen-tooltip";
const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 156;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

interface TooltipOptions {
  result: TranslationResult;
  anchorRect: DOMRect;
  onSave(): void;
  onClose(): void;
}

function removeExisting(): void {
  document.querySelectorAll(`[${TOOLTIP_ATTR}]`).forEach((node) => node.remove());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getViewportHeight(): number {
  return window.innerHeight || document.documentElement.clientHeight;
}

function getMaxTooltipHeight(viewportHeight: number): number {
  return Math.max(0, viewportHeight - VIEWPORT_MARGIN * 2);
}

function positionHost(host: HTMLElement, anchorRect: DOMRect, tooltipHeight = TOOLTIP_HEIGHT): void {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = getViewportHeight();
  const width = Math.min(TOOLTIP_WIDTH, Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2));
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const left = clamp(anchorRect.left, VIEWPORT_MARGIN, maxLeft);
  const maxHeight = getMaxTooltipHeight(viewportHeight);
  const height = Math.min(Math.max(tooltipHeight, TOOLTIP_HEIGHT), maxHeight);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
  const bottomTop = anchorRect.bottom + ANCHOR_GAP;
  const preferredTop = bottomTop + height > viewportHeight - VIEWPORT_MARGIN
    ? anchorRect.top - height - ANCHOR_GAP
    : bottomTop;
  const top = clamp(preferredTop, VIEWPORT_MARGIN, maxTop);

  host.style.setProperty("position", "absolute", "important");
  host.style.setProperty("z-index", "2147483647", "important");
  host.style.setProperty("top", `${window.scrollY + top}px`, "important");
  host.style.setProperty("left", `${window.scrollX + left}px`, "important");
  host.style.setProperty("width", `${width}px`, "important");
  host.style.setProperty("max-width", `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`, "important");
  host.style.setProperty("max-height", `${maxHeight}px`, "important");
}

function button(label: string, attr: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.setAttribute(attr, "");
  element.className = "openen-button";
  element.style.display = "inline-flex";
  element.style.fontSize = "13px";
  return element;
}

export function removeTranslationTooltip(): void {
  removeExisting();
}

export function createTranslationTooltip(options: TooltipOptions): HTMLElement {
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

    .openen-meaning {
      margin-top: 6px;
      color: #57606a;
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

  const title = document.createElement("strong");
  title.className = "openen-title";
  title.textContent = options.result.selectedText;

  const translation = document.createElement("div");
  translation.className = "openen-translation";
  translation.textContent = options.result.translation;

  const meaning = document.createElement("div");
  meaning.className = "openen-meaning";
  meaning.textContent = options.result.contextualMeaning;

  const actions = document.createElement("div");
  actions.className = "openen-actions";

  const save = button("加入生词本", "data-openen-save");
  save.addEventListener("click", options.onSave);

  const close = button("关闭", "data-openen-close");
  close.addEventListener("click", () => {
    removeExisting();
    options.onClose();
  });

  actions.append(save, close);
  panel.append(title, translation, meaning, actions);
  shadow.append(style, panel);
  document.body.append(host);
  positionHost(host, options.anchorRect, panel.getBoundingClientRect().height || maxTooltipHeight);

  return host;
}
