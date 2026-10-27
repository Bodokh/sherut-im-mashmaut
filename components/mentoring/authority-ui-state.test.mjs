import assert from "node:assert/strict";
import test from "node:test";
import { reconcileStoredDraft } from "./draft-state.ts";
import {
  authorityPendingState,
  authorityScopeComparison,
  buildAuthorityIntent,
  normalizeGrantActions,
  participantProtectionFields,
} from "./authority-ui-state.ts";

const initial = {
  baseVersion: 4,
  baseTargetVersion: 2,
  reason: "  העברת אחריות מתועדת  ",
  lifecycle: "paused",
  staffId: "staff",
  grantAction: "set",
  actions: ["edit"],
  expiresAtLocal: "",
  resourceId: "participant",
  protectionMode: "whole",
  fieldPaths: [],
};

test("lifecycle protection has its Hebrew choice label and stays a scoped protection intent", () => {
  assert.equal(participantProtectionFields.lifecycle, "מצב הליווי");
  const command = buildAuthorityIntent("protection", "participant", { ...initial, protectionMode: "fields", fieldPaths: ["lifecycle"] }, null);
  assert.equal(command.active, true);
  assert.deepEqual(command.fieldPaths, ["lifecycle"]);
});

test("appointment protection uses the Hebrew choice and scope label", () => {
  assert.equal(participantProtectionFields.appointment, "הפגישה הבאה");
  const command = buildAuthorityIntent("protection", "participant", { ...initial, protectionMode: "fields", fieldPaths: ["appointment"] }, null);
  assert.deepEqual(command.fieldPaths, ["appointment"]);
  const scope = authorityScopeComparison("protection", { ...initial, protectionMode: "fields", fieldPaths: ["appointment"] }, { ...currentScope, protectionFields: ["appointment"], fieldLabels: participantProtectionFields });
  assert.equal(scope.find((row) => row.label === "תחום ההגנה").current, "הפגישה הבאה");
});

test("a queued delete is shown as pending and cannot offer an inverse restore", () => {
  assert.deepEqual(authorityPendingState({ localPending: true, deletedAt: "2026-10-26T10:00:00Z" }), { pending: true, deletionPending: true, canRestore: false, canDelete: false });
  assert.equal(authorityPendingState({ deletedAt: "2026-10-26T10:00:00Z" }).canRestore, true);
});

test("pending restore or other participant changes cannot immediately queue an opposite delete", () => {
  assert.equal(authorityPendingState({ localPending: true, deletedAt: null }).canDelete, false);
  assert.equal(authorityPendingState({ localPending: false, deletedAt: null }).canDelete, true);
});

const currentScope = {
  staffName: "רכזת מאושרת",
  grantActive: false,
  grantActions: [],
  grantExpiry: "ללא מועד תפוגה",
  draftExpiry: "1.1.2027, 10:00",
  resourceName: "כרטיס החניכה",
  protectionActive: true,
  protectionFields: null,
  fieldLabels: { phone: "טלפון" },
};

test("stale grant review exposes concurrent revocation and proposed permission expiry", () => {
  const rows = authorityScopeComparison("grant", initial, currentScope);
  assert.deepEqual(
    rows.find((row) => row.label === "מצב ההרשאה"),
    { label: "מצב ההרשאה", current: "אינה פעילה", draft: "הרשאה פעילה" },
  );
  assert.deepEqual(
    rows.find((row) => row.label === "הרשאות"),
    { label: "הרשאות", current: "ללא הרשאות", draft: "צפייה · עריכה" },
  );
  assert.equal(
    rows.find((row) => row.label === "תוקף ההרשאה").draft,
    "1.1.2027, 10:00",
  );
});

test("stale protection review exposes whole-record narrowing and explicit unlock", () => {
  const fields = authorityScopeComparison(
    "protection",
    { ...initial, protectionMode: "fields", fieldPaths: ["phone"] },
    currentScope,
  );
  assert.deepEqual(
    fields.find((row) => row.label === "תחום ההגנה"),
    { label: "תחום ההגנה", current: "כל הרשומה מוגנת", draft: "טלפון" },
  );
  const unlock = authorityScopeComparison(
    "protection",
    { ...initial, protectionMode: "unlock" },
    currentScope,
  );
  assert.equal(
    unlock.find((row) => row.label === "תחום ההגנה").draft,
    "ללא הגנה פעילה",
  );
});
test("grant changes carry both concurrency versions and view permission", () => {
  assert.deepEqual(
    buildAuthorityIntent(
      "grant",
      "participant",
      initial,
      "2027-01-01T00:00:00.000Z",
    ),
    {
      type: "set_access_grant",
      participantId: "participant",
      expectedVersion: 4,
      expectedGrantVersion: 2,
      staffId: "staff",
      actions: ["view", "edit"],
      expiresAt: "2027-01-01T00:00:00.000Z",
      reason: "העברת אחריות מתועדת",
    },
  );
  assert.deepEqual(normalizeGrantActions(["approve", "approve", "unknown"]), [
    "view",
    "approve",
  ]);
});
test("revocation sends no actions or expiry and never removes local read scope itself", () => {
  const intent = buildAuthorityIntent(
    "grant",
    "participant",
    { ...initial, grantAction: "revoke" },
    "2027-01-01T00:00:00.000Z",
  );
  assert.deepEqual(intent.actions, []);
  assert.equal(intent.expiresAt, null);
});
test("whole protection and explicit unlock have distinct active flags", () => {
  const whole = buildAuthorityIntent(
    "protection",
    "participant",
    initial,
    null,
  );
  const unlock = buildAuthorityIntent(
    "protection",
    "participant",
    { ...initial, protectionMode: "unlock", fieldPaths: ["notes"] },
    null,
  );
  assert.equal(whole.active, true);
  assert.equal(whole.fieldPaths, null);
  assert.equal(unlock.active, false);
  assert.equal(unlock.fieldPaths, null);
  assert.equal(unlock.expectedProtectionVersion, 2);
});
test("field protection rejects wrong-resource and empty field lists", () => {
  for (const fieldPaths of [[], ["notes"], ["__proto__"]])
    assert.throws(() =>
      buildAuthorityIntent(
        "protection",
        "participant",
        { ...initial, protectionMode: "fields", fieldPaths },
        null,
      ),
    );
  const contact = buildAuthorityIntent(
    "protection",
    "participant",
    {
      ...initial,
      resourceId: "contact",
      protectionMode: "fields",
      fieldPaths: ["notes", "notes"],
    },
    null,
  );
  assert.deepEqual(contact.fieldPaths, ["notes"]);
});
test("logical delete and restore preserve a reason and original participant version", () => {
  for (const mode of ["delete", "restore"]) {
    const intent = buildAuthorityIntent(mode, "participant", initial, null);
    assert.equal(intent.type, `${mode}_participant`);
    assert.equal(intent.expectedVersion, 4);
    assert.equal(intent.reason, "העברת אחריות מתועדת");
  }
  assert.throws(() =>
    buildAuthorityIntent(
      "delete",
      "participant",
      { ...initial, reason: "  " },
      null,
    ),
  );
});

test("an uncertain grant submission reconciles the persisted action identity before replacing it", async () => {
  const payload = buildAuthorityIntent("grant", "participant", initial, null);
  const operationId = "4ce2ae06-134e-457a-bffa-3c78751a4c70";
  const stored = {
    kind: "mentoring-form-draft-v1",
    value: initial,
    intent: { operationId, signature: JSON.stringify(payload) },
  };
  await assert.rejects(
    reconcileStoredDraft(
      stored,
      { ...initial, baseVersion: 5 },
      async (command) => {
        assert.deepEqual(command, { ...payload, operationId });
        throw new TypeError("Response lost after commit");
      },
    ),
  );
  const accepted = {
    ok: true,
    operationId,
    replayed: true,
    acceptance: "accepted",
    participantId: "participant",
  };
  const restored = await reconcileStoredDraft(
    stored,
    { ...initial, baseVersion: 5 },
    async (command) => {
      assert.deepEqual(command, { ...payload, operationId });
      return accepted;
    },
  );
  assert.equal(restored.recovered, accepted);
  assert.equal(restored.value.baseVersion, 4);
  assert.equal(restored.intent.operationId, operationId);
});
