import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Next.js 16 leaves `scroll-behavior: smooth` in place during App Router
// transitions unless `<html>` opts in with data-scroll-behavior="smooth".
// The route scroll handler then calls scrollIntoView() on the page fragment.
// With smooth scrolling, that animation targets the footer and the new page
// settles at the bottom. The attribute restores an instant scroll to the top
// (and to hash targets) while in-page anchors stay smooth.
const documents = [
  "../../app/[locale]/layout.tsx",
  "../../app/global-not-found.tsx",
  "../../app/(staff)/layout.tsx",
  "../../app/(dialog-harness)/layout.tsx",
];

test("documents that smooth-scroll opt into instant route transitions", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /html\s*\{[^}]*scroll-behavior:\s*smooth/s);
  for (const file of documents) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /globals\.css/);
    assert.match(source, /<html\b[^>]*\bdata-scroll-behavior="smooth"/s, file);
  }
});
