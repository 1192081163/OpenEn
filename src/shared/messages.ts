import type { ExportFormat, SelectionPayload, VocabularyEntry } from "./types";

export enum MessageType {
  TranslateSelection = "TRANSLATE_SELECTION",
  AddVocabulary = "ADD_VOCABULARY",
  ListVocabulary = "LIST_VOCABULARY",
  SearchVocabulary = "SEARCH_VOCABULARY",
  DeleteVocabulary = "DELETE_VOCABULARY",
  ExportVocabulary = "EXPORT_VOCABULARY"
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

export type OpenEnMessage =
  | TranslateSelectionMessage
  | AddVocabularyMessage
  | ListVocabularyMessage
  | SearchVocabularyMessage
  | DeleteVocabularyMessage
  | ExportVocabularyMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

export function isTranslateSelectionMessage(value: unknown): value is TranslateSelectionMessage {
  if (!isRecord(value) || value.type !== MessageType.TranslateSelection || !isRecord(value.payload)) return false;
  return (
    hasString(value.payload, "selectedText") &&
    hasString(value.payload, "paragraphContext") &&
    hasString(value.payload, "sourceUrl") &&
    hasString(value.payload, "pageTitle")
  );
}

export function isAddVocabularyMessage(value: unknown): value is AddVocabularyMessage {
  return isRecord(value) && value.type === MessageType.AddVocabulary && isRecord(value.payload) && isRecord(value.payload.entry);
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
