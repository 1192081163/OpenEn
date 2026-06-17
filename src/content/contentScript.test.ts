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
  return {
    selectedText: "lead",
    translation: "lead as guide",
    contextualMeaning: "Guide an activity.",
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
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("requests translation and saves full vocabulary payload through runtime messages", async () => {
    const sentMessages: unknown[] = [];
    const result = translationResult();

    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      return { ok: true, data: result };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);

    expect(sentMessages[0]).toEqual({ type: MessageType.TranslateSelection, payload });

    saveButton().click();
    await flushPromises();

    expect(sentMessages[1]).toEqual(expectedSaveMessage(result));
  });

  it.each([
    ["rejected translate request", async () => Promise.reject(new Error("network failed"))],
    ["missing translate response", async () => undefined],
    ["failed translate response", async () => ({ ok: false, error: "translation failed" })]
  ])("does not render a tooltip for %s", async (_name, sendMessage) => {
    await expect(
      handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), vi.fn(sendMessage))
    ).resolves.toBeUndefined();

    expect(tooltipHost()).toBeNull();
  });

  it("does not render a tooltip for malformed translation data", async () => {
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

    expect(tooltipHost()).toBeNull();
  });

  it.each([
    ["rejected save request", async () => Promise.reject(new Error("save failed"))],
    ["failed save response", async () => ({ ok: false, error: "save failed" })]
  ])("handles %s without sending an invalid vocabulary payload", async (_name, saveResponse) => {
    const sentMessages: unknown[] = [];
    const result = translationResult();
    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      if ((message as { type?: unknown }).type === MessageType.AddVocabulary) {
        return saveResponse();
      }
      return { ok: true, data: result };
    });

    await handleSelectionPayload(payload, new DOMRect(10, 10, 20, 10), sendMessage);

    saveButton().click();
    await flushPromises();

    expect(sentMessages[1]).toEqual(expectedSaveMessage(result));
    expect(sentMessages).toHaveLength(2);
  });

  it("debounces selection changes and translates only the latest pending selection", async () => {
    vi.useFakeTimers();
    const { requests, sendMessage } = deferredSendMessage();
    cleanup = startContentScript(sendMessage);

    selectText("lead");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(60);

    selectText("review");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(119);
    expect(sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(requests[0]?.message).toMatchObject({
      type: MessageType.TranslateSelection,
      payload: { selectedText: "review" }
    });
  });

  it("does not let an older translation response overwrite the newer tooltip", async () => {
    vi.useFakeTimers();
    const { requests, sendMessage } = deferredSendMessage();
    cleanup = startContentScript(sendMessage);

    selectText("lead");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(120);

    selectText("review");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(120);

    requests[1]?.resolve({
      ok: true,
      data: translationResult({
        selectedText: "review",
        translation: "newer translation",
        contextualMeaning: "Inspect something again."
      })
    });
    await flushPromises();
    expect(tooltipText()).toContain("newer translation");

    requests[0]?.resolve({
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
    cleanup = startContentScript(sendMessage);

    selectText("lead");
    dispatchSelectionChange();
    await vi.advanceTimersByTimeAsync(120);

    invalidate();
    requests[0]?.resolve({ ok: true, data: translationResult() });
    await flushPromises();

    expect(tooltipHost()).toBeNull();
  });

  it("removes listeners and clears pending work when cleanup runs", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(async () => ({ ok: true, data: translationResult() }));
    cleanup = startContentScript(sendMessage);

    selectText("lead");
    dispatchSelectionChange();
    cleanup();
    cleanup = undefined;

    await vi.advanceTimersByTimeAsync(120);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(tooltipHost()).toBeNull();
  });
});
