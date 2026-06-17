import type { TranslationProvider } from "../providers/translationProvider";
import {
  isAddVocabularyMessage,
  isDeleteVocabularyMessage,
  isExportVocabularyMessage,
  isListVocabularyMessage,
  isSearchVocabularyMessage,
  isTranslateSelectionMessage,
  type AddVocabularyMessage,
  type DeleteVocabularyMessage,
  type ExportVocabularyMessage,
  type ListVocabularyMessage,
  type SearchVocabularyMessage,
  type TranslateSelectionMessage
} from "../shared/messages";
import type { TranslationResult, VocabularyEntry } from "../shared/types";
import { exportVocabularyAsCsv, exportVocabularyAsJson } from "../storage/exportVocabulary";
import type { VocabularyStore } from "../storage/vocabularyStore";

type SuccessResponse<T> = { ok: true; data: T };
type FailureResponse = { ok: false; error: string };
export type BackgroundResponse<T = unknown> = SuccessResponse<T> | FailureResponse;
type NonEmptyVocabularyEntries = [VocabularyEntry, ...VocabularyEntry[]];

interface HandlerDependencies {
  provider: TranslationProvider;
  store: VocabularyStore;
  now?: () => Date;
  idFactory?: () => string;
}

type BackgroundHandler = {
  (message: TranslateSelectionMessage): Promise<SuccessResponse<TranslationResult>>;
  (message: AddVocabularyMessage): Promise<SuccessResponse<VocabularyEntry>>;
  (message: ListVocabularyMessage): Promise<SuccessResponse<NonEmptyVocabularyEntries>>;
  (message: SearchVocabularyMessage): Promise<SuccessResponse<VocabularyEntry[]>>;
  (message: DeleteVocabularyMessage): Promise<SuccessResponse<{ id: string }>>;
  (message: ExportVocabularyMessage): Promise<SuccessResponse<string>>;
  (message: unknown): Promise<BackgroundResponse>;
};

function success<T>(data: T): SuccessResponse<T> {
  return { ok: true, data };
}

function failure(error: string): FailureResponse {
  return { ok: false, error };
}

function completeEntry(partial: Partial<VocabularyEntry>, now: Date, id: string): VocabularyEntry {
  const { selectedText, translation, contextualMeaning, paragraphContext, sourceUrl } = partial;

  if (!selectedText || !translation || !contextualMeaning || !paragraphContext || !sourceUrl) {
    throw new Error("Missing required vocabulary fields");
  }

  const entry: VocabularyEntry = {
    id,
    selectedText,
    translation,
    contextualMeaning,
    paragraphContext,
    sourceUrl,
    pageTitle: partial.pageTitle ?? "",
    createdAt: partial.createdAt ?? now.toISOString(),
    provider: partial.provider ?? "fake"
  };

  if (partial.partOfSpeech !== undefined) entry.partOfSpeech = partial.partOfSpeech;
  if (partial.example !== undefined) entry.example = partial.example;

  return entry;
}

export function createBackgroundHandler(dependencies: HandlerDependencies): BackgroundHandler {
  const now = dependencies.now ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());

  const handleMessage = async (message: unknown): Promise<BackgroundResponse> => {
    try {
      if (isTranslateSelectionMessage(message)) {
        const result = await dependencies.provider.translate({
          selectedText: message.payload.selectedText,
          paragraphContext: message.payload.paragraphContext,
          targetLang: "zh-CN"
        });
        return success(result);
      }

      if (isAddVocabularyMessage(message)) {
        const entry = completeEntry(message.payload.entry, now(), idFactory());
        return success(await dependencies.store.add(entry));
      }

      if (isListVocabularyMessage(message)) return success(await dependencies.store.list());

      if (isSearchVocabularyMessage(message)) return success(await dependencies.store.search(message.payload.query));

      if (isDeleteVocabularyMessage(message)) {
        await dependencies.store.delete(message.payload.id);
        return success({ id: message.payload.id });
      }

      if (isExportVocabularyMessage(message)) {
        const entries = await dependencies.store.list();
        return success(message.payload.format === "json" ? exportVocabularyAsJson(entries) : exportVocabularyAsCsv(entries));
      }

      return failure("Unsupported message");
    } catch (error) {
      return failure(error instanceof Error ? error.message : "Unknown background error");
    }
  };

  return handleMessage as BackgroundHandler;
}
