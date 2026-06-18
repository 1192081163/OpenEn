import { MessageType } from "../shared/messages";
import type { VocabularyEntry } from "../shared/types";
import {
  applyVocabularyHighlights,
  clearVocabularyHighlights,
  getVocabularyHighlightTerms,
  startVocabularyHighlighter
} from "./vocabularyHighlighter";

type MessageResponse = { ok: boolean; data?: unknown; error?: string };

function entry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    id: "entry-1",
    selectedText: "leading",
    baseForm: "lead",
    translation: "带领",
    contextualMeaning: "Guide an activity.",
    paragraphContext: "She is leading the review.",
    sourceUrl: "https://example.com/article",
    pageTitle: "Article",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake",
    ...overrides
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("vocabulary highlighter", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds deduplicated English word terms from base forms and selected text", () => {
    expect(
      getVocabularyHighlightTerms([
        entry(),
        entry({ id: "entry-2", selectedText: "LEAD", baseForm: "lead" }),
        entry({ id: "entry-3", selectedText: "design review", baseForm: "review" }),
        entry({ id: "entry-4", selectedText: "a", baseForm: "a" })
      ])
    ).toEqual(["lead", "leading", "review"]);
  });

  it("highlights whole saved words without touching editable or code content", () => {
    document.body.innerHTML = `
      <p>She will lead the review, but leadership is different.</p>
      <input value="lead" />
      <code>lead</code>
    `;

    applyVocabularyHighlights(document.body, ["lead"]);

    const highlights = document.querySelectorAll("[data-openen-vocabulary-highlight]");
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.textContent).toBe("lead");
    expect(document.body.textContent).toContain("leadership");
    expect(document.querySelector("input")?.value).toBe("lead");
    expect(document.querySelector("code")?.querySelector("[data-openen-vocabulary-highlight]")).toBeNull();
  });

  it("clears highlighter markup and restores plain page text", () => {
    document.body.innerHTML = "<p>lead lead</p>";
    applyVocabularyHighlights(document.body, ["lead"]);

    clearVocabularyHighlights(document.body);

    expect(document.querySelector("[data-openen-vocabulary-highlight]")).toBeNull();
    expect(document.body.textContent).toBe("lead lead");
  });

  it("loads enabled settings, highlights saved words, and observes new page text", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "<p>lead now</p>";
    const sendMessage = vi.fn(async (message: unknown): Promise<MessageResponse> => {
      if ((message as { type?: unknown }).type === MessageType.GetVocabularyHighlightSettings) {
        return { ok: true, data: { enabled: true } };
      }
      if ((message as { type?: unknown }).type === MessageType.ListVocabulary) {
        return { ok: true, data: [entry()] };
      }
      return { ok: false, error: "unexpected message" };
    });

    const stop = startVocabularyHighlighter(sendMessage);
    await flushMicrotasks();

    expect(document.querySelectorAll("[data-openen-vocabulary-highlight]")).toHaveLength(1);
    document.body.append(document.createTextNode(" leading later"));
    await flushMicrotasks();
    vi.runOnlyPendingTimers();
    await flushMicrotasks();

    expect(document.querySelectorAll("[data-openen-vocabulary-highlight]")).toHaveLength(2);

    stop();
    expect(document.querySelector("[data-openen-vocabulary-highlight]")).toBeNull();
  });

  it("clears existing highlights when settings are disabled", async () => {
    document.body.innerHTML = "<p>lead now</p>";
    applyVocabularyHighlights(document.body, ["lead"]);
    const sendMessage = vi.fn(async (message: unknown): Promise<MessageResponse> => {
      if ((message as { type?: unknown }).type === MessageType.GetVocabularyHighlightSettings) {
        return { ok: true, data: { enabled: false } };
      }
      return { ok: false, error: "unexpected message" };
    });

    const stop = startVocabularyHighlighter(sendMessage);
    await flushMicrotasks();

    expect(document.querySelector("[data-openen-vocabulary-highlight]")).toBeNull();
    expect(sendMessage).not.toHaveBeenCalledWith({ type: MessageType.ListVocabulary });
    stop();
  });

  it("refreshes highlights when popup sends updated highlight settings", async () => {
    document.body.innerHTML = "<p>lead now</p>";
    let enabled = true;
    const listeners: Array<(message: unknown) => void> = [];
    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: {
          addListener(listener: (message: unknown) => void) {
            listeners.push(listener);
          },
          removeListener(listener: (message: unknown) => void) {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          }
        }
      }
    });
    const sendMessage = vi.fn(async (message: unknown): Promise<MessageResponse> => {
      if ((message as { type?: unknown }).type === MessageType.GetVocabularyHighlightSettings) {
        return { ok: true, data: { enabled } };
      }
      if ((message as { type?: unknown }).type === MessageType.ListVocabulary) {
        return { ok: true, data: [entry({ selectedText: "lead", baseForm: "lead" })] };
      }
      return { ok: false, error: "unexpected message" };
    });

    const stop = startVocabularyHighlighter(sendMessage);
    await flushMicrotasks();
    expect(document.querySelectorAll("[data-openen-vocabulary-highlight]")).toHaveLength(1);

    enabled = false;
    listeners[0]?.({ type: MessageType.SaveVocabularyHighlightSettings, payload: { enabled: false } });
    await flushMicrotasks();

    expect(document.querySelector("[data-openen-vocabulary-highlight]")).toBeNull();
    stop();
    expect(listeners).toHaveLength(0);
  });
});
