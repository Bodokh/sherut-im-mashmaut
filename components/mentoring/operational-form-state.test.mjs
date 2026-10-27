import assert from "node:assert/strict";
import test from "node:test";
import "../../tests/mentoring/server/typescript-loader.mjs";
import { authorityInputIssues, contactInputIssues, operationalCommandIssue, operationalFieldName, settingsInputIssues } from "./operational-form-state.ts";

const participantId = "c134f486-aea1-45f8-8f44-df2173d15740";
const staffId = "957a8d91-a3fa-4be5-81d1-d7cd5aac1292";
const settings = {
  offlineLeaseHours: "24", appointmentReminderMinutesBefore: "0",
  overdueRepeatHours: "", reminderAudience: "responsible_team", reason: "עדכון מדיניות",
};
const authority = {
  baseVersion: 1, baseTargetVersion: null, reason: "עדכון הרשאה", lifecycle: "active",
  staffId, grantAction: "set", actions: ["view"], expiresAtLocal: "",
  resourceId: participantId, protectionMode: "whole", fieldPaths: [],
};
const context = {
  participantId, resourceIds: [participantId], staff: { active: true, role: "coordinator" },
  grantActive: true, protectionActive: true, now: new Date("2026-10-27T10:00:00Z"),
};

test("blank required reminder cannot become a valid zero through numeric coercion", () => {
  assert.deepEqual(settingsInputIssues(settings), {});
  for (const blank of ["", "   "]) {
    const issues = settingsInputIssues({ ...settings, appointmentReminderMinutesBefore: blank });
    assert.match(issues.appointmentReminderMinutesBefore, /0.*1,440/);
  }
  assert.equal(settingsInputIssues({ ...settings, overdueRepeatHours: " " }).overdueRepeatHours, undefined);
});

test("every policy numeric field rejects fractions, exponents, negatives, and overflow with its own message", () => {
  for (const [field, valid, invalid] of [
    ["offlineLeaseHours", ["1", "24"], ["0", "25", "1.5", "1e1", "-1"]],
    ["appointmentReminderMinutesBefore", ["0", "1440"], ["1441", "-1", "0.5", "0x10"]],
    ["overdueRepeatHours", ["", "1", "168"], ["0", "169", "2.5", "1e1"]],
  ]) {
    for (const value of valid) assert.equal(settingsInputIssues({ ...settings, [field]: value })[field], undefined, `${field} accepts ${value}`);
    for (const value of invalid) assert.ok(settingsInputIssues({ ...settings, [field]: value })[field], `${field} rejects ${value}`);
  }
});

test("recovered policy enum tampering and whitespace or overlong reasons stay actionable", () => {
  assert.ok(settingsInputIssues({ ...settings, reminderAudience: "everyone" }).reminderAudience);
  assert.ok(settingsInputIssues({ ...settings, reason: " \n " }).reason);
  assert.ok(settingsInputIssues({ ...settings, reason: "א".repeat(2001) }).reason);
  assert.equal(settingsInputIssues({ ...settings, reason: "א".repeat(2000) }).reason, undefined);
});

test("contact inputs reject recovered enums and text beyond the shared 20,000 character boundary", () => {
  const values = { method: "phone", outcome: "completed", notes: "א".repeat(20_000), manualColor: "unchanged" };
  assert.deepEqual(contactInputIssues(values), {});
  const issues = contactInputIssues({ ...values, method: "email", outcome: "unknown", notes: "א".repeat(20_001), manualColor: "blue", color: "blue" });
  assert.deepEqual(Object.keys(issues).sort(), ["color", "manualColor", "method", "notes", "outcome"]);
});

test("authority drafts reject invalid toggle selections before normalizing an intent", () => {
  assert.deepEqual(authorityInputIssues("grant", authority, context), {});
  assert.ok(authorityInputIssues("grant", { ...authority, actions: ["unknown"] }, context).actions);
  assert.ok(authorityInputIssues("grant", { ...authority, grantAction: "unknown" }, context).grantAction);
  assert.ok(authorityInputIssues("grant", { ...authority, actions: [] }, context).actions);
  assert.ok(authorityInputIssues("grant", { ...authority, actions: ["view", "view"] }, context).actions);
  assert.ok(authorityInputIssues("lifecycle", { ...authority, lifecycle: "unknown" }, context).lifecycle);
  assert.ok(authorityInputIssues("protection", { ...authority, protectionMode: "unknown" }, context).protectionMode);
});

test("grant recipient, role, revoke availability, and current expiration are checked locally", () => {
  assert.ok(authorityInputIssues("grant", authority, { ...context, staff: undefined }).staffId);
  assert.ok(authorityInputIssues("grant", authority, { ...context, staff: { active: false, role: "coordinator" } }).staffId);
  assert.ok(authorityInputIssues("grant", { ...authority, actions: ["view", "approve"] }, { ...context, staff: { active: true, role: "mentor" } }).actions);
  assert.ok(authorityInputIssues("grant", { ...authority, grantAction: "revoke" }, { ...context, grantActive: false }).grantAction);
  for (const expiresAtLocal of ["2026-10-27T12:00", "2026-02-30T15:00", "invalid"]) {
    assert.ok(authorityInputIssues("grant", { ...authority, expiresAtLocal }, context).expiresAtLocal);
  }
  assert.equal(authorityInputIssues("grant", { ...authority, expiresAtLocal: "2026-10-27T13:00" }, context).expiresAtLocal, undefined);
});

test("protection choices must refer to an available record and fields belonging to that record", () => {
  assert.ok(authorityInputIssues("protection", { ...authority, resourceId: staffId }, context).resourceId);
  assert.ok(authorityInputIssues("protection", { ...authority, protectionMode: "fields", fieldPaths: [] }, context).fieldPaths);
  assert.ok(authorityInputIssues("protection", { ...authority, protectionMode: "fields", fieldPaths: ["notes"] }, context).fieldPaths);
  assert.equal(authorityInputIssues("protection", { ...authority, protectionMode: "fields", fieldPaths: ["phone"] }, context).fieldPaths, undefined);
  assert.ok(authorityInputIssues("protection", { ...authority, protectionMode: "fields", fieldPaths: ["phone", "phone"] }, context).fieldPaths);
  assert.ok(authorityInputIssues("protection", { ...authority, protectionMode: "unlock" }, { ...context, protectionActive: false }).protectionMode);
});

test("nested wire errors point at the visible control instead of an inaccessible array index", () => {
  for (const [wire, control] of [["settings.offlineLeaseHours", "offlineLeaseHours"], ["actions.0", "actions"], ["fieldPaths.1", "fieldPaths"], ["scheduledAt", "nextAppointmentAt"], ["expiresAt", "expiresAtLocal"]]) assert.equal(operationalFieldName(wire), control);
});

test("all administrative intents pass the shared wire contract without changing retry payloads", () => {
  for (const payload of [
    { type: "set_sms_muted", muted: true },
    { type: "review_contact", participantId, contactId: staffId, revision: 1, decision: "approved" },
    { type: "resolve_conflict", conflictId: staffId, decision: "keep_ceo" },
    { type: "save_monthly_review", month: "2026-10", scopeStaffId: null, expectedVersion: null, summary: "סקירה", reviewed: true },
  ]) {
    const frozen = Object.freeze(payload);
    assert.equal(operationalCommandIssue(frozen), null);
    assert.equal("operationId" in frozen, false);
  }
  assert.match(operationalCommandIssue({ type: "set_sms_muted", muted: "false" }).message, /[֐-׿]/);
  assert.equal(operationalCommandIssue({ type: "save_monthly_review", month: "2026-13", scopeStaffId: null, expectedVersion: null, summary: "", reviewed: false }).field, "month");
});
