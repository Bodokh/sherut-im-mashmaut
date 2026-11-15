import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";
import { defaultOrganizationSettings } from "../../../lib/mentoring/features/oversight/contracts.ts";
import { participant, assignment, appointment, contact, snapshot } from "../domain/fixtures.mjs";

const { previewReminders, maskStaffMobile } = await import("../../../lib/mentoring/features/reminders/preview.ts");

const now = "2026-10-26T12:00:00Z";
const settings = defaultOrganizationSettings("org-1", now);
const member = (id, role, overrides = {}) => ({ id, organizationId: "org-1", role, active: true, version: 1, authUserId: id,
  displayName: id, email: null, phone: "050-1234567", coordinatorId: null, smsMuted: false, ...overrides });
const staff = [member("mentor-1", "mentor"), member("coordinator-1", "coordinator"), member("ceo-1", "ceo"), member("other-mentor", "mentor")];
const mentee = { ...participant, displayName: "דנה לוי", phone: "052-7654321" };
const view = (overrides = {}) => snapshot({ participant: mentee, nextAppointment: { ...appointment, scheduledAt: "2026-10-27T08:00:00.000Z" }, ...overrides });

test("preview lists the three-day and scheduled-day messages for the mentor and the coordinator only", () => {
  const entries = previewReminders([view()], staff, settings, now).filter((entry) => entry.kind === "appointment");
  assert.deepEqual([...new Set(entries.map((entry) => entry.recipientId))].sort(), ["coordinator-1", "mentor-1"]);
  for (const recipient of ["mentor-1", "coordinator-1"]) {
    const mine = entries.filter((entry) => entry.recipientId === recipient);
    assert.deepEqual(mine.map((entry) => entry.label), ["three_days_before", "scheduled_day"]);
    assert.deepEqual(mine.map((entry) => entry.scheduledAt), ["2026-10-24T08:00:00.000Z", "2026-10-27T08:00:00.000Z"]);
    assert.equal(mine[0].due, true);
    assert.equal(mine[1].due, false);
  }
});

test("preview never selects the CEO or unrelated staff and masks staff numbers", () => {
  const entries = previewReminders([view()], staff, settings, now);
  assert.ok(entries.every((entry) => ["mentor", "coordinator"].includes(entry.recipientRole) && !["ceo-1", "other-mentor"].includes(entry.recipientId)));
  assert.ok(entries.every((entry) => entry.destination === "+97250•••4567"));
  assert.equal(maskStaffMobile(null), null);
});

test("preview redacts mentee personal data by default and includes name and phone on request", () => {
  const redacted = previewReminders([view()], staff, settings, now)[0].message;
  assert.ok(!redacted.includes("דנה לוי") && !redacted.includes("052"));
  const full = previewReminders([view()], staff, settings, now, { redactPersonalData: false })[0].message;
  assert.ok(full.includes("דנה לוי"));
  assert.ok(full.includes("(טלפון: +972527654321)"));
  assert.ok(full.includes("דוח מעקב"), "tells the recipient to file the tracking report after calling");
});

test("preview skips recipients with unusable numbers and cancelled schedules renew after a report", () => {
  const broken = previewReminders([view()], [member("mentor-1", "mentor", { phone: "abc" }), member("coordinator-1", "coordinator")], settings, now);
  assert.ok(broken.filter((entry) => entry.recipientId === "mentor-1").every((entry) => entry.skippedReason === "invalid_staff_phone" && entry.destination === null));
  assert.ok(broken.filter((entry) => entry.recipientId === "coordinator-1").every((entry) => entry.skippedReason === null));
  const afterReport = previewReminders([view({ nextAppointment: null, contacts: [contact({ occurredAt: "2026-10-26T09:00:00.000Z" })] })], staff, settings, now);
  assert.ok(afterReport.every((entry) => entry.kind !== "appointment"), "no scheduled-contact SMS remains once the report is filed and no new contact is scheduled");
  assert.ok(afterReport.every((entry) => !entry.due), "the overdue cycle restarts a week after the new report");
});

test("preview ignores closed, deleted and unassigned participants", () => {
  assert.deepEqual(previewReminders([view({ participant: { ...mentee, lifecycle: "paused" } })], staff, settings, now), []);
  assert.deepEqual(previewReminders([view({ assignment: null })], staff, settings, now), []);
  assert.deepEqual(previewReminders([view({ deletedAt: "2026-10-20T00:00:00.000Z" })], staff, settings, now), []);
  assert.ok(assignment);
});
