import type { TranslationRequest, TranslationResult } from "../shared/types";
import type { TranslationProvider } from "./translationProvider";

function firstSentence(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.{1,160}?[.!?])(\s|$)/);
  return match?.[1] ?? normalized.slice(0, 160);
}

function translateLead(context: string): TranslationResult {
  const lowerContext = context.toLowerCase();
  if (/\b(pipe|metal|paint|battery|poison|plumbing)\b/.test(lowerContext)) {
    return {
      selectedText: "lead",
      translation: "lead as metal",
      partOfSpeech: "noun",
      contextualMeaning: "In this paragraph, lead means a heavy metal material.",
      example: "The pipe contained lead.",
      confidence: 0.9,
      provider: "fake"
    };
  }

  return {
    selectedText: "lead",
    translation: "lead as guide",
    partOfSpeech: "verb",
    contextualMeaning: "In this paragraph, lead means to guide or direct an activity.",
    example: "She will lead the review.",
    confidence: 0.9,
    provider: "fake"
  };
}

export function createFakeTranslationProvider(): TranslationProvider {
  return {
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      const selectedText = request.selectedText.trim();
      const paragraphContext = request.paragraphContext.trim();

      if (selectedText.toLowerCase() === "lead") {
        return translateLead(paragraphContext);
      }

      return {
        selectedText,
        translation: `Fake ${request.targetLang} translation for ${selectedText}`,
        contextualMeaning: `Fake contextual meaning based on: ${firstSentence(paragraphContext)}`,
        example: `Example with ${selectedText}.`,
        confidence: 0.5,
        provider: "fake"
      };
    }
  };
}
