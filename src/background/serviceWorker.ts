import { createFakeTranslationProvider } from "../providers/fakeTranslationProvider";
import { createChromeVocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler } from "./handlers";

const handleMessage = createBackgroundHandler({
  provider: createFakeTranslationProvider(),
  store: createChromeVocabularyStore()
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
