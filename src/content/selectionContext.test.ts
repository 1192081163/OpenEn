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
