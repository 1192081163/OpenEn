import { createChineseFakeTranslationProvider } from "./chineseFakeTranslationProvider";

describe("createChineseFakeTranslationProvider", () => {
  it("translates lead as a verb using paragraph context", async () => {
    const provider = createChineseFakeTranslationProvider();

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

expect(result).toMatchObject({
selectedText: "lead",
baseForm: "lead",
translation: "带领；主持",
      partOfSpeech: "动词",
      contextualMeaning: "在这段话中，lead 表示带领或主持某项活动。",
      provider: "fake"
    });
  });

  it("translates lead as a metal using paragraph context", async () => {
    const provider = createChineseFakeTranslationProvider();

    const result = await provider.translate({
      selectedText: "lead",
      paragraphContext: "The old pipe contained lead paint and heavy metal residue.",
      targetLang: "zh-CN"
    });

expect(result).toMatchObject({
selectedText: "lead",
baseForm: "lead",
translation: "铅",
      partOfSpeech: "名词",
      contextualMeaning: "在这段话中，lead 表示一种有毒的重金属。",
      provider: "fake"
    });
  });

  it("returns a Chinese fallback for unknown selected text", async () => {
    const provider = createChineseFakeTranslationProvider();

    const result = await provider.translate({
      selectedText: "review",
      paragraphContext: "She will lead design review tomorrow.",
      targetLang: "zh-CN"
    });

    expect(result.translation).toBe("review 的中文释义");
    expect(result.contextualMeaning).toContain("基于上下文");
    expect(result.provider).toBe("fake");
  });
});

it("normalizes common lead inflections to the same base form", async () => {
const provider = createChineseFakeTranslationProvider();

await expect(
provider.translate({
selectedText: "leading",
paragraphContext: "She is leading design review tomorrow.",
targetLang: "zh-CN"
})
).resolves.toMatchObject({
selectedText: "leading",
baseForm: "lead",
translation: "带领；主持"
});

await expect(
provider.translate({
selectedText: "led",
paragraphContext: "She led design review yesterday.",
targetLang: "zh-CN"
})
).resolves.toMatchObject({
selectedText: "led",
baseForm: "lead",
translation: "带领；主持"
});
});
