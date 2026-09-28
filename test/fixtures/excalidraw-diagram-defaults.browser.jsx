/* global location, window */

// Calls the real, unmodified src/whiteboard-frame.js convertSource() rather
// than a hand-copied reimplementation, so a regression in that function -
// including reverting its applyDiagramDefaultRoughness or
// applyDiagramDefaultFontFamily call - fails this test. Importing the module also runs its main(), which only registers a
// postMessage listener and posts "ready" to itself; it never receives an
// "init" message here, so no editor is mounted.
import { convertSource, defaultAppState } from "../../src/whiteboard-frame.js";
import { DIAGRAM_DEFAULT_FONT_FAMILY, DIAGRAM_DEFAULT_ROUGHNESS } from "../../src/whiteboard-core.js";
import fixture from "./excalidraw-diagram-defaults.json" with { type: "json" };

/** @type {any} */ (window).EXCALIDRAW_ASSET_PATH = `${location.origin}/whiteboard-assets/`;

async function run() {
  const { elements } = await convertSource(fixture.source);
  const shapes = elements.filter((element) => !element.isDeleted && element.type !== "text");
  const texts = elements.filter((element) => !element.isDeleted && element.type === "text");
  if (shapes.length === 0) throw new Error("fixture produced no shape/arrow elements to check");
  if (texts.length === 0) throw new Error("fixture produced no text elements to check");
  const shapeRoughness = shapes.map((element) => element.roughness);
  const allShapesArchitect = shapeRoughness.every((value) => value === DIAGRAM_DEFAULT_ROUGHNESS);
  const textFontFamilies = texts.map((element) => element.fontFamily);
  const allTextMonospace = textFontFamilies.every((value) => value === DIAGRAM_DEFAULT_FONT_FAMILY);
  const drawRoughness = defaultAppState().currentItemRoughness;
  return {
    pass: true,
    shapeCount: shapes.length,
    textCount: texts.length,
    allShapesArchitect,
    shapeRoughness,
    allTextMonospace,
    textFontFamilies,
    drawRoughnessArchitect: drawRoughness === DIAGRAM_DEFAULT_ROUGHNESS,
  };
}

function report(result) {
  location.replace(`/result?value=${encodeURIComponent(JSON.stringify(result))}`);
}

run().then(
  (result) => report(result),
  (error) => report({ pass: false, error: error?.stack || String(error) }),
);
