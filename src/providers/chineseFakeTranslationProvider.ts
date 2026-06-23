import type { TranslationRequest, TranslationResult } from "../shared/types";
import type { TranslationProvider } from "./translationProvider";

function firstSentence(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.{1,160}?[.!?])(\s|$)/);
  return match?.[1] ?? normalized.slice(0, 160);
}

function normalizeBaseForm(selectedText: string): string {
  const lower = selectedText.toLowerCase();
  if (lower === "lead" || lower === "leads" || lower === "leading" || lower === "led") return "lead";
  return lower;
}

function translateLead(selectedText: string, context: string): TranslationResult {
  const lowerContext = context.toLowerCase();
  if (/\b(pipe|metal|paint|battery|poison|plumbing|residue)\b/.test(lowerContext)) {
    return {
      selectedText,
      baseForm: "lead",
      translation: "铅",
      partOfSpeech: "名词",
      contextualMeaning: "在这段话中，lead 表示一种有毒的重金属。",
      example: "The pipe contained lead. 这根管道含有铅。",
      phrase: "lead paint",
      confidence: 0.9,
      provider: "fake"
    };
  }

  return {
    selectedText,
    baseForm: "lead",
    translation: "带领；主持",
    partOfSpeech: "动词",
    contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
    example: "She will lead review. 她将主持这次评审。",
    phrase: "lead a review",
    confidence: 0.9,
    provider: "fake"
  };
}

export function createChineseFakeTranslationProvider(): TranslationProvider {
  return {
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      const selectedText = request.selectedText.trim();
      const paragraphContext = request.paragraphContext.trim();
      const baseForm = normalizeBaseForm(selectedText);
      if (baseForm === "lead") return translateLead(selectedText, paragraphContext);

      return {
        selectedText,
        baseForm,
        translation: `${selectedText} 的中文释义`,
        contextualMeaning: `基于上下文：${firstSentence(paragraphContext)}`,
        example: `${selectedText} 可以结合原文语境理解。`,
        confidence: 0.5,
        provider: "fake"
      };
    }
  };
}
