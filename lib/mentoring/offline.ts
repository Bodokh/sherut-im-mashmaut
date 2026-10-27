import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ApiFailure, CommandResult, CommandSuccess, MentoringCommand, WorkspaceSnapshot } from "./contracts";
import { canPerformParticipantAction } from "./domain/index";
import { applyOptimisticCommand } from "./offline-projections";
export { applyOptimisticCommand } from "./offline-projections";

export const MENTORING_OFFLINE_DATABASE = "sherut-mentoring-private-v1";
export const MENTORING_OFFLINE_CHANNEL = "sherut-mentoring-private";
const ACCESS_GATE = "sherut-mentoring-offline-access";

/** Contains no identity or participant data; it independently closes residual
 * IndexedDB access when logout cannot clear a browser's private database. */
export function lockMentoringOfflineData(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ACCESS_GATE, "locked"); } catch { /* Another gate may still be available. */ }
  try { window.sessionStorage.setItem(ACCESS_GATE, "locked"); } catch { /* Another gate may still be available. */ }
  try { document.cookie = `${ACCESS_GATE}=locked; Path=/; Max-Age=31536000; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* Persistent browser storage locks remain independent of cookies. */ }
}

export function prepareMentoringOfflineAccess(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ACCESS_GATE, "prepared"); } catch { /* Recovery remains locked if no positive gate persists. */ }
  try { window.sessionStorage.setItem(ACCESS_GATE, "prepared"); } catch { /* Recovery remains locked if no positive gate persists. */ }
  try { document.cookie = `${ACCESS_GATE}=prepared; Path=/; Max-Age=86400; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* Recovery still needs a positive storage gate. */ }
}

export function isMentoringOfflineAccessPrepared(): boolean {
  if (typeof window === "undefined") return false;
  const states: (string | null)[] = [];
  try { states.push(window.localStorage.getItem(ACCESS_GATE)); } catch { /* Missing is not a grant. */ }
  try { states.push(window.sessionStorage.getItem(ACCESS_GATE)); } catch { /* Missing is not a grant. */ }
  try { states.push(document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ACCESS_GATE}=`))?.slice(ACCESS_GATE.length + 1) ?? null); } catch { /* Missing is not a grant. */ }
  return !states.includes("locked") && states.includes("prepared");
}

export interface OfflineScope {
  readonly accountId: string;
  readonly organizationId: string;
  readonly staffId: string;
  readonly key: string;
}

export interface OfflineSession {
  readonly scope: OfflineScope;
  readonly snapshot: WorkspaceSnapshot;
  readonly lastSeenAt: number;
  readonly sequence: number;
  readonly cacheRevision: number;
  readonly cacheIdentity?: string;
}

export interface OfflineOperation {
  readonly key: string;
  readonly scopeKey: string;
  readonly command: MentoringCommand;
  readonly signature: string;
  readonly queuedAt: string;
  readonly sequence: number;
  readonly status: "pending" | "blocked" | "acknowledged";
  readonly dependsOnOperationId?: string;
  readonly dependsOnOperationIds?: readonly string[];
  readonly resourceVersions?: readonly OfflineResourceVersion[];
  readonly acknowledgedAt?: string;
  readonly failure?: ApiFailure;
}
interface OfflineResourceVersion { readonly key: string; readonly before: number | null; readonly after: number }

interface DraftRecord {
  readonly key: string;
  readonly scopeKey: string;
  readonly value: unknown;
  readonly savedAt: string;
  readonly draftKey?: string;
  readonly authority?: DraftAuthority;
  readonly recoveredAt?: string;
}

interface DraftAuthority { readonly participantIds: readonly string[]; readonly role: string; readonly newParticipant?: boolean }
interface RecoveryVault { readonly id: string; readonly scope: OfflineScope; readonly lockedAt: string; readonly reason: string }
export interface OfflineRecoveryMetadata { readonly id: string; readonly lockedAt: string; readonly reason: string; readonly pendingCount: number; readonly draftCount: number; readonly historyCount: number }
export interface OfflineRecoveredDraft { readonly key: string; readonly savedAt: string; readonly recoveredAt: string; readonly value: unknown }

interface OfflineDatabase extends DBSchema {
  session: { key: string; value: OfflineSession };
  operations: { key: string; value: OfflineOperation; indexes: { scope: string } };
  drafts: { key: string; value: DraftRecord; indexes: { scope: string } };
  receipts: { key: string; value: { key: string; signature: string; result: CommandSuccess } };
  vaults: { key: string; value: RecoveryVault };
}

export class OfflineStorageError extends Error {
  readonly code: "expired" | "account_changed" | "storage_unavailable" | "operation_reused" | "invalid_command" | "superseded";
  constructor(code: OfflineStorageError["code"], message: string) {
    super(message);
    this.name = "OfflineStorageError";
    this.code = code;
  }
}

export function scopeFor(snapshot: WorkspaceSnapshot): OfflineScope {
  const { authUserId, organizationId, id } = snapshot.actor;
  return { accountId: authUserId, organizationId, staffId: id, key: JSON.stringify([authUserId, organizationId, id]) };
}

export function isOfflineLeaseValid(session: OfflineSession, now = Date.now()): boolean {
  const { snapshot } = session;
  const expiry = Date.parse(snapshot.offlineValidUntil);
  const issued = Date.parse(snapshot.serverTime);
  return snapshot.actor.active === true
    && snapshot.actor.authUserId === session.scope.accountId
    && snapshot.actor.organizationId === session.scope.organizationId
    && snapshot.actor.id === session.scope.staffId
    && Number.isFinite(expiry) && Number.isFinite(issued)
    && expiry > issued && expiry - issued <= 24 * 60 * 60 * 1000 + 60_000
    && now >= issued - 60_000 && now < expiry && now >= session.lastSeenAt - 60_000;
}

function assertSession(session: OfflineSession | undefined, scope: OfflineScope, now: number): asserts session is OfflineSession {
  if (!session || session.scope.key !== scope.key) throw new OfflineStorageError("account_changed", "החשבון השתנה. יש לטעון מחדש את סביבת הליווי.");
  if (typeof window !== "undefined" && !isMentoringOfflineAccessPrepared()) throw new OfflineStorageError("account_changed", "הגישה המקומית נעולה. יש לאמת מחדש את חשבון הצוות.");
  if (!isOfflineLeaseValid(session, now)) throw new OfflineStorageError("expired", "תוקף הגישה ללא חיבור הסתיים. יש להתחבר כדי לאמת מחדש את ההרשאות.");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function resourceKey(scope: OfflineScope, key: string): string { return JSON.stringify([scope.key, key]); }
function cacheToken(session: OfflineSession | undefined): string | null {
  return session ? JSON.stringify([session.cacheIdentity ?? `legacy:${session.scope.key}`, session.cacheRevision ?? 0]) : null;
}
function participantCommand(command: MentoringCommand): boolean { return "participantId" in command; }
export function offlineDraftAccessKey(snapshot: WorkspaceSnapshot | null): string {
  return snapshot ? JSON.stringify([snapshot.actor.authUserId, snapshot.actor.organizationId, snapshot.actor.id, snapshot.actor.role,
    snapshot.participants.map((view) => [view.participant.id, [...(view.allowedActions ?? [])].sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]) : "locked";
}
export function isOfflineDraftAccessCurrent(snapshot: WorkspaceSnapshot | null, expected: string): boolean {
  if (!snapshot) return false;
  try {
    const [accountId, organizationId, staffId, role, participants] = JSON.parse(expected) as [string, string, string, string, [string, string[]][]];
    if (accountId !== snapshot.actor.authUserId || organizationId !== snapshot.actor.organizationId || staffId !== snapshot.actor.id || role !== snapshot.actor.role || !Array.isArray(participants)) return false;
    return participants.every(([id, actions]) => {
      const view = snapshot.participants.find((item) => item.participant.id === id);
      return view && actions.every((action) => view.allowedActions?.includes(action as "view" | "edit" | "approve" | "delete"));
    });
  } catch { return false; }
}

function commandAllowed(snapshot: WorkspaceSnapshot, command: MentoringCommand, localCreates: ReadonlySet<string> = new Set()): boolean {
  const actor = snapshot.actor;
  if (participantCommand(command) && "participantId" in command) {
    const view = snapshot.participants.find((item) => item.participant.id === command.participantId);
    if (!view) return localCreates.has(command.participantId) && actor.role !== "mentor";
    if (["set_access_grant", "set_ceo_protection", "set_participant_lifecycle", "delete_participant", "restore_participant"].includes(command.type)) return actor.role === "ceo";
    if (command.type === "invalidate_contact" && actor.role === "mentor") return false;
    const action = command.type === "review_contact" ? "approve" : "edit";
    return view.allowedActions ? view.allowedActions.includes(action) : canPerformParticipantAction(actor, view.participant, view.acceptedAssignment ?? view.assignment, action, view.accessGrants ?? []);
  }
  switch (command.type) {
    case "create_participant": return actor.role !== "mentor";
    case "create_staff": return actor.role === "ceo" || (actor.role === "coordinator" && command.fields.role === "mentor" && command.fields.coordinatorId === actor.id);
    case "evaluate_reminders": return actor.role !== "mentor";
    case "save_monthly_review": return actor.role === "ceo" || (actor.role === "coordinator" && command.scopeStaffId === actor.id);
    case "resolve_conflict": return actor.role === "ceo" && snapshot.conflicts.some((item) => item.id === command.conflictId);
    case "set_sms_muted": return actor.role === "ceo";
    default: return actor.role === "ceo";
  }
}

function snapshotWithLocalCreates(snapshot: WorkspaceSnapshot, operations: readonly OfflineOperation[]): WorkspaceSnapshot {
  // This overlay is used only to authorize the author's own new-record drafts.
  // A rejected creation remains a local document, never a readable central
  // participant. Its blocked intent is still excluded from projectWorkspace.
  return operations.filter((operation) => operation.command.type === "create_participant" && commandAllowed(snapshot, operation.command))
    .reduce((current, operation) => applyOptimisticCommand(current, { ...operation, status: "pending" }), snapshot);
}

function draftAuthority(snapshot: WorkspaceSnapshot, key: string, value?: unknown): DraftAuthority {
  const keyParticipantId = /^(?:contact|participant-profile|assignment):([^:]+)/.exec(key)?.[1]
    ?? /^(?:authority|contact-action):[^:]+:([^:]+)/.exec(key)?.[1];
  const envelope = value && typeof value === "object" && "value" in value ? value.value : value;
  const payload = envelope && typeof envelope === "object" && "payload" in envelope ? envelope.payload : null;
  const payloadParticipantId = payload && typeof payload === "object" && "participantId" in payload && typeof payload.participantId === "string" ? payload.participantId : null;
  const participantId = keyParticipantId && keyParticipantId !== "new" ? keyParticipantId : payloadParticipantId;
  return { participantIds: participantId ? [participantId] : snapshot.participants.map((view) => view.participant.id), role: snapshot.actor.role,
    ...(key === "participant-profile:new" ? { participantIds: [], newParticipant: true } : {}) };
}
function draftAllowed(snapshot: WorkspaceSnapshot, draft: DraftRecord): boolean {
  const authority = draft.authority;
  if (!authority || authority.role !== snapshot.actor.role || (authority.newParticipant && snapshot.actor.role === "mentor")) return false;
  return authority.participantIds.every((id) => {
    const view = snapshot.participants.find((item) => item.participant.id === id);
    return Boolean(view && (view.allowedActions ? view.allowedActions.includes("view") : canPerformParticipantAction(snapshot.actor, view.participant, view.acceptedAssignment ?? view.assignment, "view", view.accessGrants ?? [])));
  });
}

function versionResources(command: MentoringCommand, snapshot?: WorkspaceSnapshot, queued: readonly OfflineOperation[] = []): readonly OfflineResourceVersion[] {
  const resources: OfflineResourceVersion[] = [];
  if ("participantId" in command && "expectedVersion" in command) resources.push({ key: `participant:${command.participantId}`, before: command.expectedVersion, after: command.expectedVersion + 1 });
  if (command.type === "create_participant") resources.push({ key: `participant:${command.operationId}`, before: null, after: 1 });
  if (command.type === "create_staff") resources.push({ key: `staff:${command.operationId}`, before: null, after: 1 });
  if ((command.type === "set_staff_active" || command.type === "update_staff") && "expectedVersion" in command) resources.push({ key: `staff:${command.staffId}`, before: command.expectedVersion, after: command.expectedVersion + 1 });
  if (command.type === "set_sms_muted" && snapshot) {
    const base = Math.max(snapshot.actor.version, snapshot.staff.find((staff) => staff.id === snapshot.actor.id)?.version ?? 0);
    const before = queued.filter((operation) => operation.status === "pending").sort((a, b) => a.sequence - b.sequence).reduce((version, operation) => {
      const previous = operation.command;
      if (previous.type === "set_sms_muted") return version + 1;
      if ((previous.type === "set_staff_active" || previous.type === "update_staff") && previous.staffId === snapshot.actor.id && previous.expectedVersion === version) return version + 1;
      return version;
    }, base);
    resources.push({ key: `staff:${snapshot.actor.id}`, before, after: before + 1 });
  }
  if (command.type === "update_organization_settings") resources.push({ key: "settings", before: command.expectedVersion, after: command.expectedVersion + 1 });
  if (command.type === "save_monthly_review") resources.push({ key: `monthly:${command.month}:${command.scopeStaffId}`, before: command.expectedVersion, after: (command.expectedVersion ?? 0) + 1 });
  if (command.type === "record_contact") resources.push({ key: `contact:${command.operationId}`, before: null, after: 1 });
  if (command.type === "revise_contact" || command.type === "invalidate_contact") resources.push({ key: `contact:${command.contactId}`, before: command.expectedRevision, after: command.expectedRevision + 1 });
  if (command.type === "review_contact") resources.push({ key: `contact:${command.contactId}`, before: command.revision, after: command.revision });
  if (command.type === "set_access_grant") resources.push({ key: `grant:${command.participantId}:${command.staffId}`, before: command.expectedGrantVersion, after: (command.expectedGrantVersion ?? 0) + 1 });
  if (command.type === "set_ceo_protection") resources.push({ key: `protection:${command.participantId}:${command.resourceId}`, before: command.expectedProtectionVersion, after: (command.expectedProtectionVersion ?? 0) + 1 });
  return resources;
}

/**
 * Only server-authorized snapshots enter this store. A local lease never grants
 * new access. Identity changes quarantine pending work in a locked partition.
 * IndexedDB transactions bind every draft/queue write to the active account.
 */
export function createMentoringOfflineStore(databaseName = MENTORING_OFFLINE_DATABASE) {
  let database: Promise<IDBPDatabase<OfflineDatabase>> | undefined;
  function db() {
    if (typeof indexedDB === "undefined") throw new OfflineStorageError("storage_unavailable", "הדפדפן אינו מאפשר שמירה מקומית. יש לאפשר אחסון כדי לשמור טיוטות.");
    database ??= openDB<OfflineDatabase>(databaseName, 3, {
      upgrade(connection, oldVersion) {
        if (oldVersion < 1) {
          connection.createObjectStore("session");
          connection.createObjectStore("operations", { keyPath: "key" }).createIndex("scope", "scopeKey");
          connection.createObjectStore("drafts", { keyPath: "key" }).createIndex("scope", "scopeKey");
        }
        if (oldVersion < 2) connection.createObjectStore("receipts", { keyPath: "key" });
        if (oldVersion < 3) connection.createObjectStore("vaults");
      },
      blocking() { void database?.then((connection) => connection.close()); database = undefined; },
      terminated() { database = undefined; },
    });
    return database;
  }

  async function clear() {
    const connection = await db();
    const transaction = connection.transaction(["session", "operations", "drafts", "receipts", "vaults"], "readwrite");
    await Promise.all([transaction.objectStore("session").clear(), transaction.objectStore("operations").clear(), transaction.objectStore("drafts").clear(), transaction.objectStore("receipts").clear(), transaction.objectStore("vaults").clear()]);
    await transaction.done;
  }

  async function quarantine(reason: string, expectedScope?: OfflineScope): Promise<void> {
    const connection = await db();
    const transaction = connection.transaction(["session", "operations", "drafts", "receipts", "vaults"], "readwrite");
    const session = await transaction.objectStore("session").get("active");
    if (session && (!expectedScope || session.scope.key === expectedScope.key)) await quarantineInTransaction(transaction, session, reason);
    await transaction.done;
  }

  async function quarantineInTransaction(transaction: import("idb").IDBPTransaction<OfflineDatabase, ["session", "operations", "drafts", "receipts", "vaults"], "readwrite">, session: OfflineSession, reason: string) {
    const id = `locked:${crypto.randomUUID()}`;
    const operationsStore = transaction.objectStore("operations");
    const draftsStore = transaction.objectStore("drafts");
    const receiptsStore = transaction.objectStore("receipts");
    for (const operation of await operationsStore.index("scope").getAll(session.scope.key)) {
      await operationsStore.delete(operation.key);
      await operationsStore.put({ ...operation, key: JSON.stringify([id, operation.command.operationId]), scopeKey: id });
    }
    for (const draft of await draftsStore.index("scope").getAll(session.scope.key)) {
      const draftKey = draft.draftKey ?? (JSON.parse(draft.key) as string[])[1];
      await draftsStore.delete(draft.key);
      await draftsStore.put({ ...draft, key: JSON.stringify([id, draftKey]), scopeKey: id, draftKey,
        authority: draft.authority ?? draftAuthority(session.snapshot, draftKey) });
    }
    for (const receipt of await receiptsStore.getAll()) {
      const [scopeKey, operationId] = JSON.parse(receipt.key) as string[];
      if (scopeKey !== session.scope.key) continue;
      await receiptsStore.delete(receipt.key);
      await receiptsStore.put({ ...receipt, key: JSON.stringify([id, operationId]) });
    }
    await transaction.objectStore("vaults").put({ id, scope: session.scope, lockedAt: new Date().toISOString(), reason }, id);
    await transaction.objectStore("session").delete("active");
  }

  async function saveSnapshot(snapshot: WorkspaceSnapshot, accountId: string, now = Date.now(), isCurrent: () => boolean = () => true, expectedCacheRevision?: string | null): Promise<OfflineSession> {
    const accessWasLocked = typeof window !== "undefined" && !isMentoringOfflineAccessPrepared();
    if (snapshot.actor.authUserId !== accountId || !snapshot.actor.active) throw new OfflineStorageError("account_changed", "זהות החשבון אינה תואמת לסביבת הליווי.");
    const scope = scopeFor(snapshot);
    const candidate: OfflineSession = { scope, snapshot: structuredClone(snapshot), lastSeenAt: now, sequence: 0, cacheRevision: 1, cacheIdentity: crypto.randomUUID() };
    if (!isOfflineLeaseValid(candidate, now)) throw new OfflineStorageError("expired", "לא התקבל תוקף תקין לגישה ללא חיבור. יש לבדוק את שעון המכשיר ולהתחבר מחדש.");
    const connection = await db();
    const transaction = connection.transaction(["session", "operations", "drafts", "receipts", "vaults"], "readwrite");
    const store = transaction.objectStore("session");
    const previous = await store.get("active");
    if (!isCurrent()) { transaction.abort(); await transaction.done.catch(() => undefined); throw new OfflineStorageError("account_changed", "החשבון השתנה בזמן טעינת המידע."); }
    if (expectedCacheRevision !== undefined && cacheToken(previous) !== expectedCacheRevision) {
      transaction.abort(); await transaction.done.catch(() => undefined);
      throw new OfflineStorageError("superseded", "המידע במכשיר עודכן בזמן הטעינה. נדרשת טעינה חדשה מהמערכת.");
    }
    if (previous) {
      const queued = await transaction.objectStore("operations").index("scope").getAll(previous.scope.key);
      const drafts = await transaction.objectStore("drafts").index("scope").getAll(previous.scope.key);
      const localCreates = new Set(queued.filter((operation) => operation.command.type === "create_participant" && commandAllowed(snapshot, operation.command)).map((operation) => operation.command.operationId));
      const draftSnapshot = snapshotWithLocalCreates(snapshot, queued);
      if (accessWasLocked || previous.scope.key !== scope.key || queued.some((operation) => !commandAllowed(snapshot, operation.command, localCreates)) || drafts.some((draft) => !draftAllowed(draftSnapshot, { ...draft, authority: draft.authority ?? draftAuthority(previous.snapshot, draft.draftKey ?? (JSON.parse(draft.key) as string[])[1], draft.value) }))) {
        await quarantineInTransaction(transaction, previous, accessWasLocked ? "access_locked" : previous.scope.key !== scope.key ? "account_changed" : "authority_changed");
      }
    }
    const next = { ...candidate, cacheIdentity: previous?.scope.key === scope.key ? previous.cacheIdentity ?? candidate.cacheIdentity : candidate.cacheIdentity, sequence: previous?.scope.key === scope.key ? previous.sequence : 0, cacheRevision: (previous?.cacheRevision ?? 0) + 1 };
    await store.put(next, "active");
    await transaction.done;
    return next;
  }

  async function cacheRevision(accountId: string): Promise<string | null> {
    const session = await (await db()).get("session", "active");
    return session?.scope.accountId === accountId ? cacheToken(session) : null;
  }

  async function activeCacheRevision(): Promise<string | null> {
    const session = await (await db()).get("session", "active");
    // This comparison token is never displayed. It lets a newly verified
    // account atomically quarantine a previous account after a cold restart.
    return cacheToken(session);
  }

  async function readSession(accountId: string | null, allowLastAccount = false, now = Date.now()): Promise<OfflineSession | null> {
    if (typeof window !== "undefined" && !isMentoringOfflineAccessPrepared()) return null;
    const connection = await db();
    const transaction = connection.transaction("session", "readwrite");
    const session = await transaction.store.get("active");
    if (!session || (accountId ? session.scope.accountId !== accountId : !allowLastAccount) || !isOfflineLeaseValid(session, now)) {
      await transaction.done;
      return null;
    }
    const touched = { ...session, lastSeenAt: Math.max(now, session.lastSeenAt) };
    await transaction.store.put(touched, "active");
    await transaction.done;
    return touched;
  }

  async function operations(scope: OfflineScope): Promise<OfflineOperation[]> {
    const connection = await db();
    const transaction = connection.transaction(["session", "operations"]);
    assertSession(await transaction.objectStore("session").get("active"), scope, Date.now());
    const result = await transaction.objectStore("operations").index("scope").getAll(scope.key);
    await transaction.done;
    return result.sort((a, b) => a.sequence - b.sequence);
  }

  async function enqueue(scope: OfflineScope, command: MentoringCommand, now = Date.now()): Promise<OfflineOperation> {
    if (!command.operationId || command.operationId.length > 128) throw new OfflineStorageError("invalid_command", "חסר מזהה תקין לפעולה. יש לפתוח מחדש את הטופס.");
    const signature = canonical(command);
    const connection = await db();
    const transaction = connection.transaction(["session", "operations", "receipts"], "readwrite");
    const sessions = transaction.objectStore("session");
    const session = await sessions.get("active");
    assertSession(session, scope, now);
    const store = transaction.objectStore("operations");
    const key = resourceKey(scope, command.operationId);
    const receipt = await transaction.objectStore("receipts").get(key);
    if (receipt && receipt.signature !== signature) {
      transaction.abort(); await transaction.done.catch(() => undefined);
      throw new OfflineStorageError("operation_reused", "מזהה הפעולה כבר התקבל במערכת עם תוכן אחר. יש ליצור פעולה חדשה.");
    }
    const previous = await store.get(key);
    if (previous && previous.signature !== signature) {
      transaction.abort(); await transaction.done.catch(() => undefined);
      throw new OfflineStorageError("operation_reused", "הפעולה כבר נשמרה עם תוכן אחר. יש ליצור פעולה חדשה כדי לשמור את השינוי.");
    }
    if (previous) { await transaction.done; return previous; }
    const queued = await store.index("scope").getAll(scope.key);
    const dependencies = new Set<string>();
    const pending = queued.filter((operation) => operation.status === "pending").sort((a, b) => b.sequence - a.sequence);
    const resourceVersions = versionResources(command, session.snapshot, queued);
    for (const resource of resourceVersions) {
      const predecessor = pending.find((operation) => (operation.resourceVersions ?? versionResources(operation.command)).some((previous) => previous.key === resource.key && previous.before !== previous.after && previous.after === resource.before));
      if (predecessor) dependencies.add(predecessor.command.operationId);
    }
    const referencedStaffIds = [...("staffId" in command ? [command.staffId] : []), ...(command.type === "assign_participant" ? [command.mentorId, command.coordinatorId] : command.type === "create_staff" || command.type === "update_staff" ? [command.fields.coordinatorId] : [])];
    for (const staffId of referencedStaffIds) {
      const create = pending.find((operation) => operation.command.type === "create_staff" && operation.command.operationId === staffId);
      if (create) dependencies.add(create.command.operationId);
    }
    const dependencyIds = [...dependencies];
    const operation: OfflineOperation = { key, scopeKey: scope.key, command: structuredClone(command), signature, queuedAt: new Date(now).toISOString(), sequence: session.sequence + 1, status: "pending", resourceVersions, ...(dependencyIds.length ? { dependsOnOperationId: dependencyIds[0], dependsOnOperationIds: dependencyIds } : {}) };
    await store.add(operation);
    await sessions.put({ ...session, sequence: operation.sequence, lastSeenAt: Math.max(now, session.lastSeenAt) }, "active");
    await transaction.done;
    return operation;
  }

  async function settle(scope: OfflineScope, operation: OfflineOperation, result: CommandResult): Promise<void> {
    const connection = await db();
    const transaction = connection.transaction(["session", "operations", "receipts"], "readwrite");
    const sessions = transaction.objectStore("session");
    const session = await sessions.get("active");
    assertSession(session, scope, Date.now());
    const store = transaction.objectStore("operations");
    const saved = await store.get(operation.key);
    if (!saved || saved.signature !== operation.signature) { await transaction.done; return; }
    if (result.ok) {
      // Keep the accepted change readable if connectivity drops before refresh.
      await sessions.put({ ...session, snapshot: applyOptimisticCommand(session.snapshot, saved, true), lastSeenAt: Math.max(Date.now(), session.lastSeenAt), cacheRevision: session.cacheRevision + 1 }, "active");
      await transaction.objectStore("receipts").put({ key: saved.key, signature: saved.signature, result: structuredClone(result) });
      await store.delete(saved.key);
    } else await store.put({ ...saved, status: "blocked", failure: structuredClone(result) });
    await transaction.done;
  }

  async function readReceipt(scope: OfflineScope, command: MentoringCommand): Promise<CommandSuccess | null> {
    const connection = await db();
    const transaction = connection.transaction(["session", "receipts"]);
    assertSession(await transaction.objectStore("session").get("active"), scope, Date.now());
    const receipt = await transaction.objectStore("receipts").get(resourceKey(scope, command.operationId));
    await transaction.done;
    if (receipt && receipt.signature !== canonical(command)) throw new OfflineStorageError("operation_reused", "מזהה הפעולה כבר התקבל עם תוכן אחר. יש ליצור פעולה חדשה.");
    return receipt?.result ?? null;
  }

  async function acknowledgeLocalFailure(scope: OfflineScope, operationId: string): Promise<void> {
    const connection = await db();
    const transaction = connection.transaction(["session", "operations"], "readwrite");
    assertSession(await transaction.objectStore("session").get("active"), scope, Date.now());
    const store = transaction.objectStore("operations");
    const operation = await store.get(resourceKey(scope, operationId));
    if (operation?.status === "blocked") await store.put({ ...operation, status: "acknowledged", acknowledgedAt: new Date().toISOString() });
    await transaction.done;
  }

  async function readDraft<T>(scope: OfflineScope, key: string): Promise<T | null> {
    const connection = await db();
    const transaction = connection.transaction(["session", "drafts", "operations"]);
    const session = await transaction.objectStore("session").get("active");
    assertSession(session, scope, Date.now());
    const snapshot = snapshotWithLocalCreates(session.snapshot, await transaction.objectStore("operations").index("scope").getAll(scope.key));
    const result = await transaction.objectStore("drafts").get(resourceKey(scope, key));
    await transaction.done;
    if (result && !draftAllowed(snapshot, { ...result, authority: result.authority ?? draftAuthority(snapshot, key) })) throw new OfflineStorageError("account_changed", "הטיוטה נעולה עד לאימות הרשאות מתאים.");
    return result ? structuredClone(result.value) as T : null;
  }

  async function writeDraft<T>(scope: OfflineScope, key: string, value: T, now = Date.now(), accessKey?: string): Promise<void> {
    if (!key || key.length > 500 || canonical(value).length > 150_000) throw new OfflineStorageError("invalid_command", "הטיוטה גדולה מדי לשמירה מקומית.");
    const connection = await db();
    const transaction = connection.transaction(["session", "drafts", "operations"], "readwrite");
    const session = await transaction.objectStore("session").get("active");
    assertSession(session, scope, now);
    const snapshot = snapshotWithLocalCreates(session.snapshot, await transaction.objectStore("operations").index("scope").getAll(scope.key));
    if (accessKey !== undefined && !isOfflineDraftAccessCurrent(snapshot, accessKey)) throw new OfflineStorageError("account_changed", "לא ניתן לשמור טיוטה מטופס שנפתח לפני שינוי הרשאות.");
    const draftsStore = transaction.objectStore("drafts");
    const previous = await draftsStore.get(resourceKey(scope, key));
    const authority = draftAuthority(snapshot, key, value);
    const candidate = { key: resourceKey(scope, key), scopeKey: scope.key, value: structuredClone(value), savedAt: new Date(now).toISOString(), draftKey: key, authority };
    if ((previous && !draftAllowed(snapshot, { ...previous, authority: previous.authority ?? draftAuthority(snapshot, key, previous.value) })) || !draftAllowed(snapshot, candidate)) throw new OfflineStorageError("account_changed", "לא ניתן לשמור טיוטה לאחר שינוי הרשאות. התוכן הקודם נשאר נעול.");
    await draftsStore.put(candidate);
    await transaction.objectStore("session").put({ ...session, lastSeenAt: Math.max(now, session.lastSeenAt) }, "active");
    await transaction.done;
  }

  async function clearDraft(scope: OfflineScope, key: string): Promise<void> {
    const connection = await db();
    const transaction = connection.transaction(["session", "drafts"], "readwrite");
    assertSession(await transaction.objectStore("session").get("active"), scope, Date.now());
    await transaction.objectStore("drafts").delete(resourceKey(scope, key));
    await transaction.done;
  }

  async function clearRecoveredDraft(scope: OfflineScope, key: string, savedAt: string, recoveredAt: string): Promise<void> {
    const connection = await db();
    const transaction = connection.transaction(["session", "drafts"], "readwrite");
    assertSession(await transaction.objectStore("session").get("active"), scope, Date.now());
    const draftsStore = transaction.objectStore("drafts");
    const draft = await draftsStore.get(resourceKey(scope, key));
    if (draft && (!draft.recoveredAt || draft.savedAt !== savedAt || draft.recoveredAt !== recoveredAt)) throw new OfflineStorageError("superseded", "הטיוטה עודכנה מאז פתיחת האישור. העבודה החדשה נשמרה ויש לבדוק אותה לפני מחיקה.");
    if (draft) await draftsStore.delete(draft.key);
    await transaction.done;
  }

  async function unsyncedCount(): Promise<number> {
    const connection = await db();
    const transaction = connection.transaction(["operations", "drafts"]);
    const [queued, drafts] = await Promise.all([transaction.objectStore("operations").getAll(), transaction.objectStore("drafts").count()]);
    await transaction.done;
    return queued.filter((operation) => operation.status !== "acknowledged").length + drafts;
  }

  async function recoveryMetadata(scope: OfflineScope): Promise<OfflineRecoveryMetadata[]> {
    const connection = await db();
    const transaction = connection.transaction(["session", "vaults", "operations", "drafts"]);
    assertSession(await transaction.objectStore("session").get("active"), scope, Date.now());
    const metadata: OfflineRecoveryMetadata[] = [];
    for (const vault of await transaction.objectStore("vaults").getAll()) {
      if (vault.scope.key !== scope.key) continue;
      const operations = await transaction.objectStore("operations").index("scope").getAll(vault.id);
      const draftCount = await transaction.objectStore("drafts").index("scope").count(vault.id);
      if (!operations.length && !draftCount) continue;
      metadata.push({ id: vault.id, lockedAt: vault.lockedAt, reason: vault.reason, pendingCount: operations.filter((operation) => operation.status !== "acknowledged").length, historyCount: operations.filter((operation) => operation.status === "acknowledged").length, draftCount });
    }
    await transaction.done;
    return metadata;
  }

  async function recoverLocalWork(scope: OfflineScope, vaultId: string): Promise<{ recoveredOperations: number; recoveredDrafts: number; lockedOperations: number; lockedDrafts: number }> {
    const connection = await db();
    const transaction = connection.transaction(["session", "vaults", "operations", "drafts"], "readwrite");
    const session = await transaction.objectStore("session").get("active");
    assertSession(session, scope, Date.now());
    const vault = await transaction.objectStore("vaults").get(vaultId);
    if (!vault || vault.scope.key !== scope.key) throw new OfflineStorageError("account_changed", "לא ניתן לפתוח עבודה של חשבון או הרשאות אחרים.");
    const store = transaction.objectStore("operations");
    const operations = (await store.index("scope").getAll(vaultId)).sort((a, b) => a.sequence - b.sequence);
    // New records can be recovered for review, but they never grant access to
    // missing existing records and are never automatically sent after recovery.
    const localCreates = new Set(operations.filter((operation) => operation.command.type === "create_participant" && commandAllowed(session.snapshot, operation.command)).map((operation) => operation.command.operationId));
    const draftSnapshot = snapshotWithLocalCreates(session.snapshot, operations);
    let sequence = session.sequence;
    let recoveredOperations = 0; let recoveredDrafts = 0; let lockedDrafts = 0;
    for (const operation of operations) {
      if (!commandAllowed(session.snapshot, operation.command, localCreates)) continue;
      const key = resourceKey(scope, operation.command.operationId);
      if (await store.get(key)) continue;
      await store.put({ ...operation, key, scopeKey: scope.key, sequence: ++sequence,
        ...(operation.status === "acknowledged" ? {} : { status: "blocked" as const, failure: operation.failure ?? { ok: false as const, error: { code: "conflict" as const, message: "העבודה שוחזרה לאחר אימות הרשאות. יש לבדוק את התוכן ולשמור פעולה חדשה מול הנתונים העדכניים." } } }) });
      await store.delete(operation.key);
      ++recoveredOperations;
    }
    const draftsStore = transaction.objectStore("drafts");
    for (const draft of await draftsStore.index("scope").getAll(vaultId)) {
      const key = draft.draftKey ?? (JSON.parse(draft.key) as string[])[1];
      if (!draftAllowed(draftSnapshot, draft) || await draftsStore.get(resourceKey(scope, key))) { ++lockedDrafts; continue; }
      // Prepared intent is deliberately cleared: its immutable command is in
      // review, and opening a recovered form must not silently replay it.
      let value = draft.value && typeof draft.value === "object" && "kind" in draft.value && draft.value.kind === "mentoring-form-draft-v1" ? { ...draft.value, intent: null } : draft.value;
      const localProfileId = /^participant-profile:(.+)$/.exec(key)?.[1];
      const mapToNewProfile = localProfileId && localCreates.has(localProfileId) && !session.snapshot.participants.some((view) => view.participant.id === localProfileId)
        && !await draftsStore.get(resourceKey(scope, "participant-profile:new"));
      const restoredKey = mapToNewProfile ? "participant-profile:new" : key;
      if (mapToNewProfile && value && typeof value === "object") {
        value = "value" in value && value.value && typeof value.value === "object" ? { ...value, value: { ...value.value, baseVersion: null } } : { ...value, baseVersion: null };
      }
      await draftsStore.put({ ...draft, key: resourceKey(scope, restoredKey), draftKey: restoredKey, scopeKey: scope.key, value, recoveredAt: new Date().toISOString(),
        ...(mapToNewProfile ? { authority: draftAuthority(session.snapshot, restoredKey, value) } : {}) });
      await draftsStore.delete(draft.key);
      ++recoveredDrafts;
    }
    await transaction.objectStore("session").put({ ...session, sequence, cacheRevision: session.cacheRevision + 1 }, "active");
    await transaction.done;
    return { recoveredOperations, recoveredDrafts, lockedOperations: operations.length - recoveredOperations, lockedDrafts };
  }

  async function recoveredDrafts(scope: OfflineScope): Promise<OfflineRecoveredDraft[]> {
    const connection = await db();
    const transaction = connection.transaction(["session", "drafts", "operations"]);
    const session = await transaction.objectStore("session").get("active");
    assertSession(session, scope, Date.now());
    const snapshot = snapshotWithLocalCreates(session.snapshot, await transaction.objectStore("operations").index("scope").getAll(scope.key));
    const drafts = await transaction.objectStore("drafts").index("scope").getAll(scope.key);
    await transaction.done;
    return drafts.filter((draft) => draft.recoveredAt && draftAllowed(snapshot, draft)).map((draft) => ({ key: draft.draftKey ?? (JSON.parse(draft.key) as string[])[1], savedAt: draft.savedAt, recoveredAt: draft.recoveredAt!, value: structuredClone(draft.value) }));
  }

  async function discardLocalRecovery(scope: OfflineScope, vaultId: string): Promise<void> {
    const connection = await db();
    const transaction = connection.transaction(["session", "vaults", "operations", "drafts", "receipts"], "readwrite");
    assertSession(await transaction.objectStore("session").get("active"), scope, Date.now());
    const vault = await transaction.objectStore("vaults").get(vaultId);
    if (!vault || vault.scope.key !== scope.key) throw new OfflineStorageError("account_changed", "לא ניתן למחוק עבודה של חשבון אחר.");
    for (const operation of await transaction.objectStore("operations").index("scope").getAll(vaultId)) await transaction.objectStore("operations").delete(operation.key);
    for (const draft of await transaction.objectStore("drafts").index("scope").getAll(vaultId)) await transaction.objectStore("drafts").delete(draft.key);
    for (const receipt of await transaction.objectStore("receipts").getAll()) if ((JSON.parse(receipt.key) as string[])[0] === vaultId) await transaction.objectStore("receipts").delete(receipt.key);
    await transaction.objectStore("vaults").delete(vaultId);
    await transaction.done;
  }

  return { clear, quarantine, saveSnapshot, cacheRevision, activeCacheRevision, readSession, operations, enqueue, settle, readReceipt, acknowledgeLocalFailure, readDraft, writeDraft, clearDraft, clearRecoveredDraft, unsyncedCount, recoveryMetadata, recoverLocalWork, recoveredDrafts, discardLocalRecovery };
}

export function projectWorkspace(snapshot: WorkspaceSnapshot, operations: readonly OfflineOperation[]): WorkspaceSnapshot {
  let projected = operations.reduce((state, operation) => applyOptimisticCommand(state, operation), snapshot);
  const localConflicts = operations.filter((operation) => operation.status !== "pending" && (!operation.failure?.error.conflictId || !snapshot.conflicts.some((conflict) => conflict.id === operation.failure?.error.conflictId))).map((operation) => {
    const command = operation.command;
    const participantId = "participantId" in command ? command.participantId : command.type === "create_participant" ? command.operationId : "";
    const view = projected.participants.find((participant) => participant.participant.id === participantId);
    return { id: `local:${command.operationId}`, participantId, participantName: view?.participant.displayName || "עדכון מקומי", authorName: snapshot.actor.displayName, authoritativeValue: operation.failure?.error.message ?? "העדכון דורש בדיקה לפני שליחה מחדש.", submittedValue: JSON.stringify(command, null, 2), createdAt: operation.queuedAt, resolvedAt: operation.acknowledgedAt ?? null };
  });
  if (localConflicts.length) projected = { ...projected, conflicts: [...projected.conflicts, ...localConflicts] };
  return projected;
}

export const mentoringOfflineStore = createMentoringOfflineStore();

export async function getMentoringPendingCount(): Promise<number> {
  // Logout warning includes durable drafts as well as queued/blocked commands.
  return mentoringOfflineStore.unsyncedCount();
}

export async function clearMentoringOfflineData(): Promise<void> {
  lockMentoringOfflineData();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mentoring-private-cleared"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(MENTORING_OFFLINE_CHANNEL);
    channel.postMessage({ type: "cleared" });
    channel.close();
  }
  await mentoringOfflineStore.clear();
}

export async function quarantineMentoringOfflineData(reason: string, scope?: OfflineScope): Promise<void> {
  lockMentoringOfflineData();
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(MENTORING_OFFLINE_CHANNEL);
    channel.postMessage({ type: "locked" });
    channel.close();
  }
  await mentoringOfflineStore.quarantine(reason, scope);
}
