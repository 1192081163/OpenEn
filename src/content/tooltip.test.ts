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

describe("translation tooltip", () => {
  it("renders translation content and save action", () => {
    const onSave = vi.fn();
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave, onClose: vi.fn() });

    expect(document.querySelector("[data-openen-tooltip]")?.textContent).toContain("lead as guide");
    (document.querySelector("[data-openen-save]") as HTMLButtonElement).click();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("removes an existing tooltip before rendering a new one", () => {
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave: vi.fn(), onClose: vi.fn() });
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave: vi.fn(), onClose: vi.fn() });

    expect(document.querySelectorAll("[data-openen-tooltip]")).toHaveLength(1);
  });
});
