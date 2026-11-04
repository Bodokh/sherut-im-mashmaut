import assert from "node:assert/strict";
import { test } from "node:test";
import { startTestimonialsAutoplay } from "../../components/sections/testimonials-autoplay.ts";

function fixture(reduced = false) {
  const original = { window: globalThis.window, document: globalThis.document, observer: globalThis.IntersectionObserver };
  const timers = new Map();
  let now = 0;
  let sequence = 0;
  let advances = 0;
  let enabled;
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const carousel = Object.assign(new EventTarget(), { contains: (node) => node === carousel || node === track });
  const track = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false, activeElement: null });
  const observation = { current: null };
  class Observer {
    constructor(callback) { this.callback = callback; observation.current = this; }
    observe(node) { assert.equal(node, carousel); }
    disconnect() { this.disconnected = true; }
  }
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => motion,
    IntersectionObserver: Observer,
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  Object.assign(globalThis, { window, document, IntersectionObserver: Observer });
  const controller = startTestimonialsAutoplay(carousel, track, () => ++advances, (value) => { enabled = value; });
  function dispatch(target, type, fields = {}) {
    target.dispatchEvent(Object.assign(new Event(type), fields));
  }
  function tick(duration) {
    const end = now + duration;
    for (;;) {
      const due = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!due || due[1].at > end) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
    }
    now = end;
  }
  return {
    controller, carousel, track, document, window, motion, dispatch, tick, timers,
    get advances() { return advances; },
    get enabled() { return enabled; },
    visible(value) { observation.current.callback([{ isIntersecting: value, intersectionRatio: value ? 0.75 : 0 }]); },
    cleanup() {
      controller.cleanup();
      Object.assign(globalThis, { window: original.window, document: original.document, IntersectionObserver: original.observer });
    },
  };
}

test("autoplay advances 1.7 times faster at 4706ms and never runs offscreen or in a hidden tab", () => {
  const f = fixture();
  try {
    assert.equal(f.enabled, true);
    f.tick(30_000);
    assert.equal(f.advances, 0);
    f.visible(true);
    f.tick(4_705);
    assert.equal(f.advances, 0);
    f.tick(1);
    assert.equal(f.advances, 1);
    f.visible(false);
    f.tick(20_000);
    assert.equal(f.advances, 1);
    f.visible(true);
    f.document.hidden = true;
    f.dispatch(f.document, "visibilitychange");
    f.tick(20_000);
    assert.equal(f.advances, 1);
    f.document.hidden = false;
    f.dispatch(f.document, "visibilitychange");
    f.tick(4_706);
    assert.equal(f.advances, 2);
  } finally { f.cleanup(); }
});

test("hover, focus and a touch drag pause reading, and manual scrolling restarts the full interval", () => {
  const f = fixture();
  try {
    f.visible(true);
    f.dispatch(f.carousel, "pointerenter", { pointerType: "mouse" });
    f.tick(9_000);
    assert.equal(f.advances, 0);
    f.dispatch(f.carousel, "pointerleave");
    f.dispatch(f.carousel, "focusin");
    f.tick(9_000);
    assert.equal(f.advances, 0);
    f.dispatch(f.carousel, "focusout", { relatedTarget: f.track });
    f.tick(9_000);
    assert.equal(f.advances, 0, "moving focus inside the carousel stays paused");
    f.dispatch(f.carousel, "focusout", { relatedTarget: null });
    f.dispatch(f.carousel, "pointerenter", { pointerType: "touch" });
    f.dispatch(f.track, "pointerdown");
    f.tick(9_000);
    assert.equal(f.advances, 0);
    f.dispatch(f.window, "pointerup");
    f.tick(4_000);
    f.dispatch(f.track, "wheel");
    f.tick(4_705);
    assert.equal(f.advances, 0);
    f.tick(1);
    assert.equal(f.advances, 1);
    f.tick(4_000);
    f.controller.reset();
    f.tick(4_705);
    assert.equal(f.advances, 1);
    f.tick(1);
    assert.equal(f.advances, 2);
  } finally { f.cleanup(); }
});

test("reduced motion defaults to paused, explicit play works, and a preference change stops autoplay", () => {
  const f = fixture(true);
  try {
    f.visible(true);
    f.tick(20_000);
    assert.equal(f.enabled, false);
    assert.equal(f.advances, 0);
    f.controller.toggle();
    f.tick(4_706);
    assert.equal(f.advances, 1);
    f.dispatch(f.motion, "change");
    f.tick(20_000);
    assert.equal(f.enabled, false);
    assert.equal(f.advances, 1);
    f.controller.toggle();
    f.controller.toggle();
    f.tick(20_000);
    assert.equal(f.advances, 1, "the pause button stops subsequent changes");
  } finally { f.cleanup(); }
});

test("cleanup cancels the timer, observers and input subscriptions", () => {
  const f = fixture();
  try {
    f.visible(true);
    assert.equal(f.timers.size, 1);
    f.controller.cleanup();
    assert.equal(f.timers.size, 0);
    f.dispatch(f.window, "pointerup");
    f.dispatch(f.document, "visibilitychange");
    f.tick(20_000);
    assert.equal(f.advances, 0);
    assert.equal(f.timers.size, 0);
  } finally { f.cleanup(); }
});

test("explicit Play can restart from the pause button while it still has focus or hover", () => {
  const f = fixture();
  try {
    f.visible(true);
    f.dispatch(f.carousel, "pointerenter", { pointerType: "mouse" });
    f.dispatch(f.carousel, "focusin");
    f.controller.toggle();
    f.controller.toggle();
    f.tick(4_706);
    assert.equal(f.advances, 1);
    f.dispatch(f.carousel, "focusin");
    f.tick(4_706);
    assert.equal(f.advances, 1, "a later focus movement pauses again");
  } finally { f.cleanup(); }
});
