import type { TranslationProvider } from "../providers/translationProvider";
import {
  isAddVocabularyMessage,
  isClearDeepSeekSettingsMessage,
  isDeleteVocabularyMessage,
  isExportVocabularyMessage,
  isGetTranslationSettingsMessage,
  isGetVocabularyHighlightSettingsMessage,
  isListVocabularyMessage,
  isSaveDeepSeekSettingsMessage,
  isSaveVocabularyHighlightSettingsMessage,
  isSearchVocabularyMessage,
  isTranslateSelectionMessage,
  type AddVocabularyMessage,
  type ClearDeepSeekSettingsMessage,
  type DeleteVocabularyMessage,
  type ExportVocabularyMessage,
  type GetTranslationSettingsMessage,
  type GetVocabularyHighlightSettingsMessage,
  type ListVocabularyMessage,
  type SaveDeepSeekSettingsMessage,
  type SaveVocabularyHighlightSettingsMessage,
  type SearchVocabularyMessage,
  type TranslateSelectionMessage
} from "../shared/messages";
import type {
  TranslationResult,
  TranslationSettingsView,
  VocabularyEntry,
  VocabularyHighlightSettingsView
} from "../shared/types";
import type { TranslationSettings, TranslationSettingsStore } from "../settings/translationSettings";
import type { VocabularyHighlightSettingsStore } from "../settings/vocabularyHighlightSettings";
import { exportVocabularyAsCsv, exportVocabularyAsJson } from "../storage/exportVocabulary";
import type { VocabularyStore } from "../storage/vocabularyStore";

type SuccessResponse<T> = { ok: true; data: T };
type FailureResponse = { ok: false; error: string };

export type BackgroundResponse<T = unknown> = SuccessResponse<T> | FailureResponse;

interface HandlerDependencies {
  provider: TranslationProvider;
  store: VocabularyStore;
  settingsStore?: TranslationSettingsStore;
  highlightSettingsStore?: VocabularyHighlightSettingsStore;
  now?: () => Date;
  idFactory?: () => string;
}

type BackgroundHandler = {
  (message: TranslateSelectionMessage): Promise<BackgroundResponse<TranslationResult>>;
  (message: AddVocabularyMessage): Promise<BackgroundResponse<VocabularyEntry>>;
  (message: ListVocabularyMessage): Promise<BackgroundResponse<VocabularyEntry[]>>;
  (message: SearchVocabularyMessage): Promise<BackgroundResponse<VocabularyEntry[]>>;
  (message: DeleteVocabularyMessage): Promise<BackgroundResponse<{ id: string }>>;
  (message: ExportVocabularyMessage): Promise<BackgroundResponse<string>>;
  (message: GetTranslationSettingsMessage): Promise<BackgroundResponse<TranslationSettingsView>>;
  (message: SaveDeepSeekSettingsMessage): Promise<BackgroundResponse<TranslationSettingsView>>;
  (message: ClearDeepSeekSettingsMessage): Promise<BackgroundResponse<TranslationSettingsView>>;
  (message: GetVocabularyHighlightSettingsMessage): Promise<BackgroundResponse<VocabularyHighlightSettingsView>>;
  (message: SaveVocabularyHighlightSettingsMessage): Promise<BackgroundResponse<VocabularyHighlightSettingsView>>;
  (message: unknown): Promise<BackgroundResponse>;
};

function success<T>(data: T): SuccessResponse<T> {
  return { ok: true, data };
}

function failure(error: string): FailureResponse {
  return { ok: false, error };
}

function toSettingsView(settings: TranslationSettings): TranslationSettingsView {
  return {
    provider: settings.provider,
    deepseek: {
      hasApiKey: Boolean(settings.deepseek.apiKey),
      apiKey: "",
      model: settings.deepseek.model
    }
  };
}

function completeEntry(partial: Partial<VocabularyEntry>, now: Date, id: string): VocabularyEntry {
  const { selectedText, translation, contextualMeaning, paragraphContext, sourceUrl } = partial;

  if (!selectedText || !translation || !contextualMeaning || !paragraphContext || !sourceUrl) {
    throw new Error("Missing required vocabulary fields");
  }

  const entry: VocabularyEntry = {
    id: partial.id ?? id,
    selectedText,
    translation,
    contextualMeaning,
    paragraphContext,
    sourceUrl,
    pageTitle: partial.pageTitle ?? "",
    createdAt: partial.createdAt ?? now.toISOString(),
    provider: partial.provider ?? "fake"
  };

  if (partial.baseForm !== undefined) entry.baseForm = partial.baseForm;
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

      if (isGetTranslationSettingsMessage(message)) {
        if (!dependencies.settingsStore) return failure("Translation settings unavailable");
        return success(toSettingsView(await dependencies.settingsStore.load()));
      }

      if (isSaveDeepSeekSettingsMessage(message)) {
        if (!dependencies.settingsStore) return failure("Translation settings unavailable");
        return success(toSettingsView(await dependencies.settingsStore.saveDeepSeek(message.payload)));
      }

    if (isClearDeepSeekSettingsMessage(message)) {
      if (!dependencies.settingsStore) return failure("Translation settings unavailable");
      return success(toSettingsView(await dependencies.settingsStore.clearDeepSeek()));
    }

    if (isGetVocabularyHighlightSettingsMessage(message)) {
      if (!dependencies.highlightSettingsStore) return failure("Vocabulary highlight settings unavailable");
      return success(await dependencies.highlightSettingsStore.load());
    }

    if (isSaveVocabularyHighlightSettingsMessage(message)) {
      if (!dependencies.highlightSettingsStore) return failure("Vocabulary highlight settings unavailable");
      return success(await dependencies.highlightSettingsStore.save(message.payload));
    }

    return failure("Unsupported message");
    } catch (error) {
      return failure(error instanceof Error ? error.message : "Unknown background error");
    }
  };

  return handleMessage as BackgroundHandler;
}
