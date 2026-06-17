import { MessageType } from "../shared/messages";
import type { TranslationResult } from "../shared/types";
import { handleSelectionPayload } from "./contentScript";

describe("content script selection handling", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("requests translation and saves vocabulary through runtime messages", async () => {
    const sentMessages: unknown[] = [];
    const result: TranslationResult = {
      selectedText: "lead",
      translation: "lead as guide",
      contextualMeaning: "Guide an activity.",
      provider: "fake"
    };

    const sendMessage = vi.fn(async (message: unknown) => {
      sentMessages.push(message);
      return { ok: true, data: result };
    });

    await handleSelectionPayload(
      {
        selectedText: "lead",
        paragraphContext: "She will lead the review.",
        sourceUrl: "https://example.com",
        pageTitle: "Example"
      },
      new DOMRect(10, 10, 20, 10),
      sendMessage
    );

    expect(sentMessages[0]).toMatchObject({ type: MessageType.TranslateSelection });

    const tooltipHost = document.querySelector("[data-openen-tooltip]");
    expect(tooltipHost).toBeInstanceOf(HTMLElement);
    const saveButton = (tooltipHost as HTMLElement).shadowRoot?.querySelector("[data-openen-save]");
    expect(saveButton).toBeInstanceOf(HTMLButtonElement);
    (saveButton as HTMLButtonElement).click();

    expect(sentMessages[1]).toMatchObject({ type: MessageType.AddVocabulary });
  });
});
