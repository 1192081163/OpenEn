import {
  isAddVocabularyMessage,
  isClearDeepSeekSettingsMessage,
  isDeleteVocabularyMessage,
  isExportVocabularyMessage,
  isGetTranslationBubbleSettingsMessage,
  isGetTranslationSettingsMessage,
  isGetVocabularyHighlightSettingsMessage,
  isListVocabularyMessage,
  isSaveTranslationBubbleSettingsMessage,
  isSaveVocabularyHighlightSettingsMessage,
  isSaveDeepSeekSettingsMessage,
  isSearchVocabularyMessage,
  isTranslateSelectionMessage,
  MessageType
} from "./messages";

describe("message guards", () => {
  it("accepts translate selection message", () => {
    expect(
      isTranslateSelectionMessage({
        type: MessageType.TranslateSelection,
        payload: {
          selectedText: "lead",
          paragraphContext: "She will lead design review.",
          sourceUrl: "https://example.com/article",
          pageTitle: "Article"
        }
      })
    ).toBe(true);
  });

  it("rejects malformed translate messages", () => {
    expect(isTranslateSelectionMessage({ type: MessageType.TranslateSelection, payload: {} })).toBe(false);
  });

  it("accepts vocabulary list, search, add, delete, export messages", () => {
    expect(isListVocabularyMessage({ type: MessageType.ListVocabulary })).toBe(true);
    expect(isSearchVocabularyMessage({ type: MessageType.SearchVocabulary, payload: { query: "lead" } })).toBe(true);
    expect(isAddVocabularyMessage({ type: MessageType.AddVocabulary, payload: { entry: { id: "1", baseForm: "lead" } } })).toBe(true);
    expect(isDeleteVocabularyMessage({ type: MessageType.DeleteVocabulary, payload: { id: "1" } })).toBe(true);
    expect(isExportVocabularyMessage({ type: MessageType.ExportVocabulary, payload: { format: "csv" } })).toBe(true);
  });

  it("rejects add vocabulary messages with malformed known string fields", () => {
    expect(isAddVocabularyMessage({ type: MessageType.AddVocabulary, payload: { entry: { selectedText: 123 } } })).toBe(false);
    expect(isAddVocabularyMessage({ type: MessageType.AddVocabulary, payload: { entry: { translation: true } } })).toBe(false);
    expect(isAddVocabularyMessage({ type: MessageType.AddVocabulary, payload: { entry: { baseForm: false } } })).toBe(false);
  });

  it("accepts translation settings messages", () => {
    expect(isGetTranslationSettingsMessage({ type: MessageType.GetTranslationSettings })).toBe(true);
    expect(
      isSaveDeepSeekSettingsMessage({
        type: MessageType.SaveDeepSeekSettings,
        payload: { apiKey: "sk-test", model: "deepseek-v4-flash" }
      })
    ).toBe(true);
    expect(isClearDeepSeekSettingsMessage({ type: MessageType.ClearDeepSeekSettings })).toBe(true);
  });

  it("accepts vocabulary highlight settings messages", () => {
    expect(isGetVocabularyHighlightSettingsMessage({ type: MessageType.GetVocabularyHighlightSettings })).toBe(true);
    expect(
      isSaveVocabularyHighlightSettingsMessage({
        type: MessageType.SaveVocabularyHighlightSettings,
        payload: { enabled: true }
      })
    ).toBe(true);
  });

  it("rejects malformed vocabulary highlight settings messages", () => {
    expect(
      isSaveVocabularyHighlightSettingsMessage({
        type: MessageType.SaveVocabularyHighlightSettings,
        payload: { enabled: "true" }
      })
    ).toBe(false);
  });

  it("accepts translation bubble settings messages", () => {
    expect(isGetTranslationBubbleSettingsMessage({ type: MessageType.GetTranslationBubbleSettings })).toBe(true);
    expect(
      isSaveTranslationBubbleSettingsMessage({
        type: MessageType.SaveTranslationBubbleSettings,
        payload: { enabled: false }
      })
    ).toBe(true);
  });

  it("rejects malformed translation bubble settings messages", () => {
    expect(
      isSaveTranslationBubbleSettingsMessage({
        type: MessageType.SaveTranslationBubbleSettings,
        payload: { enabled: "false" }
      })
    ).toBe(false);
  });

  it("rejects malformed save deepseek settings messages", () => {
    expect(
      isSaveDeepSeekSettingsMessage({
        type: MessageType.SaveDeepSeekSettings,
        payload: { apiKey: 42, model: "deepseek-v4-flash" }
      })
    ).toBe(false);
  });
});
