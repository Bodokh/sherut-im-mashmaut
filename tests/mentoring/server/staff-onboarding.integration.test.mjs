import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import "./typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";
const organizationId = "11111111-1111-4111-8111-111111111111";

test("staff onboarding queues and dispatches accepted membership commands", { skip: !enabled, timeout: 30_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const databaseUrl = new URL(process.env.MENTORING_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "Use a disposable local database.");
  const database = new Pool({ connectionString: databaseUrl.toString() });
  t.after(() => database.end());
  const schema = await database.query("SELECT to_regclass('mentoring.staff_onboarding_emails') IS NOT NULL AS ready");
  assert.equal(schema.rows[0].ready, true, "A durable staff onboarding queue should exist.");

  const { executeCommand } = await import("../../../lib/mentoring/server/commands.ts");
  const { dispatchStaffOnboardingEmails } = await import("../../../lib/mentoring/server/staff-onboarding.ts");
  const { getDatabasePool } = await import("../../../lib/mentoring/server/db.ts");
  t.after(() => getDatabasePool().end());

  const ceoId = randomUUID();
  const ceoUserId = `test_${randomUUID()}`;
  const ceoEmail = `${ceoId}@staff-tests.invalid`;
  const fixtureIds = [ceoId];
  t.after(async () => {
    const cleanup = new Pool({ connectionString: databaseUrl.toString() });
    try {
      await cleanup.query("DELETE FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2", [organizationId, ceoId]);
      await cleanup.query("DELETE FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2", [organizationId, ceoId]);
      await cleanup.query("DELETE FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, fixtureIds]);
    } finally {
      await cleanup.end();
    }
  });
  await database.query("INSERT INTO mentoring.memberships (organization_id,id,auth_user_id,email,display_name,role) VALUES ($1,$2,$3,$4,'Onboarding integration CEO','ceo')", [organizationId, ceoId, ceoUserId, ceoEmail]);
  function createCommand(email) {
    const operationId = randomUUID();
    fixtureIds.push(operationId);
    return { type: "create_staff", operationId, fields: { displayName: "Onboarding integration staff", email: email ?? `${operationId}@staff-tests.invalid`, role: "mentor", phone: null, coordinatorId: null } };
  }
  const execute = (command) => executeCommand(ceoUserId, ceoEmail, command);
  async function createMember() {
    const command = createCommand();
    const result = await execute(command);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.acceptance, "accepted");
    return command;
  }
  async function emailJob(staffId) {
    return (await database.query("SELECT * FROM mentoring.staff_onboarding_emails WHERE organization_id=$1 AND staff_id=$2", [organizationId, staffId])).rows[0];
  }
  async function makeDue(staffId) {
    await database.query("UPDATE mentoring.staff_onboarding_emails SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE organization_id=$1 AND staff_id=$2", [organizationId, staffId]);
  }

  await t.test("create, replay and duplicate email produce exactly one matching queued job", async () => {
    const command = await createMember();
    const queued = await emailJob(command.operationId);
    assert.equal(queued.recipient_email, command.fields.email);
    assert.equal(queued.status, "queued");
    assert.equal(queued.attempt_count, 0);
    assert.equal((await execute(command)).replayed, true);
    const duplicate = createCommand(command.fields.email);
    assert.equal((await execute(duplicate)).error.code, "conflict");
    assert.equal(await emailJob(duplicate.operationId), undefined);
    assert.equal(await emailJob(ceoId), undefined, "Older/directly seeded memberships receive no onboarding job.");
    assert.equal((await emailJob(command.operationId)).attempt_count, 0);
  });

  await t.test("concurrent dispatch claims once and persists provider acceptance", async () => {
    const command = await createMember();
    const sent = [];
    let signalStarted;
    let releaseSender;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const released = new Promise((resolve) => { releaseSender = resolve; });
    const send = async (job) => {
      sent.push(job);
      signalStarted();
      await released;
      return { status: "accepted", providerId: "provider-email-id" };
    };
    const first = dispatchStaffOnboardingEmails(send, command.operationId);
    try {
      await Promise.race([started, first]);
      await dispatchStaffOnboardingEmails(send, command.operationId);
    } finally {
      releaseSender();
      await first;
    }
    assert.deepEqual(sent, [{ staffId: command.operationId, recipientEmail: command.fields.email }]);
    const job = await emailJob(command.operationId);
    assert.equal(job.status, "accepted");
    assert.equal(job.provider_id, "provider-email-id");
    assert.equal(job.attempt_count, 1);
    await dispatchStaffOnboardingEmails(send, command.operationId);
    assert.equal(sent.length, 1);
  });

  await t.test("an expired worker cannot overwrite a later attempt's outcome", async () => {
    const command = await createMember();
    const staffId = command.operationId;
    let signalStarted;
    let releaseSender;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const released = new Promise((resolve) => { releaseSender = resolve; });
    const first = dispatchStaffOnboardingEmails(async () => {
      signalStarted();
      await released;
      return { status: "failed" };
    }, staffId);
    try {
      await Promise.race([started, first]);
      await makeDue(staffId);
      await dispatchStaffOnboardingEmails(async () => ({ status: "accepted", providerId: "recovered-email-id" }), staffId);
    } finally {
      releaseSender();
      await first;
    }
    const job = await emailJob(staffId);
    assert.equal(job.attempt_count, 2);
    assert.equal(job.status, "accepted");
    assert.equal(job.provider_id, "recovered-email-id");
  });

  await t.test("temporary failures retry the same recipient and expiry prevents another send", async () => {
    const command = await createMember();
    const sent = [];
    const send = async (job) => {
      sent.push(job);
      return sent.length === 1 ? { status: "retry" } : { status: "accepted", providerId: "retry-email-id" };
    };
    await dispatchStaffOnboardingEmails(send, command.operationId);
    const first = await emailJob(command.operationId);
    assert.equal(first.status, "queued");
    assert.equal(first.attempt_count, 1);
    assert.ok(first.next_attempt_at > first.first_attempt_at);
    await dispatchStaffOnboardingEmails(send, command.operationId);
    assert.equal(sent.length, 1);
    await makeDue(command.operationId);
    await dispatchStaffOnboardingEmails(send, command.operationId);
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0], sent[1]);
    assert.equal((await emailJob(command.operationId)).status, "accepted");

    const expired = await createMember();
    await dispatchStaffOnboardingEmails(async () => ({ status: "retry" }), expired.operationId);
    await database.query("UPDATE mentoring.staff_onboarding_emails SET first_attempt_at=clock_timestamp()-interval '24 hours' WHERE organization_id=$1 AND staff_id=$2", [organizationId, expired.operationId]);
    await makeDue(expired.operationId);
    await dispatchStaffOnboardingEmails(send, expired.operationId);
    assert.equal(sent.length, 2);
    assert.equal((await emailJob(expired.operationId)).status, "failed");
  });

  await t.test("deactivation/reactivation, address replacement and completed account setup cancel pending jobs", async () => {
    const first = await createMember();
    const staffId = first.operationId;
    const changed = await createMember();
    const bound = await createMember();
    await database.query("UPDATE mentoring.memberships SET active=false WHERE organization_id=$1 AND id=$2", [organizationId, staffId]);
    await database.query("UPDATE mentoring.memberships SET active=true WHERE organization_id=$1 AND id=$2", [organizationId, staffId]);
    await database.query("UPDATE mentoring.memberships SET email=$3 WHERE organization_id=$1 AND id=$2", [organizationId, changed.operationId, `${randomUUID()}@staff-tests.invalid`]);
    await database.query("UPDATE mentoring.memberships SET email=$3 WHERE organization_id=$1 AND id=$2", [organizationId, changed.operationId, changed.fields.email]);
    await database.query("UPDATE mentoring.memberships SET auth_user_id=$3 WHERE organization_id=$1 AND id=$2", [organizationId, bound.operationId, `test_${randomUUID()}`]);
    let sent = 0;
    const send = async () => { sent += 1; return { status: "accepted", providerId: "not-expected" }; };
    await dispatchStaffOnboardingEmails(send, staffId);
    await dispatchStaffOnboardingEmails(send, changed.operationId);
    await dispatchStaffOnboardingEmails(send, bound.operationId);
    assert.equal(sent, 0);
    assert.equal((await emailJob(staffId)).status, "cancelled");
    assert.equal((await emailJob(changed.operationId)).status, "cancelled");
    assert.equal((await emailJob(bound.operationId)).status, "cancelled");
  });
});
