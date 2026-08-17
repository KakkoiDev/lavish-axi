import assert from "node:assert/strict";
import test from "node:test";

import {
  definedCustomProperties,
  referencedCustomProperties,
  styleValidityFindings,
  unresolvedCustomProperties,
} from "../src/style-validity.js";

// The exact defect this module exists to catch: a page styled against DaisyUI v5 property names
// while loading v4, which defines --bc and never defines --color-base-content. Every referencing
// declaration is dropped, yet the text stays perfectly readable so the geometry audit says nothing.
const DAISYUI_V4 = ":root{--bc:0 0% 20%;--b1:0 0% 100%;--su:158 64% 52%}";
const DAISYUI_V5 = ":root{--color-base-content:#111;--color-base-100:#fff;--color-success:#0a0}";
const AUTHORED_AGAINST_V5 = `
  .kcard{background:color-mix(in oklab, var(--color-base-content) 6%, var(--color-base-100))}
  .kcard.acc-done{border-left:3px solid var(--color-success)}
`;

test("reports every unresolved property when the authored CSS targets the wrong major version", () => {
  const findings = styleValidityFindings({ authored: AUTHORED_AGAINST_V5, loaded: [DAISYUI_V4] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "unresolved-custom-property");
  assert.equal(findings[0].severity, "error");
  assert.deepEqual(findings[0].properties, ["--color-base-100", "--color-base-content", "--color-success"]);
});

test("stays silent once the matching major version is loaded", () => {
  assert.deepEqual(styleValidityFindings({ authored: AUTHORED_AGAINST_V5, loaded: [DAISYUI_V5] }), []);
});

test("a reference with a fallback still renders, so it is not a defect", () => {
  const authored = ".a{color:var(--nope, red)}";
  assert.deepEqual(unresolvedCustomProperties({ authored, loaded: [] }), []);
});

test("a property defined in the same authored block resolves", () => {
  const authored = ":root{--mine:#fff}.a{color:var(--mine)}";
  assert.deepEqual(unresolvedCustomProperties({ authored, loaded: [] }), []);
});

test("the runtime resolver rescues properties set outside any stylesheet", () => {
  const authored = ".a{color:var(--from-script)}";
  const resolve = (name) => (name === "--from-script" ? " #abc " : "");
  assert.deepEqual(unresolvedCustomProperties({ authored, loaded: [], resolve }), []);
  assert.deepEqual(unresolvedCustomProperties({ authored, loaded: [] }), ["--from-script"]);
});

test("an empty runtime value is treated as unresolved", () => {
  const authored = ".a{color:var(--blank)}";
  assert.deepEqual(unresolvedCustomProperties({ authored, loaded: [], resolve: () => "   " }), ["--blank"]);
});

test("each unresolved property is reported once regardless of how often it is referenced", () => {
  const authored = ".a{color:var(--x)}.b{background:var(--x)}.c{border-color:var(--x)}";
  assert.deepEqual(unresolvedCustomProperties({ authored, loaded: [] }), ["--x"]);
});

test("parses references and definitions without confusing one for the other", () => {
  assert.deepEqual(referencedCustomProperties(":root{--a:1}.x{color:var(--a)}"), ["--a"]);
  assert.deepEqual(definedCustomProperties(".x{color:var(--a)}"), []);
  assert.deepEqual(definedCustomProperties(":root{--a:1;--b:2}"), ["--a", "--b"]);
});

test("non-string input is tolerated rather than throwing inside a page audit", () => {
  assert.deepEqual(referencedCustomProperties(undefined), []);
  assert.deepEqual(definedCustomProperties(null), []);
  assert.deepEqual(styleValidityFindings(), []);
});
