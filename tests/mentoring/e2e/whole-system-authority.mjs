import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const profileTab = "פרטי החניכה והליווי";
const protectionTitle = "הגנת מנכ״ל על רשומה";
const grantTitle = "הרשאה אישית לכרטיס";

/** Actual UI authority journeys. The parent harness owns identity, fixtures,
 * isolated browser windows, command recording, cleanup, and safe reporting. */
export async function runAuthorityScenarios(h) {
  const participantId = h.fixture.participantId;
  const note = (label) => `בדיקת דפדפן ${h.runId}: ${label}`;
  const initial = await h.snapshot();
  assert.equal(initial.actor.role, "ceo", "Authority setup requires the actual CEO membership.");
  const policy = initial.settings && {
    offlineLeaseHours: initial.settings.offlineLeaseHours,
    reminderAudience: initial.settings.reminderAudience,
    appointmentReminderMinutesBefore: initial.settings.appointmentReminderMinutesBefore,
    overdueRemindersEnabled: initial.settings.overdueRemindersEnabled,
    overdueRepeatHours: initial.settings.overdueRepeatHours,
  };
  let protectedCommand;
  let preservedConflictId;

  async function required(name, run, criteria) {
    if (!await h.scenario(name, run, { criteria }))
      throw new Error(`Authority prerequisite failed: ${name}`);
  }
  async function dialog(title, targetParticipantId = participantId) {
    await h.openParticipant(targetParticipantId, profileTab);
    await h.page.getByRole("button", { name: title, exact: true }).click();
    const current = h.page.getByRole("dialog");
    await current.getByRole("heading", { name: title, exact: true }).waitFor({ state: "visible" });
    return current;
  }
  async function saveAuthority(current, type, reason, button = "שמירת השינוי") {
    await current.getByLabel("סיבה לפעולה", { exact: true }).fill(reason);
    const saved = await h.action(type, () => current.getByRole("button", { name: button, exact: true }).click());
    await current.waitFor({ state: "hidden" });
    return saved;
  }
  async function setLifecycle(lifecycle, reason) {
    const current = await dialog("שינוי מצב הליווי");
    const labels = { active: "ליווי פעיל", paused: "ליווי בהשהיה", closed: "ליווי סגור" };
    await current.getByRole("button", { name: labels[lifecycle], exact: true }).click();
    await saveAuthority(current, "set_participant_lifecycle", reason);
    return h.poll(() => h.participant(participantId), (view) => view?.participant.lifecycle === lifecycle);
  }
  async function setProtection(mode, reason) {
    const current = await dialog(protectionTitle);
    await current.getByRole("button", {
      name: { whole: "כל הרשומה", fields: "שדות נבחרים", unlock: "הסרת הגנה" }[mode], exact: true,
    }).click();
    if (mode === "fields") {
      // A fresh whole-record lock has no field selection. Keep the test intent
      // explicit if the harness reruns this helper after another scoped lock.
      const group = current.getByRole("group", { name: "בחירת שדות מוגנים", exact: true });
      for (const selected of await group.getByRole("button", { pressed: true }).all()) await selected.click();
      await group.getByRole("button", { name: "מידע נוסף לליווי", exact: true }).click();
    }
    await saveAuthority(current, "set_ceo_protection", reason);
    return h.participant(participantId);
  }
  async function setGrant(staffId, actions, reason, targetParticipantId = participantId) {
    const person = (await h.snapshot()).staff.find((member) => member.id === staffId);
    assert.ok(person, "Grant target must be a current staff member.");
    const current = await dialog(grantTitle, targetParticipantId);
    await current.getByLabel("חבר/ת צוות", { exact: true }).click();
    await h.page.getByRole("option", { name: person.displayName, exact: true }).click();
    if (person.role === "mentor")
      assert.equal(await current.getByRole("button", { name: "אישור תיעוד", exact: true }).isDisabled(), true);
    if (!actions.length) {
      await current.getByRole("button", { name: "ביטול הרשאה", exact: true }).click();
      await saveAuthority(current, "set_access_grant", reason);
      return h.participant(targetParticipantId);
    }
    const group = current.getByRole("group", { name: "בחירת הרשאות", exact: true });
    // Edit automatically includes view. Choosing edit alone exercises that
    // normalization in the functional component and accepted server payload.
    for (const action of actions) {
      const label = { view: "צפייה", edit: "עריכה", approve: "אישור תיעוד" }[action];
      const control = group.getByRole("button", { name: label, exact: true });
      if (await control.getAttribute("aria-pressed") !== "true") await control.click();
    }
    const saved = await saveAuthority(current, "set_access_grant", reason);
    assert.ok(saved.command.actions.includes("view"));
    return h.participant(targetParticipantId);
  }
  function assertRoutineAppointmentUnprotected(view) {
    const participantLocks = view.protectionStates.filter((entry) => entry.resourceId === view.participant.id && entry.active);
    assert.ok(participantLocks.length > 0, "Routine profile fields must retain their actual CEO protection.");
    assert.ok(participantLocks.some((entry) => entry.fieldPaths?.includes("profileNotes")),
      "The CEO's routine profile-notes edit must remain protected.");
    for (const protection of participantLocks) {
      assert.ok(Array.isArray(protection.fieldPaths), "Routine actions must not create an implicit whole-participant lock.");
      assert.equal(protection.fieldPaths.includes("appointment"), false,
        "Routine CEO contact and profile work must not prevent the mentor's next appointment.");
    }
  }
  async function recordRoutineCompleted(targetParticipantId, notes, occurredAt, nextAt) {
    await h.navigate(`/staff/contacts/new?participant=${targetParticipantId}`);
    await h.page.locator("#contact-outcome").click();
    await h.page.getByRole("option", { name: "הקשר הושלם", exact: true }).click();
    await h.page.locator("#contact-method").click();
    await h.page.getByRole("option", { name: "שיחה טלפונית", exact: true }).click();
    await h.page.locator("#contact-occurredAt").fill(h.localInput(occurredAt));
    await h.page.locator("#contact-nextAppointmentAt").fill(h.localInput(nextAt));
    await h.page.locator("#contact-notes").fill(notes);
    return h.action("record_contact", () => h.page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click());
  }
  async function forbidden(payload, label) {
    const { status, body } = await h.command({ operationId: randomUUID(), ...payload });
    assert.equal(status, 403, `${label} must be denied by the current server role.`);
    assert.equal(body.ok, false, `${label} cannot return success.`);
    assert.equal(body.error?.code, "forbidden", `${label} must report a permission denial.`);
  }
  async function updatePhone(phone) {
    await h.openParticipant(participantId, profileTab);
    await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    const current = h.page.getByRole("dialog");
    await current.getByLabel("טלפון", { exact: true }).fill(phone);
    await h.action("update_participant", () => current.getByRole("button", { name: "שמירת פרטים", exact: true }).click());
    await current.waitFor({ state: "hidden" });
  }
  async function openHistoryPanel(targetParticipantId = participantId) {
    await h.openParticipant(targetParticipantId);
    await h.page.getByRole("tab", { name: /^היסטוריית קשר/ }).click();
    const panel = h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ });
    await panel.waitFor({ state: "visible" });
    return panel;
  }
  async function correctInactiveContact(lifecycle, changeTime = false) {
    const before = await h.participant(participantId);
    assert.equal(before.participant.lifecycle, lifecycle);
    const entry = before.contacts.find((contact) => contact.id === h.fixture.primaryContactId);
    assert.ok(entry && entry.outcome === "completed" && entry.invalidatedAt == null,
      "Inactive correction requires the existing valid completed contact.");
    assert.ok(before.nextAppointment, "Historical correction must retain the existing appointment.");
    if (changeTime) {
      const latest = before.contacts.filter((contact) => contact.outcome === "completed" && contact.invalidatedAt == null)
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0];
      assert.equal(latest.id, entry.id, "Timing correction must exercise the current completed-contact anchor.");
    }
    const historyPanel = await openHistoryPanel(participantId);
    const article = historyPanel.locator("article").filter({ hasText: entry.notes });
    assert.equal(await article.count(), 1, "The current report must have one exact visible history entry.");
    await article.getByRole("button", { name: "תיקון דיווח", exact: true }).click();
    const current = h.page.getByRole("dialog", { name: "תיקון דיווח", exact: true });
    const revisedNotes = note(`${lifecycle}: תיקון היסטורי ${changeTime ? "של מועד הקשר" : "של הסיכום בלבד"}`);
    // Fill waits for draft hydration; assertions about missing schedule inputs
    // must then describe the usable form rather than its loading state.
    await current.getByLabel("סיכום הדיווח המתוקן", { exact: true }).fill(revisedNotes);
    await current.getByLabel("סיבת השינוי", { exact: true }).fill(note(`${lifecycle}: תחזוקת דיווח קיים בלי קביעת פגישה`));
    if (changeTime) {
      await current.getByLabel("מועד הקשר בפועל", { exact: true }).fill(h.localInput(new Date(Date.parse(entry.occurredAt) - 5 * 60_000)));
      await current.getByText("המועד הקיים יישמר לבדיקה", { exact: true }).waitFor({ state: "visible" });
    }
    assert.equal(await current.getByLabel("מועד הקשר הבא", { exact: true }).count(), 0);
    const { command } = await h.action("revise_contact", () => current.getByRole("button", { name: "שמירת השינוי", exact: true }).click());
    assert.equal(Object.hasOwn(command, "nextAppointmentAt"), false,
      "An inactive historical correction cannot submit a hidden appointment.");
    await current.waitFor({ state: "hidden" });
    const after = await h.poll(() => h.participant(participantId),
      (view) => view?.contacts.find((contact) => contact.id === entry.id)?.revision === entry.revision + 1);
    const corrected = after.contacts.find((contact) => contact.id === entry.id);
    assert.equal(corrected.notes, revisedNotes);
    assert.equal(corrected.actorId, entry.actorId);
    assert.equal(corrected.receivedAt, entry.receivedAt);
    assert.equal(corrected.method, entry.method);
    assert.equal(corrected.outcome, entry.outcome);
    assert.ok(after.contactRevisions.some((revision) => revision.id === entry.id && revision.revision === entry.revision && revision.notes === entry.notes));
    assert.ok(after.contactRevisions.some((revision) => revision.id === entry.id && revision.revision === corrected.revision && revision.notes === revisedNotes && revision.changeKind === "correction"));
    if (changeTime) {
      assert.equal(corrected.occurredAt, command.occurredAt);
      assert.notEqual(corrected.occurredAt, entry.occurredAt);
      assert.deepEqual(after.nextAppointment, {
        ...before.nextAppointment,
        version: before.nextAppointment.version + 1,
        requiresReview: true,
      });
      assert.deepEqual(after.contactWarnings, ["appointment_requires_review"]);
      await h.page.getByText("צריך לבדוק את מועד הקשר הבא", { exact: true }).waitFor({ state: "visible" });
    } else {
      assert.equal(corrected.occurredAt, entry.occurredAt);
      assert.deepEqual(after.nextAppointment, before.nextAppointment);
      assert.deepEqual(after.contactWarnings, before.contactWarnings);
    }
    await historyPanel.getByText(revisedNotes, { exact: true }).waitFor({ state: "visible" });
    return {
      lifecycle, change: changeTime ? "actual_time" : "notes_only", revision: corrected.revision,
      previousRevisionPreserved: true, noNewAppointmentInputOrPayload: true,
      chosenAppointmentRetained: true, appointmentWarning: after.nextAppointment.requiresReview === true,
      ...(changeTime ? { screenshot: await h.screenshot(`authority-${lifecycle}-historical-correction`) } : {}),
    };
  }

  await required("CEO replacement preserves the first assignment clock and records responsibility history", async () => {
    const before = await h.participant(participantId);
    assert.ok(before.assignment, "The primary fixture must already be assigned.");
    const replacement = before.assignment.mentorId === h.fixture.otherMentorId ? h.fixture.mentorId : h.fixture.otherMentorId;
    await h.assignParticipant(participantId, replacement, h.fixture.coordinatorId);
    const after = await h.poll(() => h.participant(participantId), (view) => view?.assignment?.mentorId === replacement);
    assert.equal(after.assignment.followupAnchorAt, before.assignment.followupAnchorAt);
    assert.equal(after.assignmentHistory.filter((entry) => entry.endedAt === null).length, 1);
    assert.ok(after.assignmentHistory.some((entry) => entry.id === before.assignment.id && entry.endedAt !== null));
    if (before.nextAppointment) assert.equal(after.nextAppointment.mentorId, replacement);
    h.fixture.currentMentorId = replacement;
    await h.openParticipant(participantId, "שינויים ואחריות");
    await h.page.getByRole("tabpanel", { name: "שינויים ואחריות", exact: true }).getByText("היסטוריית שינויים ואחריות", { exact: true }).waitFor({ state: "visible" });
    return { originalAnchorPreserved: true, currentAssignments: 1, historyVisible: true, screenshot: await h.screenshot("authority-assignment-history") };
  }, ["AC-01", "AC-19"]);

  await required("CEO pause, close, recycle and restore preserve the participant history and previous lifecycle", async () => {
    const before = await h.participant(participantId);
    const inactiveCorrections = [];
    await setLifecycle("paused", note("השהיית הליווי"));
    let current = await h.participant(participantId);
    const { status, body } = await h.command({
      type: "record_contact", operationId: randomUUID(), participantId,
      expectedVersion: current.participant.version,
      expectedAppointmentVersion: current.nextAppointment?.version ?? null,
      method: "phone", outcome: "no_answer", occurredAt: new Date(Date.now() - 60_000).toISOString(), notes: note("ניסיון בכרטיס מושהה"),
    });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, "validation");
    const pausedJobs = (await h.snapshot()).reminders?.filter((job) => job.participantId === participantId) ?? [];
    assert.ok(pausedJobs.every((job) => !["pending", "blocked"].includes(job.state)), "Paused participants cannot retain unsent reminders.");
    inactiveCorrections.push(await correctInactiveContact("paused"));
    inactiveCorrections.push(await correctInactiveContact("paused", true));
    await setLifecycle("closed", note("סגירת הליווי"));
    inactiveCorrections.push(await correctInactiveContact("closed"));
    inactiveCorrections.push(await correctInactiveContact("closed", true));
    const history = (await h.participant(participantId)).contacts.map((entry) => [entry.id, entry.revision]);
    const deletion = await dialog("העברת כרטיס לסל המחזור");
    await saveAuthority(deletion, "delete_participant", note("העברה לבדיקה בסל המחזור"), "העברה לסל המחזור");
    current = await h.poll(() => h.participant(participantId), (view) => Boolean(view?.participant.deletedAt));
    assert.equal(current.participant.deletedPreviousLifecycle, "closed");
    assert.deepEqual(current.contacts.map((entry) => [entry.id, entry.revision]), history);
    assert.equal(current.assignment.id, before.assignment.id);
    await h.navigate("/staff/settings");
    await h.page.getByText("סל המחזור", { exact: true }).waitFor({ state: "visible" });
    await h.page.getByText(current.participant.displayName, { exact: true }).waitFor({ state: "visible" });
    const recycled = await h.screenshot("authority-recycle-bin");
    await h.openParticipant(participantId, profileTab);
    assert.equal(await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).count(), 0);
    await h.page.getByRole("button", { name: "שחזור כרטיס מסל המחזור", exact: true }).click();
    await saveAuthority(h.page.getByRole("dialog"), "restore_participant", note("שחזור עם היסטוריה"), "שחזור הכרטיס");
    current = await h.poll(() => h.participant(participantId), (view) => view?.participant.deletedAt === null);
    assert.equal(current.participant.lifecycle, "closed");
    assert.deepEqual(current.contacts.map((entry) => [entry.id, entry.revision]), history);
    await setLifecycle("active", note("החזרת הליווי לפעילות"));
    return { pausedContactDenied: true, unsentRemindersCancelled: true, inactiveCorrections, softDeleteRetainedHistory: true, restoredPreviousLifecycle: "closed", activeAgain: true, screenshot: recycled };
  }, ["AC-09", "AC-17", "TA-13"]);

  await required("CEO grants and whole-record protection remain versioned until an explicit scoped change", async () => {
    h.fixture.authorityPrivateParticipantId = await h.createParticipant("authority-private");
    await h.openParticipant(participantId, profileTab);
    await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    let current = h.page.getByRole("dialog");
    await current.getByLabel("מידע נוסף לליווי", { exact: true }).fill(note("מידע סמכותי מוגן"));
    await h.action("update_participant", () => current.getByRole("button", { name: "שמירת פרטים", exact: true }).click());
    await current.waitFor({ state: "hidden" });
    let view = await setProtection("whole", note("סיבת הגנה לעיני מנכ״ל בלבד"));
    const wholeVersion = view.protectionStates.find((entry) => entry.resourceId === participantId).version;
    await updatePhone("0500000001");
    view = await h.participant(participantId);
    let protection = view.protectionStates.find((entry) => entry.resourceId === participantId);
    assert.equal(protection.active, true);
    assert.equal(protection.fieldPaths, null, "A later CEO field edit must not narrow a whole-record lock.");
    assert.ok(protection.version >= wholeVersion);
    view = await setProtection("fields", note("סיבת הגנה פרטית על מידע נוסף"));
    protection = view.protectionStates.find((entry) => entry.resourceId === participantId);
    assert.deepEqual(protection.fieldPaths, ["profileNotes"]);
    assert.ok(protection.version > wholeVersion);
    await setGrant(h.actorId, ["edit"], note("הרשאת עריכה לבדיקה לאותו חשבון"));
    view = await setGrant(h.fixture.otherMentorId, ["view"], note("הרשאת צפייה נוספת שאינה שייכת לחשבון הבדיקה"));
    const firstGrant = view.accessGrants.find((grant) => grant.staffId === h.fixture.otherMentorId);
    view = await setGrant(h.fixture.otherMentorId, [], note("ביטול הרשאה אישית ושמירת היסטוריה"));
    const revokedGrant = view.accessGrants.find((grant) => grant.staffId === h.fixture.otherMentorId);
    assert.equal(revokedGrant.id, firstGrant.id);
    assert.equal(revokedGrant.active, false);
    assert.equal(revokedGrant.version, firstGrant.version + 1);
    assert.equal(revokedGrant.revokedByStaffId, h.actorId);
    assert.ok(revokedGrant.revokedAt);
    assert.deepEqual(revokedGrant.actions, []);
    view = await setGrant(h.fixture.otherMentorId, ["view"], note("החזרת הרשאת צפייה נפרדת לבדיקה"));
    assert.equal(view.accessGrants.find((grant) => grant.staffId === h.fixture.otherMentorId).id, firstGrant.id);
    const own = view.accessGrants.find((grant) => grant.staffId === h.actorId);
    assert.deepEqual([...own.actions].sort(), ["edit", "view"]);
    assert.equal(own.active, true);
    h.fixture.protectedAuthorityValue = view.participant.profileNotes;
    return { selfGrantIncludesViewAndEdit: true, mentorApproveDisabled: true, grantRevocationAttributedAndVersioned: true, unrelatedCeoEditPreservedWholeLock: true, explicitNarrowingVersioned: true, screenshot: await h.screenshot("authority-grants-and-protection") };
  }, ["AC-08", "AC-09", "AC-11", "TA-04", "TA-06"]);

  await required("Routine CEO create, assign, completed contact and profile edit protect fields without locking the mentor's appointment", async () => {
    const routineId = await h.createParticipant("routine-protection-policy");
    h.fixture.routineParticipantId = routineId;
    await h.assignParticipant(routineId, h.fixture.mentorId, h.fixture.coordinatorId);
    h.fixture.routineCeoContactNotes = note("דיווח מנכ״ל מוגן במהלך ליווי שגרתי");
    const { command } = await recordRoutineCompleted(routineId, h.fixture.routineCeoContactNotes,
      new Date(Date.now() - 3 * 60_000), new Date(Date.now() + 86_400_000));
    h.fixture.routineCeoContactId = command.operationId;
    await h.openParticipant(routineId, profileTab);
    await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    const edit = h.page.getByRole("dialog");
    h.fixture.routineProfileNotes = note("מידע נוסף שנערך בשגרה ללא שינוי הגנות מפורש");
    await edit.getByLabel("מידע נוסף לליווי", { exact: true }).fill(h.fixture.routineProfileNotes);
    await h.action("update_participant", () => edit.getByRole("button", { name: "שמירת פרטים", exact: true }).click());
    await edit.waitFor({ state: "hidden" });
    const routine = await setGrant(h.actorId, ["edit"], note("הרשאת בדיקה לכרטיס שגרתי"), routineId);
    assertRoutineAppointmentUnprotected(routine);
    const contactLock = routine.protectionStates.find((entry) => entry.resourceId === command.operationId && entry.active);
    assert.ok(contactLock, "The CEO's accepted contact must remain protected.");
    assert.equal(contactLock.fieldPaths, null);
    assert.equal(routine.participant.profileNotes, h.fixture.routineProfileNotes);
    assert.equal(routine.nextAppointment.sourceContactId, command.operationId);
    return { routineFixtureCreatedThroughUi: true, explicitProtectionChanges: 0, appointmentFieldUnlockedAfterRoutineCeoWork: true, ceoContactRemainsProtected: true, screenshot: await h.screenshot("authority-routine-ceo-protection-policy") };
  }, ["AC-03", "AC-07", "AC-09"]);

  await required("Real coordinator membership can add own-team staff and initially assign, while CEO-only operations remain denied", async () => {
    return h.roleWindow("coordinator", async () => {
      const firstMentorId = await h.createStaff("mentor", "coordinator-window-first");
      const secondMentorId = await h.createStaff("mentor", "coordinator-window-second");
      const ownParticipantId = await h.createParticipant("coordinator-window");
      h.fixture.coordinatorWindowParticipantId = ownParticipantId;
      let snapshot = await h.snapshot();
      assert.equal(snapshot.actor.role, "coordinator");
      assert.equal(snapshot.staff.find((person) => person.id === firstMentorId).coordinatorId, h.actorId);
      const unassigned = snapshot.participants.find((view) => view.participant.id === ownParticipantId);
      assert.ok(unassigned);
      assert.equal(unassigned.assignment, null);
      await h.assignParticipant(ownParticipantId, firstMentorId, h.actorId);
      const assigned = await h.participant(ownParticipantId);
      assert.equal(assigned.assignment.mentorId, firstMentorId);
      assert.equal(assigned.assignment.coordinatorId, h.actorId);
      await h.openParticipant(ownParticipantId, profileTab);
      assert.equal(await h.page.getByRole("button", { name: "שינוי שיוך", exact: true }).isDisabled(), true);
      await forbidden({ type: "assign_participant", participantId: ownParticipantId, expectedVersion: assigned.participant.version, mentorId: secondMentorId, coordinatorId: h.actorId }, "Coordinator replacement");
      await forbidden({ type: "delete_participant", participantId: ownParticipantId, expectedVersion: assigned.participant.version, reason: note("מחיקה אסורה לרכזת") }, "Coordinator deletion");
      const member = (await h.snapshot()).staff.find((person) => person.id === firstMentorId);
      await forbidden({ type: "update_staff", staffId: firstMentorId, expectedVersion: member.version, fields: { phone: "0500000002" } }, "Coordinator staff edit");
      await forbidden({ type: "set_sms_muted", muted: true }, "Coordinator mandatory SMS mute");
      snapshot = await h.snapshot();
      const primary = snapshot.participants.find((view) => view.participant.id === participantId);
      assert.ok(primary);
      assert.equal(primary.accessGrants.length, 1, "The coordinator must receive its own actual grant without the other mentor's grant.");
      assert.equal(primary.accessGrants[0].staffId, h.actorId);
      assert.equal(primary.accessGrants[0].active, true);
      assert.ok(primary.protectionStates.some((entry) => entry.resourceId === participantId && entry.active));
      for (const view of snapshot.participants) {
        assert.ok((view.accessGrants ?? []).every((grant) => grant.staffId === h.actorId));
        assert.ok((view.protectionStates ?? []).every((entry) => entry.reason === null));
        assert.ok((view.authorityHistory ?? []).every((entry) => !["set_access_grant", "set_ceo_protection"].includes(entry.action)));
      }
      const protectedBefore = (await h.participant(participantId)).protectionStates.find((entry) => entry.resourceId === participantId);
      await updatePhone("0500000002");
      const protectedAfter = (await h.participant(participantId)).protectionStates.find((entry) => entry.resourceId === participantId);
      assert.equal(protectedAfter.active, true);
      assert.equal(protectedAfter.version, protectedBefore.version);
      assert.deepEqual(protectedAfter.fieldPaths, ["profileNotes"]);
      await h.navigate("/staff/settings");
      assert.equal(await h.page.getByRole("switch").first().isDisabled(), true);
      assert.equal(await h.page.getByText("סל המחזור", { exact: true }).count(), 0);
      return { actualRole: "coordinator", ownTeamStaffCreated: 2, initialAssignmentAccepted: true, replacementDenied: true, deletionDenied: true, staffEditDenied: true, mandatorySmsCannotBeDisabled: true, administrativeMetadataRedacted: true, unrelatedFieldEditPreservedProtection: true, screenshot: await h.screenshot("authority-coordinator-permissions") };
    });
  }, ["AC-01", "AC-08", "AC-09", "AC-14", "TA-05", "TA-06"]);

  await required("Real mentor grant scope, protected-field UX and server role boundaries agree", async () => {
    return h.roleWindow("mentor", async () => {
      let snapshot = await h.snapshot();
      assert.equal(snapshot.actor.role, "mentor");
      const primary = snapshot.participants.find((view) => view.participant.id === participantId);
      assert.ok(primary);
      assert.equal(primary.accessGrants.length, 1, "The mentor must receive its own actual grant without the other mentor's grant.");
      assert.equal(primary.accessGrants[0].staffId, h.actorId);
      assert.equal(primary.accessGrants[0].active, true);
      assert.ok(primary.protectionStates.some((entry) => entry.resourceId === participantId && entry.active));
      assert.equal(snapshot.participants.some((view) => view.participant.id === h.fixture.authorityPrivateParticipantId), false);
      assert.ok(snapshot.staff.some((person) => person.id === h.fixture.otherMentorId));
      for (const member of snapshot.staff.filter((person) => person.id !== h.actorId)) {
        assert.equal(member.email, null);
        assert.equal(member.phone, null);
        assert.equal(member.authUserId, "");
      }
      for (const view of snapshot.participants) {
        assert.ok((view.accessGrants ?? []).every((grant) => grant.staffId === h.actorId));
        assert.ok((view.protectionStates ?? []).every((entry) => entry.reason === null));
        assert.deepEqual(view.authorityHistory ?? [], []);
      }
      await h.navigate(`/staff/participants/${h.fixture.authorityPrivateParticipantId}`);
      await h.page.getByRole("heading", { name: "כרטיס החניכה אינו זמין", exact: true }).waitFor({ state: "visible" });
      const privateName = h.manifest.names.participants[h.fixture.authorityPrivateParticipantId];
      assert.equal((await h.page.locator("body").innerText()).includes(privateName), false);
      await h.openParticipant(participantId, profileTab);
      assert.equal(await h.page.getByRole("button", { name: "שינוי מצב הליווי", exact: true }).count(), 0);
      assert.equal(await h.page.getByRole("button", { name: grantTitle, exact: true }).count(), 0);
      await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
      const edit = h.page.getByRole("dialog");
      // Filling an allowed field waits for draft hydration to finish. Checking
      // the locked field earlier could pass merely because the whole form was
      // temporarily disabled while its draft loaded.
      await edit.getByLabel("טלפון", { exact: true }).fill("0500000003");
      assert.equal(await edit.getByLabel("מידע נוסף לליווי", { exact: true }).isDisabled(), true);
      await h.action("update_participant", () => edit.getByRole("button", { name: "שמירת פרטים", exact: true }).click());
      await edit.waitFor({ state: "hidden" });
      let current = await h.participant(participantId);
      assert.equal(current.participant.phone, "0500000003");
      assert.equal(current.participant.profileNotes, h.fixture.protectedAuthorityValue);
      assert.deepEqual(current.protectionStates.find((entry) => entry.resourceId === participantId).fieldPaths, ["profileNotes"]);
      const screenshot = await h.screenshot("authority-mentor-protected-profile");

      const beforeAppointment = current.nextAppointment;
      await h.navigate(`/staff/contacts/new?participant=${participantId}`);
      await h.page.locator("#contact-outcome").click();
      await h.page.getByRole("option", { name: "לא היה מענה", exact: true }).click();
      await h.page.locator("#contact-occurredAt").fill(h.localInput(new Date(Date.now() - 60_000)));
      await h.page.locator("#contact-notes").fill(note("ניסיון קשר של חונכת בהרשאה אמיתית"));
      const { command: contact } = await h.action("record_contact", () => h.page.getByRole("button", { name: "שמירת התיעוד", exact: true }).click());
      current = await h.participant(participantId);
      assert.equal(current.contacts.find((entry) => entry.id === contact.operationId).actorId, h.actorId);
      assert.deepEqual(current.nextAppointment, beforeAppointment);

      const beforeCompleted = current;
      const notesProtection = current.protectionStates.find((entry) => entry.resourceId === participantId);
      assert.deepEqual(notesProtection.fieldPaths, ["profileNotes"]);
      await h.navigate(`/staff/contacts/new?participant=${participantId}`);
      await h.page.locator("#contact-outcome").click();
      await h.page.getByRole("option", { name: "הקשר הושלם", exact: true }).click();
      await h.page.locator("#contact-method").click();
      await h.page.getByRole("option", { name: "שיחה טלפונית", exact: true }).click();
      await h.page.locator("#contact-occurredAt").fill(h.localInput(new Date(Date.now() - 2 * 60_000)));
      // This permitted input must become usable despite the unrelated notes
      // protection; successful typing also waits for draft hydration.
      await h.page.locator("#contact-nextAppointmentAt").fill(h.localInput(new Date(Date.now() + 2 * 86_400_000)));
      await h.page.locator("#contact-notes").fill(note("שיחה שהושלמה עם חונכת כאשר מידע נוסף בלבד מוגן"));
      const { command: completed } = await h.action("record_contact", () => h.page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click());
      current = await h.poll(() => h.participant(participantId), (view) => view?.contacts.some((entry) => entry.id === completed.operationId));
      const completedEntry = current.contacts.find((entry) => entry.id === completed.operationId);
      assert.equal(completedEntry.actorId, h.actorId);
      assert.equal(completedEntry.method, "phone");
      assert.equal(completedEntry.outcome, "completed");
      assert.equal(current.contacts.filter((entry) => entry.outcome === "completed" && !entry.invalidatedAt).length,
        beforeCompleted.contacts.filter((entry) => entry.outcome === "completed" && !entry.invalidatedAt).length + 1);
      assert.equal(current.nextAppointment.id, beforeCompleted.nextAppointment.id);
      assert.equal(current.nextAppointment.version, beforeCompleted.nextAppointment.version + 1);
      assert.equal(current.nextAppointment.scheduledAt, completed.nextAppointmentAt);
      assert.equal(current.nextAppointment.sourceContactId, completed.operationId);
      assert.equal(current.participant.profileNotes, h.fixture.protectedAuthorityValue);
      assert.deepEqual(current.protectionStates.find((entry) => entry.resourceId === participantId), notesProtection);
      assert.ok(current.contacts.some((entry) => entry.id === h.fixture.primaryContactId && entry.outcome === "completed" && entry.invalidatedAt == null),
        "The original valid completed contact remains available for later draft checks.");
      h.fixture.mentorCompletedContactId = completed.operationId;
      const completedPanel = await openHistoryPanel(participantId);
      await completedPanel.getByText(completed.notes, { exact: true }).waitFor({ state: "visible" });
      const completedContactScreenshot = await h.screenshot("authority-mentor-completed-contact");

      let routineBefore = await h.participant(h.fixture.routineParticipantId);
      assert.ok(routineBefore, "The routine CEO workflow fixture must be available through its actual grant.");
      assertRoutineAppointmentUnprotected(routineBefore);
      assert.equal(routineBefore.participant.phone, null, "The routine CEO name-only create must leave phone blank.");
      const routineName = routineBefore.participant.displayName;
      const routinePhone = "0500000005";
      await h.openParticipant(h.fixture.routineParticipantId, profileTab);
      await h.page.getByRole("tabpanel", { name: profileTab, exact: true }).waitFor({ state: "visible" });
      await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
      const routineEdit = h.page.getByRole("dialog");
      const phoneInput = routineEdit.getByLabel("טלפון", { exact: true });
      await h.poll(() => phoneInput.isEnabled(), Boolean);
      assert.equal(await phoneInput.inputValue(), "");
      await phoneInput.fill(routinePhone);
      assert.equal(await routineEdit.getByLabel("שם החניכה", { exact: true }).isDisabled(), true);
      assert.equal(await routineEdit.getByLabel("שם החניכה", { exact: true }).inputValue(), routineName);
      assert.equal(await routineEdit.getByLabel("מידע נוסף לליווי", { exact: true }).isDisabled(), true);
      assert.equal(await routineEdit.getByLabel("מידע נוסף לליווי", { exact: true }).inputValue(), h.fixture.routineProfileNotes);
      await h.action("update_participant", () => routineEdit.getByRole("button", { name: "שמירת פרטים", exact: true }).click());
      await routineEdit.waitFor({ state: "hidden" });
      const routineAfterPhone = await h.participant(h.fixture.routineParticipantId);
      assert.equal(routineAfterPhone.participant.phone, routinePhone);
      assert.equal(routineAfterPhone.participant.displayName, routineName);
      assert.equal(routineAfterPhone.participant.profileNotes, h.fixture.routineProfileNotes);
      assert.deepEqual(routineAfterPhone.protectionStates, routineBefore.protectionStates);
      assert.deepEqual(routineAfterPhone.protections, routineBefore.protections);
      assert.deepEqual(routineAfterPhone.nextAppointment, routineBefore.nextAppointment);
      await h.openParticipant(h.fixture.routineParticipantId, profileTab);
      const routineProfilePanel = h.page.getByRole("tabpanel", { name: profileTab, exact: true });
      await routineProfilePanel.getByRole("link", { name: routinePhone, exact: true }).waitFor({ state: "visible" });
      await routineProfilePanel.getByText(h.fixture.routineProfileNotes, { exact: true }).waitFor({ state: "visible" });
      routineBefore = routineAfterPhone;
      const routineCompletedNotes = note("חונכת ממשיכה ליווי שגרתי אחרי דיווח מנכ״ל בלי הסרת הגנה");
      const { command: routineCompleted } = await recordRoutineCompleted(h.fixture.routineParticipantId,
        routineCompletedNotes, new Date(Date.now() - 60_000), new Date(Date.now() + 2 * 86_400_000));
      const routineAfter = await h.poll(() => h.participant(h.fixture.routineParticipantId),
        (view) => view?.contacts.some((entry) => entry.id === routineCompleted.operationId));
      const routineContact = routineAfter.contacts.find((entry) => entry.id === routineCompleted.operationId);
      assert.equal(routineContact.actorId, h.actorId);
      assert.equal(routineContact.method, "phone");
      assert.equal(routineContact.outcome, "completed");
      assert.equal(routineAfter.contacts.length, routineBefore.contacts.length + 1);
      assert.equal(routineAfter.nextAppointment.id, routineBefore.nextAppointment.id);
      assert.equal(routineAfter.nextAppointment.version, routineBefore.nextAppointment.version + 1);
      assert.equal(routineAfter.nextAppointment.scheduledAt, routineCompleted.nextAppointmentAt);
      assert.equal(routineAfter.nextAppointment.sourceContactId, routineCompleted.operationId);
      assert.equal(routineAfter.reviews.some((review) => review.contactId === routineCompleted.operationId), false);
      assert.equal(routineAfter.participant.profileNotes, h.fixture.routineProfileNotes);
      assertRoutineAppointmentUnprotected(routineAfter);
      const ceoContactLock = routineAfter.protectionStates.find((entry) => entry.resourceId === h.fixture.routineCeoContactId && entry.active);
      assert.ok(ceoContactLock);
      assert.equal(ceoContactLock.fieldPaths, null);
      const routineHistoryPanel = await openHistoryPanel(h.fixture.routineParticipantId);
      await routineHistoryPanel.getByText(routineCompletedNotes, { exact: true }).waitFor({ state: "visible" });
      const ceoArticle = routineHistoryPanel.locator("article").filter({ hasText: h.fixture.routineCeoContactNotes });
      assert.equal(await ceoArticle.count(), 1);
      assert.equal(await ceoArticle.getByRole("button", { name: "תיקון דיווח", exact: true }).isDisabled(), true);
      const routineContactScreenshot = await h.screenshot("authority-mentor-routine-ceo-policy");

      protectedCommand = {
        type: "update_participant", operationId: randomUUID(), participantId,
        expectedVersion: current.participant.version,
        fields: { profileNotes: note("שינוי שנעצר ונשמר בנפרד") },
      };
      const first = await h.command(protectedCommand);
      assert.equal(first.status, 409);
      assert.equal(first.body.ok, false);
      assert.equal(first.body.error?.code, "ceo_protected");
      preservedConflictId = first.body.error?.conflictId;
      assert.match(preservedConflictId, /^[0-9a-f-]{36}$/);
      const replay = await h.command(protectedCommand);
      assert.equal(replay.status, 409);
      assert.equal(replay.body.error?.conflictId, preservedConflictId);
      current = await h.participant(participantId);
      assert.equal(current.participant.profileNotes, h.fixture.protectedAuthorityValue);

      const offlineConflictNotes = note("שינוי מוגן נוסף שממתין להכרעה ללא חיבור");
      const second = await h.command({
        type: "update_participant", operationId: randomUUID(), participantId,
        expectedVersion: current.participant.version,
        fields: { profileNotes: offlineConflictNotes },
      });
      assert.equal(second.status, 409);
      assert.equal(second.body.ok, false);
      assert.equal(second.body.error?.code, "ceo_protected");
      assert.match(second.body.error?.conflictId, /^[0-9a-f-]{36}$/);
      assert.notEqual(second.body.error.conflictId, preservedConflictId);
      h.fixture.offlineConflictId = second.body.error.conflictId;
      h.fixture.offlineConflictNotes = offlineConflictNotes;

      const administrative = [
        ["Mentor approval", { type: "review_contact", participantId, contactId: contact.operationId, revision: 1, decision: "approved" }],
        ["Mentor lifecycle", { type: "set_participant_lifecycle", participantId, expectedVersion: current.participant.version, lifecycle: "paused", reason: note("השהיה אסורה לחונכת") }],
        ["Mentor deletion", { type: "delete_participant", participantId, expectedVersion: current.participant.version, reason: note("מחיקה אסורה לחונכת") }],
        ["Mentor reminder scan", { type: "evaluate_reminders" }],
        ["Mentor SMS mute", { type: "set_sms_muted", muted: true }],
        ["Mentor staff edit", { type: "update_staff", staffId: h.fixture.mentorId, expectedVersion: snapshot.staff.find((person) => person.id === h.fixture.mentorId).version, fields: { phone: "0500000004" } }],
      ];
      if (policy) administrative.push(["Mentor settings", { type: "update_organization_settings", expectedVersion: initial.settings.version, settings: policy, reason: note("הגדרות אסורות לחונכת") }]);
      for (const [label, payload] of administrative) await forbidden(payload, label);
      await h.navigate("/staff/settings");
      assert.equal(await h.page.getByRole("switch").first().isDisabled(), true);
      snapshot = await h.snapshot();
      assert.equal(snapshot.participants.some((view) => view.participant.id === h.fixture.authorityPrivateParticipantId), false);
      return { actualRole: "mentor", directUnauthorizedUrlRedacted: true, otherStaffContactDetailsRedacted: true, grantAndProtectionMetadataRedacted: true, unrelatedFieldAccepted: true, protectedOverwritePreserved: true, repeatedConflictStable: true, additionalProtectedConflictPreparedForOffline: true, actualMentorContactAccepted: true, completedPhoneAndNextAppointmentAcceptedWithUnrelatedNotesProtection: true, routineBlankPhoneCompletedWithoutUnlock: true, routineCeoNameAndNotesRemainProtected: true, routineCeoWorkflowAllowsMentorContinuationWithoutUnlock: true, routineCeoReportStillProtected: true, oneContinuingAppointment: true, originalValidContactRetained: true, administrativeCommandsDenied: administrative.length, screenshot, completedContactScreenshot, routineContactScreenshot };
    });
  }, ["AC-02", "AC-03", "AC-04", "AC-07", "AC-08", "AC-09", "AC-11", "AC-14", "TA-04", "TA-05", "TA-06", "TA-15"]);

  await required("Explicit CEO unlock preserves the original conflict receipt and allows a reviewed resolution", async () => {
    const before = await h.participant(participantId);
    const version = before.protectionStates.find((entry) => entry.resourceId === participantId).version;
    let current = await setProtection("unlock", note("הסרת הגנה מפורשת לאחר בדיקה"));
    const state = current.protectionStates.find((entry) => entry.resourceId === participantId);
    assert.equal(state.active, false);
    assert.ok(state.version > version);
    assert.equal(state.unlockedByStaffId, h.actorId);
    assert.ok(state.unlockedAt);
    const replay = await h.command(protectedCommand);
    assert.equal(replay.status, 409);
    assert.equal(replay.body.error?.code, "ceo_protected");
    assert.equal(replay.body.error?.conflictId, preservedConflictId);
    const changedReplay = await h.command({ ...protectedCommand, fields: { profileNotes: note("תוכן אחר עם אותו מזהה") } });
    assert.equal(changedReplay.status, 409);
    assert.equal(changedReplay.body.error?.code, "conflict");
    assert.equal((await h.snapshot()).conflicts.filter((entry) => entry.id === preservedConflictId).length, 1);
    await h.navigate("/staff/conflicts");
    const card = h.page.locator('[data-slot="card"]').filter({ hasText: protectedCommand.fields.profileNotes });
    await h.action("resolve_conflict", () => card.getByRole("button", { name: "שמירת גרסת המנכ״ל וסגירה", exact: true }).click());
    await h.poll(() => h.snapshot(), (snapshot) => snapshot.conflicts.some((entry) => entry.id === preservedConflictId && Boolean(entry.resolvedAt)));
    const offlineConflict = (await h.snapshot()).conflicts.find((entry) => entry.id === h.fixture.offlineConflictId);
    assert.ok(offlineConflict);
    assert.equal(offlineConflict.resolvedAt, null, "The distinct offline-resolution fixture must remain unresolved.");
    current = await h.participant(participantId);
    assert.equal(current.participant.profileNotes, h.fixture.protectedAuthorityValue);
    await h.openParticipant(participantId, "שינויים ואחריות");
    return { unlockAttributedAndVersioned: true, oldConflictStillStableAfterUnlock: true, changedReplayRejected: true, originalConflictReferences: 1, distinctConflictRetainedUnresolvedForOffline: true, resolutionRetainedAuthoritativeValue: true, screenshot: await h.screenshot("authority-unlock-history") };
  }, ["AC-11", "TA-04", "TA-15"]);
}
