import assert from "node:assert/strict";
import test from "node:test";
import { changedStaffFields, isPendingStaffPreapproval, staffEditValues } from "./staff-form-state.ts";
import { reconcileStoredDraft } from "./draft-state.ts";

const member = {
  id: "f1728bb5-4f1f-4378-a9b4-3a533beb347c", organizationId: "organization",
  displayName: "חונכת", phone: "0501234567", email: "mentor@example.org",
  role: "mentor", coordinatorId: "coordinator", active: true, version: 7,
  authUserId: "user_mentor", smsMuted: false,
};

test("pending preapprovals are distinguished from accepted inactive staff and pending edits", () => {
  assert.equal(isPendingStaffPreapproval({ ...member, localPending: true, active: false, version: 1 }), true);
  assert.equal(isPendingStaffPreapproval({ ...member, localPending: true, active: false }), false);
  assert.equal(isPendingStaffPreapproval({ ...member, localPending: true }), false);
  assert.equal(isPendingStaffPreapproval({ ...member, active: false, version: 1 }), false);
});

test("staff drafts retain their original concurrency version", () => {
  const draft = staffEditValues(member);
  assert.equal(draft.baseVersion, 7);
  const later = { ...member, version: 8, displayName: "שם מעודכן" };
  assert.deepEqual(changedStaffFields(later, draft), { displayName: "חונכת" });
  assert.equal(draft.baseVersion, 7, "review is required before the draft can use a new version");
});

test("ordinary staff edits exclude unchanged role and team authority", () => {
  const draft = { ...staffEditValues(member), displayName: "  שם חדש  " };
  assert.deepEqual(changedStaffFields(member, draft), { displayName: "שם חדש" });
  assert.deepEqual(changedStaffFields(member, staffEditValues(member)), {});
});

test("phone clearing is explicit and normalized", () => {
  assert.deepEqual(changedStaffFields(member, { ...staffEditValues(member), phone: "  " }), { phone: null });
  const noPhone = { ...member, phone: null };
  assert.deepEqual(changedStaffFields(noPhone, { ...staffEditValues(noPhone), phone: " " }), {});
});

test("changing a mentor to coordinator also clears her former team", () => {
  assert.deepEqual(changedStaffFields(member, { ...staffEditValues(member), role: "coordinator" }), { role: "coordinator", coordinatorId: null });
});

test("CEO profile edits never send role or team fields", () => {
  const ceo = { ...member, role: "ceo", coordinatorId: null };
  assert.deepEqual(changedStaffFields(ceo, { ...staffEditValues(ceo), displayName: "שם הנהלה", role: "mentor", coordinatorId: "untrusted" }), { displayName: "שם הנהלה" });
});

for (const type of ["create_staff", "update_staff", "set_staff_active"]) {
  for (const acceptance of ["queued", "accepted"]) {
    test(`${type} response loss reuses its prepared identity when ${acceptance}`, async () => {
      const payload = type === "create_staff"
        ? { type, fields: { displayName: member.displayName, phone: member.phone, email: member.email, role: member.role, coordinatorId: member.coordinatorId } }
        : type === "update_staff"
          ? { type, staffId: member.id, expectedVersion: 7, fields: { phone: null } }
          : { type, staffId: member.id, expectedVersion: 7, active: false };
      const operationId = "56cbdaf9-880c-4200-9c3a-f18d851f96cb";
      const value = { ...staffEditValues(member), phone: "", active: false };
      const receipt = { ok: true, operationId, replayed: true, acceptance, staffId: member.id };
      let attempts = 0;
      const restored = await reconcileStoredDraft({ kind: "mentoring-form-draft-v1", value, intent: { operationId, signature: JSON.stringify(payload) } }, {}, async (command) => {
        attempts += 1;
        assert.deepEqual(command, { ...payload, operationId });
        return receipt;
      });
      assert.equal(attempts, 1);
      assert.equal(restored.recovered, receipt);
      assert.equal(restored.value.baseVersion, 7);
      assert.equal(restored.intent.operationId, operationId);
    });
  }
}
