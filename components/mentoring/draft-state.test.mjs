import assert from "node:assert/strict";
import test from "node:test";
import { reconcileStoredDraft, restoreDraftValue } from "./draft-state.ts";

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

test("new draft fields receive defaults while existing content and unknown future fields survive", () => {
  const old = { notes: "טיוטה קיימת", baseVersion: 1, futureField: "נשמר" };
  assert.deepEqual(restoreDraftValue(old, { notes: "", baseVersion: 2, reason: "", actions: [] }), {
    ...old, reason: "", actions: [],
  });
  assert.deepEqual(old, { notes: "טיוטה קיימת", baseVersion: 1, futureField: "נשמר" });
});

for (const malformed of [null, [], { notes: null }, { notes: 4 }, { notes: "נשמר", actions: "view" }, { notes: "נשמר", baseVersion: NaN }]) {
  test(`malformed draft shape ${JSON.stringify(malformed)} blocks editing and preserves its prepared intent`, async () => {
    const saved = { ...stored, value: malformed };
    await assert.rejects(reconcileStoredDraft(saved, { notes: "", baseVersion: 1, actions: [] }, async () => assert.fail("malformed drafts must not submit")), /Invalid saved draft shape/);
    assert.equal(saved.intent, stored.intent);
    assert.equal(saved.value, malformed);
  });
}

test("nullable dynamic versions and nullable management drafts remain recoverable", () => {
  assert.deepEqual(restoreDraftValue({ appointmentVersion: 2 }, { appointmentVersion: null }), { appointmentVersion: 2 });
  assert.deepEqual(restoreDraftValue({ payload }, null), { payload });
  for (const appointmentVersion of [{ invalid: true }, [], NaN]) {
    assert.throws(() => restoreDraftValue({ appointmentVersion }, { appointmentVersion: null }), /Invalid saved draft shape/);
  }
});


for (const field of ["appointmentVersion", "contactRevision", "baseTargetVersion"]) {
  test(`${field} restores null and finite versions in both directions, rejecting malformed values`, () => {
    assert.deepEqual(restoreDraftValue({ [field]: null }, { [field]: 2 }), { [field]: null });
    assert.deepEqual(restoreDraftValue({ [field]: 2 }, { [field]: null }), { [field]: 2 });
    for (const invalid of ["2", {}, [], NaN, Infinity]) {
      assert.throws(() => restoreDraftValue({ [field]: invalid }, { [field]: null }), /Invalid saved draft shape/);
      assert.throws(() => restoreDraftValue({ [field]: invalid }, { [field]: 2 }), /Invalid saved draft shape/);
    }
  });
}

test("only monthly and participant profile base versions are nullable", () => {
  const monthly = { summary: "", reviewed: false, baseVersion: 1 };
  const profile = { displayName: "", serviceType: "unknown", profileNotes: "", baseVersion: 1 };
  for (const initial of [monthly, profile]) {
    assert.equal(restoreDraftValue({ ...initial, baseVersion: null }, initial).baseVersion, null);
    assert.equal(restoreDraftValue(initial, { ...initial, baseVersion: null }).baseVersion, 1);
    for (const invalid of ["1", {}, [], NaN]) assert.throws(() => restoreDraftValue({ ...initial, baseVersion: invalid }, initial), /Invalid saved draft shape/);
  }
  assert.throws(() => restoreDraftValue({ notes: "", baseVersion: null }, { notes: "", baseVersion: 1 }), /Invalid saved draft shape/);
});

for (const acceptance of ["accepted", "queued"]) {
  test(`prepared nullable versions replay unchanged before rebase when ${acceptance}`, async () => {
    const cases = [
      { savedValue: { ...value, appointmentVersion: null }, initial: { ...value, baseVersion: 2, appointmentVersion: 2 }, command: payload },
      { savedValue: { summary: "טיוטה", reviewed: true, baseVersion: null }, initial: { summary: "עדכני", reviewed: false, baseVersion: 1 }, command: { type: "save_monthly_review", expectedVersion: null, summary: "טיוטה" } },
    ];
    for (const { savedValue, initial, command } of cases) {
      const draft = { kind: "mentoring-form-draft-v1", value: savedValue, intent: { operationId, signature: JSON.stringify(command) } };
      const receipt = { ok: true, operationId, acceptance, replayed: true };
      const restored = await reconcileStoredDraft(draft, initial, async (sent) => { assert.deepEqual(sent, { ...command, operationId }); return receipt; });
      assert.deepEqual(restored.value, savedValue);
      assert.deepEqual(restored.intent, draft.intent);
      assert.equal(restored.recovered, receipt);
    }
  });
}
