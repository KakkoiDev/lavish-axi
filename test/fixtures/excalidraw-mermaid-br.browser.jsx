/* global document, location, window */

// End-to-end line-break regression: the Mermaid source under test is NOT
// hand-written here. The test extracts it from a real artifact HTML file with
// src/mermaid-source.js first and injects it into the page, so the fixture
// exercises the same server-extraction -> convertSource path the product runs.
// A fixture that inlined a source string with literal <br/> would pass even
// while extraction silently deleted the breaks.
import { convertSource } from "../../src/whiteboard-frame.js";

/** @type {any} */ (window).EXCALIDRAW_ASSET_PATH = `${location.origin}/whiteboard-assets/`;

function extractedSource() {
  const node = document.getElementById("lavish-mermaid-source");
  if (!node) throw new Error("test page did not inject the extracted Mermaid source");
  return JSON.parse(node.textContent).source;
}

async function run() {
  const source = extractedSource();
  const { elements, imageFallback } = await convertSource(source);
  if (imageFallback) throw new Error("flowchart fell back to an image instead of native shapes");
  const texts = elements
    .filter((element) => element.type === "text" && !element.isDeleted)
    .map((element) => ({
      text: String(element.text || ""),
      originalText: String(element.originalText || ""),
      width: element.width,
      height: element.height,
      containerId: element.containerId || "",
      containerWidth: elements.find((item) => item.id === element.containerId)?.width ?? null,
      containerHeight: elements.find((item) => item.id === element.containerId)?.height ?? null,
    }));
  return { pass: true, source, texts };
}

run().then(
  (result) => {
    document.body.dataset.result = JSON.stringify(result);
  },
  (error) => {
    document.body.dataset.result = JSON.stringify({ pass: false, error: error?.stack || String(error) });
  },
);
