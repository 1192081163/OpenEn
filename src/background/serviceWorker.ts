import { createTranslationProviderFromSettings } from "../providers/providerFactory";
import { createChromeTranslationSettingsStore } from "../settings/translationSettings";
import { createChromeVocabularyHighlightSettingsStore } from "../settings/vocabularyHighlightSettings";
import { getWebExtensionApi } from "../shared/webExtensionApi";
import { createChromeVocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler } from "./handlers";

const extensionApi = getWebExtensionApi();
const settingsStore = createChromeTranslationSettingsStore();
const highlightSettingsStore = createChromeVocabularyHighlightSettingsStore();

const handleMessage = createBackgroundHandler({
  provider: {
    async translate(request) {
      const settings = await settingsStore.load();
      return createTranslationProviderFromSettings(settings).translate(request);
    }
  },
  store: createChromeVocabularyStore(),
  settingsStore,
  highlightSettingsStore
});

extensionApi.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
