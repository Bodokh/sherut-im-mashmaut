import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHookRuntime } from "../../components/mentoring/test-hook-runtime.mjs";
import { galleryPhotos } from "../../lib/gallery.ts";

const labels = { title: "Gallery", openPhoto: "Enlarge photo", closePhoto: "Close photo", previousPhoto: "Previous photo", nextPhoto: "Next photo", photoLabel: "Photo" };

function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(elements)];
}
function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!tree || typeof tree !== "object") return "";
  return [tree.props?.children].flat(Infinity).map(text).join("");
}
function clickStage(stage, target, handler = () => {}) {
  let stopped = false;
  const event = { detail: 1, target, currentTarget: stage, preventDefault() {}, stopPropagation() { stopped = true; } };
  stage.props.onClickCapture(event);
  if (!stopped) { handler(); stage.props.onClick(event); }
}

function harness(t, locale = "en", photos = galleryPhotos) {
  const runtime = createHookRuntime();
  let dialogProps;
  const dialog = {
    open: false, opens: 0, closes: 0,
    showModal() { this.open = true; this.opens += 1; },
    close() { if (!this.open) return; this.open = false; this.closes += 1; dialogProps.onClose(); },
  };
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: { style: { overflow: "clip" } } };
  t.after(() => { runtime.unmount(); globalThis.document = previousDocument; });
  const jsx = (type, props) => {
    if (type === "dialog") { dialogProps = props; props.ref.current = dialog; }
    return { type, props };
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../../components/gallery/PhotoGrid.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    if (id === "react") return runtime.react;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (id === "next/image") return { default: "Image" };
    if (id.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => key }) };
    throw new Error(`Unexpected dependency: ${id}`);
  }, loaded, loaded.exports);
  runtime.mount(() => loaded.exports.PhotoGrid({ photos, locale, labels }));
  const find = (predicate) => elements(runtime.result).find(predicate);
  const button = (name) => find((item) => item.type === "button" && item.props["aria-label"] === name);
  return {
    runtime, dialog, button, find,
    get image() { return find((item) => item.type === "Image" && item.props.className === "fullPhoto"); },
    get status() { return text(find((item) => item.props.role === "status")); },
    async open(index) {
      elements(runtime.result).filter((item) => item.type === "button" && item.props["aria-haspopup"] === "dialog")[index].props.onClick();
      await runtime.flush();
    },
    async key(key) {
      let prevented = false;
      find((item) => item.type === "dialog").props.onKeyDown({ key, preventDefault() { prevented = true; } });
      await runtime.flush();
      return prevented;
    },
  };
}

test("previous/next wrap while preserving the open modal and scroll lock", async (t) => {
  const view = harness(t);
  await view.open(galleryPhotos.length - 1);
  assert.equal(view.dialog.opens, 1);
  assert.equal(globalThis.document.documentElement.style.overflow, "hidden");
  view.button(labels.nextPhoto).props.onClick();
  await view.runtime.flush();
  assert.equal(view.image.props.src, galleryPhotos[0].src);
  assert.match(view.status, /1\s*\/\s*8/);
  view.button(labels.previousPhoto).props.onClick();
  await view.runtime.flush();
  assert.equal(view.image.props.src, galleryPhotos[7].src);
  assert.equal(view.dialog.opens, 1);
  assert.equal(view.dialog.closes, 0);
  assert.equal(globalThis.document.documentElement.style.overflow, "hidden");
  view.button(labels.closePhoto).props.onClick();
  await view.runtime.flush();
  assert.equal(view.dialog.open, false);
  assert.equal(view.dialog.closes, 1);
  assert.equal(globalThis.document.documentElement.style.overflow, "clip");
});

test("keyboard arrows follow visual direction in English and Hebrew", async (t) => {
  for (const locale of ["en", "he"]) {
    await t.test(locale, async (subtest) => {
      const view = harness(subtest, locale);
      await view.open(0);
      assert.equal(await view.key(locale === "he" ? "ArrowLeft" : "ArrowRight"), true);
      assert.equal(view.image.props.src, galleryPhotos[1].src);
      await view.key(locale === "he" ? "ArrowRight" : "ArrowLeft");
      assert.equal(view.image.props.src, galleryPhotos[0].src);
      assert.equal(view.dialog.opens, 1);
    });
  }
});

test("thumbnail selection updates the active photo and announced caption", async (t) => {
  const view = harness(t);
  await view.open(0);
  const filmstrip = view.find((item) => item.props.className === "filmstrip");
  elements(filmstrip).filter((item) => item.type === "button")[5].props.onClick();
  await view.runtime.flush();
  assert.equal(view.image.props.src, galleryPhotos[5].src);
  assert.ok(view.status.includes(galleryPhotos[5].alt.en));
  assert.match(view.status, /6\s*\/\s*8/);
  assert.equal(view.find((item) => item.props["aria-current"] === "true").props.className, "thumbnailButton");
  assert.equal(view.dialog.opens, 1);
});

test("touch navigation ignores vertical gestures and uses the same RTL direction as buttons", async (t) => {
  const view = harness(t, "he");
  await view.open(0);
  const stage = () => view.find((item) => item.props.className === "stage");
  stage().props.onPointerDown({ pointerType: "touch", clientX: 100, clientY: 100 });
  stage().props.onPointerUp({ pointerType: "touch", clientX: 185, clientY: 110 });
  const currentStage = stage();
  clickStage(currentStage, currentStage);
  await view.runtime.flush();
  assert.equal(view.image.props.src, galleryPhotos[1].src);
  assert.equal(view.dialog.open, true, "The click synthesized after a swipe must not dismiss the photo.");
  stage().props.onPointerDown({ pointerType: "touch", clientX: 100, clientY: 100 });
  stage().props.onPointerUp({ pointerType: "touch", clientX: 180, clientY: 250 });
  await view.runtime.flush();
  assert.equal(view.image.props.src, galleryPhotos[1].src);
});

test("a swipe ending on a navigation control cannot also activate its generated click", async (t) => {
  const view = harness(t);
  await view.open(0);
  const stage = view.find((item) => item.props.className === "stage");
  stage.props.onPointerDown({ pointerType: "touch", clientX: 180, clientY: 100 });
  stage.props.onPointerUp({ pointerType: "touch", clientX: 80, clientY: 105 });
  const next = view.button(labels.nextPhoto);
  clickStage(stage, next, next.props.onClick);
  await view.runtime.flush();
  assert.equal(view.image.props.src, galleryPhotos[1].src);
  assert.equal(view.dialog.open, true);
});

test("clicking empty stage background closes while image/control clicks stay inside", async (t) => {
  const view = harness(t);
  await view.open(0);
  const stage = view.find((item) => item.props.className === "stage");
  const background = {};
  stage.props.onClick({ target: {}, currentTarget: background });
  await view.runtime.flush();
  assert.equal(view.dialog.open, true);
  stage.props.onPointerDown({ pointerType: "mouse" });
  stage.props.onClick({ target: background, currentTarget: background });
  await view.runtime.flush();
  assert.equal(view.dialog.open, false);
  assert.equal(globalThis.document.documentElement.style.overflow, "clip");
});

test("a single image has no redundant navigation controls", async (t) => {
  const view = harness(t, "en", galleryPhotos.slice(0, 1));
  await view.open(0);
  assert.equal(view.button(labels.nextPhoto), undefined);
  assert.equal(view.button(labels.previousPhoto), undefined);
  assert.equal(await view.key("ArrowRight"), false);
  assert.match(view.status, /1\s*\/\s*1/);
});
