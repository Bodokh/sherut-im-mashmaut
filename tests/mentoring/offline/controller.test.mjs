import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(`${root}/package.json`);
require('fake-indexeddb/auto');
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL?.includes('/lib/mentoring/') && !/\.[a-z]+$/i.test(specifier)) {
    try { return nextResolve(`${specifier}.ts`, context); } catch { /* Preserve normal resolution for other imports. */ }
  }
  return nextResolve(specifier, context);
} });
const offline = await import(`${root}/lib/mentoring/offline.ts`);
const ts = require('typescript');
const source = readFileSync(`${root}/lib/mentoring/workspace-client.tsx`, 'utf8') + '\nexports.ReviewController = WorkspaceController;';
const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(
  (id) => id === './offline' ? offline : id === '@clerk/nextjs' ? {} : require(id), compiledModule, compiledModule.exports,
);
const Controller = compiledModule.exports.ReviewController;
const local = new Map(); const session = new Map();
const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) });
globalThis.window = Object.assign(new EventTarget(), { localStorage: storage(local), sessionStorage: storage(session) });
let cookie = '';
globalThis.document = { get cookie() { return cookie; }, set cookie(value) { cookie = value.split(';')[0]; } };
globalThis.location = { protocol: 'https:' };

function snapshot(account = 'A') {
  const now = Date.now();
  const actor = { id: `staff_${account}`, authUserId: account, organizationId: `org_${account}`, role: 'ceo', active: true, version: 1, displayName: 'test', email: null, phone: null, coordinatorId: null, smsMuted: false };
  return { actor, staff: [actor, { ...actor, id: 'staff_other', authUserId: 'other', role: 'mentor' }], participants: [{ participant: { id: 'p', organizationId: actor.organizationId, displayName: 'test', phone: null, serviceType: null, servicePlace: null, serviceRole: null, profileNotes: null, lifecycle: 'active', version: 1, createdAt: new Date(now).toISOString() }, assignment: null, nextAppointment: null, manualColor: null, manualColorAt: null, contacts: [], reviews: [], protections: [] }], conflicts: [], serverTime: new Date(now - 100).toISOString(), offlineValidUntil: new Date(now + 3_600_000).toISOString(), capabilities: { smsConfigured: false, smsSendingEnabled: false } };
}
const command = () => ({ type: 'update_participant', operationId: crypto.randomUUID(), participantId: 'p', expectedVersion: 1, fields: { profileNotes: 'test' } });
const accepted = (operationId) => Response.json({ ok: true, acceptance: 'accepted', operationId, replayed: false, participantId: 'p' });

test('controller preserves identity, replay, recovery, and snapshot versions with and without Web Locks', async () => {
for (const locksEnabled of [false, true]) {
  let lockTail = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, ...(locksEnabled ? { locks: { request(_name, _options, callback) { const next = lockTail.then(callback); lockTail = next.catch(() => undefined); return next; } } } : {}) } });

  await offline.mentoringOfflineStore.clear();
  let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot());
    assert.equal(options.headers['X-Mentoring-Account'], 'A');
    ++posts;
    return posts === 1 ? Response.json({ ok: false, error: { code: 'validation', message: 'invalid' } }, { status: 400 }) : accepted(JSON.parse(options.body).operationId);
  };
  const correctedController = new Controller();
  await correctedController.updateAuth(true, 'A');
  await correctedController.submit(command());
  const corrected = await correctedController.submit(command());
  assert.equal(posts, 2);
  assert.equal(corrected.ok && corrected.acceptance === 'accepted', true);
  const failedIntent = correctedController.getSnapshot().localFailures[0];
  assert.equal(failedIntent.failure.error.code, 'validation');
  await correctedController.acknowledgeLocalFailure('A', failedIntent.command.operationId);
  await correctedController.refresh();
  const archivedReplay = await correctedController.submit(failedIntent.command);
  assert.equal(archivedReplay.ok ? 'unexpected queued archived failure' : archivedReplay.error.code, 'validation');
  assert.equal(posts, 2, 'a reviewed historical payload is never sent automatically');
  assert.equal(correctedController.getSnapshot().localFailures.length, 0);
  assert.equal(correctedController.getSnapshot().pendingCount, 0);
  assert.ok(correctedController.getSnapshot().snapshot.conflicts.find((entry) => entry.id === `local:${failedIntent.command.operationId}`).resolvedAt);
  correctedController.dispose();

  await offline.mentoringOfflineStore.clear();
  globalThis.fetch = async (_url, options) => !options?.method ? Response.json(snapshot()) : { status: 200, ok: true, json: async () => { throw new SyntaxError('truncated response'); } };
  const lostController = new Controller();
  await lostController.updateAuth(true, 'A');
  const lost = await lostController.submit(command());
  const savedSession = await offline.mentoringOfflineStore.readSession('A');
  const pending = await offline.mentoringOfflineStore.operations(savedSession.scope);
  assert.equal(lost.ok && lost.acceptance === 'queued', true);
  assert.equal(pending[0]?.status, 'pending');
  let replayedCommand;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot());
    assert.equal(options.headers['X-Mentoring-Account'], 'A');
    replayedCommand = JSON.parse(options.body);
    return accepted(replayedCommand.operationId);
  };
  await lostController.refresh();
  assert.deepEqual(replayedCommand, pending[0].command);
  assert.equal((await offline.mentoringOfflineStore.operations(savedSession.scope)).length, 0);
  assert.equal(lostController.getSnapshot().pendingCount, 0);
  lostController.dispose();

  await offline.mentoringOfflineStore.clear();
  let account = 'A'; let postedAccount = null;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot(account));
    postedAccount = account;
    return accepted(JSON.parse(options.body).operationId);
  };
  const switchedController = new Controller();
  await switchedController.updateAuth(true, 'A');
  let release;
  switchedController.submitTask = new Promise((resolve) => { release = resolve; });
  const held = switchedController.submit({ type: 'create_participant', operationId: crypto.randomUUID(), fields: { displayName: 'private-from-A' } });
  account = 'B';
  await switchedController.updateAuth(true, 'B');
  release();
  const switched = await held;
  assert.equal(postedAccount, null);
  assert.equal(switched.ok ? 'unexpected accepted' : switched.error.code, 'not_authenticated');
  const staleFormResult = await switchedController.submit({ type: 'create_participant', operationId: crypto.randomUUID(), fields: { displayName: 'private-from-old-A-form' } }, 'A');
  assert.equal(staleFormResult.ok ? 'unexpected accepted' : staleFormResult.error.code, 'not_authenticated');
  assert.equal(postedAccount, null, 'a callback rendered for A cannot submit a new participant under B');
  switchedController.dispose();

  await offline.mentoringOfflineStore.clear();
  let verifiedCookieAccount = 'A'; let gets = 0; let accountMismatchPosts = 0; let providerWrites = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) {
      const captured = snapshot(verifiedCookieAccount);
      // A second tab changes the shared provider cookie after GET has returned
      // A's authorized snapshot, without Clerk's current tab updating yet.
      if (++gets === 2) verifiedCookieAccount = 'B';
      return Response.json(captured);
    }
    assert.equal(options.headers['X-Mentoring-Account'], 'A');
    if (options.headers['X-Mentoring-Account'] !== verifiedCookieAccount) {
      ++accountMismatchPosts;
      return new Response('', { status: 401 });
    }
    ++providerWrites;
    return accepted(JSON.parse(options.body).operationId);
  };
  const cookieSwitchController = new Controller();
  await cookieSwitchController.updateAuth(true, 'A');
  await cookieSwitchController.writeDraft('A', 'private-A', { notes: 'private from A' });
  const wrongCookieResult = await cookieSwitchController.submit(command());
  assert.equal(accountMismatchPosts, 1);
  assert.equal(providerWrites, 0);
  assert.equal(wrongCookieResult.ok ? 'unexpected accepted' : wrongCookieResult.error.code, 'not_authenticated');
  assert.equal(cookieSwitchController.getSnapshot().snapshot, null);
  assert.equal(cookieSwitchController.getSnapshot().pendingCount, 0);
  assert.equal(await offline.mentoringOfflineStore.readSession('A'), null);
  assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 2, 'authentication loss preserves the draft and immutable command in a locked partition');
  assert.equal(offline.isMentoringOfflineAccessPrepared(), false);
  assert.deepEqual(cookieSwitchController.getSnapshot().recoveryVaults, [], 'locked metadata is withheld until identity is reverified');
  cookieSwitchController.dispose();

  for (const status of [401, 403]) {
    await offline.mentoringOfflineStore.clear();
    globalThis.fetch = async () => Response.json(snapshot());
    const expiredController = new Controller();
    await expiredController.updateAuth(true, 'A');
    await expiredController.writeDraft('A', 'private-A', { notes: 'private from A' });
    globalThis.fetch = async () => new Response('', { status });
    await expiredController.refresh();
    assert.equal(expiredController.getSnapshot().snapshot, null);
    assert.equal(await offline.mentoringOfflineStore.readSession('A'), null);
    assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 1, 'invalid authentication bodies lock durable work without deleting it');
    assert.equal(offline.isMentoringOfflineAccessPrepared(), false);
    assert.deepEqual(expiredController.getSnapshot().recoveryVaults, []);
    expiredController.dispose();
  }

  await offline.mentoringOfflineStore.clear();
  globalThis.fetch = async () => Response.json(snapshot());
  const preparedController = new Controller();
  await preparedController.updateAuth(true, 'A');
  await preparedController.writeDraft('A', 'cold-reload-draft', { notes: 'survives without provider connection' });
  preparedController.dispose();
  navigator.onLine = false;
  globalThis.fetch = async () => { throw new Error('offline cold boot must not request provider data'); };
  const offlineController = new Controller();
  await offlineController.updateAuth(false, undefined);
  assert.equal(offlineController.getSnapshot().snapshot.actor.authUserId, 'A');
  assert.equal(offlineController.getSnapshot().connection, 'offline');
  assert.deepEqual(await offlineController.readDraft('A', 'cold-reload-draft'), { notes: 'survives without provider connection' });
  const queuedOffline = await offlineController.submit(command());
  assert.equal(queuedOffline.ok && queuedOffline.acceptance === 'queued', true);
  const privilegeCommand = { type: 'set_staff_active', operationId: crypto.randomUUID(), staffId: 'staff_other', expectedVersion: 1, active: false };
  const privilegeResult = await offlineController.submit(privilegeCommand);
  assert.equal(privilegeResult.ok && privilegeResult.acceptance === 'queued', true);
  assert.equal(offlineController.getSnapshot().pendingCount, 2);
  assert.equal(offlineController.getSnapshot().snapshot.actor.active, true, 'pending staff changes cannot change the current actor authority');
  assert.equal(offlineController.getSnapshot().snapshot.staff.find((member) => member.id === 'staff_other').active, true, 'pending staff revocation waits for central acceptance');

  let releaseReconnect; let reconnectStarted;
  const reconnectGate = new Promise((resolve) => { releaseReconnect = resolve; });
  const firstReconnectGet = new Promise((resolve) => { reconnectStarted = resolve; });
  let reconnectGets = 0; let reconnectPosts = 0;
  const acceptedReconnectCommands = [];
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) {
      if (++reconnectGets === 1) { reconnectStarted(); await reconnectGate; }
      return Response.json(snapshot());
    }
    assert.equal(options.headers['X-Mentoring-Account'], 'A');
    ++reconnectPosts;
    acceptedReconnectCommands.push(JSON.parse(options.body));
    return accepted(acceptedReconnectCommands.at(-1).operationId);
  };
  navigator.onLine = true;
  offlineController.online();
  await firstReconnectGet;
  assert.equal(offlineController.getSnapshot().connection, 'syncing');
  // Clerk finishes reinitializing while the reconnect GET is still pending.
  // Its new epoch must schedule a fresh cycle after the superseded one exits.
  const recoveredAuth = offlineController.updateAuth(true, 'A');
  releaseReconnect();
  await recoveredAuth;
  assert.equal(reconnectPosts, 2);
  assert.equal(acceptedReconnectCommands[0].operationId, queuedOffline.operationId);
  assert.deepEqual(acceptedReconnectCommands[1], privilegeCommand);
  assert.equal(offlineController.getSnapshot().pendingCount, 0);
  assert.equal(offlineController.getSnapshot().connection, 'online');
  await offlineController.refresh();
  assert.equal(reconnectPosts, 2, 'auth recovery drains each immutable offline intent once');

  let releaseBeforeClear; let clearStarted;
  const clearGate = new Promise((resolve) => { releaseBeforeClear = resolve; });
  const firstClearGet = new Promise((resolve) => { clearStarted = resolve; });
  let clearGets = 0;
  globalThis.fetch = async () => {
    if (++clearGets === 1) { clearStarted(); await clearGate; }
    return Response.json(snapshot());
  };
  const staleBeforeClear = offlineController.refresh();
  await firstClearGet;
  await offlineController.updateAuth(false, undefined);
  const authRecoveredBeforeClear = offlineController.updateAuth(true, 'A');
  // Logout's local clear must cancel even a previously requested auth retry.
  offlineController.externalClear();
  await offline.clearMentoringOfflineData();
  releaseBeforeClear();
  await Promise.all([staleBeforeClear, authRecoveredBeforeClear]);
  assert.equal(clearGets, 1);
  assert.equal(offlineController.getSnapshot().snapshot, null);
  assert.equal(await offline.mentoringOfflineStore.readSession('A'), null);
  assert.equal(offline.isMentoringOfflineAccessPrepared(), false);
  await offlineController.updateAuth(true, null);
  assert.equal(offlineController.getSnapshot().snapshot, null);
  assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 0);
  offlineController.dispose();
  navigator.onLine = true;
  console.log(JSON.stringify({ locksEnabled, correctedIntent: 'PASS', lostResponseReplay: 'PASS', accountSwitchBinding: 'PASS', cookieSwitchPostBinding: 'PASS', invalidAuthBodyQuarantine: 'PASS' }));
}

const store = offline.createMentoringOfflineStore(`review-cas-${crypto.randomUUID()}`);
const old = snapshot();
await store.saveSnapshot(old, 'A');
offline.prepareMentoringOfflineAccess();
const revision = await store.cacheRevision('A');
const newer = snapshot(); newer.participants[0].participant.version = 2;
await store.saveSnapshot(newer, 'A', Date.now(), () => true, revision);
await assert.rejects(store.saveSnapshot(old, 'A', Date.now(), () => true, revision), { code: 'superseded' });
assert.equal((await store.readSession('A')).snapshot.participants[0].participant.version, 2);
const sessionWithWrongClock = { ...(await store.readSession('A')), lastSeenAt: Date.now() - 365 * 86_400_000 };
assert.equal(offline.isOfflineLeaseValid(sessionWithWrongClock, sessionWithWrongClock.lastSeenAt), false);
console.log(JSON.stringify({ staleSnapshotCAS: 'PASS', initialWrongClock: 'PASS' }));

await offline.mentoringOfflineStore.clear();
});


test('multi-resource dependency failure blocks only its causal children', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  const posted = [];
  const staff = { type: 'create_staff', operationId: crypto.randomUUID(), fields: { displayName: 'pending mentor', email: 'pending@example.org', phone: null, role: 'mentor', coordinatorId: null } };
  const participant = { type: 'create_participant', operationId: crypto.randomUUID(), fields: { displayName: 'pending participant' } };
  const assignment = { type: 'assign_participant', operationId: crypto.randomUUID(), participantId: participant.operationId, expectedVersion: 1, mentorId: staff.operationId, coordinatorId: null };
  const independent = command();
  const authoritative = snapshot();
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(authoritative);
    const intent = JSON.parse(options.body);
    posted.push(intent);
    assert.equal(options.headers['X-Mentoring-Account'], 'A');
    if (intent.operationId === staff.operationId) return Response.json({ ok: false, error: { code: 'validation', message: 'staff needs correction' } }, { status: 400 });
    if (intent.operationId === participant.operationId) authoritative.participants.push({ ...structuredClone(authoritative.participants[0]), participant: { ...authoritative.participants[0].participant, id: participant.operationId, displayName: participant.fields.displayName } });
    if (intent.operationId === independent.operationId) authoritative.participants[0].participant = { ...authoritative.participants[0].participant, ...independent.fields, version: 2 };
    return accepted(intent.operationId);
  };
  const controller = new Controller();
  await controller.updateAuth(true, 'A');
  navigator.onLine = false;
  controller.offline();
  for (const intent of [staff, participant, assignment, independent]) {
    const result = await controller.submit(intent);
    assert.equal(result.ok && result.acceptance === 'queued', true);
  }
  const session = await offline.mentoringOfflineStore.readSession('A');
  const assignmentIntent = (await offline.mentoringOfflineStore.operations(session.scope)).find((entry) => entry.command.operationId === assignment.operationId);
  assert.deepEqual(new Set(assignmentIntent.dependsOnOperationIds), new Set([staff.operationId, participant.operationId]));
  assert.equal(controller.getSnapshot().snapshot.staff.find((member) => member.id === staff.operationId).authUserId, '', 'a pending staff row never invents a login identity');
  navigator.onLine = true;
  await controller.refresh();
  assert.deepEqual(posted.map((intent) => intent.operationId), [staff.operationId, participant.operationId, independent.operationId]);
  const blocked = controller.getSnapshot().localFailures.find((entry) => entry.command.operationId === assignment.operationId);
  assert.equal(blocked?.failure.error.code, 'conflict');
  assert.deepEqual(blocked.command, assignment, 'the causal child remains available for explicit review');
  controller.dispose();
  await offline.mentoringOfflineStore.clear();
});

test('failed durable storage never reports an offline intent as queued or accepted', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot());
    ++posts;
    return accepted(JSON.parse(options.body).operationId);
  };
  const controller = new Controller();
  await controller.updateAuth(true, 'A');
  navigator.onLine = false;
  controller.offline();
  const originalEnqueue = offline.mentoringOfflineStore.enqueue;
  offline.mentoringOfflineStore.enqueue = async () => { throw new DOMException('quota exhausted', 'QuotaExceededError'); };
  try {
    const result = await controller.submit(command());
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'unavailable');
    assert.equal(posts, 0);
    assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 0);
    assert.match(controller.getSnapshot().error.message, /אין די מקום.*העדכון לא נשמר/);
    assert.doesNotMatch(controller.getSnapshot().error.message, /quota exhausted|QuotaExceededError/);
  } finally {
    offline.mentoringOfflineStore.enqueue = originalEnqueue;
    navigator.onLine = true;
    controller.dispose();
    await offline.mentoringOfflineStore.clear();
  }
});


test('quarantined work needs matching renewed authority and explicit recovery before its payload is readable', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  let account = 'A'; let denied = false; let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (options?.method) { ++posts; return accepted(JSON.parse(options.body).operationId); }
    return denied ? new Response('', { status: 403 }) : Response.json(snapshot(account));
  };
  const controller = new Controller();
  await controller.updateAuth(true, 'A');
  const draft = { displayName: 'private draft name', profileNotes: 'private recovery detail', baseVersion: 1 };
  const intent = { ...command(), fields: { profileNotes: 'immutable private recovery detail' } };
  const preparedDraft = { kind: 'mentoring-form-draft-v1', value: { notes: 'prepared private recovery detail' }, intent: { operationId: intent.operationId, signature: JSON.stringify(intent) } };
  await controller.writeDraft('A', 'participant-profile:p', draft);
  await controller.writeDraft('A', 'contact:p', preparedDraft);
  navigator.onLine = false;
  controller.offline();
  assert.equal((await controller.submit(intent)).acceptance, 'queued');
  denied = true; navigator.onLine = true;
  await controller.refresh();
  assert.equal(controller.getSnapshot().snapshot, null);
  assert.deepEqual(controller.getSnapshot().localFailures, []);
  assert.deepEqual(controller.getSnapshot().recoveryVaults, []);
  assert.equal(await offline.mentoringOfflineStore.readSession('A'), null);
  assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 3);
  await assert.rejects(async () => controller.readDraft('A', 'participant-profile:p'));

  denied = false;
  await controller.refresh();
  assert.equal(posts, 0, 'renewed access does not automatically replay quarantined intent');
  assert.equal(controller.getSnapshot().pendingCount, 0);
  const vault = controller.getSnapshot().recoveryVaults[0];
  assert.ok(vault);
  assert.equal(vault.pendingCount, 1);
  assert.equal(vault.draftCount, 2);
  assert.doesNotMatch(JSON.stringify(vault), /private draft name|private recovery detail|immutable private/);
  assert.equal(await controller.readDraft('A', 'participant-profile:p'), null);

  account = 'B';
  await controller.updateAuth(true, 'B');
  assert.equal(controller.getSnapshot().snapshot.actor.authUserId, 'B');
  assert.deepEqual(controller.getSnapshot().recoveryVaults, [], 'a different account cannot enumerate another account vault');
  assert.equal(await controller.readDraft('B', 'participant-profile:p'), null);
  await assert.rejects(controller.recoverLocalWork('B', vault.id));
  assert.equal(posts, 0);

  account = 'A';
  await controller.updateAuth(true, 'A');
  assert.equal(controller.getSnapshot().recoveryVaults.length, 1);
  await controller.recoverLocalWork('A', vault.id);
  assert.equal(posts, 0, 'explicit recovery restores intent for review without resending it');
  assert.deepEqual(await controller.readDraft('A', 'participant-profile:p'), draft);
  assert.deepEqual(await controller.readDraft('A', 'contact:p'), { ...preparedDraft, intent: null }, 'opening a recovered form cannot replay the quarantined prepared intent');
  const restored = controller.getSnapshot().localFailures.find((entry) => entry.command.operationId === intent.operationId);
  assert.equal(restored?.status, 'blocked');
  assert.deepEqual(restored.command, intent);
  await controller.refresh();
  assert.equal(posts, 0, 'recovered historical intent stays blocked across later refreshes');
  controller.dispose();
  await offline.mentoringOfflineStore.clear();
});

test('an empty command-level permission denial locks pending work without destroying its durable evidence', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot());
    ++posts;
    return new Response('', { status: 403 });
  };
  const controller = new Controller();
  await controller.updateAuth(true, 'A');
  await controller.writeDraft('A', 'participant-profile:p', { profileNotes: 'permission-loss draft' });
  const intent = command();
  const result = await controller.submit(intent);
  assert.equal(result.ok, false);
  assert.equal(posts, 1);
  assert.equal(controller.getSnapshot().snapshot, null);
  assert.equal(controller.getSnapshot().pendingCount, 0);
  assert.equal(await offline.mentoringOfflineStore.readSession('A'), null);
  assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 2);
  assert.equal(offline.isMentoringOfflineAccessPrepared(), false);
  await controller.refresh();
  assert.equal(posts, 1);
  assert.equal(controller.getSnapshot().recoveryVaults[0]?.pendingCount, 1);
  assert.equal(controller.getSnapshot().recoveryVaults[0]?.draftCount, 1);
  controller.dispose();
  await offline.mentoringOfflineStore.clear();
});


test('same-account recovery retains newly unreadable participant work until explicit discard', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  let deny = false; let includeParticipant = true;
  globalThis.fetch = async () => {
    if (deny) return new Response('', { status: 403 });
    const authorized = snapshot();
    if (!includeParticipant) authorized.participants = [];
    return Response.json(authorized);
  };
  const controller = new Controller();
  await controller.updateAuth(true, 'A');
  await controller.writeDraft('A', 'participant-profile:p', { profileNotes: 'no-longer-readable content' });
  navigator.onLine = false;
  controller.offline();
  await controller.submit(command());
  navigator.onLine = true; deny = true;
  await controller.refresh();
  deny = false; includeParticipant = false;
  await controller.refresh();
  const vault = controller.getSnapshot().recoveryVaults[0];
  assert.ok(vault);
  await controller.recoverLocalWork('A', vault.id);
  assert.equal(controller.getSnapshot().snapshot.participants.length, 0);
  assert.deepEqual(controller.getSnapshot().localFailures, []);
  assert.equal(await controller.readDraft('A', 'participant-profile:p'), null);
  assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 2, 'lost scope cannot silently destroy or expose the preserved content');
  assert.equal(controller.getSnapshot().recoveryVaults[0]?.pendingCount, 1);
  await controller.discardLocalRecovery('A', vault.id);
  assert.deepEqual(controller.getSnapshot().recoveryVaults, []);
  assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 0);
  controller.dispose();
  await offline.mentoringOfflineStore.clear();
});


test('each recovery invocation requires a fresh successful authorization response', async () => {
  for (const failureMode of ['network', 'unavailable', 'invalid_request']) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    await offline.mentoringOfflineStore.clear();
    let mode = 'authorized'; let posts = 0;
    globalThis.fetch = async (_url, options) => {
      if (options?.method) { ++posts; return accepted(JSON.parse(options.body).operationId); }
      if (mode === 'denied') return new Response('', { status: 401 });
      if (mode === 'network') throw new TypeError('connection unavailable');
      if (mode === 'unavailable') return Response.json({ ok: false, error: { code: 'unavailable', message: 'temporarily unavailable' } }, { status: 503 });
      if (mode === 'invalid_request') return Response.json({ unexpected: true }, { status: 400 });
      return Response.json(snapshot());
    };
    const controller = new Controller();
    try {
      await controller.updateAuth(true, 'A');
      await controller.writeDraft('A', 'participant-profile:p', { profileNotes: 'fresh authorization is required' });
      navigator.onLine = false;
      controller.offline();
      await controller.submit(command());
      navigator.onLine = true; mode = 'denied';
      await controller.refresh();
      mode = 'authorized';
      await controller.refresh();
      const vault = controller.getSnapshot().recoveryVaults[0];
      assert.ok(vault);
      assert.equal(controller.getSnapshot().pendingCount, 0);
      mode = failureMode;
      await assert.rejects(controller.recoverLocalWork('A', vault.id), { code: 'account_changed' });
      assert.equal(posts, 0, `${failureMode}: a previous successful GET cannot authorize this recovery`);
      assert.equal(await controller.readDraft('A', 'participant-profile:p'), null);
      assert.deepEqual(controller.getSnapshot().localFailures, []);
      assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 2);
      mode = 'authorized';
      await controller.refresh();
      const retained = controller.getSnapshot().recoveryVaults.find((entry) => entry.id === vault.id);
      assert.equal(retained?.pendingCount, 1);
      assert.equal(retained?.draftCount, 1);
    } finally {
      controller.dispose();
      navigator.onLine = true;
      await offline.mentoringOfflineStore.clear();
    }
  }
});

test('a fresh controller for another account archives durable work before opening its own workspace', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  let account = 'A'; let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (options?.method) { ++posts; return accepted(JSON.parse(options.body).operationId); }
    return Response.json(snapshot(account));
  };
  const first = new Controller();
  await first.updateAuth(true, 'A');
  const draft = { profileNotes: 'durable A-only private text' };
  const intent = { ...command(), fields: { profileNotes: 'durable A-only intent' } };
  await first.writeDraft('A', 'participant-profile:p', draft);
  navigator.onLine = false;
  first.offline();
  await first.submit(intent);
  first.dispose();

  navigator.onLine = true; account = 'B';
  const next = new Controller();
  try {
    await next.updateAuth(true, 'B');
    assert.equal(next.getSnapshot().snapshot?.actor.authUserId, 'B');
    assert.equal(next.getSnapshot().pendingCount, 0);
    assert.deepEqual(next.getSnapshot().localFailures, []);
    assert.deepEqual(next.getSnapshot().recoveryVaults, []);
    assert.doesNotMatch(JSON.stringify(next.getSnapshot()), /durable A-only/);
    assert.equal(await next.readDraft('B', 'participant-profile:p'), null);
    assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 2);
    assert.equal(posts, 0);

    account = 'A';
    await next.updateAuth(true, 'A');
    const vault = next.getSnapshot().recoveryVaults[0];
    assert.equal(vault?.pendingCount, 1);
    assert.equal(vault?.draftCount, 1);
    assert.equal(await next.readDraft('A', 'participant-profile:p'), null);
    await next.recoverLocalWork('A', vault.id);
    assert.deepEqual(await next.readDraft('A', 'participant-profile:p'), draft);
    assert.deepEqual(next.getSnapshot().localFailures[0]?.command, intent);
    assert.equal(posts, 0);
  } finally {
    next.dispose();
    await offline.mentoringOfflineStore.clear();
  }
});

test('late same-account form writes cannot reopen a participant removed from the authorized snapshot', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  let includeParticipant = true;
  globalThis.fetch = async () => {
    const authorized = snapshot();
    if (!includeParticipant) authorized.participants = [];
    return Response.json(authorized);
  };
  const controller = new Controller();
  try {
    await controller.updateAuth(true, 'A');
    const oldAccessKey = offline.offlineDraftAccessKey(controller.getSnapshot().snapshot);
    await controller.writeDraft('A', 'participant-profile:p', { profileNotes: 'preserved before scope change' }, oldAccessKey);
    includeParticipant = false;
    await controller.refresh();
    assert.equal(controller.getSnapshot().snapshot.participants.length, 0);
    await assert.rejects(async () => controller.writeDraft('A', 'participant-profile:p', { profileNotes: 'late stale callback' }, oldAccessKey), { code: 'account_changed' });
    await assert.rejects(async () => controller.writeDraft('A', 'participant-profile:p', { profileNotes: 'late callback without a provider token' }), { code: 'account_changed' });
    assert.equal(await controller.readDraft('A', 'participant-profile:p'), null);
    assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 1);
    assert.equal(controller.getSnapshot().recoveryVaults[0]?.draftCount, 1);
    assert.deepEqual(controller.getSnapshot().localFailures, []);
  } finally {
    controller.dispose();
    await offline.mentoringOfflineStore.clear();
  }
});

test('quarantine storage failure leaves an independent lock and requires explicit recovery after renewed authorization', async () => {
  for (const deniedStatus of [401, 403]) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    await offline.mentoringOfflineStore.clear();
    let denied = false; let posts = 0;
    globalThis.fetch = async (_url, options) => {
      if (options?.method) { ++posts; return accepted(JSON.parse(options.body).operationId); }
      return denied ? new Response('', { status: deniedStatus }) : Response.json(snapshot());
    };
    const controller = new Controller();
    const originalQuarantine = offline.mentoringOfflineStore.quarantine;
    try {
      await controller.updateAuth(true, 'A');
      const draft = { profileNotes: 'durable work survives failed quarantine storage' };
      const intent = command();
      await controller.writeDraft('A', 'participant-profile:p', draft);
      navigator.onLine = false;
      controller.offline();
      await controller.submit(intent);
      let quarantineAttempts = 0;
      offline.mentoringOfflineStore.quarantine = async () => {
        ++quarantineAttempts;
        throw new DOMException('quarantine storage unavailable', 'UnknownError');
      };
      denied = true; navigator.onLine = true;
      await controller.refresh();
      assert.equal(quarantineAttempts, 1);
      assert.equal(controller.getSnapshot().snapshot, null);
      assert.equal(offline.isMentoringOfflineAccessPrepared(), false);
      assert.equal(await offline.mentoringOfflineStore.readSession('A'), null, 'the independent lock hides the active IDB row left behind by the failed transaction');
      assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 2);
      assert.equal(posts, 0);

      offline.mentoringOfflineStore.quarantine = originalQuarantine;
      denied = false;
      await controller.refresh();
      assert.equal(controller.getSnapshot().snapshot?.actor.authUserId, 'A');
      assert.equal(controller.getSnapshot().pendingCount, 0);
      assert.deepEqual(controller.getSnapshot().localFailures, []);
      assert.equal(await controller.readDraft('A', 'participant-profile:p'), null);
      const vault = controller.getSnapshot().recoveryVaults[0];
      assert.equal(vault?.pendingCount, 1);
      assert.equal(vault?.draftCount, 1);
      assert.equal(vault?.reason, 'access_locked');
      assert.equal(posts, 0, 'renewed authorization atomically archives locked leftovers before any drain');
      await controller.recoverLocalWork('A', vault.id);
      assert.deepEqual(await controller.readDraft('A', 'participant-profile:p'), draft);
      assert.deepEqual(controller.getSnapshot().localFailures[0]?.command, intent);
      assert.equal(controller.getSnapshot().localFailures[0]?.status, 'blocked');
      assert.equal(posts, 0, 'recovered work waits for an explicit new reviewed command');
    } finally {
      offline.mentoringOfflineStore.quarantine = originalQuarantine;
      controller.dispose();
      navigator.onLine = true;
      await offline.mentoringOfflineStore.clear();
    }
  }
});


test('a coordinator can autosave a newly queued participant child form through the original reconnect snapshot', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  let authoritative = snapshot();
  authoritative.actor.role = 'coordinator';
  authoritative.participants[0].allowedActions = ['view', 'edit', 'approve'];
  const create = { type: 'create_participant', operationId: crypto.randomUUID(), fields: { displayName: 'coordinator offline creation' } };
  let posts = 0; let originalReconnectSnapshots = 0; let reconnecting = false;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) {
      if (reconnecting && !authoritative.participants.some((view) => view.participant.id === create.operationId)) ++originalReconnectSnapshots;
      return Response.json(authoritative);
    }
    const intent = JSON.parse(options.body);
    assert.equal(options.headers['X-Mentoring-Account'], 'A');
    assert.deepEqual(intent, create);
    ++posts;
    const template = authoritative.participants[0];
    authoritative = { ...authoritative, participants: [...authoritative.participants, {
      ...structuredClone(template), participant: { ...template.participant, id: create.operationId, displayName: create.fields.displayName, createdBy: authoritative.actor.id },
      assignment: null, nextAppointment: null, contacts: [], reviews: [], protections: [], manualColor: null, manualColorAt: null, allowedActions: ['view', 'edit', 'approve'],
    }] };
    return Response.json({ ok: true, acceptance: 'accepted', operationId: intent.operationId, replayed: false, participantId: create.operationId });
  };
  const controller = new Controller();
  try {
    await controller.updateAuth(true, 'A');
    navigator.onLine = false;
    controller.offline();
    assert.equal((await controller.submit(create)).acceptance, 'queued');
    const created = controller.getSnapshot().snapshot.participants.find((view) => view.participant.id === create.operationId);
    assert.ok(created);
    assert.equal(created.participant.createdBy, 'staff_A');
    const capturedAccessKey = offline.offlineDraftAccessKey(controller.getSnapshot().snapshot);
    const drafts = new Map([
      [`contact:${create.operationId}`, { notes: 'child contact draft before central acceptance' }],
      [`participant-profile:${create.operationId}`, { displayName: create.fields.displayName, profileNotes: 'child profile draft', baseVersion: 1 }],
      ['participant-profile:p', { profileNotes: 'unrelated existing case draft', baseVersion: 1 }],
    ]);
    for (const [key, value] of drafts) {
      await controller.writeDraft('A', key, value, capturedAccessKey);
      assert.deepEqual(await controller.readDraft('A', key, capturedAccessKey), value);
    }
    await controller.refresh();
    assert.equal(controller.getSnapshot().pendingCount, 1);
    assert.deepEqual(controller.getSnapshot().recoveryVaults, []);
    assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 4);
    navigator.onLine = true; reconnecting = true;
    await controller.refresh();
    assert.equal(originalReconnectSnapshots, 1, 'the first reconnect GET legitimately precedes accepting the queued creation');
    assert.equal(posts, 1);
    assert.equal(controller.getSnapshot().pendingCount, 0);
    assert.deepEqual(controller.getSnapshot().recoveryVaults, [], 'authorized local creations and their drafts remain active during reconnect');
    assert.deepEqual(controller.getSnapshot().localFailures, []);
    for (const [key, value] of drafts) assert.deepEqual(await controller.readDraft('A', key, capturedAccessKey), value);
    assert.equal(controller.getSnapshot().snapshot.participants.filter((view) => view.participant.id === create.operationId).length, 1);
    assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 3);
  } finally {
    controller.dispose();
    navigator.onLine = true;
    await offline.mentoringOfflineStore.clear();
  }
});


test('accepted historical contact corrections on paused and closed cases survive a failed follow-up refresh', async () => {
  for (const lifecycle of ['paused', 'closed']) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    await offline.mentoringOfflineStore.clear();
    const original = snapshot();
    const now = Date.now();
    const occurredAt = new Date(now - 2 * 86_400_000).toISOString();
    const revisedOccurredAt = new Date(now - 86_400_000).toISOString();
    const scheduledAt = new Date(now + 86_400_000).toISOString();
    const view = original.participants[0];
    view.participant.lifecycle = lifecycle;
    view.assignment = { id: 'assignment_p', organizationId: original.actor.organizationId, participantId: 'p', mentorId: 'staff_other', coordinatorId: null, assignedAt: new Date(now - 10 * 86_400_000).toISOString(), version: 1 };
    view.nextAppointment = { id: 'appointment_p', organizationId: original.actor.organizationId, participantId: 'p', mentorId: 'staff_other', scheduledAt, sourceContactId: 'contact_p', requiresReview: false, version: 1 };
    view.contacts = [{ id: 'contact_p', organizationId: original.actor.organizationId, participantId: 'p', actorId: 'staff_other', method: 'phone', outcome: 'completed', occurredAt, receivedAt: occurredAt, notes: 'original historical contact', revision: 1 }];
    const revision = { type: 'revise_contact', operationId: crypto.randomUUID(), participantId: 'p', expectedVersion: 1, contactId: 'contact_p', expectedRevision: 1, expectedAppointmentVersion: 1, method: 'phone', outcome: 'completed', occurredAt: revisedOccurredAt, notes: `corrected ${lifecycle} historical contact`, reason: 'historical timestamp correction' };
    let gets = 0; let posts = 0;
    globalThis.fetch = async (_url, options) => {
      if (!options?.method) {
        if (++gets > 2) throw new TypeError('connection lost after central acceptance');
        return Response.json(original);
      }
      assert.equal(options.headers['X-Mentoring-Account'], 'A');
      assert.deepEqual(JSON.parse(options.body), revision);
      ++posts;
      return accepted(revision.operationId);
    };
    const controller = new Controller();
    try {
      await controller.updateAuth(true, 'A');
      const result = await controller.submit(revision);
      assert.equal(result.ok && result.acceptance === 'accepted', true, `${lifecycle}: the durable central receipt survives failed refetch`);
      assert.equal(posts, 1);
      assert.equal(gets, 3, 'initial authorization and pre-command refresh succeed before the post-acceptance GET fails');
      assert.equal(controller.getSnapshot().pendingCount, 0);
      assert.deepEqual(controller.getSnapshot().localFailures, []);
      assert.equal(controller.getSnapshot().connection, 'offline');
      const cachedSession = await offline.mentoringOfflineStore.readSession('A');
      const cached = cachedSession.snapshot.participants[0];
      assert.equal(cached.participant.lifecycle, lifecycle);
      assert.equal(cached.participant.version, 2);
      assert.equal(cached.contacts[0].notes, revision.notes);
      assert.equal(cached.contacts[0].occurredAt, revisedOccurredAt);
      assert.equal(cached.contacts[0].revision, 2);
      assert.equal(cached.nextAppointment.scheduledAt, scheduledAt, 'historical maintenance never replaces the chosen appointment time');
      assert.equal(cached.nextAppointment.version, 2);
      assert.equal(cached.nextAppointment.requiresReview, true);
      assert.equal(cached.nextAppointment.sourceContactId, 'contact_p');
      assert.deepEqual(controller.getSnapshot().snapshot.participants[0], cached);
      assert.equal((await offline.mentoringOfflineStore.readReceipt(cachedSession.scope, revision)).acceptance, 'accepted');
      const replay = await controller.submit(revision);
      assert.equal(replay.ok && replay.acceptance === 'accepted' && replay.replayed, true);
      assert.equal(posts, 1);
      assert.equal(gets, 3);
      assert.equal((await offline.mentoringOfflineStore.readSession('A')).snapshot.participants[0].nextAppointment.version, 2, 'receipt replay cannot project the accepted change twice');
    } finally {
      controller.dispose();
      await offline.mentoringOfflineStore.clear();
    }
  }
});


test('offline correction, exact-revision review, and invalidation replay in order without replacing their immutable payloads', async () => {
  for (const reviewRejected of [false, true]) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  const authoritative = snapshot();
  authoritative.actor.role = 'coordinator';
  const view = authoritative.participants[0];
  view.allowedActions = ['view', 'edit', 'approve'];
  const now = Date.now();
  const occurredAt = new Date(now - 86_400_000).toISOString();
  const scheduledAt = new Date(now + 86_400_000).toISOString();
  view.assignment = { id: 'chain_assignment', organizationId: authoritative.actor.organizationId, participantId: 'p', mentorId: 'staff_other', coordinatorId: authoritative.actor.id, assignedAt: new Date(now - 10 * 86_400_000).toISOString(), version: 1 };
  view.nextAppointment = { id: 'chain_appointment', organizationId: authoritative.actor.organizationId, participantId: 'p', mentorId: 'staff_other', scheduledAt, sourceContactId: 'chain_contact', requiresReview: false, version: 1 };
  view.contacts = [{ id: 'chain_contact', organizationId: authoritative.actor.organizationId, participantId: 'p', actorId: authoritative.actor.id, method: 'phone', outcome: 'completed', occurredAt, receivedAt: occurredAt, notes: 'accepted original contact', revision: 1, invalidatedAt: null }];
  const revise = { type: 'revise_contact', operationId: crypto.randomUUID(), participantId: 'p', expectedVersion: 1, contactId: 'chain_contact', expectedRevision: 1, expectedAppointmentVersion: 1, method: 'phone', outcome: 'completed', occurredAt, notes: 'corrected without changing appointment', reason: 'notes correction' };
  const review = { type: 'review_contact', operationId: crypto.randomUUID(), participantId: 'p', contactId: 'chain_contact', revision: 2, decision: 'approved' };
  const invalidate = { type: 'invalidate_contact', operationId: crypto.randomUUID(), participantId: 'p', expectedVersion: 2, contactId: 'chain_contact', expectedRevision: 2, expectedAppointmentVersion: 1, reason: 'historical invalidation after revision review' };
  const expectedIntents = structuredClone([revise, review, invalidate]);
  const posted = [];
  let gets = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) { ++gets; return Response.json(authoritative); }
    const intent = JSON.parse(options.body);
    assert.equal(options.headers['X-Mentoring-Account'], 'A');
    assert.deepEqual(intent, expectedIntents[posted.length]);
    posted.push(intent);
    if (intent.type === 'revise_contact') {
      assert.equal(view.contacts[0].revision, 1);
      view.contacts[0] = { ...view.contacts[0], notes: intent.notes, revision: 2 };
      view.participant = { ...view.participant, version: 2 };
    } else if (intent.type === 'review_contact') {
      if (reviewRejected) return Response.json({ ok: false, error: { code: 'validation', message: 'review decision requires correction' } }, { status: 400 });
      assert.equal(view.contacts[0].revision, intent.revision, 'the central review applies to the corrected revision');
      view.reviews = [{ contactId: intent.contactId, revision: intent.revision, decision: intent.decision, reviewedByStaffId: authoritative.actor.id, reviewedAt: new Date().toISOString() }];
      view.reviewEvents = [{ ...view.reviews[0], id: intent.operationId, operationId: intent.operationId, participantId: 'p' }];
    } else {
      assert.equal(view.contacts[0].revision, 2);
      view.contacts[0] = { ...view.contacts[0], revision: 3, invalidatedAt: new Date().toISOString() };
      view.participant = { ...view.participant, version: 3 };
      view.nextAppointment = { ...view.nextAppointment, version: 2, requiresReview: true };
      view.contactWarnings = ['appointment_requires_review'];
    }
    return accepted(intent.operationId);
  };
  const controller = new Controller();
  try {
    await controller.updateAuth(true, 'A');
    navigator.onLine = false;
    controller.offline();
    for (const intent of [revise, review, invalidate]) {
      const queued = await controller.submit(intent);
      assert.equal(queued.ok && queued.acceptance === 'queued', true);
    }
    assert.equal(gets, 1, 'each authorized action works offline without forcing a reconnect');
    assert.equal(posted.length, 0);
    const session = await offline.mentoringOfflineStore.readSession('A');
    const saved = await offline.mentoringOfflineStore.operations(session.scope);
    assert.deepEqual(saved.map((operation) => operation.command), expectedIntents);
    assert.ok(saved[1].dependsOnOperationIds.includes(revise.operationId), 'the revision-specific review depends on its queued correction');
    assert.ok(saved[2].dependsOnOperationIds.includes(revise.operationId), 'the invalidation remains causally tied to the actual revision producer');
    assert.equal(saved[2].dependsOnOperationIds.includes(review.operationId), false, 'a review reads revision 2 and does not produce or increment it');
    const projected = controller.getSnapshot().snapshot.participants[0];
    assert.equal(projected.participant.version, 3);
    assert.equal(projected.contacts[0].revision, 3);
    assert.ok(projected.contacts[0].invalidatedAt);
    assert.equal(projected.contacts[0].notes, revise.notes);
    assert.equal(projected.reviews.filter((entry) => entry.contactId === 'chain_contact' && entry.revision === 2 && entry.decision === 'approved').length, 1, 'review evidence stays attached to revision 2 after invalidation creates revision 3');
    assert.equal(projected.nextAppointment.scheduledAt, scheduledAt);
    assert.equal(projected.nextAppointment.version, 2);
    assert.equal(projected.nextAppointment.requiresReview, true);
    assert.equal(controller.getSnapshot().pendingCount, 3);

    // Caller objects can change after storage without changing the three saved intents.
    revise.notes = 'caller mutation after enqueue';
    review.revision = 99;
    invalidate.reason = 'caller mutation after enqueue';
    navigator.onLine = true;
    await controller.refresh();
    assert.deepEqual(posted, expectedIntents);
    assert.equal(gets, 3);
    assert.equal(controller.getSnapshot().pendingCount, reviewRejected ? 1 : 0);
    const failures = controller.getSnapshot().localFailures;
    if (reviewRejected) {
      assert.equal(failures.length, 1);
      assert.deepEqual(failures[0].command, expectedIntents[1]);
      assert.equal(failures[0].failure.error.code, 'validation');
    } else assert.deepEqual(failures, []);
    assert.deepEqual(controller.getSnapshot().recoveryVaults, []);
    const acceptedView = controller.getSnapshot().snapshot.participants[0];
    assert.equal(acceptedView.participant.version, 3);
    assert.equal(acceptedView.contacts.length, 1);
    assert.equal(acceptedView.contacts[0].revision, 3);
    assert.ok(acceptedView.contacts[0].invalidatedAt);
    assert.equal(acceptedView.contacts[0].notes, expectedIntents[0].notes);
    assert.equal(acceptedView.reviews.length, reviewRejected ? 0 : 1);
    assert.equal(acceptedView.reviewEvents?.length ?? 0, reviewRejected ? 0 : 1);
    if (!reviewRejected) {
      assert.equal(acceptedView.reviews[0].revision, 2);
      assert.equal(acceptedView.reviewEvents[0].operationId, expectedIntents[1].operationId);
    }
    assert.equal(acceptedView.nextAppointment.scheduledAt, scheduledAt);
    assert.equal(acceptedView.nextAppointment.version, 2);
    assert.equal(acceptedView.nextAppointment.requiresReview, true);
    const remaining = await offline.mentoringOfflineStore.operations(session.scope);
    if (reviewRejected) {
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].status, 'blocked');
      assert.deepEqual(remaining[0].command, expectedIntents[1]);
      assert.equal(await offline.mentoringOfflineStore.readReceipt(session.scope, expectedIntents[1]), null);
      const rejectedReplay = await controller.submit(expectedIntents[1]);
      assert.equal(rejectedReplay.ok, false);
      assert.equal(rejectedReplay.error.code, 'validation');
      assert.equal(posted.length, 3, 'a rejected review stays available for review without blocking or resending its independent revision mutation');
    } else assert.deepEqual(remaining, []);
    for (const intent of expectedIntents.filter((entry) => !reviewRejected || entry.type !== 'review_contact')) assert.equal((await offline.mentoringOfflineStore.readReceipt(session.scope, intent)).acceptance, 'accepted');
  } finally {
    controller.dispose();
    navigator.onLine = true;
    await offline.mentoringOfflineStore.clear();
  }
  }
});


test('draft hydration scope stays stable for authorized gains and changes only when authority is reduced or replaced', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  let authoritative = snapshot();
  authoritative.actor.role = 'coordinator';
  authoritative.participants[0].allowedActions = ['view', 'edit', 'approve'];
  const create = { type: 'create_participant', operationId: crypto.randomUUID(), fields: { displayName: 'local scope gain' } };
  let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(authoritative);
    assert.deepEqual(JSON.parse(options.body), create);
    ++posts;
    const original = authoritative.participants[0];
    authoritative.participants.push({ ...structuredClone(original), participant: { ...original.participant, id: create.operationId, displayName: create.fields.displayName, createdBy: authoritative.actor.id }, allowedActions: ['view', 'edit', 'approve'] });
    return Response.json({ ok: true, acceptance: 'accepted', operationId: create.operationId, replayed: false, participantId: create.operationId });
  };
  const controller = new Controller();
  try {
    await controller.updateAuth(true, 'A');
    const initialScope = controller.getSnapshot().draftScopeKey;
    assert.ok(initialScope);
    const initialAccessKey = offline.offlineDraftAccessKey(controller.getSnapshot().snapshot);
    await controller.refresh();
    assert.equal(controller.getSnapshot().draftScopeKey, initialScope, 'a fresh authorized snapshot does not restart draft hydration');
    navigator.onLine = false;
    controller.offline();
    assert.equal((await controller.submit(create)).acceptance, 'queued');
    assert.equal(controller.getSnapshot().draftScopeKey, initialScope, 'adding an authorized local creation keeps mounted drafts hydrated');
    const createdAccessKey = offline.offlineDraftAccessKey(controller.getSnapshot().snapshot);
    assert.notEqual(createdAccessKey, initialAccessKey, 'storage callbacks still receive the exact updated authority binding');
    navigator.onLine = true;
    await controller.refresh();
    assert.equal(posts, 1);
    assert.equal(controller.getSnapshot().draftScopeKey, initialScope, 'accepting the same deterministic participant does not reopen existing forms');

    const external = structuredClone(authoritative.participants[0]);
    external.participant.id = 'newly-authorized-existing-participant';
    external.allowedActions = ['view'];
    authoritative.participants.push(external);
    await controller.refresh();
    assert.equal(controller.getSnapshot().draftScopeKey, initialScope, 'newly authorized records are gains rather than draft-reset events');
    const accessBeforeReduction = offline.offlineDraftAccessKey(controller.getSnapshot().snapshot);
    authoritative.participants[0].allowedActions = ['view', 'edit'];
    await controller.refresh();
    const reducedScope = controller.getSnapshot().draftScopeKey;
    assert.notEqual(reducedScope, initialScope, 'losing an allowed action cancels draft reads started under broader authority');
    await assert.rejects(async () => controller.writeDraft('A', 'participant-profile:p', { profileNotes: 'stale broader callback' }, accessBeforeReduction), { code: 'account_changed' });
    await controller.refresh();
    assert.equal(controller.getSnapshot().draftScopeKey, reducedScope);

    authoritative.participants = authoritative.participants.filter((view) => view.participant.id !== 'p');
    await controller.refresh();
    const removedScope = controller.getSnapshot().draftScopeKey;
    assert.notEqual(removedScope, reducedScope, 'removing a participant cancels draft reads for the former scope');
    authoritative.actor.role = 'ceo';
    await controller.refresh();
    const changedRoleScope = controller.getSnapshot().draftScopeKey;
    assert.notEqual(changedRoleScope, removedScope);

    authoritative = snapshot('B');
    await controller.updateAuth(true, 'B');
    const changedAccountScope = controller.getSnapshot().draftScopeKey;
    assert.notEqual(changedAccountScope, changedRoleScope);
    assert.equal(controller.getSnapshot().snapshot.actor.authUserId, 'B');
    controller.externalClear();
    assert.notEqual(controller.getSnapshot().draftScopeKey, changedAccountScope);
    assert.equal(controller.getSnapshot().snapshot, null);
  } finally {
    controller.dispose();
    navigator.onLine = true;
    await offline.mentoringOfflineStore.clear();
  }
});


test('malformed or unknown command failures remain pending and retry the same immutable operation', async () => {
  const failures = [
    { ok: false, error: { code: 'proxy_failure', message: 'database secret' } },
    { ok: false, error: { message: 'missing code' } },
    { ok: false, error: { code: 'validation' } },
    { ok: false, error: { code: 'validation', message: 42 } },
    { ok: false, error: { code: 'validation', message: 'bad field', field: { path: 'phone' } } },
    { ok: false, error: { code: 'conflict', message: 'bad id', conflictId: 10 } },
  ];
  for (const badFailure of failures) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    await offline.mentoringOfflineStore.clear();
    const intended = command(); const posts = [];
    globalThis.fetch = async (_url, options) => {
      if (!options?.method) return Response.json(snapshot());
      const sent = JSON.parse(options.body); posts.push(sent);
      return posts.length === 1 ? Response.json(badFailure, { status: 400 }) : accepted(sent.operationId);
    };
    const controller = new Controller();
    try {
      await controller.updateAuth(true, 'A');
      const first = await controller.submit(intended);
      assert.equal(first.ok && first.acceptance, 'queued');
      const session = await offline.mentoringOfflineStore.readSession('A');
      const operations = await offline.mentoringOfflineStore.operations(session.scope);
      assert.equal(operations.length, 1);
      assert.equal(operations[0].status, 'pending');
      assert.deepEqual(operations[0].command, intended);
      assert.deepEqual(controller.getSnapshot().localFailures, []);
      assert.doesNotMatch(JSON.stringify(controller.getSnapshot().error), /database secret|missing code|bad field|bad id/);
      await controller.refresh();
      assert.deepEqual(posts, [intended, intended]);
      assert.equal((await offline.mentoringOfflineStore.operations(session.scope)).length, 0);
      assert.equal((await offline.mentoringOfflineStore.readReceipt(session.scope, intended)).acceptance, 'accepted');
    } finally { controller.dispose(); await offline.mentoringOfflineStore.clear(); }
  }
});

test('known server failures are field-aware and never expose technical server messages', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  await offline.mentoringOfflineStore.clear();
  const intended = command();
  globalThis.fetch = async (_url, options) => !options?.method ? Response.json(snapshot()) : Response.json({ ok: false, error: { code: 'validation', field: 'fields.phone', message: 'שגיאה SQL: SELECT secret FROM private_table' } }, { status: 400 });
  const controller = new Controller();
  try {
    await controller.updateAuth(true, 'A');
    const result = await controller.submit(intended);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'validation');
    assert.equal(result.error.field, 'fields.phone');
    assert.match(result.error.message, /טלפון/);
    assert.doesNotMatch(result.error.message, /SQL|SELECT|secret|private_table/);
    const failure = controller.getSnapshot().localFailures[0].failure;
    assert.deepEqual(failure, result);
  } finally { controller.dispose(); await offline.mentoringOfflineStore.clear(); }
});
