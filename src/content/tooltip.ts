import type { TranslationResult } from "../shared/types";

const TOOLTIP_ATTR = "data-openen-tooltip";
const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 156;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

interface TooltipBaseOptions {
  anchorRect: DOMRect;
  onClose(): void;
}

interface ActionTooltipOptions extends TooltipBaseOptions {
  mode: "action";
  selectedText: string;
  onTranslate(): void;
}

interface LoadingTooltipOptions extends TooltipBaseOptions {
  mode: "loading";
  selectedText: string;
}

interface ErrorTooltipOptions extends TooltipBaseOptions {
  mode: "error";
  selectedText: string;
  onRetry(): void;
}

interface ResultTooltipOptions extends TooltipBaseOptions {
  mode: "result";
  result: TranslationResult;
  saved?: boolean;
  onSave(): void;
  onRefresh?(): void;
}

type TooltipOptions = ActionTooltipOptions | LoadingTooltipOptions | ErrorTooltipOptions | ResultTooltipOptions;

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

function optionalText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function resultMeta(result: TranslationResult): string {
  return [optionalText(result.partOfSpeech), optionalText(result.baseForm ?? result.selectedText)]
    .filter(Boolean)
    .join(" · ");
}

function appendDetail(parent: HTMLElement, label: string, value: string | undefined): void {
  const text = optionalText(value);
  if (!text) return;

  const row = document.createElement("div");
  row.className = "openen-detail";

  const labelElement = document.createElement("span");
  labelElement.className = "openen-detail-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.textContent = text;

  row.append(labelElement, valueElement);
  parent.append(row);
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
      font-size: 15px;
      font-weight: 700;
      line-height: 1.35;
    }

    .openen-result-card {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .openen-meta {
      color: #57606a;
      font-size: 12px;
      line-height: 1.35;
    }

    .openen-detail {
      line-height: 1.4;
    }

    .openen-detail-label {
      color: #57606a;
      margin-right: 4px;
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

  const close = button("关闭", "data-openen-close");
  close.addEventListener("click", () => {
    removeExisting();
    options.onClose();
  });

  if (options.mode === "action") {
    const title = document.createElement("strong");
    title.className = "openen-title";
    title.textContent = options.selectedText;

    const translate = button("翻译", "data-openen-translate");
    translate.addEventListener("click", options.onTranslate);
    panel.append(title);
    actions.append(translate, close);
  } else if (options.mode === "loading") {
    const title = document.createElement("strong");
    title.className = "openen-title";
    title.textContent = options.selectedText;

    const loading = button("翻译中...", "data-openen-translate");
    loading.disabled = true;
    panel.append(title);
    actions.append(loading, close);
  } else if (options.mode === "error") {
    const title = document.createElement("strong");
    title.className = "openen-title";
    title.textContent = options.selectedText;

    const message = document.createElement("div");
    message.className = "openen-translation";
    message.textContent = "翻译失败，请重试";

    const retry = button("重试", "data-openen-retry");
    retry.addEventListener("click", options.onRetry);

    panel.append(title, message);
    actions.append(retry, close);
  } else {
    const card = document.createElement("div");
    card.className = "openen-result-card";
    card.setAttribute("data-openen-result-card", "");

    const translation = document.createElement("div");
    translation.className = "openen-translation";
    translation.textContent = options.result.translation;
    card.append(translation);

    const metaText = resultMeta(options.result);
    if (metaText) {
      const meta = document.createElement("div");
      meta.className = "openen-meta";
      meta.textContent = metaText;
      card.append(meta);
    }

    appendDetail(card, "语境", options.result.contextualMeaning);
    appendDetail(card, "例句", options.result.example);
    appendDetail(card, "短语", options.result.phrase);

    const save = button(options.saved ? "已加入" : "加入生词本", "data-openen-save");
    save.disabled = options.saved === true;
    if (!options.saved) save.addEventListener("click", options.onSave);

    if (options.onRefresh) {
      const refresh = button("重新翻译", "data-openen-refresh");
      refresh.addEventListener("click", options.onRefresh);
      actions.append(refresh);
    }

    panel.append(card);
    actions.append(save, close);
  }

  panel.append(actions);
  shadow.append(style, panel);
  document.body.append(host);
  positionHost(host, options.anchorRect, panel.getBoundingClientRect().height || maxTooltipHeight);

  return host;
}
