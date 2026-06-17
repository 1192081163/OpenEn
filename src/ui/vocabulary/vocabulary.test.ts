import { readFileSync } from "node:fs";

import { MessageType } from "../../shared/messages";
import type { VocabularyEntry } from "../../shared/types";
import { renderVocabularyPage } from "./vocabulary";

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

function renderShell(): void {
  document.body.innerHTML = `
    <input id="search" />
    <button id="exportJson"></button>
    <button id="exportCsv"></button>
    <table><tbody id="entries"></tbody></table>
  `;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForExpectation(assertion: () => void): Promise<void> {
  const timeoutAt = Date.now() + 1000;
  let lastError: unknown;
  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushPromises();
    }
  }
  throw lastError;
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("vocabulary page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders entries and deletes a row", () => {
    const onDelete = vi.fn();
    document.body.innerHTML = `<input id="search" /><button id="exportJson"></button><button id="exportCsv"></button><tbody id="entries"></tbody>`;

    renderVocabularyPage({ entries, onDelete, onSearch: vi.fn(), onExport: vi.fn() });

    expect(document.body.textContent).toContain("lead");
    const deleteButton = document.querySelector("[data-delete-id='1']") as HTMLButtonElement;
    expect(deleteButton.textContent).toBe("删除");
    deleteButton.click();
    expect(onDelete).toHaveBeenCalledWith("1");
  });

  it("calls search and export callbacks", () => {
    const onSearch = vi.fn();
    const onExport = vi.fn();
    document.body.innerHTML = `<input id="search" /><button id="exportJson"></button><button id="exportCsv"></button><tbody id="entries"></tbody>`;

    renderVocabularyPage({ entries, onDelete: vi.fn(), onSearch, onExport });
    const search = document.querySelector("#search") as HTMLInputElement;
    search.value = "lead";
    search.dispatchEvent(new Event("input"));
    (document.querySelector("#exportCsv") as HTMLButtonElement).click();

    expect(onSearch).toHaveBeenCalledWith("lead");
    expect(onExport).toHaveBeenCalledWith("csv");
  });

  it("renders a valid source link with a safe new-tab policy", () => {
    renderShell();

    renderVocabularyPage({ entries, onDelete: vi.fn(), onSearch: vi.fn(), onExport: vi.fn() });

    const link = document.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toBe("Example");
    expect(link.href).toBe("https://example.com/");
    expect(link.target).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders javascript and invalid source URLs as plain text", () => {
    const unsafeEntries: VocabularyEntry[] = [
      { ...entries[0]!, id: "javascript", sourceUrl: "javascript:alert(1)", pageTitle: "Unsafe" },
      { ...entries[0]!, id: "invalid", sourceUrl: "not a url", pageTitle: "" }
    ];
    renderShell();

    renderVocabularyPage({ entries: unsafeEntries, onDelete: vi.fn(), onSearch: vi.fn(), onExport: vi.fn() });

    expect(document.querySelector("a")).toBeNull();
    expect(document.body.textContent).toContain("Unsafe");
    expect(document.body.textContent).toContain("not a url");
  });

  it("renders load failure distinctly when initial load rejects", async () => {
    renderShell();
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockRejectedValue(new Error("unavailable")) } });
    vi.resetModules();

    await import("./vocabulary");

    await waitForExpectation(() => {
      expect(document.body.textContent).toContain("Unable to load saved words.");
      expect(document.body.textContent).not.toContain("No saved words.");
    });
  });

  it("renders load failure distinctly when list response is ok false", async () => {
    renderShell();
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: false }) } });
    vi.resetModules();

    await import("./vocabulary");

    await waitForExpectation(() => {
      expect(document.body.textContent).toContain("Unable to load saved words.");
      expect(document.body.textContent).not.toContain("No saved words.");
    });
  });

  it("renders load failure distinctly when list response is invalid", async () => {
    renderShell();
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true, data: "invalid" }) } });
    vi.resetModules();

    await import("./vocabulary");

    await waitForExpectation(() => {
      expect(document.body.textContent).toContain("Unable to load saved words.");
      expect(document.body.textContent).not.toContain("No saved words.");
    });
  });

  it("renders search failure distinctly when search response is ok false", async () => {
    const sendMessage = vi.fn(async (message: { type: MessageType }) =>
      message.type === MessageType.ListVocabulary ? { ok: true, data: entries } : { ok: false }
    );
    renderShell();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.resetModules();
    await import("./vocabulary");
    await waitForExpectation(() => expect(document.body.textContent).toContain("lead"));

    const search = document.querySelector("#search") as HTMLInputElement;
    search.value = "missing";
    search.dispatchEvent(new Event("input"));

    await waitForExpectation(() => {
      expect(document.body.textContent).toContain("Unable to load saved words.");
      expect(document.body.textContent).not.toContain("No saved words.");
    });
  });

  it("keeps newer search results when an older response resolves last", async () => {
    const olderResponse = deferred<unknown>();
    const newerResponse = deferred<unknown>();
    const olderEntry: VocabularyEntry = {
      ...entries[0]!,
      id: "older",
      selectedText: "older",
      translation: "older result"
    };
    const newerEntry: VocabularyEntry = {
      ...entries[0]!,
      id: "newer",
      selectedText: "newer",
      translation: "newer result"
    };
    const sendMessage = vi.fn((message: { type: MessageType; payload?: { query?: string } }) => {
      if (message.type === MessageType.ListVocabulary) return Promise.resolve({ ok: true, data: entries });
      if (message.payload?.query === "older") return olderResponse.promise;
      if (message.payload?.query === "newer") return newerResponse.promise;
      return Promise.resolve({ ok: true, data: [] });
    });
    renderShell();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.resetModules();
    await import("./vocabulary");
    await waitForExpectation(() => expect(document.body.textContent).toContain("lead"));

    const search = document.querySelector("#search") as HTMLInputElement;
    search.value = "older";
    search.dispatchEvent(new Event("input"));
    search.value = "newer";
    search.dispatchEvent(new Event("input"));

    newerResponse.resolve({ ok: true, data: [newerEntry] });
    await waitForExpectation(() => {
      expect(document.body.textContent).toContain("newer result");
      expect(document.body.textContent).not.toContain("older result");
    });

    olderResponse.resolve({ ok: true, data: [olderEntry] });
    await flushPromises();

    expect(document.body.textContent).toContain("newer result");
    expect(document.body.textContent).not.toContain("older result");
  });

  it("includes accessible labels and wrapping styles", () => {
    const html = readFileSync("src/ui/vocabulary/vocabulary.html", "utf8");
    const css = readFileSync("src/ui/vocabulary/vocabulary.css", "utf8");

    expect(html).toContain('aria-label="搜索生词"');
    expect(html).toContain('aria-label="生词本操作"');
    expect(html).toContain('id="exportJson" type="button">导出 JSON</button>');
    expect(html).toContain('id="exportCsv" type="button">导出 CSV</button>');
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
