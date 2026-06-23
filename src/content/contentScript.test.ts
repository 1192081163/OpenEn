import { MessageType } from "../shared/messages";
import type { SelectionPayload, TranslationResult } from "../shared/types";
import { handleSelectionPayload, startContentScript } from "./contentScript";

type MessageResponse = { ok: boolean; data?: unknown; error?: string };

const payload: SelectionPayload = {
  selectedText: "lead",
  paragraphContext: "She will lead the review.",
  sourceUrl: "https://example.com",
  pageTitle: "Example"
};

function translationResult(overrides: Partial<TranslationResult> = {}): TranslationResult {
  const selectedText = overrides.selectedText ?? "lead";
  return {
    selectedText,
    baseForm: selectedText === "review" ? "review" : "lead",
    translation: "带领；主持",
    partOfSpeech: "verb",
    contextualMeaning: "Guide an activity.",
    example: "She will lead the review.",
    phrase: "lead a review",
    provider: "fake",
    ...overrides
  };
}

function expectedSaveMessage(result: TranslationResult) {
  return {
    type: MessageType.AddVocabulary,
    payload: {
      entry: {
        ...result,
        paragraphContext: payload.paragraphContext,
        sourceUrl: payload.sourceUrl,
        pageTitle: payload.pageTitle
      }
    }
  };
}

function tooltipHost(): HTMLElement | null {
  return document.querySelector("[data-openen-tooltip]");
}

function tooltipText(): string {
  return tooltipHost()?.shadowRoot?.textContent ?? "";
}

function saveButton(): HTMLButtonElement {
  const host = tooltipHost();
  expect(host).toBeInstanceOf(HTMLElement);

  const save = host?.shadowRoot?.querySelector("[data-openen-save]");
  expect(save).toBeInstanceOf(HTMLButtonElement);
  return save as HTMLButtonElement;
}

function translateButton(): HTMLButtonElement {
  const host = tooltipHost();
  expect(host).toBeInstanceOf(HTMLElement);

  const translate = host?.shadowRoot?.querySelector("[data-openen-translate]");
  expect(translate).toBeInstanceOf(HTMLButtonElement);
  return translate as HTMLButtonElement;
}

function retryButton(): HTMLButtonElement {
  const host = tooltipHost();
  expect(host).toBeInstanceOf(HTMLElement);

  const retry = host?.shadowRoot?.querySelector("[data-openen-retry]");
  expect(retry).toBeInstanceOf(HTMLButtonElement);
  return retry as HTMLButtonElement;
}

function refreshButton(): HTMLButtonElement {
  const host = tooltipHost();
  expect(host).toBeInstanceOf(HTMLElement);

  const refresh = host?.shadowRoot?.querySelector("[data-openen-refresh]");
  expect(refresh).toBeInstanceOf(HTMLButtonElement);
  return refresh as HTMLButtonElement;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function selectText(query: string): void {
  document.title = "Example";
  document.body.innerHTML = "<p>She will lead the review.</p>";

  const node = document.querySelector("p")?.firstChild;
  if (!(node instanceof Text)) throw new Error("Missing text node");

  const start = node.data.indexOf(query);
  if (start < 0) throw new Error(`Missing selected text: ${query}`);

  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + query.length);
  Object.defineProperty(range, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(10, 10, 20, 10)
  });

  const selection = window.getSelection();
  if (!selection) throw new Error("Missing selection");
  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatchSelectionChange(): void {
  document.dispatchEvent(new Event("selectionchange"));
}

function savedVocabularyEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "saved",
    selectedText: "lead",
    baseForm: "lead",
    translation: "旧翻译",
    partOfSpeech: "verb",
    contextualMeaning: "Saved meaning.",
    example: "Saved example.",
    phrase: "lead a saved review",
    paragraphContext: payload.paragraphContext,
    sourceUrl: payload.sourceUrl,
    pageTitle: payload.pageTitle,
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake",
    ...overrides
  };
}

function deferredSendMessage() {
  const requests: Array<{
    message: unknown;
    resolve(response: MessageResponse | undefined): void;
    reject(error: unknown): void;
  }> = [];

  const sendMessage = vi.fn(
    (message: unknown) =>
      new Promise<MessageResponse | undefined>((resolve, reject) => {
        requests.push({ message, resolve, reject });
      })
  );

  return { requests, sendMessage };
}

describe("content script selection handling", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("requests translation only after manual action and saves full vocabulary payload", async () => {
    const sentMessages: unknown[] = [];
    const result = translationResult();

    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.SearchVocabulary) {
        return { ok: true, data: [] };
      }
      if ((message as { type?: unknown }).type === MessageType.AddVocabulary) {
        return { ok: true, data: { id: "saved", ...result } };
      }
      return { ok: true, data: result };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);

    expect(tooltipText()).toContain("lead");
    expect(translateButton().textContent).toBe("翻译");
    expect(sentMessages).toHaveLength(0);

    translateButton().click();
    await flushPromises();

    expect(sentMessages[0]).toEqual({ type: MessageType.TranslateSelection, payload });
    expect(tooltipText()).toContain("带领；主持");
    expect(tooltipText()).toContain("verb · lead");
    expect(tooltipText()).toContain(result.contextualMeaning);
    expect(tooltipText()).toContain(result.example ?? "");
    expect(tooltipText()).toContain(result.phrase ?? "");

    saveButton().click();
    await flushPromises();

    expect(sentMessages[1]).toEqual({ type: MessageType.SearchVocabulary, payload: { query: "lead" } });
    expect(sentMessages[2]).toEqual(expectedSaveMessage(result));
    expect(saveButton().textContent).toBe("已加入");
    expect(saveButton().disabled).toBe(true);
  });

  it("shows loading state while translation request is pending", async () => {
    const { requests, sendMessage } = deferredSendMessage();
    const result = translationResult();

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);

    translateButton().click();
    expect(tooltipText()).toContain("翻译中...");
    expect(translateButton().disabled).toBe(true);

    requests[0]?.resolve({ ok: true, data: result });
    await flushPromises();
    requests[1]?.resolve({ ok: true, data: [] });
    await flushPromises();

    expect(tooltipText()).toContain("带领；主持");
  });

  it.each([
    ["rejected translate request", async () => Promise.reject(new Error("network failed"))],
    ["missing translate response", async () => undefined],
    ["failed translate response", async () => ({ ok: false, error: "translation failed" })]
  ])("renders retry action for %s", async (_name, sendMessage) => {
    await expect(
      handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), vi.fn(sendMessage))
    ).resolves.toBeUndefined();

    translateButton().click();
    await flushPromises();

    expect(tooltipText()).toContain("lead");
    expect(tooltipText()).toContain("翻译失败，请重试");
    expect(retryButton().textContent).toBe("重试");
    expect(tooltipHost()?.shadowRoot?.querySelector("[data-openen-save]")).toBeNull();
  });

  it("retries a failed translation request", async () => {
    const sentMessages: unknown[] = [];
    const result = translationResult();
    let translateAttempts = 0;

    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.SearchVocabulary) {
        return { ok: true, data: [] };
      }
      translateAttempts += 1;
      return translateAttempts === 1 ? { ok: false, error: "translation failed" } : { ok: true, data: result };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);

    translateButton().click();
    await flushPromises();
    retryButton().click();
    await flushPromises();

    expect(tooltipText()).toContain("带领；主持");
    expect(sentMessages.filter((message) => (message as { type?: unknown }).type === MessageType.TranslateSelection)).toHaveLength(2);
  });

  it("keeps manual translate tooltip for malformed translation data", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      data: {
        selectedText: "lead",
        translation: 42,
        contextualMeaning: "Guide an activity.",
        provider: "fake"
      }
    }));

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);
    translateButton().click();
    await flushPromises();

    expect(tooltipText()).toContain("lead");
    expect(tooltipText()).toContain("翻译失败，请重试");
    expect(tooltipHost()?.shadowRoot?.querySelector("[data-openen-save]")).toBeNull();
  });

  it.each([
    ["rejected save request", async () => Promise.reject(new Error("save failed"))],
    ["failed save response", async () => ({ ok: false, error: "save failed" })]
  ])("handles %s without sending an invalid vocabulary payload", async (_name, saveResponse) => {
    const sentMessages: unknown[] = [];
    const result = translationResult();
    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.SearchVocabulary) {
        return { ok: true, data: [] };
      }
      if ((message as { type?: unknown }).type === MessageType.AddVocabulary) {
        return saveResponse();
      }
      return { ok: true, data: result };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);
    translateButton().click();
    await flushPromises();

    saveButton().click();
    await flushPromises();

    expect(sentMessages[2]).toEqual(expectedSaveMessage(result));
    expect(sentMessages).toHaveLength(3);
  });

  it("reuses cached translation for the same selection context", async () => {
    const sentMessages: unknown[] = [];
    const result = translationResult();
    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.SearchVocabulary) {
        return { ok: true, data: [] };
      }
      return { ok: true, data: result };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);
    translateButton().click();
    await flushPromises();

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);
    translateButton().click();
    await flushPromises();

    expect(tooltipText()).toContain("带领；主持");
    expect(sentMessages.filter((message) => (message as { type?: unknown }).type === MessageType.TranslateSelection)).toHaveLength(1);
  });

  it("shows already saved state for existing vocabulary entry", async () => {
    const sentMessages: unknown[] = [];
    const result = translationResult();
    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.SearchVocabulary) {
        return {
          ok: true,
          data: [
            {
              id: "saved",
              ...result,
              paragraphContext: payload.paragraphContext,
              sourceUrl: payload.sourceUrl,
              pageTitle: payload.pageTitle,
              createdAt: "2026-06-17T00:00:00.000Z"
            }
          ]
        };
      }
      return { ok: true, data: result };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);
    translateButton().click();
    await flushPromises();

    expect(saveButton().textContent).toBe("已加入");
    expect(saveButton().disabled).toBe(true);
    saveButton().click();
    await flushPromises();

    expect(sentMessages.some((message) => (message as { type?: unknown }).type === MessageType.AddVocabulary)).toBe(false);
  });

  it("shows saved vocabulary translation immediately when requested for highlighted text", async () => {
    const sentMessages: unknown[] = [];
    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.SearchVocabulary) {
        return { ok: true, data: [savedVocabularyEntry()] };
      }
      return { ok: false, error: "unexpected message" };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage, {
      preferSavedVocabulary: true
    });
    await flushPromises();

    expect(sentMessages).toEqual([{ type: MessageType.SearchVocabulary, payload: { query: "lead" } }]);
    expect(tooltipText()).toContain("旧翻译");
    expect(tooltipText()).toContain("verb · lead");
    expect(tooltipText()).toContain("Saved meaning.");
    expect(tooltipText()).toContain("Saved example.");
    expect(tooltipText()).toContain("lead a saved review");
    expect(tooltipHost()?.shadowRoot?.querySelector("[data-openen-translate]")).toBeNull();
    expect(refreshButton().textContent).toBe("重新翻译");
    expect(saveButton().textContent).toBe("已加入");
    expect(saveButton().disabled).toBe(true);
  });

  it("refreshes highlighted vocabulary translation without saving over old entry", async () => {
    const sentMessages: unknown[] = [];
    const refreshedResult = translationResult({ translation: "新翻译" });
    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.SearchVocabulary) {
        return { ok: true, data: [savedVocabularyEntry()] };
      }
      if ((message as { type?: unknown }).type === MessageType.TranslateSelection) {
        return { ok: true, data: refreshedResult };
      }
      if ((message as { type?: unknown }).type === MessageType.AddVocabulary) {
        throw new Error("refresh must not save vocabulary");
      }
      return { ok: false, error: "unexpected message" };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage, {
      preferSavedVocabulary: true
    });
    await flushPromises();
    refreshButton().click();
    await flushPromises();

    expect(tooltipText()).toContain("新翻译");
    expect(tooltipText()).not.toContain("旧翻译");
    expect(saveButton().textContent).toBe("已加入");
    expect(saveButton().disabled).toBe(true);
    expect(sentMessages.filter((message) => (message as { type?: unknown }).type === MessageType.TranslateSelection)).toHaveLength(1);
    expect(sentMessages.some((message) => (message as { type?: unknown }).type === MessageType.AddVocabulary)).toBe(false);
  });

  it("uses base form when checking existing vocabulary entries", async () => {
    const inflectedPayload: SelectionPayload = {
      ...payload,
      selectedText: "leading",
      paragraphContext: "She is leading the review."
    };
    const sentMessages: unknown[] = [];
    const result = translationResult({ selectedText: "leading", baseForm: "lead" });
    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.SearchVocabulary) {
        return {
          ok: true,
          data: [
            {
              id: "saved",
              selectedText: "lead",
              baseForm: "lead",
              translation: "带领；主持",
              contextualMeaning: "Guide an activity.",
              paragraphContext: payload.paragraphContext,
              sourceUrl: payload.sourceUrl,
              pageTitle: payload.pageTitle,
              createdAt: "2026-06-17T00:00:00.000Z",
              provider: "fake"
            }
          ]
        };
      }
      return { ok: true, data: result };
    });

    await handleSelectionPayload(inflectedPayload, new DOMRect(10, 10, 20, 10), sendMessage);
    translateButton().click();
    await flushPromises();

    expect(sentMessages[1]).toEqual({ type: MessageType.SearchVocabulary, payload: { query: "lead" } });
    expect(saveButton().textContent).toBe("已加入");
    expect(saveButton().disabled).toBe(true);
  });

  it("highlights saved vocabulary when content script starts", async () => {
    document.body.innerHTML = "<p>She will lead the review.</p>";
    const sendMessage = vi.fn(async (message: unknown) => {
      if ((message as { type?: unknown }).type === MessageType.GetVocabularyHighlightSettings) {
        return { ok: true, data: { enabled: true } };
      }
      if ((message as { type?: unknown }).type === MessageType.ListVocabulary) {
        return {
          ok: true,
          data: [
            {
              id: "saved",
              selectedText: "lead",
              baseForm: "lead",
              translation: "带领；主持",
              contextualMeaning: "Guide an activity.",
              paragraphContext: payload.paragraphContext,
              sourceUrl: payload.sourceUrl,
              pageTitle: payload.pageTitle,
              createdAt: "2026-06-17T00:00:00.000Z",
              provider: "fake"
            }
          ]
        };
      }
      return { ok: false, error: "unexpected message" };
    });

    cleanup = startContentScript(sendMessage);
    await flushPromises();

    const highlight = document.querySelector("[data-openen-vocabulary-highlight]");
    expect(highlight?.textContent).toBe("lead");
    expect(sendMessage).toHaveBeenCalledWith({ type: MessageType.GetVocabularyHighlightSettings });
    expect(sendMessage).toHaveBeenCalledWith({ type: MessageType.ListVocabulary });
  });

  it("does not show selection bubble when translation bubble is disabled", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(async () => ({ ok: true, data: translationResult() }));
    cleanup = startContentScript(sendMessage, {
      enableVocabularyHighlighting: false,
      enableTranslationBubble: false
    });

    selectText("lead");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(120);

    expect(tooltipHost()).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("removes an open selection bubble when translation bubble setting is disabled", async () => {
    vi.useFakeTimers();
    const listeners: Array<(message: unknown) => void> = [];
    vi.stubGlobal("browser", {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener: (message: unknown) => void) => listeners.push(listener)),
          removeListener: vi.fn()
        }
      }
    });
    const sendMessage = vi.fn(async () => ({ ok: true, data: translationResult() }));
    cleanup = startContentScript(sendMessage, { enableVocabularyHighlighting: false });

    selectText("lead");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(120);
    expect(tooltipText()).toContain("lead");

    listeners[0]?.({
      type: MessageType.SaveTranslationBubbleSettings,
      payload: { enabled: false }
    });

    expect(tooltipHost()).toBeNull();
  });

  it("debounces selection changes and prepares only the latest pending selection", async () => {
    vi.useFakeTimers();
    const { requests, sendMessage } = deferredSendMessage();
    cleanup = startContentScript(sendMessage, { enableVocabularyHighlighting: false });

    selectText("lead");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(60);

    selectText("review");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(119);
    expect(sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(tooltipText()).toContain("review");
    expect(tooltipText()).not.toContain("lead");

    translateButton().click();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(requests[0]?.message).toMatchObject({
      type: MessageType.TranslateSelection,
      payload: { selectedText: "review" }
    });
  });

  it("does not let an older translation response overwrite the newer tooltip", async () => {
    vi.useFakeTimers();
    const { requests, sendMessage } = deferredSendMessage();
    cleanup = startContentScript(sendMessage, { enableVocabularyHighlighting: false });

    selectText("lead");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(120);
    translateButton().click();

    selectText("review");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(120);
    translateButton().click();

    const newerRequest = requests.find(
      (request) =>
        (request.message as { type?: unknown; payload?: { selectedText?: unknown } }).type === MessageType.TranslateSelection &&
        (request.message as { payload?: { selectedText?: unknown } }).payload?.selectedText === "review"
    );
    newerRequest?.resolve({
      ok: true,
      data: translationResult({
        selectedText: "review",
        translation: "newer translation",
        contextualMeaning: "Inspect something again."
      })
    });
    await flushPromises();
    expect(tooltipText()).toContain("newer translation");

    const olderRequest = requests.find(
      (request) =>
        (request.message as { type?: unknown; payload?: { selectedText?: unknown } }).type === MessageType.TranslateSelection &&
        (request.message as { payload?: { selectedText?: unknown } }).payload?.selectedText === "lead"
    );
    olderRequest?.resolve({
      ok: true,
      data: translationResult({
        translation: "older translation"
      })
    });
    await flushPromises();

    expect(tooltipText()).toContain("newer translation");
    expect(tooltipText()).not.toContain("older translation");
  });

  it.each([
    [
      "Escape",
      () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      }
    ],
    [
      "scroll",
      () => {
        document.dispatchEvent(new Event("scroll"));
      }
    ],
    [
      "collapsed selection",
      () => {
        window.getSelection()?.removeAllRanges();
        dispatchSelectionChange();
      }
    ]
  ])("invalidates an in-flight translation after %s", async (_name, invalidate) => {
    vi.useFakeTimers();
    const { requests, sendMessage } = deferredSendMessage();
    cleanup = startContentScript(sendMessage, { enableVocabularyHighlighting: false });

    selectText("lead");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(120);
    translateButton().click();

    invalidate();
    requests[0]?.resolve({ ok: true, data: translationResult() });
    await flushPromises();

    expect(tooltipHost()).toBeNull();
  });

  it("removes listeners and clears pending work when cleanup runs", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(async () => ({ ok: true, data: translationResult() }));
    cleanup = startContentScript(sendMessage, { enableVocabularyHighlighting: false });

    selectText("lead");
    dispatchSelectionChange();
    cleanup();
    cleanup = undefined;

    await vi.advanceTimersByTimeAsync(120);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(tooltipHost()).toBeNull();
  });
});
