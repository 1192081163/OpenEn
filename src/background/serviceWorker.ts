import { createTranslationProviderFromSettings } from "../providers/providerFactory";
import { createChromeTranslationSettingsStore } from "../settings/translationSettings";
import { createChromeVocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler } from "./handlers";

const settingsStore = createChromeTranslationSettingsStore();

const handleMessage = createBackgroundHandler({
  provider: {
    async translate(request) {
      const settings = await settingsStore.load();
      return createTranslationProviderFromSettings(settings).translate(request);
    }
  },
  store: createChromeVocabularyStore(),
  settingsStore
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
