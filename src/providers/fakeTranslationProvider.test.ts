import { createFakeTranslationProvider } from "./fakeTranslationProvider";

describe("fake translation provider", () => {
  it("uses paragraph context to distinguish lead as a verb", async () => {
    const provider = createFakeTranslationProvider();
    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead the design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(result.translation).toContain("lead as guide");
    expect(result.contextualMeaning).toContain("guide");
    expect(result.provider).toBe("fake");
  });

  it("uses paragraph context to distinguish lead as a metal", async () => {
    const provider = createFakeTranslationProvider();
    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "The old pipe was made of lead and needed replacement.",
      targetLang: "zh-CN"
    });

    expect(result.translation).toContain("lead as metal");
    expect(result.contextualMeaning).toContain("metal");
  });

  it("returns a deterministic fallback for unknown text", async () => {
    const provider = createFakeTranslationProvider();
    const result = await provider.translate({
      selectedText: "contextual",
      paragraphContext: "Contextual clues change the meaning of a word.",
      targetLang: "zh-CN"
    });

    expect(result.translation).toBe("Fake zh-CN translation for contextual");
    expect(result.contextualMeaning).toContain("Contextual clues");
  });
});
