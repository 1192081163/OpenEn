import type { VocabularyEntry } from "../../shared/types";
import { renderVocabularyPage } from "./vocabulary";

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

describe("vocabulary page", () => {
  it("renders entries and deletes a row", () => {
    const onDelete = vi.fn();
    document.body.innerHTML = `<input id="search" /><button id="exportJson"></button><button id="exportCsv"></button><tbody id="entries"></tbody>`;

    renderVocabularyPage({ entries, onDelete, onSearch: vi.fn(), onExport: vi.fn() });

    expect(document.body.textContent).toContain("lead");
    (document.querySelector("[data-delete-id='1']") as HTMLButtonElement).click();
    expect(onDelete).toHaveBeenCalledWith("1");
  });

  it("calls search and export callbacks", () => {
    const onSearch = vi.fn();
    const onExport = vi.fn();
    document.body.innerHTML = `<input id="search" /><button id="exportJson"></button><button id="exportCsv"></button><tbody id="entries"></tbody>`;

    renderVocabularyPage({ entries, onDelete: vi.fn(), onSearch, onExport });
    const search = document.querySelector("#search") as HTMLInputElement;
    search.value = "lead";
    search.dispatchEvent(new Event("input"));
    (document.querySelector("#exportCsv") as HTMLButtonElement).click();

    expect(onSearch).toHaveBeenCalledWith("lead");
    expect(onExport).toHaveBeenCalledWith("csv");
  });
});
