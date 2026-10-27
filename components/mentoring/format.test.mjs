import assert from "node:assert/strict";
import test from "node:test";
import { fromDateTimeInput, toDateTimeInput } from "./format.ts";

test("organization input uses Jerusalem time regardless of the device timezone", () => {
  assert.equal(toDateTimeInput("2026-10-26T09:15:00Z"), "2026-10-26T11:15");
  assert.equal(
    fromDateTimeInput("2026-10-26T11:15"),
    "2026-10-26T09:15:00.000Z",
  );
});

test("spring clock-change gaps cannot silently become a different meeting time", () => {
  assert.equal(fromDateTimeInput("2026-03-27T02:30"), null);
  assert.equal(
    fromDateTimeInput("2026-03-27T03:30"),
    "2026-03-27T00:30:00.000Z",
  );
});

test("ambiguous autumn wall times select the earlier instant consistently", () => {
  assert.equal(
    fromDateTimeInput("2026-10-25T01:30"),
    "2026-10-24T22:30:00.000Z",
  );
});

test("malformed and impossible calendar dates are rejected", () => {
  for (const value of [
    "",
    "2026-02-30T10:00",
    "2026-10-26T25:00",
    "2026-10-26",
    "2026-10-26T11:15Z",
  ]) {
    assert.equal(fromDateTimeInput(value), null);
  }
});
