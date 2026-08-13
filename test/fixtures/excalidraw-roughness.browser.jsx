/* global document, location, window */

// Calls the real, unmodified src/whiteboard-frame.js convertSource() rather
// than a hand-copied reimplementation, so a regression in that function -
// including reverting its applyDiagramDefaultRoughness call - fails this
// test. Importing the module also runs its main(), which only registers a
// postMessage listener and posts "ready" to itself; it never receives an
// "init" message here, so no editor is mounted.
import { convertSource } from "../../src/whiteboard-frame.js";
import { DIAGRAM_DEFAULT_ROUGHNESS } from "../../src/whiteboard-core.js";
import fixture from "./excalidraw-roughness.json" with { type: "json" };

/** @type {any} */ (window).EXCALIDRAW_ASSET_PATH = `${location.origin}/whiteboard-assets/`;

async function run() {
  const { elements } = await convertSource(fixture.source);
  const shapes = elements.filter((element) => !element.isDeleted && element.type !== "text");
  const texts = elements.filter((element) => !element.isDeleted && element.type === "text");
  if (shapes.length === 0) throw new Error("fixture produced no shape/arrow elements to check");
  if (texts.length === 0) throw new Error("fixture produced no text elements to check");
  const shapeRoughness = shapes.map((element) => element.roughness);
  const allShapesArchitect = shapeRoughness.every((value) => value === DIAGRAM_DEFAULT_ROUGHNESS);
  return {
    pass: true,
    shapeCount: shapes.length,
    textCount: texts.length,
    allShapesArchitect,
    shapeRoughness,
  };
}

run().then(
  (result) => {
    document.body.dataset.result = JSON.stringify(result);
  },
  (error) => {
    document.body.dataset.result = JSON.stringify({ pass: false, error: error?.stack || String(error) });
  },
);
