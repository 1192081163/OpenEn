import type { TranslationRequest, TranslationResult } from "../shared/types";

export interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
