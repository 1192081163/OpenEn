export interface TranslationRequest {
  selectedText: string;
  paragraphContext: string;
  sourceLang?: string;
  targetLang: string;
}

export interface TranslationResult {
  selectedText: string;
  translation: string;
  partOfSpeech?: string;
  contextualMeaning: string;
  example?: string;
  confidence?: number;
  provider: "fake" | "openai" | "external";
}

export interface VocabularyEntry {
  id: string;
  selectedText: string;
  translation: string;
  partOfSpeech?: string;
  contextualMeaning: string;
  example?: string;
  paragraphContext: string;
  sourceUrl: string;
  pageTitle: string;
  createdAt: string;
  provider: string;
}

export interface SelectionPayload {
  selectedText: string;
  paragraphContext: string;
  sourceUrl: string;
  pageTitle: string;
}

export type ExportFormat = "json" | "csv";
