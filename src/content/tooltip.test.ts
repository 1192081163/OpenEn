import type { TranslationResult } from "../shared/types";
import { createTranslationTooltip } from "./tooltip";

const result: TranslationResult = {
  selectedText: "lead",
  translation: "lead as guide",
  partOfSpeech: "verb",
  contextualMeaning: "Guide or direct an activity.",
  example: "She will lead the review.",
  provider: "fake"
};

const defaultViewport = {
  height: window.innerHeight,
  width: window.innerWidth
};

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function tooltipHost(): HTMLElement {
  const host = document.querySelector("[data-openen-tooltip]");
  expect(host).toBeInstanceOf(HTMLElement);
  return host as HTMLElement;
}

function tooltipRoot(): ShadowRoot {
  const root = tooltipHost().shadowRoot;
  expect(root).not.toBeNull();
  return root as ShadowRoot;
}

function saveButton(): HTMLButtonElement {
  const save = tooltipRoot().querySelector("[data-openen-save]");
  expect(save).toBeInstanceOf(HTMLButtonElement);
  return save as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.querySelectorAll("[data-openen-test-style]").forEach((node) => node.remove());
  setViewport(defaultViewport.width, defaultViewport.height);
});

describe("translation tooltip", () => {
  it("renders translation content and save action", () => {
    const onSave = vi.fn();
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave, onClose: vi.fn() });

    expect(tooltipRoot().textContent).toContain("lead as guide");
    saveButton().click();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("removes an existing tooltip before rendering a new one", () => {
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave: vi.fn(), onClose: vi.fn() });
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave: vi.fn(), onClose: vi.fn() });

    expect(document.querySelectorAll("[data-openen-tooltip]")).toHaveLength(1);
  });

  it("keeps controls isolated from hostile page CSS in shadow DOM", () => {
    const style = document.createElement("style");
    style.setAttribute("data-openen-test-style", "");
    style.textContent = "button { display: none !important; } * { font-size: 1px !important; }";
    document.head.append(style);

    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave: vi.fn(), onClose: vi.fn() });

    const host = tooltipHost();
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot?.querySelector("[data-openen-save]")).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector("[data-openen-save]")).toBeNull();
    expect(getComputedStyle(saveButton()).display).not.toBe("none");
    expect(getComputedStyle(saveButton()).fontSize).not.toBe("1px");
  });

  it("clamps the left position near the right viewport edge", () => {
    setViewport(360, 600);

    createTranslationTooltip({ result, anchorRect: new DOMRect(340, 120, 20, 12), onSave: vi.fn(), onClose: vi.fn() });

    expect(Number.parseFloat(tooltipHost().style.left)).toBeLessThanOrEqual(32);
  });

  it("flips above the selection near the bottom viewport edge", () => {
    setViewport(400, 240);
    const anchorRect = new DOMRect(20, 210, 40, 20);

    createTranslationTooltip({ result, anchorRect, onSave: vi.fn(), onClose: vi.fn() });

    expect(Number.parseFloat(tooltipHost().style.top)).toBeLessThan(anchorRect.top);
  });

  it("wraps long selected and translated text", () => {
    createTranslationTooltip({
      result: {
        ...result,
        selectedText: "pneumonoultramicroscopicsilicovolcanoconiosis".repeat(2),
        translation: "antidisestablishmentarianism".repeat(3)
      },
      anchorRect: new DOMRect(20, 30, 40, 12),
      onSave: vi.fn(),
      onClose: vi.fn()
    });

    const panel = tooltipRoot().querySelector("[data-openen-tooltip-panel]") as HTMLElement;
    expect(panel.style.overflowWrap).toBe("anywhere");
  });
});
