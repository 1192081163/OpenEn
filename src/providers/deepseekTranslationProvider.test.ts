import { createDeepSeekTranslationProvider } from "./deepseekTranslationProvider";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("createDeepSeekTranslationProvider", () => {
  it("sends a JSON-mode chat completion request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                baseForm: "lead",
                translation: "带领",
                partOfSpeech: "动词",
                contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
                example: "She will lead the review. 她将主持这次评审。",
                confidence: 0.93
              })
            }
          }
        ]
      })
    );

    const provider = createDeepSeekTranslationProvider({
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      fetchImpl
    });

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer sk-test",
      "content-type": "application/json"
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      stream: false,
      temperature: 0.2,
      thinking: { type: "disabled" }
    });
    expect(JSON.stringify(body.messages)).toContain("json");
    expect(JSON.stringify(body.messages)).toContain("baseForm");
    expect(JSON.stringify(body.messages)).toContain("She will lead design review tomorrow.");
    expect(result).toEqual({
      selectedText: "lead",
      baseForm: "lead",
      translation: "带领",
      partOfSpeech: "动词",
      contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
      example: "She will lead the review. 她将主持这次评审。",
      confidence: 0.93,
      provider: "deepseek"
    });
  });

  it("rejects non-2xx responses without exposing the api key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createJsonResponse({ error: { message: "bad key" } }, 401));
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-secret", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translate({
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        targetLang: "zh-CN"
      })
    ).rejects.toThrow("DeepSeek request failed with status 401");
  });

  it("rejects invalid model JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [{ finish_reason: "stop", message: { content: "not json" } }]
      })
    );
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translate({
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        targetLang: "zh-CN"
      })
    ).rejects.toThrow("DeepSeek returned invalid JSON");
  });

  it("rejects truncated responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            finish_reason: "length",
            message: { content: JSON.stringify({ translation: "带领", contextualMeaning: "说明" }) }
          }
        ]
      })
    );
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translate({
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        targetLang: "zh-CN"
      })
    ).rejects.toThrow("DeepSeek response was truncated");
  });

  it("rejects responses missing required fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translation: "" }) } }]
      })
    );
    const provider = createDeepSeekTranslationProvider({ apiKey: "sk-test", model: "deepseek-v4-flash", fetchImpl });

    await expect(
      provider.translate({
        selectedText: "lead",
        paragraphContext: "She will lead review.",
        targetLang: "zh-CN"
      })
    ).rejects.toThrow("DeepSeek response missing required fields");
  });
});
