/* global document, location, window */

import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements, exportToCanvas } from "@excalidraw/excalidraw";

import {
  applyDiagramDefaultRoughness,
  convertExcalidrawSkeletonsAfterFontsLoad,
  DIAGRAM_DEFAULT_ROUGHNESS,
  findDuplicateElementIds,
} from "../../src/whiteboard-core.js";
import fixture from "./excalidraw-roughness.json" with { type: "json" };

/** @type {any} */ (window).EXCALIDRAW_ASSET_PATH = `${location.origin}/whiteboard-assets/`;

async function loadFonts(elements, files) {
  await exportToCanvas({
    elements,
    appState: { exportBackground: false },
    files,
    maxWidthOrHeight: 1,
  });
  await document.fonts.ready;
}

function materialize(skeletons) {
  let elements = convertToExcalidrawElements(skeletons, { regenerateIds: false });
  if (findDuplicateElementIds(elements).length > 0) {
    elements = convertToExcalidrawElements(skeletons, { regenerateIds: true });
  }
  return elements;
}

// Mirrors src/whiteboard-frame.js's convertSource(): apply the shared default
// before materializing, exactly like the shipped conversion path.
async function convertSource(source) {
  const { elements: skeletons, files } = await parseMermaidToExcalidraw(source, {
    themeVariables: { fontSize: "16px" },
  });
  applyDiagramDefaultRoughness(skeletons);
  const elements = await convertExcalidrawSkeletonsAfterFontsLoad(skeletons, {
    convert: materialize,
    loadFonts: async (firstPass) => {
      await loadFonts(firstPass, files || null);
    },
  });
  return elements;
}

async function run() {
  const elements = await convertSource(fixture.source);
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
