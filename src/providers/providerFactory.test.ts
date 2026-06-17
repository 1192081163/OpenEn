import { createTranslationProviderFromSettings } from "./providerFactory";

describe("createTranslationProviderFromSettings", () => {
  it("uses Chinese fake provider when settings are local", async () => {
    const provider = createTranslationProviderFromSettings({
      provider: "local",
      deepseek: { apiKey: "", model: "deepseek-v4-flash" }
    });

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(result.translation).toBe("带领；主持");
    expect(result.provider).toBe("fake");
  });

  it("uses DeepSeek provider when api key is configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify({ translation: "带领", contextualMeaning: "说明" }) }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const provider = createTranslationProviderFromSettings(
      {
        provider: "deepseek",
        deepseek: { apiKey: "sk-test", model: "deepseek-v4-flash" }
      },
      { fetchImpl }
    );

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(result.provider).toBe("deepseek");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
