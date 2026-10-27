import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { commandSchema, parseCommand } from "../../../lib/mentoring/validation.ts";
import { parseCommand as parseServerCommand } from "../../../lib/mentoring/server/validation.ts";

const id = () => randomUUID();
const date = "2026-10-27T10:00:00+02:00";
const common = () => ({ operationId: id(), participantId: id(), expectedVersion: 1 });
const contact = () => ({ ...common(), contactId: id(), expectedRevision: 1, expectedAppointmentVersion: null });
const reason = "תיקון פרטים בעקבות שיחה";
const commands = {
  create_staff: () => ({ operationId: id(), fields: { displayName: "שרה", email: "staff@example.org", phone: null, role: "mentor", coordinatorId: null } }),
  update_staff: () => ({ operationId: id(), staffId: id(), expectedVersion: 1, fields: { displayName: "שרה", phone: null, role: "mentor", coordinatorId: null } }),
  set_staff_active: () => ({ operationId: id(), staffId: id(), expectedVersion: 1, active: false }),
  create_participant: () => ({ operationId: id(), fields: { displayName: "שרה", phone: null, serviceType: "national", servicePlace: "ירושלים", serviceRole: "הדרכה", profileNotes: "הערה" } }),
  update_participant: () => ({ ...common(), fields: { displayName: "שרה", phone: null, serviceType: "military", servicePlace: null, serviceRole: null, profileNotes: null } }),
  assign_participant: () => ({ ...common(), mentorId: id(), coordinatorId: null }),
  record_contact: () => ({ ...common(), expectedAppointmentVersion: null, method: "phone", outcome: "completed", occurredAt: date, notes: "דיווח", manualColor: "green", nextAppointmentAt: date }),
  review_contact: () => ({ operationId: id(), participantId: id(), contactId: id(), revision: 1, decision: "approved" }),
  revise_contact: () => ({ ...contact(), method: "in_person", outcome: "completed", occurredAt: date, notes: "דיווח מתוקן", reason, nextAppointmentAt: date }),
  invalidate_contact: () => ({ ...contact(), reason }),
  reschedule_appointment: () => ({ ...common(), expectedAppointmentVersion: 1, scheduledAt: date, reason }),
  set_manual_color: () => ({ ...common(), color: "orange", reason }),
  set_access_grant: () => ({ ...common(), reason, staffId: id(), expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: null }),
  set_ceo_protection: () => ({ ...common(), reason, resourceId: id(), expectedProtectionVersion: null, active: true, fieldPaths: ["phone"] }),
  set_participant_lifecycle: () => ({ ...common(), reason, lifecycle: "paused" }),
  delete_participant: () => ({ ...common(), reason }),
  restore_participant: () => ({ ...common(), reason }),
  update_organization_settings: () => ({ operationId: id(), expectedVersion: 1, settings: { offlineLeaseHours: 24, reminderAudience: "responsible_team", appointmentReminderMinutesBefore: 0, overdueRemindersEnabled: true, overdueRepeatHours: null }, reason }),
  save_monthly_review: () => ({ operationId: id(), month: "2026-10", scopeStaffId: null, expectedVersion: null, summary: "סיכום", reviewed: true }),
  evaluate_reminders: () => ({ operationId: id(), afterParticipantId: null }),
  set_sms_muted: () => ({ operationId: id(), muted: true }),
  resolve_conflict: () => ({ operationId: id(), conflictId: id(), decision: "keep_ceo" }),
};
const make = (type) => ({ type, ...commands[type]() });
const set = (command, path, value) => {
  const copy = structuredClone(command);
  const parts = path.split(".");
  let target = copy;
  for (const part of parts.slice(0, -1)) target = target[part];
  if (value === undefined) delete target[parts.at(-1)];
  else target[parts.at(-1)] = value;
  return copy;
};
function rejected(command, field) {
  const result = parseCommand(command);
  assert.equal(result.ok, false, `${command?.type ?? "invalid command"}: ${field ?? "form"} must fail`);
  assert.equal(result.error.code, "validation");
  assert.match(result.error.message, /[א-ת]/, "every rejection has a Hebrew explanation");
  assert.doesNotMatch(result.error.message, /Invalid|Expected|Too (?:big|small)|Unrecognized|unknown|undefined|NaN/);
  if (field) assert.equal(result.error.field, field);
  return result.error;
}

test("client-safe and server command parsers share every supported command shape", () => {
  assert.equal(parseCommand, parseServerCommand);
  for (const type of Object.keys(commands)) {
    const command = make(type);
    assert.equal(parseCommand(command).ok, true, type);
    rejected({ ...command, extra: true });
    rejected(set(command, "operationId", "invalid"), "operationId");
    rejected(set(command, "operationId", undefined), "operationId");
  }
  for (const value of [null, undefined, true, [], {}, { type: "unsupported" }, { type: 1 }]) rejected(value);
});

test("client-safe validation dependency graph contains no server or Node imports", async () => {
  const files = ["validation.ts", "validation-fields.ts", "features/authority/schema.ts", "features/contacts/schema.ts", "features/oversight/schema.ts"];
  for (const file of files) {
    const source = await readFile(new URL(`../../../lib/mentoring/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:from\s*|import\s*)["'](?:node:|server-only|.*\/server(?:\/|["']))/, file);
  }
});

test("every required form field rejects omission with a Hebrew field error", () => {
  const optional = new Set(["evaluate_reminders.afterParticipantId", "record_contact.manualColor", "revise_contact.nextAppointmentAt", "set_manual_color.reason"]);
  for (const type of Object.keys(commands)) {
    const command = make(type);
    for (const field of Object.keys(command).filter((key) => key !== "type")) {
      if (optional.has(`${type}.${field}`)) continue;
      rejected(set(command, field, undefined), field);
    }
  }
  for (const field of Object.keys(make("create_staff").fields)) rejected(set(make("create_staff"), `fields.${field}`, undefined), `fields.${field}`);
  for (const field of Object.keys(make("update_organization_settings").settings)) rejected(set(make("update_organization_settings"), `settings.${field}`, undefined), `settings.${field}`);
});

test("all identity, version and boolean fields reject invalid primitive values", () => {
  for (const type of Object.keys(commands)) {
    const command = make(type);
    for (const [field, value] of Object.entries(command)) {
      if (field.endsWith("Id")) {
        for (const invalid of ["", "not-an-id", 1, {}]) rejected(set(command, field, invalid), field);
      }
      if (/Version$|^revision$|^expectedRevision$/.test(field)) {
        for (const invalid of [0, -1, 1.5, "1", Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) rejected(set(command, field, invalid), field);
        assert.equal(parseCommand(set(command, field, 2_147_483_647)).ok, true, `${type}.${field} supports the DB integer boundary`);
      }
      if (typeof value === "boolean") for (const invalid of ["true", 1, null]) rejected(set(command, field, invalid), field);
    }
  }
  for (const type of ["create_staff", "update_staff"]) rejected(set(make(type), "fields.coordinatorId", "invalid"), "fields.coordinatorId");
});

test("staff and participant phone input is validated and canonicalized at every write boundary", () => {
  for (const type of ["create_staff", "update_staff", "create_participant", "update_participant"]) {
    for (const [value, expected] of [["050-123-4567", "+972501234567"], ["+972 50 123 4567", "+972501234567"], ["+1 (202) 555-0123", "+12025550123"], ["  ", null], ["", null], [null, null]]) {
      const parsed = parseCommand(set(make(type), "fields.phone", value));
      assert.equal(parsed.ok, true, `${type}: ${String(value)}`);
      assert.equal(parsed.command.fields.phone, expected);
    }
    for (const value of ["123", "not-a-phone", "+972", "0501234567,0521234567", "x".repeat(41), 501234567, {}]) {
      const error = rejected(set(make(type), "fields.phone", value), "fields.phone");
      assert.match(error.message, /טלפון/);
    }
  }
});

test("optional participant profile fields retain their established empty and nullable contract", () => {
  assert.equal(parseCommand({ type: "create_participant", operationId: id(), fields: {} }).ok, true);
  for (const type of ["create_participant", "update_participant"]) {
    const command = make(type);
    for (const field of ["displayName", "phone", "serviceType", "servicePlace", "serviceRole", "profileNotes"]) {
      assert.equal(parseCommand(set(command, `fields.${field}`, undefined)).ok, true, `${type}.${field} remains optional`);
    }
    for (const field of ["phone", "serviceType", "servicePlace", "serviceRole", "profileNotes"]) assert.equal(parseCommand(set(command, `fields.${field}`, null)).ok, true);
    assert.equal(parseCommand(set(command, "fields.displayName", "  ")).ok, true);
    rejected(set(command, "fields.displayName", null), "fields.displayName");
    rejected(set(command, "fields.serviceType", "other"), "fields.serviceType");
    rejected(set(command, "fields.extra", "untrusted"), "fields");
  }
  rejected(set(make("update_participant"), "fields", {}), "fields");
  rejected(set(make("update_staff"), "fields", {}), "fields");
});

test("text fields have clear length limits and required staff names and reasons cannot be blank", () => {
  const limits = [
    ["create_staff", "fields.displayName", 200], ["update_staff", "fields.displayName", 200],
    ["create_participant", "fields.displayName", 160], ["update_participant", "fields.displayName", 160],
    ["create_participant", "fields.servicePlace", 240], ["update_participant", "fields.servicePlace", 240],
    ["create_participant", "fields.serviceRole", 240], ["update_participant", "fields.serviceRole", 240],
    ["create_participant", "fields.profileNotes", 20_000], ["update_participant", "fields.profileNotes", 20_000],
    ["record_contact", "notes", 20_000], ["revise_contact", "notes", 20_000], ["save_monthly_review", "summary", 20_000],
  ];
  for (const type of Object.keys(commands)) if ("reason" in make(type)) limits.push([type, "reason", 2_000]);
  for (const [type, path, maximum] of limits) {
    assert.equal(parseCommand(set(make(type), path, "א".repeat(maximum))).ok, true, `${type}.${path} boundary`);
    assert.match(rejected(set(make(type), path, "א".repeat(maximum + 1)), path).message, new RegExp(String(maximum.toLocaleString("en-US")).replaceAll(",", ",?")));
    rejected(set(make(type), path, 1), path);
    if (path === "reason" || (["create_staff", "update_staff"].includes(type) && path === "fields.displayName")) rejected(set(make(type), path, "  "), path);
  }
  for (const type of ["create_staff", "update_staff"]) {
    assert.equal(parseCommand(set(make(type), "fields.displayName", "  שרה  ")).command.fields.displayName, "שרה");
  }
  const staff = parseCommand(set(make("create_staff"), "fields.email", "  STAFF@EXAMPLE.ORG  "));
  assert.equal(staff.ok, true);
  assert.equal(staff.command.fields.email, "staff@example.org");
  for (const email of ["", "invalid", "name@", "x".repeat(321), null, 1]) assert.match(rejected(set(make("create_staff"), "fields.email", email), "fields.email").message, /דוא/);
});

test("enum choices and authority arrays explain invalid selections and preserve policy constraints", () => {
  const fields = [["create_staff", "fields.role"], ["update_staff", "fields.role"], ["create_participant", "fields.serviceType"], ["update_participant", "fields.serviceType"], ["record_contact", "method"], ["record_contact", "outcome"], ["record_contact", "manualColor"], ["revise_contact", "method"], ["revise_contact", "outcome"], ["review_contact", "decision"], ["set_manual_color", "color"], ["set_participant_lifecycle", "lifecycle"], ["update_organization_settings", "settings.reminderAudience"], ["resolve_conflict", "decision"]];
  for (const [type, field] of fields) for (const value of ["unsupported", "", 1]) rejected(set(make(type), field, value), field);
  for (const actions of [["unsupported"], ["view", "view"], ["edit"], ["approve"], ["view", "edit", "approve", "view"], "view"]) rejected(set(make("set_access_grant"), "actions", actions));
  assert.equal(parseCommand(set(make("set_access_grant"), "actions", [])).ok, true, "an empty list continues to revoke a grant");
  for (const fieldPaths of [[], ["unsupported"], ["phone", "phone"], ["phone", ...Array(16).fill("notes")], "phone"]) rejected(set(make("set_ceo_protection"), "fieldPaths", fieldPaths));
  assert.equal(parseCommand(set(make("set_ceo_protection"), "fieldPaths", null)).ok, true, "null continues to protect the full resource");
  rejected({ ...make("set_ceo_protection"), active: false, fieldPaths: ["phone"] }, "fieldPaths");
  assert.equal(parseCommand({ ...make("set_ceo_protection"), active: false, fieldPaths: null }).ok, true);
});

test("all date inputs reject invalid calendar dates, missing timezones and wrong types", () => {
  for (const [type, field] of [["record_contact", "occurredAt"], ["record_contact", "nextAppointmentAt"], ["revise_contact", "occurredAt"], ["revise_contact", "nextAppointmentAt"], ["reschedule_appointment", "scheduledAt"], ["set_access_grant", "expiresAt"]]) {
    for (const value of ["", "not-a-date", "2026-10-27T10:00", "2026-02-30T10:00:00Z", 1]) {
      assert.match(rejected(set(make(type), field, value), field).message, /(?:מועד|תאריך|תוקף)/);
    }
    assert.equal(parseCommand(set(make(type), field, "2026-10-27T08:00:00Z")).ok, true);
  }
  for (const month of ["0000-01", "2026-00", "2026-13", "2026-1", "26-10", "", null, 1]) rejected(set(make("save_monthly_review"), "month", month), "month");
  for (const month of ["0001-01", "9999-12"]) assert.equal(parseCommand(set(make("save_monthly_review"), "month", month)).ok, true);
});

test("organization number inputs enforce documented whole-number ranges and nullable recurrence", () => {
  for (const [field, minimum, maximum] of [["offlineLeaseHours", 1, 24], ["appointmentReminderMinutesBefore", 0, 1440], ["overdueRepeatHours", 1, 168]]) {
    for (const value of [minimum, maximum]) assert.equal(parseCommand(set(make("update_organization_settings"), `settings.${field}`, value)).ok, true);
    for (const value of [minimum - 1, maximum + 1, 1.5, "1", Number.NaN, Number.POSITIVE_INFINITY]) rejected(set(make("update_organization_settings"), `settings.${field}`, value), `settings.${field}`);
  }
  rejected(set(make("update_organization_settings"), "settings.overdueRemindersEnabled", "true"), "settings.overdueRemindersEnabled");
  rejected(set(make("update_organization_settings"), "settings.extra", true), "settings");
});

test("direct schema use also returns Hebrew errors for unsupported and malformed forms", () => {
  for (const value of [null, {}, { type: "unsupported" }, set(make("create_staff"), "fields", []), set(make("set_ceo_protection"), "fieldPaths", [1])]) {
    const result = commandSchema.safeParse(value);
    assert.equal(result.success, false);
    for (const issue of result.error.issues) assert.match(issue.message, /[א-ת]/);
  }
});
