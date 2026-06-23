import type { TranslationResult } from "../shared/types";
import { createTranslationTooltip } from "./tooltip";

const result: TranslationResult = {
  selectedText: "lead",
  baseForm: "lead",
  translation: "带领；主持",
  partOfSpeech: "动词",
  contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
  example: "She will lead the review. 她将主持这次评审。",
  phrase: "lead a review",
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

function translateButton(): HTMLButtonElement {
  const translate = tooltipRoot().querySelector("[data-openen-translate]");
  expect(translate).toBeInstanceOf(HTMLButtonElement);
  return translate as HTMLButtonElement;
}

function retryButton(): HTMLButtonElement {
  const retry = tooltipRoot().querySelector("[data-openen-retry]");
  expect(retry).toBeInstanceOf(HTMLButtonElement);
  return retry as HTMLButtonElement;
}

function refreshButton(): HTMLButtonElement {
  const refresh = tooltipRoot().querySelector("[data-openen-refresh]");
  expect(refresh).toBeInstanceOf(HTMLButtonElement);
  return refresh as HTMLButtonElement;
}

function closeButton(): HTMLButtonElement {
  const close = tooltipRoot().querySelector("[data-openen-close]");
  expect(close).toBeInstanceOf(HTMLButtonElement);
  return close as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.querySelectorAll("[data-openen-test-style]").forEach((node) => node.remove());
  setViewport(defaultViewport.width, defaultViewport.height);
});

describe("translation tooltip", () => {
  it("renders manual translate action", () => {
    const onTranslate = vi.fn();

    createTranslationTooltip({
      mode: "action",
      selectedText: "lead",
      anchorRect: new DOMRect(20, 30, 40, 12),
      onTranslate,
      onClose: vi.fn()
    });

    expect(tooltipRoot().textContent).toContain("lead");
    expect(translateButton().textContent).toBe("翻译");
    expect(closeButton().textContent).toBe("关闭");
    expect(tooltipRoot().querySelector("[data-openen-save]")).toBeNull();

    translateButton().click();
    expect(onTranslate).toHaveBeenCalledOnce();
  });

  it("renders loading state while translating", () => {
    createTranslationTooltip({
      mode: "loading",
      selectedText: "lead",
      anchorRect: new DOMRect(20, 30, 40, 12),
      onClose: vi.fn()
    });

    expect(tooltipRoot().textContent).toContain("lead");
    expect(translateButton().textContent).toBe("翻译中...");
    expect(translateButton().disabled).toBe(true);
    expect(tooltipRoot().querySelector("[data-openen-save]")).toBeNull();
  });

  it("renders retry action after translation failure", () => {
    const onRetry = vi.fn();

    createTranslationTooltip({
      mode: "error",
      selectedText: "lead",
      anchorRect: new DOMRect(20, 30, 40, 12),
      onRetry,
      onClose: vi.fn()
    });

    expect(tooltipRoot().textContent).toContain("lead");
    expect(tooltipRoot().textContent).toContain("翻译失败，请重试");
    expect(retryButton().textContent).toBe("重试");
    expect(tooltipRoot().querySelector("[data-openen-save]")).toBeNull();

    retryButton().click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders contextual learning details and save action after translation", () => {
    const onSave = vi.fn();
    createTranslationTooltip({
      mode: "result",
      result,
      anchorRect: new DOMRect(20, 30, 40, 12),
      onSave,
      onClose: vi.fn()
    });

    const text = tooltipRoot().textContent ?? "";
    expect(tooltipRoot().querySelector("[data-openen-result-card]")).toBeInstanceOf(HTMLElement);
    expect(text).toContain("带领；主持");
    expect(text).toContain("动词 · lead");
    expect(text).toContain("在这段话中，lead 表示带领或主持某项活动。");
    expect(text).toContain("She will lead the review. 她将主持这次评审。");
    expect(text).toContain("lead a review");
    expect(saveButton().textContent).toBe("加入生词本");
    expect(closeButton().textContent).toBe("关闭");
    saveButton().click();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("renders already saved result without another save action", () => {
    const onSave = vi.fn();

    createTranslationTooltip({
      mode: "result",
      result,
      saved: true,
      anchorRect: new DOMRect(20, 30, 40, 12),
      onSave,
      onClose: vi.fn()
    });

    expect(tooltipRoot().textContent).toContain("带领；主持");
    expect(saveButton().textContent).toBe("已加入");
    expect(saveButton().disabled).toBe(true);

  saveButton().click();
  expect(onSave).not.toHaveBeenCalled();
});

  it("renders optional refresh action for saved results", () => {
    const onRefresh = vi.fn();

    createTranslationTooltip({
      mode: "result",
      result,
      saved: true,
      anchorRect: new DOMRect(20, 30, 40, 12),
      onSave: vi.fn(),
      onRefresh,
      onClose: vi.fn()
    });

    expect(refreshButton().textContent).toBe("重新翻译");
    refreshButton().click();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("removes an existing tooltip before rendering a new one", () => {
    createTranslationTooltip({
      mode: "result",
      result,
      anchorRect: new DOMRect(20, 30, 40, 12),
      onSave: vi.fn(),
      onClose: vi.fn()
    });
    createTranslationTooltip({
      mode: "result",
      result,
      anchorRect: new DOMRect(20, 30, 40, 12),
      onSave: vi.fn(),
      onClose: vi.fn()
    });

    expect(document.querySelectorAll("[data-openen-tooltip]")).toHaveLength(1);
  });

  it("keeps controls isolated from hostile page CSS in shadow DOM", () => {
    const style = document.createElement("style");
    style.setAttribute("data-openen-test-style", "");
    style.textContent = "button { display: none !important; } * { font-size: 1px !important; }";
    document.head.append(style);

    createTranslationTooltip({
      mode: "result",
      result,
      anchorRect: new DOMRect(20, 30, 40, 12),
      onSave: vi.fn(),
      onClose: vi.fn()
    });

    const host = tooltipHost();
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot?.querySelector("[data-openen-save]")).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector("[data-openen-save]")).toBeNull();
    expect(getComputedStyle(saveButton()).display).not.toBe("none");
    expect(getComputedStyle(saveButton()).fontSize).not.toBe("1px");
  });

  it("clamps the left position near the right viewport edge", () => {
    setViewport(360, 600);

    createTranslationTooltip({
      mode: "result",
      result,
      anchorRect: new DOMRect(340, 120, 20, 12),
      onSave: vi.fn(),
      onClose: vi.fn()
    });

    expect(Number.parseFloat(tooltipHost().style.left)).toBeLessThanOrEqual(32);
  });

  it("flips above the selection near the bottom viewport edge", () => {
    setViewport(400, 240);
    const anchorRect = new DOMRect(20, 210, 40, 20);

    createTranslationTooltip({
      mode: "result",
      result,
      anchorRect,
      onSave: vi.fn(),
      onClose: vi.fn()
    });

    expect(Number.parseFloat(tooltipHost().style.top)).toBeLessThan(anchorRect.top);
  });

  it("wraps long selected and translated text", () => {
    createTranslationTooltip({
      mode: "result",
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

  it("keeps very long tooltip content within viewport height near bottom edge", () => {
    setViewport(360, 180);

    createTranslationTooltip({
      mode: "result",
      result: {
        ...result,
        selectedText: "selected text ".repeat(80),
        translation: "translated content ".repeat(120),
        contextualMeaning: "contextual meaning ".repeat(120)
      },
      anchorRect: new DOMRect(20, 164, 40, 12),
      onSave: vi.fn(),
      onClose: vi.fn()
    });

    const host = tooltipHost();
    const panel = tooltipRoot().querySelector("[data-openen-tooltip-panel]") as HTMLElement;

    expect(Number.parseFloat(host.style.top)).toBeGreaterThanOrEqual(8);
    expect(panel.style.maxHeight).toBe("164px");
    expect(panel.style.overflowY).toBe("auto");
  });
});
