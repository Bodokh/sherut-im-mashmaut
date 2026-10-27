import assert from "node:assert/strict";

const privateDatabase = "sherut-mentoring-private-v1";
const profileTab = "פרטי החניכה והליווי";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Inspect existing native browser storage only. Never seed authentication,
 * workspace data, or commands through the browser tooling. */
async function localState(h, participantId) {
  return h.page.evaluate(async ({ name, participantId }) => {
    if (!(await indexedDB.databases()).some((database) => database.name === name)) throw new Error("The prepared private database is missing.");
    const connection = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error("Read-only inspection cannot create or upgrade private storage.")); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Read-only private state inspection failed."));
    });
    try {
      const transaction = connection.transaction(["session", "operations"], "readonly");
      const get = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Read-only private state request failed."));
      });
      const [session, operations] = await Promise.all([
        get(transaction.objectStore("session").get("active")),
        get(transaction.objectStore("operations").getAll()),
      ]);
      const view = session?.snapshot.participants.find((item) => item.participant.id === participantId);
      return {
        actor: session ? { id: session.snapshot.actor.id, role: session.snapshot.actor.role, coordinatorId: session.snapshot.actor.coordinatorId } : null,
        participant: view ? {
          id: view.participant.id,
          assignmentMentorId: view.assignment?.mentorId ?? null,
          assignmentCoordinatorId: view.assignment?.coordinatorId ?? null,
          activeOwnGrants: (view.accessGrants ?? []).filter((grant) => grant.staffId === session.snapshot.actor.id && grant.active).length,
        } : null,
        pendingOperationCount: operations.filter((operation) => operation.status === "pending").length,
        operations: operations.filter((operation) => operation.command.participantId === participantId)
          .map((operation) => ({ command: operation.command, status: operation.status, failureCode: operation.failure?.error?.code ?? null })),
      };
    } finally { connection.close(); }
  }, { name: privateDatabase, participantId });
}

async function remember(h, participantId) {
  const state = await localState(h, participantId);
  for (const operation of state.operations) h.track(operation.command);
  await h.saveManifest();
  return state;
}

async function centralCounts(h, participantId, contactId) {
  const result = await h.database.query(`SELECT
    (SELECT count(*) FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=$2)::int AS contacts,
    (SELECT count(*) FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=$2 AND id=$3)::int AS matching_contacts,
    (SELECT count(*) FROM mentoring.appointments WHERE organization_id=$1 AND participant_id=$2 AND is_current)::int AS appointments`,
  [h.manifest.organizationId, participantId, contactId ?? "00000000-0000-4000-8000-000000000000"]);
  return result.rows[0];
}

async function grantUi(h, participantId, originalGrant, revoke) {
  await h.openParticipant(participantId, profileTab);
  await h.page.getByRole("button", { name: "הרשאה אישית לכרטיס", exact: true }).click();
  const dialog = h.page.getByRole("dialog", { name: "הרשאה אישית לכרטיס", exact: true });
  const actor = (await h.snapshot()).actor;
  assert.equal(actor.role, "ceo");
  await dialog.getByLabel("חבר/ת צוות", { exact: true }).click();
  await h.page.getByRole("option", { name: actor.displayName, exact: true }).click();
  if (revoke) {
    await dialog.getByRole("button", { name: "ביטול הרשאה", exact: true }).click();
  } else {
    await dialog.getByRole("button", { name: "הגדרת הרשאה", exact: true }).click();
    const group = dialog.getByRole("group", { name: "בחירת הרשאות", exact: true });
    for (const action of originalGrant.actions) {
      const control = group.getByRole("button", { name: { view: "צפייה", edit: "עריכה", approve: "אישור תיעוד" }[action], exact: true });
      if (await control.getAttribute("aria-pressed") !== "true") await control.click();
    }
    if (originalGrant.expiresAt) {
      assert.ok(Date.parse(originalGrant.expiresAt) > Date.now(), "An expired grant must not be revived with an invented expiry.");
      await dialog.getByLabel("מועד תפוגה לפי שעון ישראל", { exact: true }).fill(h.localInput(new Date(originalGrant.expiresAt)));
    }
  }
  await dialog.getByLabel("סיבה לפעולה", { exact: true }).fill(`בדיקת דפדפן ${h.runId}: ${revoke ? "ביטול הרשאה כדי לבדוק שיוך חונכת אמיתי" : "החזרת הרשאת הבדיקה המקורית לאחר בדיקת שיוך"}`);
  const saved = await h.action("set_access_grant", () => dialog.getByRole("button", { name: "שמירת השינוי", exact: true }).click());
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual([...saved.command.actions].sort(), revoke ? [] : [...originalGrant.actions].sort());
  if (!revoke) assert.equal(saved.command.expiresAt, originalGrant.expiresAt);
}

/** All SQL mutations below are explicit fixture topology changes. They touch
 * only the recorded synthetic participant's two mentor-ID columns, preserving
 * accepted contacts, versions, chosen times, and the approved QA identity. */
async function lockedOwner(h, participantId, expectedRole, requireActive = true) {
  const org = h.manifest.organizationId;
  const actor = await h.database.query("SELECT id,email,auth_user_id,role,active,coordinator_id FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 FOR UPDATE", [org, h.actorId]);
  assert.equal(actor.rowCount, 1);
  assert.equal(actor.rows[0].email, "mentoring-owner+clerk_test@example.com");
  assert.equal(actor.rows[0].auth_user_id, h.manifest.actorOriginal.auth_user_id);
  assert.equal(actor.rows[0].role, expectedRole);
  assert.equal(actor.rows[0].active, true);
  const participant = await h.database.query("SELECT id,display_name,created_by,lifecycle,deleted_at FROM mentoring.participants WHERE organization_id=$1 AND id=$2 FOR UPDATE", [org, participantId]);
  assert.equal(participant.rowCount, 1);
  assert.equal(participant.rows[0].created_by, h.actorId);
  assert.equal(participant.rows[0].display_name, h.manifest.names.participants[participantId]);
  assert.ok(participant.rows[0].display_name.includes(h.runId));
  if (requireActive) {
    assert.equal(participant.rows[0].lifecycle, "active");
    assert.equal(participant.rows[0].deleted_at, null);
  }
  return actor.rows[0];
}

async function lockedFixture(h, participantId, expectedRole) {
  const org = h.manifest.organizationId;
  const actor = await lockedOwner(h, participantId, expectedRole);
  const assignment = await h.database.query("SELECT id,mentor_id,coordinator_id FROM mentoring.assignments WHERE organization_id=$1 AND participant_id=$2 AND ended_at IS NULL FOR UPDATE", [org, participantId]);
  const appointment = await h.database.query("SELECT id,mentor_id FROM mentoring.appointments WHERE organization_id=$1 AND participant_id=$2 AND is_current FOR UPDATE", [org, participantId]);
  assert.equal(assignment.rowCount, 1);
  assert.equal(appointment.rowCount, 1);
  assert.ok(assignment.rows[0].coordinator_id);
  const coordinator = await h.database.query("SELECT id,role,active,auth_user_id,display_name FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 FOR UPDATE", [org, assignment.rows[0].coordinator_id]);
  assert.equal(coordinator.rowCount, 1);
  assert.ok(h.manifest.staffIds.includes(coordinator.rows[0].id));
  assert.equal(coordinator.rows[0].display_name, h.manifest.names.staff[coordinator.rows[0].id]);
  assert.ok(coordinator.rows[0].display_name.includes(h.runId));
  assert.equal(coordinator.rows[0].role, "coordinator");
  assert.equal(coordinator.rows[0].active, true);
  assert.equal(coordinator.rows[0].auth_user_id, null);
  if (expectedRole === "mentor") assert.equal(actor.coordinator_id, coordinator.rows[0].id);
  return { assignment: assignment.rows[0], appointment: appointment.rows[0] };
}

async function captureMapping(h, participantId) {
  await h.database.query("BEGIN");
  try {
    const original = await lockedFixture(h, participantId, "ceo");
    assert.notEqual(original.assignment.mentor_id, h.actorId);
    assert.equal(original.appointment.mentor_id, original.assignment.mentor_id);
    const mentor = await h.database.query("SELECT id,role,active,coordinator_id,auth_user_id,display_name FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 FOR UPDATE", [h.manifest.organizationId, original.assignment.mentor_id]);
    assert.equal(mentor.rowCount, 1);
    assert.ok(h.manifest.staffIds.includes(mentor.rows[0].id));
    assert.equal(mentor.rows[0].display_name, h.manifest.names.staff[mentor.rows[0].id]);
    assert.ok(mentor.rows[0].display_name.includes(h.runId));
    assert.equal(mentor.rows[0].role, "mentor");
    assert.equal(mentor.rows[0].active, true);
    assert.equal(mentor.rows[0].coordinator_id, original.assignment.coordinator_id);
    assert.equal(mentor.rows[0].auth_user_id, null);
    await h.database.query("COMMIT");
    return original;
  } catch (error) { await h.database.query("ROLLBACK"); throw error; }
}

async function changeMapping(h, participantId, original) {
  await h.database.query("BEGIN");
  try {
    const current = await lockedFixture(h, participantId, "mentor");
    assert.equal(current.assignment.id, original.assignment.id);
    assert.equal(current.appointment.id, original.appointment.id);
    assert.equal(current.assignment.coordinator_id, original.assignment.coordinator_id);
    const expectedMentor = original.assignment.mentor_id;
    const expectedAppointmentMentor = original.appointment.mentor_id;
    assert.equal(current.assignment.mentor_id, expectedMentor);
    assert.equal(current.appointment.mentor_id, expectedAppointmentMentor);
    const grant = await h.database.query("SELECT count(*)::int AS n FROM mentoring.grants WHERE organization_id=$1 AND participant_id=$2 AND staff_id=$3 AND active", [h.manifest.organizationId, participantId, h.actorId]);
    assert.equal(grant.rows[0].n, 0, "Assigned mentor proof must not receive authority from a personal grant.");
    const assignment = await h.database.query("UPDATE mentoring.assignments SET mentor_id=$4 WHERE organization_id=$1 AND participant_id=$2 AND id=$3 AND mentor_id=$5 AND ended_at IS NULL", [h.manifest.organizationId, participantId, original.assignment.id, h.actorId, expectedMentor]);
    const appointment = await h.database.query("UPDATE mentoring.appointments SET mentor_id=$4 WHERE organization_id=$1 AND participant_id=$2 AND id=$3 AND mentor_id=$5 AND is_current", [h.manifest.organizationId, participantId, original.appointment.id, h.actorId, expectedAppointmentMentor]);
    assert.equal(assignment.rowCount, 1);
    assert.equal(appointment.rowCount, 1);
    await h.database.query("COMMIT");
  } catch (error) { await h.database.query("ROLLBACK"); throw error; }
}

async function restoreMapping(h, participantId, original, queuedCommandId) {
  let unexpectedState = false;
  await h.database.query("BEGIN");
  try {
    const actor = await lockedOwner(h, participantId, "mentor", false);
    assert.equal(actor.coordinator_id, original.assignment.coordinator_id);
    // Restore the exact rows we changed even if a product defect replaced the
    // current appointment. Current-row invariants are test assertions, not a
    // precondition that may strand the captured fixture mapping on failure.
    const assignment = await h.database.query("SELECT id,mentor_id,coordinator_id FROM mentoring.assignments WHERE organization_id=$1 AND participant_id=$2 AND id=$3 FOR UPDATE", [h.manifest.organizationId, participantId, original.assignment.id]);
    const appointments = await h.database.query("SELECT id,mentor_id,is_current,source_contact_id FROM mentoring.appointments WHERE organization_id=$1 AND participant_id=$2 AND (id=$3 OR is_current) FOR UPDATE", [h.manifest.organizationId, participantId, original.appointment.id]);
    const safeAssignment = assignment.rowCount === 1 && assignment.rows[0].coordinator_id === original.assignment.coordinator_id && [h.actorId, original.assignment.mentor_id].includes(assignment.rows[0].mentor_id);
    if (!safeAssignment) unexpectedState = true;
    const capturedAppointment = appointments.rows.find((row) => row.id === original.appointment.id);
    const safeCapturedAppointment = capturedAppointment && [h.actorId, original.appointment.mentor_id].includes(capturedAppointment.mentor_id);
    if (!safeCapturedAppointment) unexpectedState = true;
    const replacements = appointments.rows.filter((row) => row.is_current && row.id !== original.appointment.id);
    const command = queuedCommandId ? h.submitted.get(queuedCommandId) : null;
    const ownedReplacements = replacements.filter((row) => row.mentor_id === h.actorId && row.source_contact_id === queuedCommandId && command?.type === "record_contact" && command.participantId === participantId);
    if (ownedReplacements.length !== replacements.length) unexpectedState = true;
    if (safeAssignment) await h.database.query("UPDATE mentoring.assignments SET mentor_id=$4 WHERE organization_id=$1 AND participant_id=$2 AND id=$3 AND mentor_id=$5", [h.manifest.organizationId, participantId, original.assignment.id, original.assignment.mentor_id, h.actorId]);
    if (safeCapturedAppointment) await h.database.query("UPDATE mentoring.appointments SET mentor_id=$4 WHERE organization_id=$1 AND participant_id=$2 AND id=$3 AND mentor_id=$5", [h.manifest.organizationId, participantId, original.appointment.id, original.appointment.mentor_id, h.actorId]);
    for (const row of ownedReplacements) await h.database.query("UPDATE mentoring.appointments SET mentor_id=$4 WHERE organization_id=$1 AND participant_id=$2 AND id=$3 AND mentor_id=$5 AND source_contact_id=$6 AND is_current", [h.manifest.organizationId, participantId, row.id, original.appointment.mentor_id, h.actorId, queuedCommandId]);
    await h.database.query("COMMIT");
  } catch (error) { await h.database.query("ROLLBACK"); throw error; }
  if (unexpectedState) throw new Error("Safe captured fixture mentor IDs were restored; an unexpected missing or untracked replacement row was left unchanged for ownership-checked cleanup.");
}

async function seedAppointment(h, participantId) {
  await h.navigate(`/staff/contacts/new?participant=${participantId}`);
  await h.page.locator("#contact-outcome").click();
  await h.page.getByRole("option", { name: "הקשר הושלם", exact: true }).click();
  await h.page.locator("#contact-method").click();
  await h.page.getByRole("option", { name: "שיחה טלפונית", exact: true }).click();
  await h.page.locator("#contact-occurredAt").fill(h.localInput(new Date(Date.now() - 3 * 60_000)));
  await h.page.locator("#contact-nextAppointmentAt").fill(h.localInput(new Date(Date.now() + 86_400_000)));
  await h.page.locator("#contact-notes").fill(`בדיקת דפדפן ${h.runId}: דיווח מנכ״ל לקראת בדיקת חונכת משויכת ללא חיבור`);
  await h.action("record_contact", () => h.page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click());
}

/** Invocation belongs to the exclusive parent harness. This module neither
 * starts a server/browser nor creates provider users or credentials. */
export async function runMentorOfflineScenario(h) {
  const participantId = h.fixture.routineParticipantId ?? h.fixture.participantId;
  assert.match(participantId, uuid);
  assert.match(h.actorId, uuid);
  assert.match(h.runId, /^[0-9a-f]{8}$/);
  assert.equal(h.manifest.organizationId, "11111111-1111-4111-8111-111111111111");
  assert.ok(h.manifest.participantIds.includes(participantId));
  assert.equal(typeof h.track, "function");
  assert.ok(await h.scenario("An actually assigned mentor finalizes contact after a native offline restart and synchronizes exactly once without a personal grant", async () => {
    const originalActor = (await h.snapshot()).actor;
    assert.equal(originalActor.id, h.actorId);
    assert.equal(originalActor.role, "ceo");
    let before = await h.participant(participantId);
    assert.ok(before.assignment);
    if (!before.nextAppointment) { await seedAppointment(h, participantId); before = await h.participant(participantId); }
    assert.ok(before.nextAppointment);
    const nameLock = before.protections.find((entry) => entry.active && entry.resourceId === participantId && entry.fieldPaths?.includes("displayName"));
    assert.ok(nameLock, "The name entered by the CEO must remain protected.");
    assert.ok(before.protections.filter((entry) => entry.active && entry.resourceId === participantId)
      .every((entry) => Array.isArray(entry.fieldPaths) && !entry.fieldPaths.includes("appointment")),
    "The normal fixture must allow routine appointment tracking without an explicit unlock.");
    const originalGrant = before.accessGrants.find((grant) => grant.staffId === h.actorId && grant.active);
    const original = await captureMapping(h, participantId);
    let revokedGrant = false;
    let evidence;
    let acceptedData;
    let strictDraftEvidence;
    try {
      if (originalGrant) { revokedGrant = true; await grantUi(h, participantId, originalGrant, true); }
      if (h.fixture.strictDraftsBeforeMentor) {
        assert.equal(participantId, h.fixture.participantId, "The strict draft proof must use this standalone scenario's assigned fixture.");
        const ownGrant = (await h.participant(participantId)).accessGrants.find((grant) => grant.staffId === h.actorId);
        if (!ownGrant) {
          const temporaryGrant = { actions: ["view", "edit"], expiresAt: null };
          await grantUi(h, participantId, temporaryGrant, false);
          await grantUi(h, participantId, temporaryGrant, true);
        }
        assert.equal((await h.participant(participantId)).accessGrants.some((grant) => grant.staffId === h.actorId && grant.active), false);
        strictDraftEvidence = await (await import("./whole-system-drafts.mjs")).runDraftScenarios(h);
        assert.equal(strictDraftEvidence.editableDraftVariants, 19, "The bounded native restart proof must recover all 19 editable draft variants.");
        assert.equal((await localState(h, participantId)).pendingOperationCount, 0,
          "Strict native draft recovery must finish with no submitted pending commands.");
        await h.captureCurrent();
      }
      evidence = await h.roleWindow("mentor", async () => {
        let mapped = false;
        let queuedCommandId;
        try {
          await changeMapping(h, participantId, original);
          mapped = true;
          await h.captureCurrent();
          await h.openParticipant(participantId);
          const accepted = await h.participant(participantId);
          const actor = (await h.snapshot()).actor;
          assert.equal(actor.role, "mentor");
          assert.equal(actor.id, accepted.assignment.mentorId);
          assert.equal(actor.coordinatorId, accepted.assignment.coordinatorId);
          assert.equal(accepted.assignment.mentorId, h.actorId);
          assert.equal(accepted.accessGrants.some((grant) => grant.staffId === h.actorId && grant.active), false);
          await h.poll(() => localState(h, participantId), (state) => state.actor?.role === "mentor" && state.actor.id === h.actorId && state.participant?.assignmentMentorId === h.actorId && state.participant.activeOwnGrants === 0);
          const centralBefore = await centralCounts(h, participantId);
          const notes = `בדיקת דפדפן ${h.runId}: חונכת משויכת תיעדה שיחה לאחר הפעלה ללא חיבור`;
          await h.restartOffline();
          await h.openParticipant(participantId);
          let local = await localState(h, participantId);
          assert.equal(local.actor.role, "mentor");
          assert.equal(local.participant.assignmentMentorId, local.actor.id);
          assert.equal(local.participant.activeOwnGrants, 0);
          assert.equal(await h.page.evaluate(() => navigator.onLine), false);
          await h.navigate(`/staff/contacts/new?participant=${participantId}`);
          await h.page.locator("#contact-occurredAt").fill(h.localInput(new Date(Date.now() - 60_000)));
          await h.page.locator("#contact-nextAppointmentAt").fill(h.localInput(new Date(Date.now() + 2 * 86_400_000)));
          await h.page.locator("#contact-notes").fill(notes);
          const prior = new Set((await localState(h, participantId)).operations.map((operation) => operation.command.operationId));
          await h.page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click();
          await h.page.waitForURL((url) => url.pathname === `/staff/participants/${participantId}`);
          await h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).getByText(notes, { exact: true }).waitFor({ state: "visible" });
          local = await h.poll(() => remember(h, participantId), (state) => state.operations.some((operation) => !prior.has(operation.command.operationId) && operation.command.type === "record_contact" && operation.command.notes === notes));
          const operation = local.operations.find((item) => !prior.has(item.command.operationId) && item.command.type === "record_contact" && item.command.notes === notes);
          queuedCommandId = operation.command.operationId;
          assert.equal(operation.status, "pending");
          assert.equal(Object.hasOwn(operation.command, "manualColor"), false, "Default contact recording must omit unrelated color intent.");
          assert.equal(operation.command.expectedAppointmentVersion, accepted.nextAppointment.version);
          assert.deepEqual(await centralCounts(h, participantId, operation.command.operationId), { ...centralBefore, matching_contacts: 0 });
          const queuedScreenshot = await h.screenshot("assigned-mentor-offline-contact");
          await h.restartOffline();
          await h.openParticipant(participantId);
          await h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).getByText(notes, { exact: true }).waitFor({ state: "visible" });
          local = await remember(h, participantId);
          const retained = local.operations.filter((item) => item.command.operationId === operation.command.operationId);
          assert.equal(retained.length, 1);
          assert.equal(retained[0].status, "pending");
          assert.deepEqual(retained[0].command, operation.command);
          assert.deepEqual(await centralCounts(h, participantId, operation.command.operationId), { ...centralBefore, matching_contacts: 0 });
          await h.reconnect();
          await h.poll(() => localState(h, participantId), (state) => {
            const pending = state.operations.find((item) => item.command.operationId === operation.command.operationId);
            if (pending) assert.equal(pending.status, "pending", `Assigned mentor contact was preserved instead of accepted (${pending.failureCode ?? pending.status}).`);
            return !pending;
          });
          const current = await h.poll(() => h.participant(participantId), (view) => view?.contacts.some((entry) => entry.id === operation.command.operationId));
          const contact = current.contacts.find((entry) => entry.id === operation.command.operationId);
          assert.equal((await h.snapshot()).actor.role, "mentor");
          assert.equal(current.assignment.mentorId, h.actorId);
          assert.equal(current.accessGrants.some((grant) => grant.staffId === h.actorId && grant.active), false);
          assert.equal(contact.actorId, h.actorId);
          assert.equal(contact.method, "phone");
          assert.equal(contact.outcome, "completed");
          assert.equal(current.contacts.filter((entry) => entry.id === operation.command.operationId).length, 1);
          assert.equal(current.nextAppointment.id, accepted.nextAppointment.id);
          assert.equal(current.nextAppointment.mentorId, h.actorId);
          assert.equal(current.nextAppointment.version, accepted.nextAppointment.version + 1);
          assert.equal(current.nextAppointment.scheduledAt, operation.command.nextAppointmentAt);
          assert.equal(current.nextAppointment.sourceContactId, operation.command.operationId);
          assert.deepEqual(await centralCounts(h, participantId, operation.command.operationId), { contacts: centralBefore.contacts + 1, matching_contacts: 1, appointments: 1 });
          acceptedData = { contact, appointment: current.nextAppointment };
          const replay = await h.command(operation.command);
          assert.equal(replay.status, 200);
          assert.equal(replay.body.ok, true);
          assert.equal(replay.body.replayed, true);
          assert.deepEqual(await centralCounts(h, participantId, operation.command.operationId), { contacts: centralBefore.contacts + 1, matching_contacts: 1, appointments: 1 });
          await h.openParticipant(participantId);
          await h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).getByText(notes, { exact: true }).waitFor({ state: "visible" });
          return {
            authenticatedRole: "mentor", ownershipMapping: "explicit controlled SQL fixture mapping of the recorded synthetic assignment and appointment mentor IDs",
            actualActorEqualsAssignedMentor: true, validCoordinatorRelationship: true, activePersonalGrants: 0,
            nativeOfflineRestarts: 2, centrallyAcceptedWhileOffline: false, localPendingCommandSurvivedRestart: true,
            automaticReconnect: true, acceptedMatchingContacts: 1, continuingAppointments: 1, sameOperationReplayCreatesDuplicate: false,
            queuedScreenshot, screenshot: await h.screenshot("assigned-mentor-reconnected-contact"),
          };
        } finally {
          // Stop this browser before removing temporary ownership. Any failed
          // submission remains safely local until the parent closes this profile.
          await remember(h, participantId).catch(() => {});
          await h.context.setOffline(true).catch(() => {});
          if (mapped) {
            await restoreMapping(h, participantId, original, queuedCommandId);
            await h.captureCurrent();
          }
        }
      }, { coordinatorId: original.assignment.coordinator_id });
    } finally {
      // roleWindow restores the QA membership and real CEO session first. A
      // preexisting fixture grant is then restored honestly as a new UI revision.
      if (revokedGrant) await grantUi(h, participantId, originalGrant, false);
    }
    const restored = await h.participant(participantId);
    const restoredActor = (await h.snapshot()).actor;
    assert.equal(restoredActor.role, "ceo");
    assert.equal(restoredActor.id, originalActor.id);
    assert.equal(restoredActor.coordinatorId, originalActor.coordinatorId);
    assert.equal(restoredActor.active, originalActor.active);
    assert.equal(restored.assignment.mentorId, original.assignment.mentor_id);
    assert.equal(restored.nextAppointment.mentorId, original.appointment.mentor_id);
    assert.deepEqual(restored.contacts.find((entry) => entry.id === acceptedData.contact.id), acceptedData.contact);
    assert.deepEqual(restored.nextAppointment, { ...acceptedData.appointment, mentorId: original.appointment.mentor_id });
    if (originalGrant) {
      const grant = restored.accessGrants.find((entry) => entry.staffId === h.actorId);
      assert.equal(grant.active, true);
      assert.deepEqual([...grant.actions].sort(), [...originalGrant.actions].sort());
      assert.equal(grant.expiresAt, originalGrant.expiresAt);
      assert.ok(grant.version > originalGrant.version);
    }
    await h.captureCurrent();
    return { ...evidence, fixtureMentorIdsRestoredWithoutResettingContactData: true, qaMembershipRestoredByHarness: true, preexistingGrantRestoredThroughUi: Boolean(originalGrant), strictNativeDraftVariants: strictDraftEvidence?.editableDraftVariants ?? 0 };
  }, { criteria: ["AC-03", "AC-08", "AC-10", "AC-13", "AC-21", "TA-01", "TA-05", "TA-10", "TA-11"] }));
}
