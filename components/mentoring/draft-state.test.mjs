import assert from "node:assert/strict";
import test from "node:test";
import { reconcileStoredDraft } from "./draft-state.ts";

const operationId = "d4ef7e11-03fa-4f96-853c-2bc06cf374a3";
const payload = {
  type: "record_contact",
  participantId: "c134f486-aea1-45f8-8f44-df2173d15740",
  expectedVersion: 1,
  expectedAppointmentVersion: null,
  method: "phone",
  outcome: "completed",
  occurredAt: "2026-10-26T09:00:00.000Z",
  notes: "סיכום שנשמר לפני הפסקת החיבור",
  nextAppointmentAt: "2026-11-01T09:00:00.000Z",
};
const value = {
  notes: payload.notes,
  baseVersion: 1,
  appointmentVersion: null,
};
const stored = {
  kind: "mentoring-form-draft-v1",
  value,
  intent: { operationId, signature: JSON.stringify(payload) },
};

test("an ordinary autosaved draft never submits an action on reopening", async () => {
  const restored = await reconcileStoredDraft(value, {}, async () =>
    assert.fail("unsubmitted text is not a command"),
  );
  assert.deepEqual(restored.value, value);
  assert.equal(restored.recovered, null);
});

for (const acceptance of ["accepted", "queued"]) {
  test(`reload after a ${acceptance} save replays its original identity before any rebase`, async () => {
    let newContacts = 0;
    const existing = {
      ok: true,
      operationId,
      acceptance,
      replayed: true,
      participantId: payload.participantId,
    };
    const restored = await reconcileStoredDraft(
      stored,
      { baseVersion: 2 },
      async (command) => {
        if (command.operationId !== operationId) newContacts += 1;
        assert.deepEqual(command, { ...payload, operationId });
        return existing;
      },
    );
    assert.equal(newContacts, 0);
    assert.equal(restored.recovered, existing);
    assert.equal(restored.value.baseVersion, 1);
    assert.equal(restored.rejected, false);
  });
}

test("a known rejection preserves entered text for explicitly reviewed correction", async () => {
  const restored = await reconcileStoredDraft(stored, {}, async () => ({
    ok: false,
    error: { code: "conflict", message: "הכרטיס עודכן" },
  }));
  assert.deepEqual(restored.value, value);
  assert.equal(restored.value.baseVersion, 1);
  assert.equal(restored.intent, null);
  assert.equal(restored.rejected, true);
  assert.ok(stored.intent, "the immutable stored submission is not mutated");
});

test("an uncertain previous save blocks editing rather than generating a new identity", async () => {
  await assert.rejects(
    reconcileStoredDraft(stored, {}, async () => ({
      ok: false,
      error: { code: "unavailable", message: "החיבור נקטע" },
    })),
    /could not be reconciled/,
  );
  assert.equal(stored.intent.operationId, operationId);
  assert.equal(stored.value.notes, payload.notes);
});

test("malformed prepared intent is retained for recovery without submitting", async () => {
  const invalid = { ...stored, intent: { operationId, signature: "null" } };
  await assert.rejects(
    reconcileStoredDraft(invalid, {}, async () =>
      assert.fail("invalid metadata must not submit"),
    ),
    /Invalid saved command/,
  );
});
