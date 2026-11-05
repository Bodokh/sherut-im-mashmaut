import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { jsx } from "react/jsx-runtime";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(
  readFileSync(new URL("../../components/sections/Manifesto.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } },
).outputText;
const exports = {};
vm.runInNewContext(source, {
  exports,
  require(name) {
    if (name.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
    if (name === "@/components/ui/Section") return { Section: ({ children }) => jsx("section", { children }) };
    if (name === "@/components/ui/PinnedSceneFit") return { PinnedSceneFit: () => null };
    if (name === "./MeaningMountains") return { MeaningMountains: () => null };
    if (name === "@/lib/media") return { media: {} };
    if (name === "next/image") return () => null;
    return require(name);
  },
}, { filename: "Manifesto.js" });

test("long manifesto curves retain local SVG paint and a visible fallback when CSS paint references fail", () => {
  const html = renderToStaticMarkup(jsx(exports.Manifesto, {
    dict: { manifesto: { kicker: "", lines: [], body: "", pillars: [] } },
  }));
  const curves = [...html.matchAll(/<path\b[^>]*class="[^"]*\bstrand\b[^"]*"[^>]*>/g)];
  assert.equal(curves.length, 24);
  for (const [path] of curves) {
    const paint = path.match(/\bstroke="url\(#([^)]*)\) (#[\da-f]{6})"/i);
    assert.ok(paint, "each full curve needs a document-local gradient and an explicit fallback color");
    assert.ok(html.includes(`<linearGradient id="${paint[1]}"`), "the paint server must exist in the same SVG");
    assert.match(path, /\bpathLength="1"/, "keep the complete-stroke drawing normalization");
  }
});
