// Detects declarations that reference a CSS custom property nothing defines.
//
// A `var(--x)` naming an undefined property makes the whole declaration invalid at computed-value
// time, so the browser drops it. The element keeps its classes, its geometry is unaffected and its
// text stays readable, which is why the geometry-based layout audit correctly stays silent. The
// visual design is simply gone.
//
// Split into a pure core so it can be tested without a browser. The DOM-facing wrapper lives at the
// bottom and does nothing but gather inputs.

const VAR_REFERENCE = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,|\))/g;
const CUSTOM_PROPERTY_DECLARATION = /(^|[;{]\s*)(--[A-Za-z0-9_-]+)\s*:/g;

// A reference carrying a fallback (`var(--x, red)`) still renders, so it is not a defect.
export function referencedCustomProperties(cssText) {
  if (typeof cssText !== "string") return [];
  const found = new Set();
  for (const match of cssText.matchAll(VAR_REFERENCE)) {
    if (match[2] === ")") found.add(match[1]);
  }
  return [...found];
}

export function definedCustomProperties(cssText) {
  if (typeof cssText !== "string") return [];
  const found = new Set();
  for (const match of cssText.matchAll(CUSTOM_PROPERTY_DECLARATION)) found.add(match[2]);
  return [...found];
}

// `resolve` reports whether a property has a value at runtime, covering properties set by inline
// styles or script rather than by a stylesheet. Omitting it falls back to stylesheet text alone.
export function unresolvedCustomProperties({ authored = "", loaded = [], resolve } = {}) {
  const defined = new Set(definedCustomProperties(authored));
  for (const sheet of loaded) {
    for (const name of definedCustomProperties(sheet)) defined.add(name);
  }
  const unresolved = referencedCustomProperties(authored).filter((name) => {
    if (defined.has(name)) return false;
    if (typeof resolve !== "function") return true;
    return !String(resolve(name) ?? "").trim();
  });
  return unresolved.sort();
}

export function styleValidityFindings(input) {
  const names = unresolvedCustomProperties(input);
  if (!names.length) return [];
  return [
    {
      kind: "unresolved-custom-property",
      severity: "error",
      properties: names,
      count: names.length,
    },
  ];
}

export function collectStyleValidityFindings(doc = globalThis.document, win = globalThis) {
  const authored = [];
  const loaded = [];
  for (const sheet of doc?.styleSheets ?? []) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin stylesheet cannot be read. Its definitions are unknowable, so treat the whole
      // page as unverifiable rather than reporting references it may well define.
      return [];
    }
    const text = [...(rules ?? [])].map((rule) => rule.cssText).join("\n");
    (sheet.ownerNode?.tagName === "STYLE" ? authored : loaded).push(text);
  }
  const root = doc?.documentElement;
  const resolve =
    root && win?.getComputedStyle ? (name) => win.getComputedStyle(root).getPropertyValue(name) : undefined;
  return styleValidityFindings({ authored: authored.join("\n"), loaded, resolve });
}
