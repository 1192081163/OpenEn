import { MessageType } from "../../shared/messages";
import type { VocabularyEntry } from "../../shared/types";
import { initPopup, renderPopup } from "./popup";

const entries: VocabularyEntry[] = [
  {
    id: "1",
    selectedText: "lead",
    translation: "lead as guide",
    contextualMeaning: "guide",
    paragraphContext: "She will lead the review.",
    sourceUrl: "https://example.com",
    pageTitle: "Example",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake"
  }
];

describe("popup UI", () => {
  beforeEach(() => {
    document.body.innerHTML = `<main><button id="openVocabulary"></button><ul id="recentWords"></ul></main>`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders recent words and opens vocabulary page", () => {
    const openVocabulary = vi.fn();
    renderPopup({ entries, openVocabulary });

    expect(document.body.textContent).toContain("lead");
    (document.querySelector("#openVocabulary") as HTMLButtonElement).click();
    expect(openVocabulary).toHaveBeenCalledOnce();
  });

  it("renders empty vocabulary state distinctly", () => {
    renderPopup({ entries: [], openVocabulary: vi.fn() });

    expect(document.body.textContent).toContain("No saved words yet.");
    expect(document.body.textContent).not.toContain("Unable to load saved words.");
  });

  it("renders load failure state for failed background response", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: false, error: "Store unavailable" });

    await initPopup({ sendMessage, openOptionsPage: vi.fn() });

    expect(sendMessage).toHaveBeenCalledWith({ type: MessageType.ListVocabulary });
    expect(document.body.textContent).toContain("Unable to load saved words.");
    expect(document.body.textContent).not.toContain("No saved words yet.");
  });

  it("renders load failure state when background request rejects", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("Runtime unavailable"));

    await initPopup({ sendMessage, openOptionsPage: vi.fn() });

    expect(document.body.textContent).toContain("Unable to load saved words.");
    expect(document.body.textContent).not.toContain("No saved words yet.");
  });

  it("does not auto-start with partial chrome runtime globals", async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", { runtime: {} });

    await import("./popup");

    expect(document.body.textContent).not.toContain("Unable to load saved words.");
    expect(() => (document.querySelector("#openVocabulary") as HTMLButtonElement).click()).not.toThrow();
  });

  it("does not duplicate open vocabulary handler across renders", () => {
    const firstOpenVocabulary = vi.fn();
    const secondOpenVocabulary = vi.fn();

    renderPopup({ entries, openVocabulary: firstOpenVocabulary });
    renderPopup({ entries, openVocabulary: secondOpenVocabulary });
    (document.querySelector("#openVocabulary") as HTMLButtonElement).click();

    expect(firstOpenVocabulary).not.toHaveBeenCalled();
    expect(secondOpenVocabulary).toHaveBeenCalledOnce();
  });
});
