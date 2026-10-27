import assert from "node:assert/strict";
import test from "node:test";
import { readableWorkspaceError } from "../../../lib/mentoring/ui-errors.ts";

test("known field and offline failures preserve their actionable Hebrew guidance", () => {
  for (const code of ["validation", "conflict", "expired", "storage_unavailable", "account_changed"]) {
    assert.equal(readableWorkspaceError({ code, message: "יש לבחור תאריך ולנסות שוב." }), "יש לבחור תאריך ולנסות שוב.");
  }
});
test("unknown exceptions are replaced with guidance without claiming the draft was saved", () => {
  for (const error of [new TypeError("Failed to fetch"), new Error("SQL credentials password=secret"), null, "technical failure", { code: "unavailable", message: "ECONNRESET" }, { code: "unknown", message: "שגיאת ספק token=secret" }]) {
    const message = readableWorkspaceError(error);
    assert.match(message, /יש לבדוק את החיבור/);
    assert.match(message, /לוודא שמוצג אישור/);
    assert.doesNotMatch(message, /SQL|ECONNRESET|secret|נשמרו|נשמרה/);
  }
});
