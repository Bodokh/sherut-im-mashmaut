import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { galleryPhotos } from "../../lib/gallery.ts";

test("the curated gallery has available photos, intrinsic sizes and descriptions in both languages", () => {
  assert.equal(galleryPhotos.length, 8);
  assert.equal(new Set(galleryPhotos.map((photo) => photo.src)).size, galleryPhotos.length);
  for (const photo of galleryPhotos) {
    assert.match(photo.src, /^\/images\/gallery\/\d{2}\.webp$/);
    assert.ok(existsSync(new URL(`../../public${photo.src}`, import.meta.url)), photo.src);
    assert.ok(photo.width > 0 && photo.height > 0, photo.src);
    assert.ok(photo.alt.he.trim() && photo.alt.en.trim(), photo.src);
    assert.notEqual(photo.alt.he, photo.alt.en, photo.src);
  }
});
