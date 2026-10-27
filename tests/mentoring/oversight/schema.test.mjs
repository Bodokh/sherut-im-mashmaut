import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import "../server/typescript-loader.mjs";
import { oversightCommandSchemas } from "../../../lib/mentoring/features/oversight/schema.ts";
import { DEFAULT_ORGANIZATION_POLICY, defaultOrganizationSettings } from "../../../lib/mentoring/features/oversight/contracts.ts";

test("settings use explicit provisional defaults and reject unsafe lease/timing input", () => {
  const command = { type: "update_organization_settings", operationId: randomUUID(), expectedVersion: 1, settings: { ...DEFAULT_ORGANIZATION_POLICY }, reason: "Policy decision" };
  const schema = oversightCommandSchemas[0];
  assert.equal(schema.safeParse(command).success, true);
  for (const settings of [{ ...command.settings, offlineLeaseHours: 0 }, { ...command.settings, offlineLeaseHours: 25 }, { ...command.settings, offlineLeaseHours: 1.5 }, { ...command.settings, appointmentReminderMinutesBefore: 1441 }, { ...command.settings, overdueRepeatHours: 0 }, { ...command.settings, overdueRepeatHours: 169 }, { ...command.settings, reminderAudience: "participants" }, { ...command.settings, providerSecret: "not-accepted" }]) assert.equal(schema.safeParse({ ...command, settings }).success, false);
  assert.equal(schema.safeParse({ ...command, reason: " " }).success, false);
  assert.equal(defaultOrganizationSettings("org", "2026-10-01T00:00:00Z").updatedBy, null);
});

test("monthly review has strict month/scope/version and no invented outcome fields", () => {
  const command = { type: "save_monthly_review", operationId: randomUUID(), month: "2026-10", scopeStaffId: null, expectedVersion: null, summary: "Observed progress", reviewed: true };
  const schema = oversightCommandSchemas[1];
  assert.equal(schema.safeParse(command).success, true);
  for (const patch of [{ month: "2026-13" }, { month: "0000-01" }, { scopeStaffId: "wrong" }, { expectedVersion: 0 }, { summary: "x".repeat(20_001) }, { wellbeingScore: 10 }]) assert.equal(schema.safeParse({ ...command, ...patch }).success, false);
});
