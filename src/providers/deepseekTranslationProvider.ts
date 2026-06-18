import type { TranslationRequest, TranslationResult } from "../shared/types";
import type { TranslationProvider } from "./translationProvider";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface DeepSeekProviderOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

interface DeepSeekJsonResult {
  baseForm?: unknown;
  translation?: unknown;
  partOfSpeech?: unknown;
  contextualMeaning?: unknown;
  example?: unknown;
  confidence?: unknown;
}

function clampConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseDeepSeekContent(content: string): DeepSeekJsonResult {
  try {
    return JSON.parse(content) as DeepSeekJsonResult;
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }
}

function buildMessages(request: TranslationRequest): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content:
        "You are a precise English-to-Simplified-Chinese dictionary translator. Output only json. " +
        "Return valid JSON with baseForm, translation, partOfSpeech, contextualMeaning, example, and confidence."
    },
    {
      role: "user",
      content: JSON.stringify({
        instruction:
          "Translate the selected English text into Simplified Chinese using the paragraph context. Output json only.",
        selectedText: request.selectedText,
        paragraphContext: request.paragraphContext,
        targetLang: request.targetLang,
        exampleJson: {
          baseForm: "lead",
          translation: "带领",
          partOfSpeech: "动词",
          contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
          example: "She will lead the review. 她将主持这次评审。",
          confidence: 0.9
        }
      })
    }
  ];
}

export function createDeepSeekTranslationProvider(options: DeepSeekProviderOptions): TranslationProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      const response = await fetchImpl(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          messages: buildMessages(request),
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          stream: false,
          temperature: 0.2,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
      };
      const choice = payload.choices?.[0];

      if (choice?.finish_reason === "length") {
        throw new Error("DeepSeek response was truncated");
      }

      const content = choice?.message?.content;
      if (!content) {
        throw new Error("DeepSeek returned empty content");
      }

      const parsed = parseDeepSeekContent(content);
      const baseForm = optionalString(parsed.baseForm);
      const translation = optionalString(parsed.translation);
      const contextualMeaning = optionalString(parsed.contextualMeaning);
      const partOfSpeech = optionalString(parsed.partOfSpeech);
      const example = optionalString(parsed.example);
      const confidence = clampConfidence(parsed.confidence);

      if (!translation || !contextualMeaning) {
        throw new Error("DeepSeek response missing required fields");
      }

      return {
        selectedText: request.selectedText,
        ...(baseForm ? { baseForm } : {}),
        translation,
        contextualMeaning,
        ...(partOfSpeech ? { partOfSpeech } : {}),
        ...(example ? { example } : {}),
        ...(confidence !== undefined ? { confidence } : {}),
        provider: "deepseek"
      };
    }
  };
}
