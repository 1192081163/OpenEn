import { readFileSync } from "node:fs";

import { MessageType } from "../../shared/messages";
import type { VocabularyEntry } from "../../shared/types";
import { initPopup, renderPopup } from "./popup";

const entries: VocabularyEntry[] = [
  {
    id: "1",
    selectedText: "lead",
    translation: "lead as guide",
    contextualMeaning: "guide",
    paragraphContext: "She will lead review.",
    sourceUrl: "https://example.com",
    pageTitle: "Example",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake"
  }
];

function renderPopupShell(): void {
  document.body.innerHTML = `
    <main>
      <button id="openVocabulary" type="button"></button>
      <form id="translationSettings">
        <span id="providerStatus"></span>
        <input id="deepseekApiKey" />
        <input id="deepseekModel" />
        <button id="saveDeepSeek" type="submit"></button>
        <button id="clearDeepSeek" type="button"></button>
      </form>
      <label class="switch-row">
        <span class="switch-label">划词气泡</span>
        <input id="translationBubble" class="switch-input" type="checkbox" role="switch" />
        <span class="switch-track" aria-hidden="true">
          <span class="switch-thumb"></span>
        </span>
      </label>
      <label class="switch-row">
        <span class="switch-label">高亮生词</span>
        <input id="highlightVocabulary" class="switch-input" type="checkbox" role="switch" />
        <span class="switch-track" aria-hidden="true">
          <span class="switch-thumb"></span>
        </span>
      </label>
      <ul id="recentWords"></ul>
    </main>
  `;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("popup UI", () => {
  beforeEach(() => {
    renderPopupShell();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders recent words and opens the vocabulary page", () => {
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

  it("renders provider settings and saves deepseek key", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: entries })
.mockResolvedValueOnce({
ok: true,
data: { provider: "local", deepseek: { hasApiKey: false, model: "deepseek-v4-flash", apiKey: "" } }
})
.mockResolvedValueOnce({ ok: true, data: { enabled: true } })
.mockResolvedValueOnce({ ok: true, data: { enabled: true } })
.mockResolvedValueOnce({
ok: true,
data: { provider: "deepseek", deepseek: { hasApiKey: true, model: "deepseek-v4-flash", apiKey: "" } }
      });

    await initPopup({ sendMessage, openOptionsPage: vi.fn() });

    (document.querySelector("#deepseekApiKey") as HTMLInputElement).value = "sk-test";
    (document.querySelector("#deepseekModel") as HTMLInputElement).value = "deepseek-v4-flash";
    (document.querySelector("#translationSettings") as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    await flushMicrotasks();

    expect(sendMessage).toHaveBeenCalledWith({
      type: MessageType.SaveDeepSeekSettings,
      payload: { apiKey: "sk-test", model: "deepseek-v4-flash" }
    });
    expect(document.body.textContent).toContain("DeepSeek 已启用");
    expect((document.querySelector("#deepseekApiKey") as HTMLInputElement).value).toBe("");
  });

  it("clears deepseek settings", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: entries })
.mockResolvedValueOnce({
ok: true,
data: { provider: "deepseek", deepseek: { hasApiKey: true, model: "deepseek-v4-flash", apiKey: "" } }
})
.mockResolvedValueOnce({ ok: true, data: { enabled: true } })
.mockResolvedValueOnce({ ok: true, data: { enabled: true } })
.mockResolvedValueOnce({
ok: true,
data: { provider: "local", deepseek: { hasApiKey: false, model: "deepseek-v4-flash", apiKey: "" } }
      });

    await initPopup({ sendMessage, openOptionsPage: vi.fn() });
    (document.querySelector("#clearDeepSeek") as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(sendMessage).toHaveBeenCalledWith({ type: MessageType.ClearDeepSeekSettings });
    expect(document.body.textContent).toContain("本地中文模式");
  });

  it("loads and saves vocabulary highlight toggle", async () => {
    const notifyVocabularyHighlightSettingsChanged = vi.fn();
    const sendMessage = vi.fn(async (message: unknown) => {
      if ((message as { type?: unknown }).type === MessageType.ListVocabulary) {
        return { ok: true, data: entries };
      }
      if ((message as { type?: unknown }).type === MessageType.GetTranslationSettings) {
        return {
          ok: true,
          data: {
            provider: "local",
            deepseek: { hasApiKey: false, apiKey: "", model: "deepseek-v4-flash" }
          }
        };
      }
      if ((message as { type?: unknown }).type === MessageType.GetVocabularyHighlightSettings) {
        return { ok: true, data: { enabled: true } };
      }
      if ((message as { type?: unknown }).type === MessageType.SaveVocabularyHighlightSettings) {
        return { ok: true, data: { enabled: false } };
      }
      return { ok: false, error: "unexpected message" };
    });

    await initPopup({
      sendMessage,
      openOptionsPage: vi.fn(),
      notifyVocabularyHighlightSettingsChanged
    });

    const checkbox = document.querySelector("#highlightVocabulary") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    await flushMicrotasks();

    expect(sendMessage).toHaveBeenCalledWith({
      type: MessageType.SaveVocabularyHighlightSettings,
      payload: { enabled: false }
    });
  expect(notifyVocabularyHighlightSettingsChanged).toHaveBeenCalledWith(false);
  });

  it("loads and saves translation bubble switch", async () => {
    const notifyTranslationBubbleSettingsChanged = vi.fn();
    const sendMessage = vi.fn(async (message: unknown) => {
      if ((message as { type?: unknown }).type === MessageType.ListVocabulary) {
        return { ok: true, data: entries };
      }
      if ((message as { type?: unknown }).type === MessageType.GetTranslationSettings) {
        return {
          ok: true,
          data: {
            provider: "local",
            deepseek: { hasApiKey: false, apiKey: "", model: "deepseek-v4-flash" }
          }
        };
      }
      if ((message as { type?: unknown }).type === MessageType.GetVocabularyHighlightSettings) {
        return { ok: true, data: { enabled: true } };
      }
      if ((message as { type?: unknown }).type === MessageType.GetTranslationBubbleSettings) {
        return { ok: true, data: { enabled: true } };
      }
      if ((message as { type?: unknown }).type === MessageType.SaveTranslationBubbleSettings) {
        return { ok: true, data: { enabled: false } };
      }
      return { ok: false, error: "unexpected message" };
    });

    await initPopup({
      sendMessage,
      openOptionsPage: vi.fn(),
      notifyTranslationBubbleSettingsChanged
    });

    const switchInput = document.querySelector("#translationBubble") as HTMLInputElement;
    expect(switchInput.checked).toBe(true);

    switchInput.checked = false;
    switchInput.dispatchEvent(new Event("change"));
    await flushMicrotasks();

    expect(sendMessage).toHaveBeenCalledWith({
      type: MessageType.SaveTranslationBubbleSettings,
      payload: { enabled: false }
    });
    expect(notifyTranslationBubbleSettingsChanged).toHaveBeenCalledWith(false);
  });

  it("uses Chinese labels for popup buttons", () => {
    const html = readFileSync("src/ui/popup/popup.html", "utf8");

  expect(html).toContain('id="openVocabulary" type="button">生词本</button>');
  expect(html).toContain('id="saveDeepSeek" type="submit">保存</button>');
  expect(html).toContain('id="clearDeepSeek" type="button">清除</button>');
  expect(html).toContain("划词气泡");
  expect(html).toContain("高亮生词");
  });

  it("renders vocabulary highlight as a switch control", () => {
    const html = readFileSync("src/ui/popup/popup.html", "utf8");
    const css = readFileSync("src/ui/popup/popup.css", "utf8");

    expect(html).toContain('class="switch-row"');
    expect(html).toContain('id="highlightVocabulary"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('class="switch-track"');
    expect(html).toContain('class="switch-thumb"');
    expect(css).toContain(".switch-track");
    expect(css).toContain(".switch-input:checked + .switch-track");
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
