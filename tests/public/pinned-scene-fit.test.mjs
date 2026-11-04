import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../../components/ui/PinnedSceneFit.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function fixture({ width = 390, height = 844, available = 772, panelHeights = [772], reduced = false, supported = true } = {}) {
  const section = { dataset: {}, querySelectorAll: () => panels };
  const panels = panelHeights.map((scrollHeight) => ({ scrollHeight }));
  const probe = { closest: () => section, getBoundingClientRect: () => ({ height: available }) };
  const fonts = Object.assign(new EventTarget(), { ready: new Promise(() => {}) });
  const document = Object.assign(new EventTarget(), { fonts });
  const motion = Object.assign(new EventTarget(), { matches: !reduced });
  let effect;
  let observer;
  class ResizeObserver {
    constructor(callback) { observer = { callback, disconnected: false }; }
    observe() {}
    disconnect() { observer.disconnected = true; }
  }
  const window = Object.assign(new EventTarget(), {
    ResizeObserver,
    location: { hash: "" },
    matchMedia(query) {
      motion.matches = !reduced && (!query.includes("min-width: 1000px") || width >= 1000) && (!query.includes("min-height: 760px") || height >= 760);
      return motion;
    },
    clearTimeout() {},
  });
  const exports = {};
  const context = {
    exports, window, document, ResizeObserver,
    CSS: { supports: () => supported },
    cancelAnimationFrame() {},
    require(name) {
      if (name === "react") return { useRef: () => ({ current: probe }), useLayoutEffect: (callback) => { effect = callback; } };
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(source, context, { filename: "PinnedSceneFit.js" });
  const rendered = exports.PinnedSceneFit();
  const cleanup = effect();
  return {
    section, panels, probe, motion, fonts, rendered,
    resize(nextAvailable, nextHeights = panelHeights) {
      available = nextAvailable;
      nextHeights.forEach((value, index) => { panels[index].scrollHeight = value; });
      observer.callback();
    },
    get observer() { return observer; },
    cleanup() { cleanup?.(); },
  };
}

test("phone and narrow desktop scenes pin when their complete composition fits", () => {
  for (const dimensions of [
    { width: 375, height: 667, available: 595 },
    { width: 390, height: 844, available: 772 },
    { width: 768, height: 1024, available: 936 },
    { width: 900, height: 700, available: 612 },
  ]) {
    const f = fixture({ ...dimensions, panelHeights: [dimensions.available] });
    try { assert.equal(f.section.dataset.pinnedFit, "true"); }
    finally { f.cleanup(); }
  }
});

test("the measured stage accepts integer scrollHeight rounding but rejects even one extra CSS pixel", () => {
  const f = fixture({ available: 594.5, panelHeights: [595] });
  try {
    assert.equal(f.section.dataset.pinnedFit, "true");
    f.resize(594.5, [596]);
    assert.equal(f.section.dataset.pinnedFit, undefined);
  } finally { f.cleanup(); }
});

test("text enlargement and shorter viewports release pinning, and resizing back restores it", () => {
  const f = fixture({ available: 535, panelHeights: [500, 200, 220] });
  try {
    assert.equal(f.section.dataset.pinnedFit, "true");
    f.resize(535, [560, 200, 220]);
    assert.equal(f.section.dataset.pinnedFit, undefined);
    f.resize(400, [500, 200, 220]);
    assert.equal(f.section.dataset.pinnedFit, undefined);
    f.resize(535, [500, 200, 220]);
    assert.equal(f.section.dataset.pinnedFit, "true");
    assert.match(f.rendered.props.style.height, /--pinned-reserve/);
  } finally { f.cleanup(); }
});

test("reduced motion, unsupported native timelines and empty scenes never pin", () => {
  for (const options of [{ reduced: true }, { supported: false }, { panelHeights: [] }]) {
    const f = fixture(options);
    try { assert.equal(f.section.dataset.pinnedFit, undefined); }
    finally { f.cleanup(); }
  }
});

test("preference changes disable pinning and cleanup releases observers", () => {
  const f = fixture();
  assert.equal(f.section.dataset.pinnedFit, "true");
  f.motion.matches = false;
  f.motion.dispatchEvent(new Event("change"));
  assert.equal(f.section.dataset.pinnedFit, undefined);
  f.motion.matches = true;
  f.motion.dispatchEvent(new Event("change"));
  assert.equal(f.section.dataset.pinnedFit, "true");
  f.cleanup();
  assert.equal(f.section.dataset.pinnedFit, undefined);
  assert.equal(f.observer.disconnected, true);
});
