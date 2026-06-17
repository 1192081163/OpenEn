import {
  isAddVocabularyMessage,
  isDeleteVocabularyMessage,
  isExportVocabularyMessage,
  isListVocabularyMessage,
  isSearchVocabularyMessage,
  isTranslateSelectionMessage,
  MessageType
} from "./messages";

describe("message guards", () => {
  it("accepts a translate selection message", () => {
    expect(
      isTranslateSelectionMessage({
        type: MessageType.TranslateSelection,
        payload: {
          selectedText: "lead",
          paragraphContext: "She will lead the design review.",
          sourceUrl: "https://example.com/article",
          pageTitle: "Article"
        }
      })
    ).toBe(true);
  });

  it("rejects malformed translate messages", () => {
    expect(isTranslateSelectionMessage({ type: MessageType.TranslateSelection, payload: {} })).toBe(false);
  });

  it("accepts vocabulary list, search, add, delete, and export messages", () => {
    expect(isListVocabularyMessage({ type: MessageType.ListVocabulary })).toBe(true);
    expect(isSearchVocabularyMessage({ type: MessageType.SearchVocabulary, payload: { query: "lead" } })).toBe(true);
    expect(isAddVocabularyMessage({ type: MessageType.AddVocabulary, payload: { entry: { id: "1" } } })).toBe(true);
    expect(isDeleteVocabularyMessage({ type: MessageType.DeleteVocabulary, payload: { id: "1" } })).toBe(true);
    expect(isExportVocabularyMessage({ type: MessageType.ExportVocabulary, payload: { format: "csv" } })).toBe(true);
  });
  it("rejects add vocabulary messages with malformed known string fields", () => {
    expect(isAddVocabularyMessage({ type: MessageType.AddVocabulary, payload: { entry: { selectedText: 123 } } })).toBe(false);
    expect(isAddVocabularyMessage({ type: MessageType.AddVocabulary, payload: { entry: { translation: true } } })).toBe(false);
  });
});
