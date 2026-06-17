import { extractSelectionContextFromRange } from "./selectionContext";

function selectText(node: Text, query: string): Range {
  const start = node.data.indexOf(query);
  if (start < 0) throw new Error(`Text not found: ${query}`);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + query.length);
  return range;
}

function selectTextOccurrence(node: Text, query: string, occurrence: number): Range {
  let start = -1;
  let searchFrom = 0;

  for (let index = 0; index <= occurrence; index += 1) {
    start = node.data.indexOf(query, searchFrom);
    if (start < 0) throw new Error(`Text occurrence not found: ${query}`);
    searchFrom = start + query.length;
  }

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

  it("returns null for selections inside textarea elements", () => {
    document.body.innerHTML = `<textarea>Do not extract this private note.</textarea>`;
    const text = document.querySelector("textarea")!.firstChild as Text;
    const result = extractSelectionContextFromRange(selectText(text, "private"));

    expect(result).toBeNull();
  });

  it("returns null for selections inside script elements", () => {
    document.body.innerHTML = `<script>const token = "secret";</script>`;
    const text = document.querySelector("script")!.firstChild as Text;
    const result = extractSelectionContextFromRange(selectText(text, "secret"));

    expect(result).toBeNull();
  });

  it("returns null for selections spanning ignored elements", () => {
    document.body.innerHTML = `
      <div>
        <p id="start">Allowed start text.</p>
        <script>const token = "secret";</script>
        <textarea>private draft</textarea>
        <p id="end">Allowed end text.</p>
      </div>
    `;
    const startText = document.querySelector("#start")!.firstChild as Text;
    const endText = document.querySelector("#end")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(startText, startText.data.indexOf("start"));
    range.setEnd(endText, endText.data.indexOf("end") + "end".length);

    const result = extractSelectionContextFromRange(range);

    expect(result).toBeNull();
  });

  it("keeps selected text in capped long paragraph context", () => {
    const selectedText = "needle-term";
    const longText = `${"context ".repeat(260)}${selectedText} trailing sentence.`;
    document.body.innerHTML = `<p>${longText}</p>`;
    const text = document.querySelector("p")!.firstChild as Text;
    const result = extractSelectionContextFromRange(selectText(text, selectedText));

    expect(result?.paragraphContext.length).toBeLessThanOrEqual(1500);
    expect(result?.paragraphContext).toContain(selectedText);
  });

  it("centers capped context on the actual repeated selection occurrence", () => {
    const selectedText = "target-word";
    const beginningMarker = "BEGINNING_MARKER";
    const endMarker = "NEAR_END_MARKER";
    const longText = `${beginningMarker} ${selectedText} ${"filler ".repeat(
      260
    )}${endMarker} ${selectedText} trailing sentence.`;
    document.body.innerHTML = `<p>${longText}</p>`;
    const text = document.querySelector("p")!.firstChild as Text;

    const result = extractSelectionContextFromRange(selectTextOccurrence(text, selectedText, 1));

    expect(result?.paragraphContext.length).toBeLessThanOrEqual(1500);
    expect(result?.paragraphContext).toContain(selectedText);
    expect(result?.paragraphContext).toContain(endMarker);
    expect(result?.paragraphContext).not.toContain(beginningMarker);
  });

  it("uses the current page URL as sourceUrl", () => {
    window.history.pushState({}, "", "/lesson?token=secret#answer");
    document.body.innerHTML = `<p>Keep the selected word context.</p>`;
    const text = document.querySelector("p")!.firstChild as Text;
    const result = extractSelectionContextFromRange(selectText(text, "selected"));

    expect(result?.sourceUrl).toBe(window.location.href);
  });
});
