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
    phrase: "lead a review",
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
      "selectedText,baseForm,translation,partOfSpeech,contextualMeaning,example,phrase,paragraphContext,sourceUrl,pageTitle,createdAt,provider"
    );
    expect(csv).toContain("lead a review");
    expect(csv).toContain('"Article, One"');
  });

  it("neutralizes formula-leading CSV values before escaping", () => {
    const csv = exportVocabularyAsCsv([
      {
        ...entries[0]!,
        selectedText: '=IMPORTXML("https://example.com", "//title")',
        translation: " +SUM(1,2)",
        partOfSpeech: "-cmd",
        contextualMeaning: "\t@handle"
      }
    ]);

    expect(csv).toContain(`"'=IMPORTXML(""https://example.com"", ""//title"")"`);
    expect(csv).toContain(`"' +SUM(1,2)"`);
    expect(csv).toContain("'-cmd");
    expect(csv).toContain("'\t@handle");
  });
});
