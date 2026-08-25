import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as esbuild from "esbuild";
import { parse } from "parse5";

import { extractMermaidSources } from "../src/mermaid-source.js";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return "";
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function resultFromDump(html) {
  const document = parse(html);
  const stack = /** @type {import("parse5").DefaultTreeAdapterMap["node"][]} */ ([document]);
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeName === "body") {
      const element = /** @type {import("parse5").DefaultTreeAdapterMap["element"]} */ (node);
      const attribute = element.attrs.find((item) => item.name === "data-result");
      if (attribute) return JSON.parse(attribute.value);
    }
    if ("childNodes" in node) stack.push(...node.childNodes);
  }
  return null;
}

async function renderFixtureInChrome(chrome, { entry, prefix, headHtml = "", bodyHtml = "", timeBudgetMs, timeoutMs }) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await esbuild.build({
      entryPoints: [path.join(projectRoot, entry)],
      outdir: root,
      entryNames: "fixture",
      assetNames: "assets/[name]-[hash]",
      bundle: true,
      format: "iife",
      platform: "browser",
      conditions: ["production"],
      loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
      define: {
        "process.env.NODE_ENV": '"production"',
        "process.env.IS_PREACT": '"false"',
      },
    });
    await cp(
      path.join(projectRoot, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"),
      path.join(root, "whiteboard-assets/fonts"),
      { recursive: true },
    );
    await writeFile(
      path.join(root, "index.html"),
      `<!doctype html><html><head><meta charset="utf-8">${headHtml}</head><body>${bodyHtml}<script src="/fixture.js"></script></body></html>`,
    );
    const server = http.createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, "http://127.0.0.1").pathname;
        const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
        const file = path.resolve(root, relative);
        if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error("outside fixture root");
        const body = await readFile(file);
        response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server did not bind to a TCP port");
      const profile = path.join(root, "chrome-profile");
      const { stdout } = await execFileAsync(
        chrome,
        [
          "--headless=new",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-sandbox",
          `--user-data-dir=${profile}`,
          "--run-all-compositor-stages-before-draw",
          `--virtual-time-budget=${timeBudgetMs}`,
          "--dump-dom",
          `http://127.0.0.1:${address.port}/`,
        ],
        { maxBuffer: 8 * 1024 * 1024, timeout: timeoutMs },
      );
      return resultFromDump(stdout);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("real Excalidraw rendering keeps loaded-font labels inside their text bounds", { timeout: 90_000 }, async (t) => {
  const chrome = await chromePath();
  if (!chrome) {
    t.skip("Chrome or Chromium is required for the real-render regression");
    return;
  }
  const result = await renderFixtureInChrome(chrome, {
    entry: "test/fixtures/excalidraw-label-clipping.browser.jsx",
    prefix: "lavish-excalidraw-render-",
    headHtml: '<link rel="stylesheet" href="/fixture.css">',
    timeBudgetMs: 20_000,
    timeoutMs: 75_000,
  });
  assert.ok(result, "browser fixture did not report a result");
  assert.equal(result.pass, true, result.error);
  assert.equal(result.fontReady, true);
  assert.equal(result.edgeLabels, 4);
  assert.ok(result.multilineLines >= 2);
  assert.ok(result.repaired >= 5);
  assert.ok(result.opaquePixels >= 1000);
});

test("real Excalidraw conversion defaults shapes to Architect roughness", { timeout: 30_000 }, async (t) => {
  const chrome = await chromePath();
  if (!chrome) {
    t.skip("Chrome or Chromium is required for the real-render regression");
    return;
  }
  const result = await renderFixtureInChrome(chrome, {
    entry: "test/fixtures/excalidraw-roughness.browser.jsx",
    prefix: "lavish-excalidraw-roughness-",
    timeBudgetMs: 8_000,
    timeoutMs: 18_000,
  });
  assert.ok(result, "browser fixture did not report a result");
  assert.equal(result.pass, true, result.error);
  assert.ok(result.shapeCount > 0);
  assert.ok(result.textCount > 0);
  assert.equal(result.allShapesArchitect, true, JSON.stringify(result.shapeRoughness));
});

test(
  "artifact <br> node labels survive extraction and reach Excalidraw as real newlines",
  { timeout: 40_000 },
  async (t) => {
    const chrome = await chromePath();
    if (!chrome) {
      t.skip("Chrome or Chromium is required for the real-render regression");
      return;
    }
    const artifactHtml = await readFile(path.join(projectRoot, "test/fixtures/mermaid-br-artifact.html"), "utf8");
    const [extracted] = extractMermaidSources(artifactHtml);
    assert.ok(extracted, "fixture artifact exposed no .mermaid diagram");
    // `\u003c` keeps a `<` in the diagram source from closing the JSON script tag.
    const injected = JSON.stringify({ source: extracted.source }).replace(/</g, "\\u003c");
    const result = await renderFixtureInChrome(chrome, {
      entry: "test/fixtures/excalidraw-mermaid-br.browser.jsx",
      prefix: "lavish-excalidraw-mermaid-br-",
      bodyHtml: `<script id="lavish-mermaid-source" type="application/json">${injected}</script>`,
      timeBudgetMs: 12_000,
      timeoutMs: 30_000,
    });
    assert.ok(result, "browser fixture did not report a result");
    assert.equal(result.pass, true, result.error);

    const expected = [
      { kind: "unquoted <br/> node", lines: ["Upload dialog", "6 images or 1 PDF"] },
      { kind: "quoted <br> node", lines: ["Upload", "6 images or 1 PDF"] },
      { kind: "<br/> edge label", lines: ["queue", "batch"] },
    ];
    const rendered = result.texts.map((item) => item.originalText || item.text);
    for (const { kind, lines } of expected) {
      const fused = lines.join("");
      assert.ok(
        !rendered.some((value) => value.includes(fused)),
        `${kind} arrived fused as ${JSON.stringify(fused)}: ${JSON.stringify(rendered)}`,
      );
      const label = result.texts.find((item) => (item.originalText || item.text) === lines.join("\n"));
      assert.ok(label, `${kind} was not newline-separated in the scene: ${JSON.stringify(rendered)}`);
      assert.ok(label.text.includes("\n"), `${kind} display text lost its line break: ${JSON.stringify(label.text)}`);
      if (label.containerId) {
        assert.ok(
          label.containerHeight >= label.height,
          `${kind} container is shorter than its two-line label: ${JSON.stringify(label)}`,
        );
      }
    }
    assert.ok(rendered.includes("Single line node"), `single-line labels regressed: ${JSON.stringify(rendered)}`);
  },
);
