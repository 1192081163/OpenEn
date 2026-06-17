import type { VocabularyEntry } from "../../shared/types";
import { renderPopup } from "./popup";

const entries: VocabularyEntry[] = [
  {
    id: "1",
    selectedText: "lead",
    translation: "lead as guide",
    contextualMeaning: "guide",
    paragraphContext: "She will lead the review.",
    sourceUrl: "https://example.com",
    pageTitle: "Example",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake"
  }
];

describe("popup UI", () => {
  it("renders recent words and opens vocabulary page", () => {
    document.body.innerHTML = `<main><button id="openVocabulary"></button><ul id="recentWords"></ul></main>`;
    const openVocabulary = vi.fn();
    renderPopup({ entries, openVocabulary });

    expect(document.body.textContent).toContain("lead");
    (document.querySelector("#openVocabulary") as HTMLButtonElement).click();
    expect(openVocabulary).toHaveBeenCalledOnce();
  });
});
