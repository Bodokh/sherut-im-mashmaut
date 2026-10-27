import assert from "node:assert/strict";
import test from "node:test";
import { recoveredDocument } from "./recovered-document-state.ts";

const snapshot = { staff: [{ id: "mentor", displayName: "החונכת" }, { id: "coordinator", displayName: "הרכזת" }], participants: [{ participant: { id: "accepted", displayName: "חניכה קיימת" } }] };
const saved = (value) => ({ kind: "mentoring-form-draft-v1", value, intent: { operationId: "secret-operation-id", signature: "prepared-command-do-not-render" } });

test("orphan contact recovery exposes entered fields without prepared command or concurrency metadata", () => {
  const document = recoveredDocument("contact:failed-local-create", saved({ notes: "סיכום שלא נשלח", method: "phone", outcome: "completed", occurredAt: "2026-10-26T10:30", nextAppointmentAt: "2026-10-28T11:00", baseVersion: 4, appointmentVersion: 2 }), snapshot);
  assert.equal(document.orphan, true);
  assert.equal(document.href, null);
  assert.ok(document.rows.some((row) => row.label === "סיכום הקשר" && row.value === "סיכום שלא נשלח"));
  assert.ok(document.rows.some((row) => row.label === "דרך הקשר" && row.value === "שיחה טלפונית"));
  assert.ok(document.rows.some((row) => row.label === "מועד הקשר הבא" && row.date === "local"));
  assert.ok(!JSON.stringify(document).includes("secret-operation-id"));
  assert.ok(!JSON.stringify(document).includes("baseVersion"));
});

test("orphan assignment recovery keeps mentor and coordinator choices readable", () => {
  const document = recoveredDocument("assignment:failed-local-create", saved({ mentorId: "mentor", coordinatorId: "coordinator", baseVersion: 2 }), snapshot);
  assert.equal(document.orphan, true);
  assert.deepEqual(document.rows, [{ label: "חונך/ת", value: "החונכת" }, { label: "רכז/ת", value: "הרכזת" }]);
});

test("known contact recovery links to the actual participant query contract", () => {
  const document = recoveredDocument("contact:accepted", saved({ notes: "טיוטה" }), snapshot);
  assert.equal(document.participantName, "חניכה קיימת");
  assert.equal(document.orphan, false);
  assert.equal(document.href, "/staff/contacts/new?participant=accepted");
});

test("new profile recovery remains a draft and opens the participant list", () => {
  const document = recoveredDocument("participant-profile:new", saved({ displayName: "שם חלקי", phone: "", baseVersion: null }), snapshot);
  assert.equal(document.orphan, false);
  assert.equal(document.href, "/staff/participants");
  assert.equal(document.rows[0].value, "שם חלקי");
  assert.equal(document.rows[1].value, "טרם הוזן");
});

test("free text cannot be translated as an enum and technical prepared action metadata stays hidden", () => {
  const document = recoveredDocument("management-action:reviews", saved({ key: "technical-key", successMessage: "הדיווח אושר", payload: { type: "review_contact", operationId: "operation", participantId: "hidden-id", revision: 2, decision: "approved", notes: "active", reason: "phone" } }), snapshot);
  assert.deepEqual(document.rows, [{ label: "החלטת הבקרה", value: "אישור הדיווח" }, { label: "סיכום הקשר", value: "active" }, { label: "סיבת השינוי", value: "phone" }]);
  assert.ok(!JSON.stringify(document).includes("הדיווח אושר"));
});

test("zero, false and settings audience survive document formatting", () => {
  const document = recoveredDocument("organization-settings", saved({ appointmentReminderMinutesBefore: "0", overdueRemindersEnabled: false, reminderAudience: "responsible_team", reason: "לבדיקה" }), snapshot);
  assert.ok(document.rows.some((row) => row.value === "0"));
  assert.ok(document.rows.some((row) => row.label === "תזכורות על איחור" && row.value === "לא"));
  assert.ok(document.rows.some((row) => row.value === "הצוות האחראי לליווי"));
});

test("grant and protection arrays are readable while original instant timestamps remain identified", () => {
  const document = recoveredDocument("authority:grant:accepted:new", saved({ staffId: "mentor", actions: ["view", "edit"], fieldPaths: ["notes", "appointment"], expiresAt: "2026-11-01T10:00:00Z" }), snapshot);
  assert.ok(document.rows.some((row) => row.value === "צפייה, עריכה"));
  assert.ok(document.rows.some((row) => row.value === "סיכום הקשר, הפגישה הבאה"));
  assert.ok(document.rows.some((row) => row.date === "instant"));
});

test("monthly recovery retains month and team context encoded only in the draft key", () => {
  const document = recoveredDocument("monthly-review:2026-09:coordinator", saved({ summary: "סיכום חודשי", reviewed: true, baseVersion: 3 }), snapshot);
  assert.deepEqual(document.rows.slice(0, 2), [{ label: "חודש הבקרה", value: "09/2026" }, { label: "צוות הבקרה", value: "הרכזת" }]);
  assert.equal(document.title, "טיוטת בקרה חודשית · 09/2026 · הרכזת");
  const organization = recoveredDocument("monthly-review:2026-09:organization", saved({ summary: "סיכום ארגוני" }), snapshot);
  assert.equal(organization.rows[1].value, "כלל הארגון");
});

test("staff access recovery identifies the person from the draft key before showing the requested action", () => {
  const document = recoveredDocument("staff-access:mentor", saved({ active: false, baseVersion: 4 }), snapshot);
  assert.deepEqual(document.rows, [{ label: "חבר/ת הצוות בטיוטה", value: "החונכת" }, { label: "גישה פעילה", value: "לא" }]);
  assert.equal(document.title, "טיוטת שינוי גישה לצוות · החונכת");
});
