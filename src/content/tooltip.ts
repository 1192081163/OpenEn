import type { TranslationResult } from "../shared/types";

const TOOLTIP_ATTR = "data-openen-tooltip";

interface TooltipOptions {
  result: TranslationResult;
  anchorRect: DOMRect;
  onSave(): void;
  onClose(): void;
}

function removeExisting(): void {
  document.querySelectorAll(`[${TOOLTIP_ATTR}]`).forEach((node) => node.remove());
}

function button(label: string, attr: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.setAttribute(attr, "");
  element.style.border = "1px solid #d0d7de";
  element.style.borderRadius = "6px";
  element.style.background = "#fff";
  element.style.padding = "4px 8px";
  element.style.cursor = "pointer";
  return element;
}

export function removeTranslationTooltip(): void {
  removeExisting();
}

export function createTranslationTooltip(options: TooltipOptions): HTMLElement {
  removeExisting();

  const root = document.createElement("div");
  root.setAttribute(TOOLTIP_ATTR, "");
  root.style.position = "absolute";
  root.style.zIndex = "2147483647";
  root.style.top = `${window.scrollY + options.anchorRect.bottom + 8}px`;
  root.style.left = `${window.scrollX + options.anchorRect.left}px`;
  root.style.maxWidth = "320px";
  root.style.padding = "10px";
  root.style.border = "1px solid rgba(0, 0, 0, 0.12)";
  root.style.borderRadius = "8px";
  root.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.14)";
  root.style.background = "#fff";
  root.style.color = "#1f2328";
  root.style.font = "13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

  const title = document.createElement("strong");
  title.textContent = options.result.selectedText;

  const translation = document.createElement("div");
  translation.textContent = options.result.translation;
  translation.style.marginTop = "6px";

  const meaning = document.createElement("div");
  meaning.textContent = options.result.contextualMeaning;
  meaning.style.marginTop = "6px";
  meaning.style.color = "#57606a";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.marginTop = "10px";

  const save = button("Add to vocabulary", "data-openen-save");
  save.addEventListener("click", options.onSave);

  const close = button("Close", "data-openen-close");
  close.addEventListener("click", () => {
    removeExisting();
    options.onClose();
  });

  actions.append(save, close);
  root.append(title, translation, meaning, actions);
  document.body.append(root);

  return root;
}
