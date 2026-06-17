# OpenEn Browser Extension Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome/Edge Manifest V3 extension that translates selected text using paragraph context, shows a lightweight popup, saves entries to a local vocabulary book, and exports vocabulary as JSON or CSV.

**Architecture:** Use a small TypeScript WebExtension codebase with esbuild bundling. Keep page selection and tooltip code in the content script, privileged extension APIs in the background service worker, fake translation behind a provider interface, and vocabulary persistence behind a storage wrapper.

**Tech Stack:** TypeScript, esbuild, Vitest, jsdom, Chrome Extension Manifest V3.

---

## File Structure

- Create: `package.json` for scripts and dev dependencies.
- Create: `tsconfig.json` for strict TypeScript.
- Create: `vitest.config.ts` for jsdom tests.
- Create: `scripts/build.mjs` for deterministic extension builds.
- Create: `public/manifest.json` for MV3 metadata.
- Create: `src/shared/types.ts` for shared request, response, and vocabulary types.
- Create: `src/shared/messages.ts` for message names and type guards.
- Create: `src/providers/translationProvider.ts` for the provider contract.
- Create: `src/providers/fakeTranslationProvider.ts` for v1 fake contextual translations.
- Create: `src/storage/vocabularyStore.ts` for local vocabulary operations.
- Create: `src/storage/exportVocabulary.ts` for JSON and CSV export text.
- Create: `src/background/handlers.ts` for testable background message handling.
- Create: `src/background/serviceWorker.ts` for Chrome runtime wiring.
- Create: `src/content/selectionContext.ts` for paragraph extraction.
- Create: `src/content/tooltip.ts` for the floating translation popup.
- Create: `src/content/contentScript.ts` for selection event orchestration.
- Create: `src/ui/popup/popup.html`, `src/ui/popup/popup.ts`, and `src/ui/popup/popup.css` for the extension popup.
- Create: `src/ui/vocabulary/vocabulary.html`, `src/ui/vocabulary/vocabulary.ts`, and `src/ui/vocabulary/vocabulary.css` for vocabulary management.
- Create tests next to source files using `*.test.ts`.
- Create: `docs/manual-qa.md` for browser verification steps.

---

## Task 1: Tooling, Manifest, And Build Pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `scripts/build.mjs`
- Create: `public/manifest.json`
- Test: `src/manifest.test.ts`

- [ ] **Step 1: Create minimal project tooling**

Create `package.json`:

```json
{
  "name": "openen",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.303",
    "esbuild": "^0.25.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["DOM", "ES2022"],
    "types": ["chrome", "vitest/globals"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src", "vitest.config.ts", "scripts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
    restoreMocks: true
  }
});
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 3: Write failing manifest test**

Create `src/manifest.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("extension manifest", () => {
  it("declares the v1 MV3 extension surface", () => {
    const manifestPath = resolve(process.cwd(), "public/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain("storage");
    expect(manifest.background.service_worker).toBe("background/serviceWorker.js");
    expect(manifest.content_scripts[0].matches).toEqual(["http://*/*", "https://*/*"]);
    expect(manifest.content_scripts[0].js).toEqual(["content/contentScript.js"]);
    expect(manifest.options_page).toBe("ui/vocabulary/vocabulary.html");
    expect(manifest.action.default_popup).toBe("ui/popup/popup.html");
  });
});
```

- [ ] **Step 4: Run test and verify it fails**

Run:

```bash
npm test -- src/manifest.test.ts
```

Expected: FAIL because `public/manifest.json` does not exist.

- [ ] **Step 5: Add manifest and build script**

Create `public/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "OpenEn",
  "description": "Context-aware selection translation and local vocabulary capture.",
  "version": "0.1.0",
  "permissions": ["storage"],
  "background": {
    "service_worker": "background/serviceWorker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["content/contentScript.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "OpenEn",
    "default_popup": "ui/popup/popup.html"
  },
  "options_page": "ui/vocabulary/vocabulary.html"
}
```

Create `scripts/build.mjs`:

```js
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "public"), dist, { recursive: true });

const common = {
  bundle: true,
  target: "chrome116",
  sourcemap: true,
  logLevel: "info"
};

await Promise.all([
  build({
    ...common,
    entryPoints: [resolve(root, "src/background/serviceWorker.ts")],
    outfile: resolve(dist, "background/serviceWorker.js"),
    format: "esm"
  }),
  build({
    ...common,
    entryPoints: [resolve(root, "src/content/contentScript.ts")],
    outfile: resolve(dist, "content/contentScript.js"),
    format: "iife"
  }),
  build({
    ...common,
    entryPoints: [resolve(root, "src/ui/popup/popup.ts")],
    outfile: resolve(dist, "ui/popup/popup.js"),
    format: "iife"
  }),
  build({
    ...common,
    entryPoints: [resolve(root, "src/ui/vocabulary/vocabulary.ts")],
    outfile: resolve(dist, "ui/vocabulary/vocabulary.js"),
    format: "iife"
  })
]);

await cp(resolve(root, "src/ui/popup/popup.html"), resolve(dist, "ui/popup/popup.html"));
await cp(resolve(root, "src/ui/popup/popup.css"), resolve(dist, "ui/popup/popup.css"));
await cp(resolve(root, "src/ui/vocabulary/vocabulary.html"), resolve(dist, "ui/vocabulary/vocabulary.html"));
await cp(resolve(root, "src/ui/vocabulary/vocabulary.css"), resolve(dist, "ui/vocabulary/vocabulary.css"));
```

- [ ] **Step 6: Run test and verify it passes**

Run:

```bash
npm test -- src/manifest.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit tooling**

Run:

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts scripts/build.mjs public/manifest.json src/manifest.test.ts
git commit -m "chore: add extension tooling"
```

---

## Task 2: Shared Types And Message Contracts

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/messages.ts`
- Test: `src/shared/messages.test.ts`

- [ ] **Step 1: Write failing message contract tests**

Create `src/shared/messages.test.ts`:

```ts
import {
  isAddVocabularyMessage,
  isDeleteVocabularyMessage,
  isExportVocabularyMessage,
  isListVocabularyMessage,
  isSearchVocabularyMessage,
  isTranslateSelectionMessage,
  MessageType
} from "./messages";

describe("message guards", () => {
  it("accepts a translate selection message", () => {
    expect(
      isTranslateSelectionMessage({
        type: MessageType.TranslateSelection,
        payload: {
          selectedText: "lead",
          paragraphContext: "She will lead the design review.",
          sourceUrl: "https://example.com/article",
          pageTitle: "Article"
        }
      })
    ).toBe(true);
  });

  it("rejects malformed translate messages", () => {
    expect(isTranslateSelectionMessage({ type: MessageType.TranslateSelection, payload: {} })).toBe(false);
  });

  it("accepts vocabulary list, search, add, delete, and export messages", () => {
    expect(isListVocabularyMessage({ type: MessageType.ListVocabulary })).toBe(true);
    expect(isSearchVocabularyMessage({ type: MessageType.SearchVocabulary, payload: { query: "lead" } })).toBe(true);
    expect(isAddVocabularyMessage({ type: MessageType.AddVocabulary, payload: { entry: { id: "1" } } })).toBe(true);
    expect(isDeleteVocabularyMessage({ type: MessageType.DeleteVocabulary, payload: { id: "1" } })).toBe(true);
    expect(isExportVocabularyMessage({ type: MessageType.ExportVocabulary, payload: { format: "csv" } })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/shared/messages.test.ts
```

Expected: FAIL because `src/shared/messages.ts` does not exist.

- [ ] **Step 3: Add shared types and guards**

Create `src/shared/types.ts`:

```ts
export interface TranslationRequest {
  selectedText: string;
  paragraphContext: string;
  sourceLang?: string;
  targetLang: string;
}

export interface TranslationResult {
  selectedText: string;
  translation: string;
  partOfSpeech?: string;
  contextualMeaning: string;
  example?: string;
  confidence?: number;
  provider: "fake" | "openai" | "external";
}

export interface VocabularyEntry {
  id: string;
  selectedText: string;
  translation: string;
  partOfSpeech?: string;
  contextualMeaning: string;
  example?: string;
  paragraphContext: string;
  sourceUrl: string;
  pageTitle: string;
  createdAt: string;
  provider: string;
}

export interface SelectionPayload {
  selectedText: string;
  paragraphContext: string;
  sourceUrl: string;
  pageTitle: string;
}

export type ExportFormat = "json" | "csv";
```

Create `src/shared/messages.ts`:

```ts
import type { ExportFormat, SelectionPayload, VocabularyEntry } from "./types";

export enum MessageType {
  TranslateSelection = "TRANSLATE_SELECTION",
  AddVocabulary = "ADD_VOCABULARY",
  ListVocabulary = "LIST_VOCABULARY",
  SearchVocabulary = "SEARCH_VOCABULARY",
  DeleteVocabulary = "DELETE_VOCABULARY",
  ExportVocabulary = "EXPORT_VOCABULARY"
}

export interface TranslateSelectionMessage {
  type: MessageType.TranslateSelection;
  payload: SelectionPayload;
}

export interface AddVocabularyMessage {
  type: MessageType.AddVocabulary;
  payload: { entry: Partial<VocabularyEntry> };
}

export interface ListVocabularyMessage {
  type: MessageType.ListVocabulary;
}

export interface SearchVocabularyMessage {
  type: MessageType.SearchVocabulary;
  payload: { query: string };
}

export interface DeleteVocabularyMessage {
  type: MessageType.DeleteVocabulary;
  payload: { id: string };
}

export interface ExportVocabularyMessage {
  type: MessageType.ExportVocabulary;
  payload: { format: ExportFormat };
}

export type OpenEnMessage =
  | TranslateSelectionMessage
  | AddVocabularyMessage
  | ListVocabularyMessage
  | SearchVocabularyMessage
  | DeleteVocabularyMessage
  | ExportVocabularyMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

export function isTranslateSelectionMessage(value: unknown): value is TranslateSelectionMessage {
  if (!isRecord(value) || value.type !== MessageType.TranslateSelection || !isRecord(value.payload)) return false;
  return (
    hasString(value.payload, "selectedText") &&
    hasString(value.payload, "paragraphContext") &&
    hasString(value.payload, "sourceUrl") &&
    hasString(value.payload, "pageTitle")
  );
}

export function isAddVocabularyMessage(value: unknown): value is AddVocabularyMessage {
  return isRecord(value) && value.type === MessageType.AddVocabulary && isRecord(value.payload) && isRecord(value.payload.entry);
}

export function isListVocabularyMessage(value: unknown): value is ListVocabularyMessage {
  return isRecord(value) && value.type === MessageType.ListVocabulary;
}

export function isSearchVocabularyMessage(value: unknown): value is SearchVocabularyMessage {
  return isRecord(value) && value.type === MessageType.SearchVocabulary && isRecord(value.payload) && hasString(value.payload, "query");
}

export function isDeleteVocabularyMessage(value: unknown): value is DeleteVocabularyMessage {
  return isRecord(value) && value.type === MessageType.DeleteVocabulary && isRecord(value.payload) && hasString(value.payload, "id");
}

export function isExportVocabularyMessage(value: unknown): value is ExportVocabularyMessage {
  return (
    isRecord(value) &&
    value.type === MessageType.ExportVocabulary &&
    isRecord(value.payload) &&
    (value.payload.format === "json" || value.payload.format === "csv")
  );
}
```

- [ ] **Step 4: Run test and typecheck**

Run:

```bash
npm test -- src/shared/messages.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit shared contracts**

Run:

```bash
git add src/shared
git commit -m "feat: add extension message contracts"
```

---

## Task 3: Fake Contextual Translation Provider

**Files:**
- Create: `src/providers/translationProvider.ts`
- Create: `src/providers/fakeTranslationProvider.ts`
- Test: `src/providers/fakeTranslationProvider.test.ts`

- [ ] **Step 1: Write failing provider tests**

Create `src/providers/fakeTranslationProvider.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/providers/fakeTranslationProvider.test.ts
```

Expected: FAIL because provider files do not exist.

- [ ] **Step 3: Add provider contract and fake implementation**

Create `src/providers/translationProvider.ts`:

```ts
import type { TranslationRequest, TranslationResult } from "../shared/types";

export interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
```

Create `src/providers/fakeTranslationProvider.ts`:

```ts
import type { TranslationRequest, TranslationResult } from "../shared/types";
import type { TranslationProvider } from "./translationProvider";

function firstSentence(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.{1,160}?[.!?])(\s|$)/);
  return match?.[1] ?? normalized.slice(0, 160);
}

function translateLead(context: string): TranslationResult {
  const lowerContext = context.toLowerCase();
  if (/\b(pipe|metal|paint|battery|poison|plumbing)\b/.test(lowerContext)) {
    return {
      selectedText: "lead",
      translation: "lead as metal",
      partOfSpeech: "noun",
      contextualMeaning: "In this paragraph, lead means a heavy metal material.",
      example: "The pipe contained lead.",
      confidence: 0.9,
      provider: "fake"
    };
  }

  return {
    selectedText: "lead",
    translation: "lead as guide",
    partOfSpeech: "verb",
    contextualMeaning: "In this paragraph, lead means to guide or direct an activity.",
    example: "She will lead the review.",
    confidence: 0.9,
    provider: "fake"
  };
}

export function createFakeTranslationProvider(): TranslationProvider {
  return {
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      const selectedText = request.selectedText.trim();
      const paragraphContext = request.paragraphContext.trim();

      if (selectedText.toLowerCase() === "lead") {
        return translateLead(paragraphContext);
      }

      return {
        selectedText,
        translation: `Fake ${request.targetLang} translation for ${selectedText}`,
        contextualMeaning: `Fake contextual meaning based on: ${firstSentence(paragraphContext)}`,
        example: `Example with ${selectedText}.`,
        confidence: 0.5,
        provider: "fake"
      };
    }
  };
}
```

- [ ] **Step 4: Run provider tests**

Run:

```bash
npm test -- src/providers/fakeTranslationProvider.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit provider**

Run:

```bash
git add src/providers
git commit -m "feat: add fake translation provider"
```

---

## Task 4: Paragraph Context Extraction

**Files:**
- Create: `src/content/selectionContext.ts`
- Test: `src/content/selectionContext.test.ts`

- [ ] **Step 1: Write failing context extraction tests**

Create `src/content/selectionContext.test.ts`:

```ts
import { extractSelectionContextFromRange } from "./selectionContext";

function selectText(node: Text, query: string): Range {
  const start = node.data.indexOf(query);
  if (start < 0) throw new Error(`Text not found: ${query}`);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + query.length);
  return range;
}

describe("selection context extraction", () => {
  it("extracts the closest paragraph containing selected text", () => {
    document.body.innerHTML = `<article><h1>Title</h1><p>She will lead the design review tomorrow.</p></article>`;
    const text = document.querySelector("p")!.firstChild as Text;
    const result = extractSelectionContextFromRange(selectText(text, "lead"));

    expect(result?.selectedText).toBe("lead");
    expect(result?.paragraphContext).toBe("She will lead the design review tomorrow.");
  });

  it("uses list items as meaningful context containers", () => {
    document.body.innerHTML = `<ul><li>Open the extension after saving a word.</li></ul>`;
    const text = document.querySelector("li")!.firstChild as Text;
    const result = extractSelectionContextFromRange(selectText(text, "extension"));

    expect(result?.paragraphContext).toBe("Open the extension after saving a word.");
  });

  it("caps very long context", () => {
    const longText = `prefix ${"word ".repeat(500)} suffix`;
    document.body.innerHTML = `<p>${longText}</p>`;
    const text = document.querySelector("p")!.firstChild as Text;
    const result = extractSelectionContextFromRange(selectText(text, "prefix"));

    expect(result?.paragraphContext.length).toBeLessThanOrEqual(1500);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/content/selectionContext.test.ts
```

Expected: FAIL because `selectionContext.ts` does not exist.

- [ ] **Step 3: Implement context extraction**

Create `src/content/selectionContext.ts`:

```ts
import type { SelectionPayload } from "../shared/types";

const MAX_CONTEXT_LENGTH = 1500;
const CONTAINER_SELECTOR = "p, li, blockquote, article, section, div";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function capContext(text: string): string {
  const normalized = normalizeText(text);
  return normalized.length > MAX_CONTEXT_LENGTH ? normalized.slice(0, MAX_CONTEXT_LENGTH).trim() : normalized;
}

function isIgnoredElement(element: Element): boolean {
  return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(element.tagName);
}

function findContextElement(range: Range, selectedText: string): Element | null {
  const startElement =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;

  if (!startElement) return null;

  let current: Element | null = startElement;
  while (current && current !== document.documentElement) {
    if (!isIgnoredElement(current) && current.matches(CONTAINER_SELECTOR)) {
      const text = normalizeText(current.textContent ?? "");
      if (text.includes(selectedText) && text.length >= selectedText.length) return current;
    }
    current = current.parentElement;
  }

  return null;
}

export function extractSelectionContextFromRange(range: Range): SelectionPayload | null {
  const selectedText = normalizeText(range.toString());
  if (!selectedText) return null;
  if (selectedText.length > 120) return null;

  const contextElement = findContextElement(range, selectedText);
  const paragraphContext = contextElement
    ? capContext(contextElement.textContent ?? selectedText)
    : capContext(range.startContainer.textContent ?? selectedText);

  return {
    selectedText,
    paragraphContext,
    sourceUrl: window.location.href,
    pageTitle: document.title
  };
}

export function extractSelectionContext(selection: Selection | null = window.getSelection()): SelectionPayload | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return extractSelectionContextFromRange(selection.getRangeAt(0));
}
```

- [ ] **Step 4: Run extraction tests**

Run:

```bash
npm test -- src/content/selectionContext.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit extraction**

Run:

```bash
git add src/content/selectionContext.ts src/content/selectionContext.test.ts
git commit -m "feat: extract paragraph context from selections"
```

---

## Task 5: Vocabulary Store

**Files:**
- Create: `src/storage/vocabularyStore.ts`
- Test: `src/storage/vocabularyStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `src/storage/vocabularyStore.test.ts`:

```ts
import type { VocabularyEntry } from "../shared/types";
import { createVocabularyStore, type StorageAreaLike } from "./vocabularyStore";

function createMemoryStorage(): StorageAreaLike {
  const data = new Map<string, unknown>();
  return {
    async get(key: string) {
      return { [key]: data.get(key) };
    },
    async set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    }
  };
}

function entry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    id: "entry-1",
    selectedText: "lead",
    translation: "lead as guide",
    partOfSpeech: "verb",
    contextualMeaning: "guide an activity",
    example: "She will lead the review.",
    paragraphContext: "She will lead the design review tomorrow.",
    sourceUrl: "https://example.com/a",
    pageTitle: "A",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake",
    ...overrides
  };
}

describe("vocabulary store", () => {
  it("adds and lists entries newest first", async () => {
    const store = createVocabularyStore(createMemoryStorage());
    await store.add(entry({ id: "old", createdAt: "2026-06-16T00:00:00.000Z" }));
    await store.add(entry({ id: "new", createdAt: "2026-06-17T00:00:00.000Z", selectedText: "open" }));

    expect((await store.list()).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("updates duplicate selected text from the same source URL", async () => {
    const store = createVocabularyStore(createMemoryStorage());
    await store.add(entry({ id: "first", translation: "old" }));
    await store.add(entry({ id: "second", translation: "new" }));

    const entries = await store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("first");
    expect(entries[0]?.translation).toBe("new");
  });

  it("searches and deletes entries", async () => {
    const store = createVocabularyStore(createMemoryStorage());
    await store.add(entry({ id: "a", selectedText: "lead" }));
    await store.add(entry({ id: "b", selectedText: "context", pageTitle: "Context Article" }));

    expect((await store.search("context")).map((item) => item.id)).toEqual(["b"]);
    await store.delete("b");
    expect((await store.list()).map((item) => item.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/storage/vocabularyStore.test.ts
```

Expected: FAIL because `vocabularyStore.ts` does not exist.

- [ ] **Step 3: Implement vocabulary store**

Create `src/storage/vocabularyStore.ts`:

```ts
import type { VocabularyEntry } from "../shared/types";

const STORAGE_KEY = "openen:vocabulary";

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface VocabularyStore {
  add(entry: VocabularyEntry): Promise<VocabularyEntry>;
  list(): Promise<VocabularyEntry[]>;
  search(query: string): Promise<VocabularyEntry[]>;
  delete(id: string): Promise<void>;
}

function sortNewestFirst(entries: VocabularyEntry[]): VocabularyEntry[] {
  return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function matchesQuery(entry: VocabularyEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [entry.selectedText, entry.translation, entry.pageTitle, entry.contextualMeaning]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function createVocabularyStore(storageArea: StorageAreaLike): VocabularyStore {
  async function readEntries(): Promise<VocabularyEntry[]> {
    const result = await storageArea.get(STORAGE_KEY);
    const value = result[STORAGE_KEY];
    return Array.isArray(value) ? (value as VocabularyEntry[]) : [];
  }

  async function writeEntries(entries: VocabularyEntry[]): Promise<void> {
    await storageArea.set({ [STORAGE_KEY]: entries });
  }

  return {
    async add(entry: VocabularyEntry): Promise<VocabularyEntry> {
      const entries = await readEntries();
      const duplicateIndex = entries.findIndex(
        (item) => item.selectedText.toLowerCase() === entry.selectedText.toLowerCase() && item.sourceUrl === entry.sourceUrl
      );

      if (duplicateIndex >= 0) {
        const existing = entries[duplicateIndex]!;
        const updated = { ...existing, ...entry, id: existing.id, createdAt: existing.createdAt };
        entries[duplicateIndex] = updated;
        await writeEntries(entries);
        return updated;
      }

      entries.push(entry);
      await writeEntries(entries);
      return entry;
    },

    async list(): Promise<VocabularyEntry[]> {
      return sortNewestFirst(await readEntries());
    },

    async search(query: string): Promise<VocabularyEntry[]> {
      return sortNewestFirst((await readEntries()).filter((entry) => matchesQuery(entry, query)));
    },

    async delete(id: string): Promise<void> {
      await writeEntries((await readEntries()).filter((entry) => entry.id !== id));
    }
  };
}

export function createChromeVocabularyStore(): VocabularyStore {
  return createVocabularyStore(chrome.storage.local);
}
```

- [ ] **Step 4: Run store tests**

Run:

```bash
npm test -- src/storage/vocabularyStore.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit store**

Run:

```bash
git add src/storage/vocabularyStore.ts src/storage/vocabularyStore.test.ts
git commit -m "feat: add local vocabulary store"
```

---

## Task 6: Vocabulary Export

**Files:**
- Create: `src/storage/exportVocabulary.ts`
- Test: `src/storage/exportVocabulary.test.ts`

- [ ] **Step 1: Write failing export tests**

Create `src/storage/exportVocabulary.test.ts`:

```ts
import type { VocabularyEntry } from "../shared/types";
import { exportVocabularyAsCsv, exportVocabularyAsJson } from "./exportVocabulary";

const entries: VocabularyEntry[] = [
  {
    id: "1",
    selectedText: "lead",
    translation: "lead as guide",
    partOfSpeech: "verb",
    contextualMeaning: "guide an activity",
    example: "She will lead the review.",
    paragraphContext: "She will lead the design review tomorrow.",
    sourceUrl: "https://example.com/a",
    pageTitle: "Article, One",
    createdAt: "2026-06-17T00:00:00.000Z",
    provider: "fake"
  }
];

describe("vocabulary export", () => {
  it("exports pretty JSON", () => {
    expect(exportVocabularyAsJson(entries)).toContain('"selectedText": "lead"');
  });

  it("exports CSV with escaped values", () => {
    const csv = exportVocabularyAsCsv(entries);
    expect(csv.split("\n")[0]).toBe(
      "selectedText,translation,partOfSpeech,contextualMeaning,example,paragraphContext,sourceUrl,pageTitle,createdAt,provider"
    );
    expect(csv).toContain('"Article, One"');
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/storage/exportVocabulary.test.ts
```

Expected: FAIL because `exportVocabulary.ts` does not exist.

- [ ] **Step 3: Implement export utilities**

Create `src/storage/exportVocabulary.ts`:

```ts
import type { VocabularyEntry } from "../shared/types";

const CSV_COLUMNS: Array<keyof VocabularyEntry> = [
  "selectedText",
  "translation",
  "partOfSpeech",
  "contextualMeaning",
  "example",
  "paragraphContext",
  "sourceUrl",
  "pageTitle",
  "createdAt",
  "provider"
];

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function exportVocabularyAsJson(entries: VocabularyEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export function exportVocabularyAsCsv(entries: VocabularyEntry[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = entries.map((entry) => CSV_COLUMNS.map((column) => csvCell(entry[column])).join(","));
  return [header, ...rows].join("\n");
}
```

- [ ] **Step 4: Run export tests**

Run:

```bash
npm test -- src/storage/exportVocabulary.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit export utilities**

Run:

```bash
git add src/storage/exportVocabulary.ts src/storage/exportVocabulary.test.ts
git commit -m "feat: add vocabulary export utilities"
```

---

## Task 7: Background Message Handling

**Files:**
- Create: `src/background/handlers.ts`
- Create: `src/background/serviceWorker.ts`
- Test: `src/background/handlers.test.ts`

- [ ] **Step 1: Write failing background handler tests**

Create `src/background/handlers.test.ts`:

```ts
import type { TranslationProvider } from "../providers/translationProvider";
import { MessageType } from "../shared/messages";
import type { TranslationResult, VocabularyEntry } from "../shared/types";
import type { VocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler } from "./handlers";

function createProvider(): TranslationProvider {
  return {
    async translate(request): Promise<TranslationResult> {
      return {
        selectedText: request.selectedText,
        translation: "translated",
        contextualMeaning: `meaning from ${request.paragraphContext}`,
        provider: "fake"
      };
    }
  };
}

function createStore(): VocabularyStore {
  const entries: VocabularyEntry[] = [];
  return {
    async add(entry) {
      entries.push(entry);
      return entry;
    },
    async list() {
      return entries;
    },
    async search(query) {
      return entries.filter((entry) => entry.selectedText.includes(query));
    },
    async delete(id) {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) entries.splice(index, 1);
    }
  };
}

describe("background handler", () => {
  it("translates a selection with zh-CN target language", async () => {
    const handler = createBackgroundHandler({ provider: createProvider(), store: createStore() });
    const response = await handler({
      type: MessageType.TranslateSelection,
      payload: {
        selectedText: "lead",
        paragraphContext: "She will lead the review.",
        sourceUrl: "https://example.com",
        pageTitle: "Example"
      }
    });

    expect(response.ok).toBe(true);
    expect(response.data.translation).toBe("translated");
  });

  it("saves and lists vocabulary entries", async () => {
    const store = createStore();
    const handler = createBackgroundHandler({ provider: createProvider(), store });
    const saveResponse = await handler({
      type: MessageType.AddVocabulary,
      payload: {
        entry: {
          selectedText: "lead",
          translation: "translated",
          contextualMeaning: "guide",
          paragraphContext: "She will lead the review.",
          sourceUrl: "https://example.com",
          pageTitle: "Example",
          provider: "fake"
        }
      }
    });

    expect(saveResponse.ok).toBe(true);

    const listResponse = await handler({ type: MessageType.ListVocabulary });
    expect(listResponse.data).toHaveLength(1);
    expect(listResponse.data[0].selectedText).toBe("lead");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/background/handlers.test.ts
```

Expected: FAIL because `handlers.ts` does not exist.

- [ ] **Step 3: Implement testable background handler**

Create `src/background/handlers.ts`:

```ts
import type { TranslationProvider } from "../providers/translationProvider";
import {
  isAddVocabularyMessage,
  isDeleteVocabularyMessage,
  isExportVocabularyMessage,
  isListVocabularyMessage,
  isSearchVocabularyMessage,
  isTranslateSelectionMessage
} from "../shared/messages";
import type { VocabularyEntry } from "../shared/types";
import { exportVocabularyAsCsv, exportVocabularyAsJson } from "../storage/exportVocabulary";
import type { VocabularyStore } from "../storage/vocabularyStore";

type SuccessResponse<T> = { ok: true; data: T };
type FailureResponse = { ok: false; error: string };
export type BackgroundResponse<T = unknown> = SuccessResponse<T> | FailureResponse;

interface HandlerDependencies {
  provider: TranslationProvider;
  store: VocabularyStore;
  now?: () => Date;
  idFactory?: () => string;
}

function success<T>(data: T): SuccessResponse<T> {
  return { ok: true, data };
}

function failure(error: string): FailureResponse {
  return { ok: false, error };
}

function completeEntry(partial: Partial<VocabularyEntry>, now: Date, id: string): VocabularyEntry {
  if (!partial.selectedText || !partial.translation || !partial.contextualMeaning || !partial.paragraphContext || !partial.sourceUrl) {
    throw new Error("Missing required vocabulary fields");
  }

  return {
    id,
    selectedText: partial.selectedText,
    translation: partial.translation,
    partOfSpeech: partial.partOfSpeech,
    contextualMeaning: partial.contextualMeaning,
    example: partial.example,
    paragraphContext: partial.paragraphContext,
    sourceUrl: partial.sourceUrl,
    pageTitle: partial.pageTitle ?? "",
    createdAt: partial.createdAt ?? now.toISOString(),
    provider: partial.provider ?? "fake"
  };
}

export function createBackgroundHandler(dependencies: HandlerDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());

  return async function handleMessage(message: unknown): Promise<BackgroundResponse> {
    try {
      if (isTranslateSelectionMessage(message)) {
        const result = await dependencies.provider.translate({
          selectedText: message.payload.selectedText,
          paragraphContext: message.payload.paragraphContext,
          targetLang: "zh-CN"
        });
        return success(result);
      }

      if (isAddVocabularyMessage(message)) {
        const entry = completeEntry(message.payload.entry, now(), idFactory());
        return success(await dependencies.store.add(entry));
      }

      if (isListVocabularyMessage(message)) return success(await dependencies.store.list());

      if (isSearchVocabularyMessage(message)) return success(await dependencies.store.search(message.payload.query));

      if (isDeleteVocabularyMessage(message)) {
        await dependencies.store.delete(message.payload.id);
        return success({ id: message.payload.id });
      }

      if (isExportVocabularyMessage(message)) {
        const entries = await dependencies.store.list();
        return success(
          message.payload.format === "json" ? exportVocabularyAsJson(entries) : exportVocabularyAsCsv(entries)
        );
      }

      return failure("Unsupported message");
    } catch (error) {
      return failure(error instanceof Error ? error.message : "Unknown background error");
    }
  };
}
```

Create `src/background/serviceWorker.ts`:

```ts
import { createFakeTranslationProvider } from "../providers/fakeTranslationProvider";
import { createChromeVocabularyStore } from "../storage/vocabularyStore";
import { createBackgroundHandler } from "./handlers";

const handleMessage = createBackgroundHandler({
  provider: createFakeTranslationProvider(),
  store: createChromeVocabularyStore()
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
```

- [ ] **Step 4: Run background tests**

Run:

```bash
npm test -- src/background/handlers.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit background handling**

Run:

```bash
git add src/background
git commit -m "feat: handle extension background messages"
```

---

## Task 8: Translation Tooltip UI

**Files:**
- Create: `src/content/tooltip.ts`
- Test: `src/content/tooltip.test.ts`

- [ ] **Step 1: Write failing tooltip tests**

Create `src/content/tooltip.test.ts`:

```ts
import type { TranslationResult } from "../shared/types";
import { createTranslationTooltip } from "./tooltip";

const result: TranslationResult = {
  selectedText: "lead",
  translation: "lead as guide",
  partOfSpeech: "verb",
  contextualMeaning: "Guide or direct an activity.",
  example: "She will lead the review.",
  provider: "fake"
};

describe("translation tooltip", () => {
  it("renders translation content and save action", () => {
    const onSave = vi.fn();
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave, onClose: vi.fn() });

    expect(document.querySelector("[data-openen-tooltip]")?.textContent).toContain("lead as guide");
    (document.querySelector("[data-openen-save]") as HTMLButtonElement).click();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("removes an existing tooltip before rendering a new one", () => {
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave: vi.fn(), onClose: vi.fn() });
    createTranslationTooltip({ result, anchorRect: new DOMRect(20, 30, 40, 12), onSave: vi.fn(), onClose: vi.fn() });

    expect(document.querySelectorAll("[data-openen-tooltip]")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/content/tooltip.test.ts
```

Expected: FAIL because `tooltip.ts` does not exist.

- [ ] **Step 3: Implement tooltip**

Create `src/content/tooltip.ts`:

```ts
import type { TranslationResult } from "../shared/types";

const TOOLTIP_ATTR = "data-openen-tooltip";

interface TooltipOptions {
  result: TranslationResult;
  anchorRect: DOMRect;
  onSave(): void;
  onClose(): void;
}

function removeExisting(): void {
  document.querySelectorAll(`[${TOOLTIP_ATTR}]`).forEach((node) => node.remove());
}

function button(label: string, attr: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.setAttribute(attr, "");
  element.style.border = "1px solid #d0d7de";
  element.style.borderRadius = "6px";
  element.style.background = "#fff";
  element.style.padding = "4px 8px";
  element.style.cursor = "pointer";
  return element;
}

export function removeTranslationTooltip(): void {
  removeExisting();
}

export function createTranslationTooltip(options: TooltipOptions): HTMLElement {
  removeExisting();

  const root = document.createElement("div");
  root.setAttribute(TOOLTIP_ATTR, "");
  root.style.position = "absolute";
  root.style.zIndex = "2147483647";
  root.style.top = `${window.scrollY + options.anchorRect.bottom + 8}px`;
  root.style.left = `${window.scrollX + options.anchorRect.left}px`;
  root.style.maxWidth = "320px";
  root.style.padding = "10px";
  root.style.border = "1px solid rgba(0, 0, 0, 0.12)";
  root.style.borderRadius = "8px";
  root.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.14)";
  root.style.background = "#fff";
  root.style.color = "#1f2328";
  root.style.font = "13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

  const title = document.createElement("strong");
  title.textContent = options.result.selectedText;

  const translation = document.createElement("div");
  translation.textContent = options.result.translation;
  translation.style.marginTop = "6px";

  const meaning = document.createElement("div");
  meaning.textContent = options.result.contextualMeaning;
  meaning.style.marginTop = "6px";
  meaning.style.color = "#57606a";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.marginTop = "10px";

  const save = button("Add to vocabulary", "data-openen-save");
  save.addEventListener("click", options.onSave);

  const close = button("Close", "data-openen-close");
  close.addEventListener("click", () => {
    removeExisting();
    options.onClose();
  });

  actions.append(save, close);
  root.append(title, translation, meaning, actions);
  document.body.append(root);

  return root;
}
```

- [ ] **Step 4: Run tooltip tests**

Run:

```bash
npm test -- src/content/tooltip.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit tooltip**

Run:

```bash
git add src/content/tooltip.ts src/content/tooltip.test.ts
git commit -m "feat: render selection translation tooltip"
```

---

## Task 9: Content Script Orchestration

**Files:**
- Create: `src/content/contentScript.ts`
- Test: `src/content/contentScript.test.ts`

- [ ] **Step 1: Write failing content script tests**

Create `src/content/contentScript.test.ts`:

```ts
import { MessageType } from "../shared/messages";
import type { TranslationResult } from "../shared/types";
import { handleSelectionPayload } from "./contentScript";

describe("content script selection handling", () => {
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
    (document.querySelector("[data-openen-save]") as HTMLButtonElement).click();
    expect(sentMessages[1]).toMatchObject({ type: MessageType.AddVocabulary });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/content/contentScript.test.ts
```

Expected: FAIL because `contentScript.ts` does not exist.

- [ ] **Step 3: Implement content script orchestration**

Create `src/content/contentScript.ts`:

```ts
import { MessageType } from "../shared/messages";
import type { SelectionPayload, TranslationResult } from "../shared/types";
import { extractSelectionContext } from "./selectionContext";
import { createTranslationTooltip, removeTranslationTooltip } from "./tooltip";

type SendMessage = (message: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

function isTranslationResult(value: unknown): value is TranslationResult {
  return typeof value === "object" && value !== null && "translation" in value && "contextualMeaning" in value;
}

export async function handleSelectionPayload(payload: SelectionPayload, anchorRect: DOMRect, sendMessage: SendMessage): Promise<void> {
  const response = await sendMessage({ type: MessageType.TranslateSelection, payload });
  if (!response.ok || !isTranslationResult(response.data)) return;

  createTranslationTooltip({
    result: response.data,
    anchorRect,
    onClose: removeTranslationTooltip,
    onSave: () => {
      void sendMessage({
        type: MessageType.AddVocabulary,
        payload: {
          entry: {
            ...response.data,
            paragraphContext: payload.paragraphContext,
            sourceUrl: payload.sourceUrl,
            pageTitle: payload.pageTitle
          }
        }
      });
    }
  });
}

function getAnchorRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

function runtimeSendMessage(message: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return chrome.runtime.sendMessage(message);
}

document.addEventListener("selectionchange", () => {
  window.setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      removeTranslationTooltip();
      return;
    }

    const payload = extractSelectionContext(selection);
    const anchorRect = getAnchorRect(selection);
    if (!payload || !anchorRect) return;

    void handleSelectionPayload(payload, anchorRect, runtimeSendMessage);
  }, 120);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") removeTranslationTooltip();
});

document.addEventListener("scroll", removeTranslationTooltip, true);
```

- [ ] **Step 4: Run content script tests**

Run:

```bash
npm test -- src/content/contentScript.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit content script**

Run:

```bash
git add src/content/contentScript.ts src/content/contentScript.test.ts
git commit -m "feat: connect selections to translations"
```

---

## Task 10: Extension Popup UI

**Files:**
- Create: `src/ui/popup/popup.html`
- Create: `src/ui/popup/popup.css`
- Create: `src/ui/popup/popup.ts`
- Test: `src/ui/popup/popup.test.ts`

- [ ] **Step 1: Write failing popup tests**

Create `src/ui/popup/popup.test.ts`:

```ts
import type { VocabularyEntry } from "../../shared/types";
import { renderPopup } from "./popup";

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
  it("renders recent words and opens vocabulary page", () => {
    document.body.innerHTML = `<main><button id="openVocabulary"></button><ul id="recentWords"></ul></main>`;
    const openVocabulary = vi.fn();
    renderPopup({ entries, openVocabulary });

    expect(document.body.textContent).toContain("lead");
    (document.querySelector("#openVocabulary") as HTMLButtonElement).click();
    expect(openVocabulary).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/ui/popup/popup.test.ts
```

Expected: FAIL because popup files do not exist.

- [ ] **Step 3: Implement popup files**

Create `src/ui/popup/popup.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./popup.css" />
    <title>OpenEn</title>
  </head>
  <body>
    <main>
      <header>
        <strong>OpenEn</strong>
        <button id="openVocabulary" type="button">Vocabulary</button>
      </header>
      <ul id="recentWords"></ul>
    </main>
    <script type="module" src="./popup.js"></script>
  </body>
</html>
```

Create `src/ui/popup/popup.css`:

```css
body {
  width: 280px;
  margin: 0;
  font: 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #1f2328;
  background: #fff;
}

main {
  padding: 12px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

button {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #f6f8fa;
  padding: 4px 8px;
  cursor: pointer;
}

ul {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
}

li {
  padding: 8px 0;
  border-top: 1px solid #d8dee4;
}

.translation {
  color: #57606a;
  margin-top: 2px;
}
```

Create `src/ui/popup/popup.ts`:

```ts
import { MessageType } from "../../shared/messages";
import type { VocabularyEntry } from "../../shared/types";

interface RenderPopupOptions {
  entries: VocabularyEntry[];
  openVocabulary(): void;
}

export function renderPopup(options: RenderPopupOptions): void {
  const list = document.querySelector<HTMLUListElement>("#recentWords");
  const openButton = document.querySelector<HTMLButtonElement>("#openVocabulary");
  if (!list || !openButton) return;

  list.replaceChildren();
  for (const entry of options.entries.slice(0, 5)) {
    const item = document.createElement("li");
    const word = document.createElement("strong");
    word.textContent = entry.selectedText;
    const translation = document.createElement("div");
    translation.className = "translation";
    translation.textContent = entry.translation;
    item.append(word, translation);
    list.append(item);
  }

  if (options.entries.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No saved words yet.";
    list.append(item);
  }

  openButton.addEventListener("click", options.openVocabulary);
}

async function init(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: MessageType.ListVocabulary });
  const entries = response?.ok && Array.isArray(response.data) ? (response.data as VocabularyEntry[]) : [];
  renderPopup({
    entries,
    openVocabulary: () => chrome.runtime.openOptionsPage()
  });
}

void init();
```

- [ ] **Step 4: Run popup tests**

Run:

```bash
npm test -- src/ui/popup/popup.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit popup**

Run:

```bash
git add src/ui/popup
git commit -m "feat: add extension popup"
```

---

## Task 11: Vocabulary Management UI

**Files:**
- Create: `src/ui/vocabulary/vocabulary.html`
- Create: `src/ui/vocabulary/vocabulary.css`
- Create: `src/ui/vocabulary/vocabulary.ts`
- Test: `src/ui/vocabulary/vocabulary.test.ts`

- [ ] **Step 1: Write failing vocabulary UI tests**

Create `src/ui/vocabulary/vocabulary.test.ts`:

```ts
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

describe("vocabulary page", () => {
  it("renders entries and deletes a row", () => {
    const onDelete = vi.fn();
    document.body.innerHTML = `<input id="search" /><button id="exportJson"></button><button id="exportCsv"></button><tbody id="entries"></tbody>`;

    renderVocabularyPage({ entries, onDelete, onSearch: vi.fn(), onExport: vi.fn() });

    expect(document.body.textContent).toContain("lead");
    (document.querySelector("[data-delete-id='1']") as HTMLButtonElement).click();
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
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- src/ui/vocabulary/vocabulary.test.ts
```

Expected: FAIL because vocabulary UI files do not exist.

- [ ] **Step 3: Implement vocabulary page**

Create `src/ui/vocabulary/vocabulary.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./vocabulary.css" />
    <title>OpenEn Vocabulary</title>
  </head>
  <body>
    <main>
      <header>
        <h1>Vocabulary</h1>
        <div class="actions">
          <button id="exportJson" type="button">Export JSON</button>
          <button id="exportCsv" type="button">Export CSV</button>
        </div>
      </header>
      <input id="search" type="search" placeholder="Search saved words" />
      <table>
        <thead>
          <tr>
            <th>Word</th>
            <th>Translation</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="entries"></tbody>
      </table>
    </main>
    <script type="module" src="./vocabulary.js"></script>
  </body>
</html>
```

Create `src/ui/vocabulary/vocabulary.css`:

```css
body {
  margin: 0;
  font: 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #1f2328;
  background: #fff;
}

main {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

h1 {
  margin: 0;
  font-size: 24px;
}

.actions {
  display: flex;
  gap: 8px;
}

button,
input {
  font: inherit;
}

button {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #f6f8fa;
  padding: 6px 10px;
  cursor: pointer;
}

input {
  box-sizing: border-box;
  width: 100%;
  margin: 20px 0 12px;
  padding: 8px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 10px 8px;
  border-top: 1px solid #d8dee4;
  text-align: left;
  vertical-align: top;
}

th {
  color: #57606a;
  font-weight: 600;
}
```

Create `src/ui/vocabulary/vocabulary.ts`:

```ts
import { MessageType } from "../../shared/messages";
import type { ExportFormat, VocabularyEntry } from "../../shared/types";

interface RenderOptions {
  entries: VocabularyEntry[];
  onSearch(query: string): void;
  onDelete(id: string): void;
  onExport(format: ExportFormat): void;
}

export function renderVocabularyPage(options: RenderOptions): void {
  const tbody = document.querySelector<HTMLTableSectionElement>("#entries");
  const search = document.querySelector<HTMLInputElement>("#search");
  const exportJson = document.querySelector<HTMLButtonElement>("#exportJson");
  const exportCsv = document.querySelector<HTMLButtonElement>("#exportCsv");
  if (!tbody || !search || !exportJson || !exportCsv) return;

  tbody.replaceChildren();
  for (const entry of options.entries) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong></strong><div></div></td>
      <td></td>
      <td><a rel="noreferrer"></a></td>
      <td><button type="button" data-delete-id="${entry.id}">Delete</button></td>
    `;
    row.querySelector("strong")!.textContent = entry.selectedText;
    row.querySelector("div")!.textContent = entry.contextualMeaning;
    row.children[1]!.textContent = entry.translation;
    const link = row.querySelector("a")!;
    link.textContent = entry.pageTitle || entry.sourceUrl;
    link.setAttribute("href", entry.sourceUrl);
    row.querySelector("button")!.addEventListener("click", () => options.onDelete(entry.id));
    tbody.append(row);
  }

  if (options.entries.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No saved words.";
    row.append(cell);
    tbody.append(row);
  }

  search.addEventListener("input", () => options.onSearch(search.value));
  exportJson.addEventListener("click", () => options.onExport("json"));
  exportCsv.addEventListener("click", () => options.onExport("csv"));
}

function downloadText(filename: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadEntries(query = ""): Promise<VocabularyEntry[]> {
  const response = await chrome.runtime.sendMessage(
    query ? { type: MessageType.SearchVocabulary, payload: { query } } : { type: MessageType.ListVocabulary }
  );
  return response?.ok && Array.isArray(response.data) ? (response.data as VocabularyEntry[]) : [];
}

async function init(): Promise<void> {
  async function refresh(query = ""): Promise<void> {
    renderVocabularyPage({
      entries: await loadEntries(query),
      onSearch: (nextQuery) => void refresh(nextQuery),
      onDelete: async (id) => {
        await chrome.runtime.sendMessage({ type: MessageType.DeleteVocabulary, payload: { id } });
        await refresh((document.querySelector<HTMLInputElement>("#search")?.value ?? "").trim());
      },
      onExport: async (format) => {
        const response = await chrome.runtime.sendMessage({ type: MessageType.ExportVocabulary, payload: { format } });
        if (response?.ok && typeof response.data === "string") {
          downloadText(`openen-vocabulary.${format}`, response.data, format === "json" ? "application/json" : "text/csv");
        }
      }
    });
  }

  await refresh();
}

void init();
```

- [ ] **Step 4: Run vocabulary UI tests**

Run:

```bash
npm test -- src/ui/vocabulary/vocabulary.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit vocabulary UI**

Run:

```bash
git add src/ui/vocabulary
git commit -m "feat: add vocabulary management page"
```

---

## Task 12: Build Verification And Manual QA Guide

**Files:**
- Create: `docs/manual-qa.md`
- Modify: build inputs created in previous tasks when build reveals missing file paths.

- [ ] **Step 1: Write manual QA guide**

Create `docs/manual-qa.md`:

```md
# OpenEn Manual QA

## Build

Run:

\`\`\`bash
npm install
npm test
npm run typecheck
npm run build
\`\`\`

Expected result: all commands pass and `dist/manifest.json` exists.

## Load Extension

1. Open Chrome or Edge.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click "Load unpacked".
5. Select the `dist` directory from this repository.

Expected result: OpenEn appears in the extension list without manifest errors.

## Selection Translation

1. Open a normal web page with article text.
2. Select the word `lead` inside a paragraph such as `She will lead the design review tomorrow`.
3. Wait for the OpenEn popup.

Expected result: popup appears near the selected text and shows `lead as guide`.

## Save Vocabulary

1. Click "Add to vocabulary" in the selection popup.
2. Open the extension popup.
3. Click "Vocabulary".

Expected result: the saved word appears in the vocabulary page.

## Manage And Export

1. Search for the saved word.
2. Export JSON.
3. Export CSV.
4. Delete the saved word.

Expected result: search filters entries, exported files download, and delete removes the row.
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
test -f dist/manifest.json
test -f dist/content/contentScript.js
test -f dist/background/serviceWorker.js
test -f dist/ui/popup/popup.html
test -f dist/ui/vocabulary/vocabulary.html
```

Expected: all commands exit with code 0.

- [ ] **Step 3: Fix build path mismatches if verification finds any**

If `npm run build` fails because a file path is missing, update `scripts/build.mjs` so every copied HTML or CSS path matches the files created in Tasks 10 and 11. Re-run the exact command block from Step 2 until it exits with code 0.

- [ ] **Step 4: Commit QA guide and build fixes**

Run:

```bash
git add docs/manual-qa.md scripts/build.mjs
git commit -m "docs: add extension manual qa"
```

---

## Task 13: Final Browser Smoke Test

**Files:**
- Modify only files needed to fix failures found during this task.

- [ ] **Step 1: Build extension**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Load `dist` in Chrome or Edge**

Open the browser extension management page, load the repository's `dist` directory as an unpacked extension, and confirm there are no manifest or service worker errors.

- [ ] **Step 3: Verify the product loop**

Use a page containing this sentence:

```text
She will lead the design review tomorrow.
```

Select `lead`, verify the popup shows `lead as guide`, click `Add to vocabulary`, open the vocabulary page, verify the entry is visible, export JSON, export CSV, delete the entry, and verify the row disappears.

- [ ] **Step 4: Fix smoke test defects**

For each defect found, add or update the narrowest automated test covering that defect, then fix the implementation and re-run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands PASS after each fix.

- [ ] **Step 5: Commit smoke-test fixes**

Run:

```bash
git add src docs public scripts package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "fix: polish extension smoke test flow"
```

Skip the commit only if Step 4 made no file changes.

---

## Self-Review

- Spec coverage: MV3 Chrome/Edge target is implemented by `public/manifest.json`; fake provider is implemented by Tasks 2 and 3; paragraph context extraction is implemented by Task 4; local vocabulary storage is implemented by Task 5; JSON and CSV export is implemented by Task 6; selection popup is implemented by Tasks 8 and 9; popup and vocabulary pages are implemented by Tasks 10 and 11; manual verification is implemented by Tasks 12 and 13.
- Scope check: The plan implements one testable v1 product loop and keeps real AI integration, account sync, Safari packaging, Firefox support, and spaced repetition out of scope.
- Type consistency: Message names, `VocabularyEntry`, `TranslationRequest`, and `TranslationResult` are introduced before downstream tasks use them.
- Build consistency: Manifest paths match `scripts/build.mjs` output paths: `background/serviceWorker.js`, `content/contentScript.js`, `ui/popup/popup.html`, and `ui/vocabulary/vocabulary.html`.
