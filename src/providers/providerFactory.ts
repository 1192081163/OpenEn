import type { TranslationSettings } from "../settings/translationSettings";
import { createChineseFakeTranslationProvider } from "./chineseFakeTranslationProvider";
import { createDeepSeekTranslationProvider } from "./deepseekTranslationProvider";
import type { TranslationProvider } from "./translationProvider";

interface ProviderFactoryOptions {
  fetchImpl?: typeof fetch;
}

export function createTranslationProviderFromSettings(
  settings: TranslationSettings,
  options: ProviderFactoryOptions = {}
): TranslationProvider {
  if (settings.provider === "deepseek" && settings.deepseek.apiKey.trim()) {
    return createDeepSeekTranslationProvider({
      apiKey: settings.deepseek.apiKey,
      model: settings.deepseek.model,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
    });
  }

  return createChineseFakeTranslationProvider();
}
