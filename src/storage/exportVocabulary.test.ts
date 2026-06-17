import type { VocabularyEntry } from "../shared/types";
import { exportVocabularyAsCsv, exportVocabularyAsJson } from "./exportVocabulary";

const entries: VocabularyEntry[] = [
  {
    id: "1",
    selectedText: "lead",
    translation: "lead as guide",
    partOfSpeech: "verb",
    contextualMeaning: "guide an activity",
    example: "She will lead the review.",
    paragraphContext: "She will lead the design review tomorrow.",
    sourceUrl: "https://example.com/a",
    pageTitle: "Article, One",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake"
  }
];

describe("vocabulary export", () => {
  it("exports pretty JSON", () => {
    expect(exportVocabularyAsJson(entries)).toContain('"selectedText": "lead"');
  });

  it("exports CSV with escaped values", () => {
    const csv = exportVocabularyAsCsv(entries);
    expect(csv.split("\n")[0]).toBe(
      "selectedText,translation,partOfSpeech,contextualMeaning,example,paragraphContext,sourceUrl,pageTitle,createdAt,provider"
    );
    expect(csv).toContain('"Article, One"');
  });
});
