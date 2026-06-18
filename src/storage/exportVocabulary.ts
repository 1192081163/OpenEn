import type { VocabularyEntry } from "../shared/types";

const CSV_COLUMNS: Array<keyof VocabularyEntry> = [
  "selectedText",
  "baseForm",
  "translation",
  "partOfSpeech",
  "contextualMeaning",
  "example",
  "paragraphContext",
  "sourceUrl",
  "pageTitle",
  "createdAt",
  "provider"
];

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const neutralizedText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(neutralizedText)) return `"${neutralizedText.replace(/"/g, '""')}"`;
  return neutralizedText;
}

export function exportVocabularyAsJson(entries: VocabularyEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export function exportVocabularyAsCsv(entries: VocabularyEntry[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = entries.map((entry) => CSV_COLUMNS.map((column) => csvCell(entry[column])).join(","));
  return [header, ...rows].join("\n");
}
