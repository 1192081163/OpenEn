export interface TranslationRequest {
  selectedText: string;
  paragraphContext: string;
  sourceLang?: string;
  targetLang: string;
}

export type TranslationProviderName = "fake" | "deepseek" | "openai" | "external";

export interface TranslationResult {
  selectedText: string;
  translation: string;
  partOfSpeech?: string;
  contextualMeaning: string;
  example?: string;
  confidence?: number;
  provider: TranslationProviderName;
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

export interface TranslationSettingsView {
  provider: "local" | "deepseek";
  deepseek: {
    hasApiKey: boolean;
    apiKey: "";
    model: string;
  };
}

export type ExportFormat = "json" | "csv";
