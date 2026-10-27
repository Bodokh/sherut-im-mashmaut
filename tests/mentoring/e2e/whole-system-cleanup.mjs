import assert from "node:assert/strict";

const ORGANIZATION = "11111111-1111-4111-8111-111111111111";
const QA_ACTOR = "15906dea-3538-46ab-ab2f-9ec651d15474";
const QA_EMAIL = "mentoring-owner+clerk_test@example.com";
const QA_AUTH_USER = "user_3LEdW1ZzcasOTeiCSsfxGV7UZTJ";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR_COLUMNS = ["id", "organization_id", "auth_user_id", "email", "display_name", "phone", "role", "active", "version", "coordinator_id", "sms_muted", "created_at", "updated_at"];
const SETTINGS_COLUMNS = ["organization_id", "version", "offline_lease_hours", "reminder_audience", "appointment_reminder_minutes_before", "overdue_reminders_enabled", "overdue_repeat_hours", "updated_at", "updated_by"];
const normalize = (value) => value instanceof Date ? value.toISOString() : value;
const comparable = (row, columns) => Object.fromEntries(columns.map((key) => [key, key.endsWith("_at") && row[key] != null ? new Date(row[key]).toISOString() : normalize(row[key])]));

function ids(value, name) {
  assert.ok(Array.isArray(value), `${name} must be an explicit ID array.`);
  assert.equal(new Set(value).size, value.length, `${name} must not contain duplicate IDs.`);
  for (const id of value) assert.match(id, UUID, `${name} contains an invalid ID.`);
  return value;
}

function validateManifest(manifest) {
  assert.match(manifest.runId, /^[0-9a-f]{8}$/);
  assert.equal(manifest.organizationId, ORGANIZATION);
  assert.equal(manifest.actorId, QA_ACTOR);
  for (const key of ["participantIds", "staffIds", "resourceIds", "operationIds", "monthlyReviewIds"]) ids(manifest[key], key);
  assert.ok(!manifest.staffIds.includes(QA_ACTOR));
  assert.ok(Array.isArray(manifest.settingsVersions));
  assert.equal(new Set(manifest.settingsVersions).size, manifest.settingsVersions.length);
  for (const version of manifest.settingsVersions) assert.ok(Number.isSafeInteger(version) && version > manifest.settingsOriginal.version);
  const original = manifest.actorOriginal;
  for (const key of ACTOR_COLUMNS) assert.ok(Object.hasOwn(original, key), `Capture actorOriginal.${key} before the test.`);
  assert.equal(original.id, QA_ACTOR);
  assert.equal(original.organization_id, ORGANIZATION);
  assert.equal(original.email, QA_EMAIL);
  assert.equal(original.auth_user_id, QA_AUTH_USER);
  assert.equal(original.role, "ceo");
  assert.equal(original.active, true);
  for (const key of SETTINGS_COLUMNS) assert.ok(Object.hasOwn(manifest.settingsOriginal, key), `Capture settingsOriginal.${key} before the test.`);
  assert.equal(manifest.settingsOriginal.organization_id, ORGANIZATION);
  assert.ok(Number.isSafeInteger(manifest.settingsOriginal.version) && manifest.settingsOriginal.version > 0);
  for (const [kind, expectedIds] of [["participants", manifest.participantIds], ["staff", manifest.staffIds]]) {
    assert.deepEqual(Object.keys(manifest.names[kind]).sort(), [...expectedIds].sort());
    for (const name of Object.values(manifest.names[kind])) assert.ok(typeof name === "string" && name.includes(manifest.runId));
  }
}

/** Remove only this run's database fixtures using a dedicated connected pg
 * Client (not a Pool.query transaction). The caller must hold the exclusive QA
 * window, close its browser first, and retain a private recovery manifest.
 * Importing this module never connects, reads credentials, or changes data.
 *
 * actorExpected must contain the latest raw membership row if the run changed
 * the QA identity's role, active state, SMS preference, or membership version.
 */
export async function cleanupWholeSystem({ database, manifest }) {
  validateManifest(manifest);
  assert.equal(process.env.MENTORING_QA_WRITES, "approved", "Explicit development fixture cleanup approval is required.");
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development");
  assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866");
  assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
  assert.ok(database && typeof database.query === "function");
  // A pg Pool has connect/release semantics different from a dedicated Client.
  assert.ok(typeof database.totalCount !== "number", "Pass a dedicated pg Client or checked-out PoolClient.");
  const { participantIds, staffIds, resourceIds, operationIds, monthlyReviewIds, settingsVersions } = manifest;
  const participants = new Set(participantIds);
  const staff = new Set([...staffIds, QA_ACTOR]);
  const resources = new Set(resourceIds);
  const operations = new Set(operationIds);
  const params = [ORGANIZATION, participantIds];
  let stage = "ownership validation";
  let transactionStarted = false;
  try {
    await database.query("BEGIN");
    transactionStarted = true;
    // Lock identity and shared policy before checking any run-owned children.
    const actor = (await database.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 FOR UPDATE", [ORGANIZATION, QA_ACTOR])).rows[0];
    assert.ok(actor);
    assert.equal(actor.email, QA_EMAIL);
    assert.equal(actor.auth_user_id, QA_AUTH_USER);
    assert.deepEqual(comparable(actor, ACTOR_COLUMNS), comparable(manifest.actorExpected ?? manifest.actorOriginal, ACTOR_COLUMNS), "The current QA membership differs from the last captured run state.");
    const settings = (await database.query("SELECT * FROM mentoring.organization_settings WHERE organization_id=$1 FOR UPDATE", [ORGANIZATION])).rows[0];
    assert.ok(settings);
    const settingsHistory = (await database.query("SELECT * FROM mentoring.organization_settings_history WHERE organization_id=$1 AND version>$2 ORDER BY version FOR UPDATE", [ORGANIZATION, manifest.settingsOriginal.version])).rows;
    const expectedVersions = [...settingsVersions].sort((a, b) => a - b);
    assert.deepEqual(settingsHistory.map((row) => row.version), expectedVersions, "An untracked settings revision exists.");
    assert.deepEqual(expectedVersions, Array.from({ length: settings.version - manifest.settingsOriginal.version }, (_, index) => manifest.settingsOriginal.version + index + 1));
    for (const row of settingsHistory) {
      assert.equal(row.updated_by, QA_ACTOR);
      assert.ok(row.reason.includes(manifest.runId));
    }
    if (!expectedVersions.length) assert.deepEqual(comparable(settings, SETTINGS_COLUMNS), comparable(manifest.settingsOriginal, SETTINGS_COLUMNS));
    else {
      const latest = settingsHistory.at(-1).settings;
      assert.equal(settings.updated_by, QA_ACTOR);
      for (const [column, key] of [["offline_lease_hours", "offlineLeaseHours"], ["reminder_audience", "reminderAudience"], ["appointment_reminder_minutes_before", "appointmentReminderMinutesBefore"], ["overdue_reminders_enabled", "overdueRemindersEnabled"], ["overdue_repeat_hours", "overdueRepeatHours"]]) assert.equal(settings[column], latest[key]);
      assert.equal(new Date(settings.updated_at).toISOString(), new Date(latest.updatedAt).toISOString());
    }

    const ownedParticipants = (await database.query("SELECT * FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", params)).rows;
    assert.equal(ownedParticipants.length, participantIds.length);
    for (const row of ownedParticipants) {
      assert.equal(row.created_by, QA_ACTOR);
      assert.equal(row.display_name, manifest.names.participants[row.id]);
      assert.ok(resources.has(row.id));
    }
    const ownedStaff = (await database.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, staffIds])).rows;
    assert.equal(ownedStaff.length, staffIds.length);
    for (const row of ownedStaff) {
      assert.equal(row.auth_user_id, null);
      assert.equal(row.display_name, manifest.names.staff[row.id]);
      assert.notEqual(row.id, QA_ACTOR);
    }
    const contacts = (await database.query("SELECT * FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[]) FOR UPDATE", params)).rows;
    const contactIds = new Set(contacts.map((row) => row.id));
    for (const row of contacts) { assert.ok(resources.has(row.id)); assert.equal(row.actor_id, QA_ACTOR); }
    const ownedResources = (await database.query("SELECT * FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, resourceIds])).rows;
    for (const row of ownedResources) assert.ok(row.kind === "participant" ? participants.has(row.id) : row.kind === "contact" && contactIds.has(row.id));
    assert.equal(ownedResources.length, participantIds.length + contacts.length);

    // Every delete below is preceded by a lock and attribution/scope checks.
    const childTables = ["reminder_attempts", "reminder_jobs", "outbox", "conflicts", "review_events", "contact_revisions", "appointment_history", "manual_color_history", "grants", "appointments", "assignments"];
    for (const table of childTables) {
      const rows = (await database.query(`SELECT * FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[]) FOR UPDATE`, params)).rows;
      for (const row of rows) {
        assert.ok(participants.has(row.participant_id));
        for (const key of ["actor_id", "revised_by_staff_id", "reviewed_by_staff_id", "changed_by_staff_id", "set_by_staff_id", "last_evaluated_by", "claimed_by_staff_id", "granted_by_staff_id", "revoked_by_staff_id", "resolved_by"]) if (row[key] != null) assert.equal(row[key], QA_ACTOR);
        for (const key of ["mentor_id", "coordinator_id", "staff_id"]) if (row[key] != null) assert.ok(staff.has(row[key]));
        if (row.contact_id != null) assert.ok(contactIds.has(row.contact_id));
        if (row.operation_id != null) assert.ok(operations.has(row.operation_id));
        if (row.last_evaluated_operation_id != null) assert.ok(operations.has(row.last_evaluated_operation_id));
      }
    }
    const reviews = (await database.query("SELECT * FROM mentoring.reviews WHERE organization_id=$1 AND contact_id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, [...contactIds]])).rows;
    for (const row of reviews) assert.equal(row.reviewed_by_staff_id, QA_ACTOR);
    const protections = (await database.query("SELECT * FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, resourceIds])).rows;
    for (const row of protections) { assert.equal(row.protected_by_staff_id, QA_ACTOR); if (row.unlocked_by_staff_id != null) assert.equal(row.unlocked_by_staff_id, QA_ACTOR); }
    const audit = (await database.query("SELECT * FROM mentoring.audit WHERE organization_id=$1 AND (participant_id=ANY($2::uuid[]) OR (actor_id=$3 AND operation_id=ANY($4::uuid[]))) FOR UPDATE", [ORGANIZATION, participantIds, QA_ACTOR, operationIds])).rows;
    for (const row of audit) { assert.equal(row.actor_id, QA_ACTOR); assert.ok(operations.has(row.operation_id)); if (row.participant_id != null) assert.ok(participants.has(row.participant_id)); }
    const operationRows = (await database.query("SELECT * FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[]) FOR UPDATE", [ORGANIZATION, QA_ACTOR, operationIds])).rows;
    for (const row of operationRows) { if (row.response.participantId != null) assert.ok(participants.has(row.response.participantId)); if (row.response.staffId != null) assert.ok(staffIds.includes(row.response.staffId)); }
    const monthly = (await database.query("SELECT * FROM mentoring.monthly_reviews WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, monthlyReviewIds])).rows;
    assert.equal(monthly.length, monthlyReviewIds.length);
    for (const row of monthly) { assert.ok(staffIds.includes(row.scope_staff_id)); assert.equal(row.updated_by, QA_ACTOR); assert.ok(row.summary.includes(manifest.runId)); }
    const monthlyHistory = (await database.query("SELECT * FROM mentoring.monthly_review_history WHERE organization_id=$1 AND review_id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, monthlyReviewIds])).rows;
    for (const row of monthlyHistory) { assert.equal(row.updated_by, QA_ACTOR); assert.ok(row.summary.includes(manifest.runId)); }

    // Reject references from outside the manifest before deleting staff or
    // operations. Foreign keys remain the final atomic backstop as well.
    const external = (await database.query(`SELECT
      (SELECT count(*) FROM mentoring.memberships WHERE organization_id=$1 AND coordinator_id=ANY($2::uuid[]) AND NOT (id=ANY($2::uuid[]) OR id=$3))::int AS memberships,
      (SELECT count(*) FROM mentoring.assignments WHERE organization_id=$1 AND (mentor_id=ANY($2::uuid[]) OR coordinator_id=ANY($2::uuid[])) AND NOT participant_id=ANY($4::uuid[]))::int AS assignments,
      (SELECT count(*) FROM mentoring.monthly_reviews WHERE organization_id=$1 AND scope_staff_id=ANY($2::uuid[]) AND NOT id=ANY($5::uuid[]))::int AS monthly,
      (SELECT count(*) FROM mentoring.reminder_jobs WHERE organization_id=$1 AND last_evaluated_operation_id=ANY($6::uuid[]) AND NOT participant_id=ANY($4::uuid[]))::int AS reminders`, [ORGANIZATION, staffIds, QA_ACTOR, participantIds, monthlyReviewIds, operationIds])).rows[0];
    assert.ok(Object.values(external).every((count) => count === 0), "A fixture has an external reference; preserve it for review.");

    stage = "fixture removal and snapshot restoration";
    for (const table of ["reminder_attempts", "reminder_jobs", "outbox", "conflicts", "review_events", "contact_revisions", "appointment_history", "manual_color_history", "grants"]) await database.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, params);
    await database.query("DELETE FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [ORGANIZATION, QA_ACTOR, operationIds]);
    await database.query("DELETE FROM mentoring.reviews WHERE organization_id=$1 AND contact_id=ANY($2::uuid[])", [ORGANIZATION, [...contactIds]]);
    await database.query("DELETE FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=ANY($2::uuid[])", [ORGANIZATION, resourceIds]);
    for (const table of ["appointments", "contacts", "assignments"]) await database.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, params);
    await database.query("DELETE FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[])", params);
    await database.query("DELETE FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[])", [ORGANIZATION, resourceIds]);
    await database.query("DELETE FROM mentoring.monthly_review_history WHERE organization_id=$1 AND review_id=ANY($2::uuid[])", [ORGANIZATION, monthlyReviewIds]);
    await database.query("DELETE FROM mentoring.monthly_reviews WHERE organization_id=$1 AND id=ANY($2::uuid[])", [ORGANIZATION, monthlyReviewIds]);
    await database.query("DELETE FROM mentoring.organization_settings_history WHERE organization_id=$1 AND version=ANY($2::integer[])", [ORGANIZATION, settingsVersions]);
    const policy = manifest.settingsOriginal;
    await database.query("UPDATE mentoring.organization_settings SET version=$2,offline_lease_hours=$3,reminder_audience=$4,appointment_reminder_minutes_before=$5,overdue_reminders_enabled=$6,overdue_repeat_hours=$7,updated_at=$8,updated_by=$9 WHERE organization_id=$1", [ORGANIZATION, policy.version, policy.offline_lease_hours, policy.reminder_audience, policy.appointment_reminder_minutes_before, policy.overdue_reminders_enabled, policy.overdue_repeat_hours, policy.updated_at, policy.updated_by]);
    const original = manifest.actorOriginal;
    await database.query("UPDATE mentoring.memberships SET display_name=$3,phone=$4,role=$5,active=$6,version=$7,coordinator_id=$8,sms_muted=$9,updated_at=$10 WHERE organization_id=$1 AND id=$2", [ORGANIZATION, QA_ACTOR, original.display_name, original.phone, original.role, original.active, original.version, original.coordinator_id, original.sms_muted, original.updated_at]);
    await database.query("DELETE FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [ORGANIZATION, QA_ACTOR, operationIds]);
    // Break only fixture-to-fixture coordinator references; all rows being
    // updated have already been validated and are deleted in this transaction.
    await database.query("UPDATE mentoring.memberships SET coordinator_id=NULL WHERE organization_id=$1 AND id=ANY($2::uuid[])", [ORGANIZATION, staffIds]);
    await database.query("DELETE FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])", [ORGANIZATION, staffIds]);

    stage = "independent verification";
    const remaining = {};
    for (const table of [...childTables, "contacts", "participants"]) {
      const column = table === "participants" ? "id" : "participant_id";
      remaining[table] = (await database.query(`SELECT count(*)::int AS count FROM mentoring.${table} WHERE organization_id=$1 AND ${column}=ANY($2::uuid[])`, params)).rows[0].count;
    }
    for (const [table, column, values] of [["memberships", "id", staffIds], ["resource_ids", "id", resourceIds], ["monthly_reviews", "id", monthlyReviewIds], ["monthly_review_history", "review_id", monthlyReviewIds], ["reviews", "contact_id", [...contactIds]], ["ceo_protections", "resource_id", resourceIds]]) remaining[table] = (await database.query(`SELECT count(*)::int AS count FROM mentoring.${table} WHERE organization_id=$1 AND ${column}=ANY($2::uuid[])`, [ORGANIZATION, values])).rows[0].count;
    remaining.operations = (await database.query("SELECT count(*)::int AS count FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [ORGANIZATION, QA_ACTOR, operationIds])).rows[0].count;
    remaining.audit = (await database.query("SELECT count(*)::int AS count FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [ORGANIZATION, QA_ACTOR, operationIds])).rows[0].count;
    remaining.settings_history = (await database.query("SELECT count(*)::int AS count FROM mentoring.organization_settings_history WHERE organization_id=$1 AND version=ANY($2::integer[])", [ORGANIZATION, settingsVersions])).rows[0].count;
    assert.ok(Object.values(remaining).every((count) => count === 0));
    const restoredActor = (await database.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=$2", [ORGANIZATION, QA_ACTOR])).rows[0];
    assert.deepEqual(comparable(restoredActor, ACTOR_COLUMNS), comparable(original, ACTOR_COLUMNS));
    const restoredSettings = (await database.query("SELECT * FROM mentoring.organization_settings WHERE organization_id=$1", [ORGANIZATION])).rows[0];
    assert.deepEqual(comparable(restoredSettings, SETTINGS_COLUMNS), comparable(policy, SETTINGS_COLUMNS));
    await database.query("COMMIT");
    transactionStarted = false;
    return { status: "passed", removedParticipants: ownedParticipants.length, removedStaff: ownedStaff.length, removedContacts: contacts.length, removedMonthlyReviews: monthly.length, remaining, approvedQaIdentityPreserved: true, membershipRestored: true, settingsRestored: true };
  } catch {
    if (transactionStarted) await database.query("ROLLBACK").catch(() => {});
    throw new Error(`Whole-system fixture cleanup was not confirmed during ${stage}. Verify only the manifest IDs before retrying; preserve the approved QA identity.`);
  }
}
