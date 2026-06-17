import type { ExportFormat, SelectionPayload, TranslationSettingsView, VocabularyEntry } from "./types";

export enum MessageType {
  TranslateSelection = "TRANSLATE_SELECTION",
  AddVocabulary = "ADD_VOCABULARY",
  ListVocabulary = "LIST_VOCABULARY",
  SearchVocabulary = "SEARCH_VOCABULARY",
  DeleteVocabulary = "DELETE_VOCABULARY",
  ExportVocabulary = "EXPORT_VOCABULARY",
  GetTranslationSettings = "GET_TRANSLATION_SETTINGS",
  SaveDeepSeekSettings = "SAVE_DEEPSEEK_SETTINGS",
  ClearDeepSeekSettings = "CLEAR_DEEPSEEK_SETTINGS"
}

export interface TranslateSelectionMessage {
  type: MessageType.TranslateSelection;
  payload: SelectionPayload;
}

export interface AddVocabularyMessage {
  type: MessageType.AddVocabulary;
  payload: { entry: Partial<VocabularyEntry> };
}

export interface ListVocabularyMessage {
  type: MessageType.ListVocabulary;
}

export interface SearchVocabularyMessage {
  type: MessageType.SearchVocabulary;
  payload: { query: string };
}

export interface DeleteVocabularyMessage {
  type: MessageType.DeleteVocabulary;
  payload: { id: string };
}

export interface ExportVocabularyMessage {
  type: MessageType.ExportVocabulary;
  payload: { format: ExportFormat };
}

export interface GetTranslationSettingsMessage {
  type: MessageType.GetTranslationSettings;
}

export interface SaveDeepSeekSettingsMessage {
  type: MessageType.SaveDeepSeekSettings;
  payload: { apiKey: string; model?: string };
}

export interface ClearDeepSeekSettingsMessage {
  type: MessageType.ClearDeepSeekSettings;
}

export type OpenEnMessage =
  | TranslateSelectionMessage
  | AddVocabularyMessage
  | ListVocabularyMessage
  | SearchVocabularyMessage
  | DeleteVocabularyMessage
  | ExportVocabularyMessage
  | GetTranslationSettingsMessage
  | SaveDeepSeekSettingsMessage
  | ClearDeepSeekSettingsMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

function hasOptionalString(record: Record<string, unknown>, key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(record, key) || typeof record[key] === "string";
}

const vocabularyEntryStringFields = [
  "id",
  "selectedText",
  "translation",
  "partOfSpeech",
  "contextualMeaning",
  "example",
  "paragraphContext",
  "sourceUrl",
  "pageTitle",
  "createdAt",
  "provider"
] as const;

function hasValidKnownVocabularyEntryFields(entry: Record<string, unknown>): boolean {
  return vocabularyEntryStringFields.every(
    (field) => !Object.prototype.hasOwnProperty.call(entry, field) || typeof entry[field] === "string"
  );
}

export function isTranslateSelectionMessage(value: unknown): value is TranslateSelectionMessage {
  return (
    isRecord(value) &&
    value.type === MessageType.TranslateSelection &&
    isRecord(value.payload) &&
    hasString(value.payload, "selectedText") &&
    hasString(value.payload, "paragraphContext") &&
    hasString(value.payload, "sourceUrl") &&
    hasString(value.payload, "pageTitle")
  );
}

export function isAddVocabularyMessage(value: unknown): value is AddVocabularyMessage {
  return (
    isRecord(value) &&
    value.type === MessageType.AddVocabulary &&
    isRecord(value.payload) &&
    isRecord(value.payload.entry) &&
    hasValidKnownVocabularyEntryFields(value.payload.entry)
  );
}

export function isListVocabularyMessage(value: unknown): value is ListVocabularyMessage {
  return isRecord(value) && value.type === MessageType.ListVocabulary;
}

export function isSearchVocabularyMessage(value: unknown): value is SearchVocabularyMessage {
  return isRecord(value) && value.type === MessageType.SearchVocabulary && isRecord(value.payload) && hasString(value.payload, "query");
}

export function isDeleteVocabularyMessage(value: unknown): value is DeleteVocabularyMessage {
  return isRecord(value) && value.type === MessageType.DeleteVocabulary && isRecord(value.payload) && hasString(value.payload, "id");
}

export function isExportVocabularyMessage(value: unknown): value is ExportVocabularyMessage {
  return (
    isRecord(value) &&
    value.type === MessageType.ExportVocabulary &&
    isRecord(value.payload) &&
    (value.payload.format === "json" || value.payload.format === "csv")
  );
}

export function isGetTranslationSettingsMessage(value: unknown): value is GetTranslationSettingsMessage {
  return isRecord(value) && value.type === MessageType.GetTranslationSettings;
}

export function isSaveDeepSeekSettingsMessage(value: unknown): value is SaveDeepSeekSettingsMessage {
  return (
    isRecord(value) &&
    value.type === MessageType.SaveDeepSeekSettings &&
    isRecord(value.payload) &&
    hasString(value.payload, "apiKey") &&
    hasOptionalString(value.payload, "model")
  );
}

export function isClearDeepSeekSettingsMessage(value: unknown): value is ClearDeepSeekSettingsMessage {
  return isRecord(value) && value.type === MessageType.ClearDeepSeekSettings;
}

export function isTranslationSettingsView(value: unknown): value is TranslationSettingsView {
  return (
    isRecord(value) &&
    (value.provider === "local" || value.provider === "deepseek") &&
    isRecord(value.deepseek) &&
    typeof value.deepseek.hasApiKey === "boolean" &&
    value.deepseek.apiKey === "" &&
    typeof value.deepseek.model === "string"
  );
}
