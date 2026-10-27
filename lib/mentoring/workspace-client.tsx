"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import type { ApiFailure, CommandResult, MentoringCommand, WorkspaceSnapshot } from "./contracts";
import { isMentoringOfflineAccessPrepared, isOfflineDraftAccessCurrent, offlineDraftAccessKey, MENTORING_OFFLINE_CHANNEL, mentoringOfflineStore, OfflineStorageError, prepareMentoringOfflineAccess, projectWorkspace, quarantineMentoringOfflineData, type OfflineOperation, type OfflineScope, type OfflineSession, type OfflineRecoveryMetadata, type OfflineRecoveredDraft } from "./offline";

type WorkspaceError = { readonly message: string; readonly code?: string };
type Connection = "online" | "offline" | "syncing" | "conflict";
interface WorkspaceState {
  readonly snapshot: WorkspaceSnapshot | null;
  readonly loading: boolean;
  readonly error: WorkspaceError | null;
  readonly connection: Connection;
  readonly isOnline: boolean;
  readonly pendingCount: number;
  readonly localFailures: readonly OfflineOperation[];
  readonly recoveryVaults: readonly OfflineRecoveryMetadata[];
  readonly recoveredDrafts: readonly OfflineRecoveredDraft[];
  readonly draftScopeKey: string;
}

export interface WorkspaceContextValue extends WorkspaceState {
  readonly refresh: () => Promise<void>;
  readonly submit: (command: MentoringCommand) => Promise<CommandResult>;
  readonly readDraft: <T>(key: string) => Promise<T | null>;
  readonly writeDraft: <T>(key: string, value: T) => Promise<void>;
  readonly clearDraft: (key: string) => Promise<void>;
  readonly clearRecoveredDraft: (key: string, savedAt: string, recoveredAt: string) => Promise<void>;
  readonly acknowledgeLocalFailure: (operationId: string) => Promise<void>;
  readonly recoverLocalWork: (vaultId: string) => Promise<void>;
  readonly discardLocalRecovery: (vaultId: string) => Promise<void>;
}

const INITIAL_STATE: WorkspaceState = { snapshot: null, loading: true, error: null, connection: "online", isOnline: true, pendingCount: 0, localFailures: [], recoveryVaults: [], recoveredDrafts: [], draftScopeKey: "locked:0" };
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function failure(code: ApiFailure["error"]["code"], message: string): ApiFailure { return { ok: false, error: { code, message } }; }
function errorFor(error: unknown): WorkspaceError {
  if (error instanceof RequestFailure) return error.failure.error;
  if (error instanceof Error) return { message: error.message, ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}) };
  return { message: "לא ניתן להשלים את העדכון. המידע שכבר נשמר במכשיר נשמר עד לחידוש החיבור." };
}

class RequestFailure extends Error {
  constructor(readonly failure: ApiFailure, readonly status: number) { super(failure.error.message); this.name = "RequestFailure"; }
}

function isFailure(value: unknown): value is ApiFailure {
  return Boolean(value && typeof value === "object" && "ok" in value && value.ok === false && "error" in value && value.error && typeof value.error === "object" && "code" in value.error && "message" in value.error && typeof value.error.message === "string");
}

function isSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== "object" || !("actor" in value) || !value.actor || typeof value.actor !== "object") return false;
  const actor = value.actor;
  return "authUserId" in actor && typeof actor.authUserId === "string" && "id" in actor && typeof actor.id === "string" && "organizationId" in actor && typeof actor.organizationId === "string" && "active" in actor && actor.active === true
    && "participants" in value && Array.isArray(value.participants) && "staff" in value && Array.isArray(value.staff) && "conflicts" in value && Array.isArray(value.conflicts)
    && "offlineValidUntil" in value && typeof value.offlineValidUntil === "string" && "serverTime" in value && typeof value.serverTime === "string";
}

class WorkspaceController {
  private state: WorkspaceState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private auth: { loaded: boolean; userId: string | null | undefined } = { loaded: false, userId: undefined };
  private authSeen = false;
  private scope: OfflineScope | null = null;
  private epoch = 0;
  private disposed = false;
  private refreshTask: Promise<void> | null = null;
  private refreshEpoch: number | null = null;
  private refreshAgain = false;
  private submitTask: Promise<unknown> = Promise.resolve();
  private reachable = true;
  private syncing = false;
  private authorizedEpoch: number | null = null;
  private authorizationSequence = 0;
  private draftScopeEpoch = 0;

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL_STATE;

  private update(patch: Partial<WorkspaceState>) {
    if (this.disposed) return;
    const next = { ...this.state, ...patch };
    if (next.snapshot !== this.state.snapshot && (!next.snapshot || !this.state.snapshot || !isOfflineDraftAccessCurrent(next.snapshot, offlineDraftAccessKey(this.state.snapshot)))) ++this.draftScopeEpoch;
    // Adding an authorized record changes the bound storage callbacks, but does
    // not reopen every mounted form. Authority reductions still cancel reads.
    const draftScopeKey = next.snapshot ? JSON.stringify([next.snapshot.actor.authUserId, next.snapshot.actor.organizationId, next.snapshot.actor.id, next.snapshot.actor.role, this.draftScopeEpoch]) : `locked:${this.draftScopeEpoch}`;
    const hasConflicts = next.localFailures.length > 0 || Boolean(next.snapshot?.conflicts.some((conflict) => !conflict.resolvedAt));
    this.state = { ...next, draftScopeKey, isOnline: this.reachable, connection: !this.reachable ? "offline" : this.syncing ? "syncing" : hasConflicts ? "conflict" : "online" };
    this.listeners.forEach((listener) => listener());
  }

  private isCurrent(epoch: number) { return !this.disposed && epoch === this.epoch; }

  async updateAuth(loaded: boolean, userId: string | null | undefined) {
    if (this.authSeen && this.auth.loaded === loaded && this.auth.userId === userId) return;
    this.authSeen = true;
    this.auth = { loaded, userId };
    this.authorizedEpoch = null;
    this.update({ recoveryVaults: [], recoveredDrafts: [] });
    let epoch = ++this.epoch;
    if (loaded && !userId) { await this.invalidate(failure("not_authenticated", "יש להיכנס עם חשבון צוות כדי לפתוח את סביבת הליווי.")); return; }
    if (userId && this.scope && userId !== this.scope.accountId) {
      const previousScope = this.scope;
      this.scope = null;
      this.update({ snapshot: null, loading: true, pendingCount: 0, localFailures: [], recoveryVaults: [], recoveredDrafts: [], error: null });
      await quarantineMentoringOfflineData("account_changed", previousScope);
      epoch = ++this.epoch;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.reachable = false;
      await this.restore(epoch);
    } else if (loaded && userId) await this.refresh();
  }

  private async invalidate(result: ApiFailure) {
    ++this.epoch;
    this.refreshAgain = false;
    const previousScope = this.scope;
    this.scope = null;
    this.authorizedEpoch = null;
    this.update({ snapshot: null, loading: false, pendingCount: 0, localFailures: [], recoveryVaults: [], recoveredDrafts: [], error: result.error });
    await quarantineMentoringOfflineData(result.error.code, previousScope ?? undefined).catch(() => undefined);
    this.update({ snapshot: null, loading: false, pendingCount: 0, localFailures: [], recoveryVaults: [], recoveredDrafts: [], error: result.error });
  }

  externalClear = () => {
    ++this.epoch;
    this.refreshAgain = false;
    this.scope = null;
    this.authorizedEpoch = null;
    this.update({ snapshot: null, loading: false, pendingCount: 0, localFailures: [], recoveryVaults: [], recoveredDrafts: [], error: { message: "הגישה המקומית ננעלה. עבודה שלא נשלחה נשמרה נעולה עד לאימות מחדש של אותו חשבון והרשאות.", code: "not_authenticated" } });
  };

  private async showSession(session: OfflineSession, epoch: number) {
    if (!this.isCurrent(epoch)) return;
    const operations = await mentoringOfflineStore.operations(session.scope);
    if (!this.isCurrent(epoch)) return;
    this.scope = session.scope;
    const localFailures = operations.filter((operation) => operation.status === "blocked");
    const recoveryVaults = this.authorizedEpoch === epoch ? await mentoringOfflineStore.recoveryMetadata(session.scope) : [];
    const recoveredDrafts = await mentoringOfflineStore.recoveredDrafts(session.scope);
    if (!this.isCurrent(epoch)) return;
    this.update({ snapshot: projectWorkspace(session.snapshot, operations), loading: false, pendingCount: operations.filter((operation) => operation.status !== "acknowledged").length, localFailures, recoveryVaults, recoveredDrafts, error: localFailures[0]?.failure?.error ?? null });
  }

  private async restore(epoch = this.epoch) {
    try {
      if (!this.reachable && !isMentoringOfflineAccessPrepared()) throw new OfflineStorageError("expired", "הגישה ללא חיבור נעולה. יש להיכנס מחדש עם חיבור כדי להכין סביבת עבודה מאושרת במכשיר.");
      const accountId = this.auth.userId ?? this.scope?.accountId ?? null;
      // Last-account recovery only runs after an actual offline/network failure.
      const session = await mentoringOfflineStore.readSession(accountId, !this.reachable && !this.auth.loaded);
      if (!this.isCurrent(epoch)) return;
      if (session) await this.showSession(session, epoch);
      else {
        this.scope = null;
        this.update({ snapshot: null, loading: false, pendingCount: 0, localFailures: [], recoveryVaults: [], recoveredDrafts: [], error: { code: "expired", message: "אין במכשיר סביבת ליווי עם תוקף גישה תקין. נדרש חיבור ראשוני ואימות הרשאות כדי לעבוד ללא חיבור. עבודה קודמת נשמרת נעולה עד לאימות." } });
      }
    } catch (error) {
      if (this.isCurrent(epoch)) {
        this.scope = null;
        this.update({ snapshot: null, pendingCount: 0, localFailures: [], recoveryVaults: [], recoveredDrafts: [], loading: false, error: errorFor(error) });
      }
    }
  }

  private async loadAuthoritative(epoch: number, retries = 0): Promise<OfflineSession | null> {
    const accountId = this.auth.userId ?? this.scope?.accountId;
    if (!accountId) return null;
    const expectedCacheRevision = await mentoringOfflineStore.activeCacheRevision();
    const response = await fetch("/api/mentoring/workspace", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    // Authentication status must close local access even if an expired session
    // receives an empty, redirected, or truncated response body.
    const payload: unknown = await response.json().catch(() => null);
    if (!this.isCurrent(epoch)) return null;
    if (!response.ok || isFailure(payload)) {
      const result = isFailure(payload) ? payload : failure("unavailable", "המערכת אינה זמינה לעדכון כרגע. אפשר להמשיך בטיוטה המקומית אם תוקף הגישה עדיין תקין.");
      if (response.status === 401 || response.status === 403 || result.error.code === "not_authenticated" || result.error.code === "not_staff") await this.invalidate(result);
      throw new RequestFailure(result, response.status);
    }
    const snapshot = isSnapshot(payload) ? payload : payload && typeof payload === "object" && "snapshot" in payload && isSnapshot(payload.snapshot) ? payload.snapshot : null;
    if (!snapshot) throw new RequestFailure(failure("unavailable", "המערכת החזירה תשובה שאינה תקינה. לא אושר עדכון מידע."), 502);
    if (this.auth.loaded && this.auth.userId !== snapshot.actor.authUserId) {
      await this.invalidate(failure("not_authenticated", "זהות החשבון השתנתה. יש להיכנס מחדש."));
      return null;
    }
    let session: OfflineSession;
    try {
      session = await mentoringOfflineStore.saveSnapshot(snapshot, snapshot.actor.authUserId, Date.now(), () => this.isCurrent(epoch), expectedCacheRevision);
    } catch (error) {
      if (error instanceof OfflineStorageError && error.code === "superseded" && this.isCurrent(epoch) && retries < 2) return this.loadAuthoritative(epoch, retries + 1);
      throw error;
    }
    if (!this.isCurrent(epoch)) return null;
    prepareMentoringOfflineAccess();
    this.authorizedEpoch = epoch;
    ++this.authorizationSequence;
    this.reachable = true;
    await this.showSession(session, epoch);
    return session;
  }

  private async drain(epoch: number): Promise<Map<string, CommandResult>> {
    const receipts = new Map<string, CommandResult>();
    const run = async () => {
      if (!this.scope || !this.isCurrent(epoch)) return;
      const scope = this.scope;
      const operations = await mentoringOfflineStore.operations(scope);
      const rejectedOperations = new Set(operations.filter((operation) => operation.status !== "pending").map((operation) => operation.command.operationId));
      for (const operation of operations) {
        if (!this.isCurrent(epoch) || !this.reachable || operation.status !== "pending") continue;
        if ((operation.dependsOnOperationIds ?? (operation.dependsOnOperationId ? [operation.dependsOnOperationId] : [])).some((id) => rejectedOperations.has(id))) {
          const result = failure("conflict", "עדכון קודם של אותה חניכה דורש בדיקה. תוכן הפעולה הזו נשמר במכשיר ולא נשלח שוב אוטומטית.");
          await mentoringOfflineStore.settle(scope, operation, result);
          receipts.set(operation.command.operationId, result);
          rejectedOperations.add(operation.command.operationId);
          continue;
        }
        let response: Response;
        try {
          response = await fetch("/api/mentoring/commands", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Mentoring-Account": scope.accountId }, body: JSON.stringify(operation.command) });
        } catch {
          this.reachable = false;
          this.update({ error: { message: "החיבור נקטע. הפעולה שמורה במכשיר ותישלח עם אותו מזהה כשיתחדש החיבור." } });
          break;
        }
        const payload: unknown = await response.json().catch(() => null);
        if (!this.isCurrent(epoch)) return;
        if (response.status === 401 || response.status === 403 || (isFailure(payload) && (payload.error.code === "not_authenticated" || payload.error.code === "not_staff"))) { await this.invalidate(isFailure(payload) ? payload : failure("not_authenticated", "תוקף הכניסה או ההרשאות השתנה. העבודה נשמרה נעולה עד לאימות מחדש.")); return; }
        if (response.status >= 500 || response.status === 429 || response.status === 408) {
          this.reachable = false;
          this.update({ error: isFailure(payload) ? payload.error : { message: "המערכת אינה זמינה כרגע. הפעולה נשמרה במכשיר וממתינה לחידוש החיבור." } });
          break;
        }
        const result: CommandResult | null = isFailure(payload) ? payload : response.ok && payload && typeof payload === "object" && "ok" in payload && payload.ok === true && "operationId" in payload && payload.operationId === operation.command.operationId && "acceptance" in payload && payload.acceptance === "accepted"
          ? payload as CommandResult : null;
        if (!result || (!result.ok && ["unavailable", "not_configured"].includes(result.error.code))) {
          // A lost/truncated body may follow a committed transaction. Keep the
          // immutable intent pending so the same operation ID can be replayed.
          this.reachable = false;
          this.update({ error: result && !result.ok ? result.error : { message: "לא התקבל אישור מלא מהמערכת. הפעולה נשמרה ותיבדק שוב עם אותו מזהה בחידוש החיבור." } });
          break;
        }
        await mentoringOfflineStore.settle(scope, operation, result);
        receipts.set(operation.command.operationId, result);
        if (!result.ok) rejectedOperations.add(operation.command.operationId);
      }
    };
    await run();
    return receipts;
  }

  private async synchronizeUnlocked(): Promise<Map<string, CommandResult>> {
    const epoch = this.epoch;
    if ((this.auth.loaded && !this.auth.userId) || (!this.auth.loaded && !this.scope)) return new Map();
    if (typeof navigator !== "undefined" && !navigator.onLine) { this.reachable = false; await this.restore(epoch); return new Map(); }
    this.syncing = true;
    this.update({});
    try {
      const session = await this.loadAuthoritative(epoch);
      if (!session || !this.isCurrent(epoch)) return new Map();
      const receipts = await this.drain(epoch);
      if (!this.isCurrent(epoch)) return receipts;
      if (this.reachable && receipts.size > 0) await this.loadAuthoritative(epoch);
      else await this.restore(epoch);
      return receipts;
    } catch (error) {
      if (this.isCurrent(epoch)) {
        if (!(error instanceof RequestFailure) || error.status >= 500) this.reachable = false;
        await this.restore(epoch);
        this.update({ loading: false, error: errorFor(error) });
      }
      return new Map();
    } finally { this.syncing = false; this.update({}); }
  }

  private async synchronize(): Promise<Map<string, CommandResult>> {
    // The complete GET→write→GET cycle is one cross-tab critical section.
    // IDB cacheRevision compare-and-swap also protects browsers without Locks.
    return typeof navigator !== "undefined" && navigator.locks
      ? await navigator.locks.request("mentoring-private-sync", { mode: "exclusive" }, () => this.synchronizeUnlocked())
      : await this.synchronizeUnlocked();
  }

  refresh = async (): Promise<void> => {
    if (this.refreshTask) {
      // Clerk can recover its identity while a cold-offline reconnect is in
      // flight. Join that task, but replace its now-invalid epoch before done.
      if (this.refreshEpoch !== this.epoch) this.refreshAgain = true;
      return this.refreshTask;
    }
    const task = (async () => {
      do {
        this.refreshAgain = false;
        this.refreshEpoch = this.epoch;
        await this.synchronize();
      } while (this.refreshAgain && !this.disposed);
    })();
    this.refreshTask = task;
    try { await task; } finally { if (this.refreshTask === task) { this.refreshTask = null; this.refreshEpoch = null; } }
  };

  submit = (command: MentoringCommand, accountId: string | null = this.scope?.accountId ?? null): Promise<CommandResult> => {
    const submittedScope = this.scope;
    const submittedEpoch = this.epoch;
    const intent = structuredClone(command);
    // Serialize intent storage and sync so a second form cannot overtake it.
    const task = this.submitTask.catch(() => undefined).then(async (): Promise<CommandResult> => {
      const scope = this.scope;
      if (!scope || !submittedScope || scope.accountId !== accountId || scope.key !== submittedScope.key || !this.isCurrent(submittedEpoch) || (this.auth.loaded && this.auth.userId !== scope.accountId)) return failure("not_authenticated", "חשבון הצוות השתנה לפני שמירת הפעולה. יש לפתוח מחדש את הטופס.");
      try {
        const command = intent;
        const existingReceipt = await mentoringOfflineStore.readReceipt(scope, command);
        if (existingReceipt) return { ...existingReceipt, replayed: true };
        const operation = await mentoringOfflineStore.enqueue(scope, command);
        if (operation.status !== "pending") return operation.failure ?? failure("conflict", "הפעולה שמורה לבדיקה ולא תישלח שוב עם תוכן שונה.");
        await this.restore();
        if (this.reachable) {
          // Finish an in-flight refresh before draining the newly stored intent.
          if (this.refreshTask) await this.refreshTask;
          const receipts = await this.synchronize();
          const receipt = receipts.get(command.operationId);
          if (receipt) return receipt;
          if (!this.scope || this.scope.key !== scope.key) return failure("not_authenticated", "החשבון השתנה לפני שהתקבל אישור לשמירה.");
          const storedReceipt = await mentoringOfflineStore.readReceipt(scope, command);
          if (storedReceipt) return storedReceipt;
        }
        return { ok: true, operationId: command.operationId, replayed: false, acceptance: "queued", ...(command.type === "create_participant" ? { participantId: command.operationId } : "participantId" in command ? { participantId: command.participantId } : command.type === "create_staff" ? { staffId: command.operationId } : {}) };
      } catch (error) {
        this.update({ error: errorFor(error) });
        return failure(error instanceof OfflineStorageError && error.code === "expired" ? "not_authenticated" : "unavailable", errorFor(error).message);
      }
    });
    this.submitTask = task;
    return task;
  };

  private draftScope(accountId: string | null, accessKey?: string): OfflineScope {
    if (!this.scope || !accountId || this.scope.accountId !== accountId || (this.auth.loaded && this.auth.userId !== accountId)) throw new OfflineStorageError("account_changed", "לא ניתן לשמור טיוטה לאחר שינוי חשבון.");
    if (accessKey !== undefined && !isOfflineDraftAccessCurrent(this.state.snapshot, accessKey)) throw new OfflineStorageError("account_changed", "ההרשאות השתנו מאז פתיחת הטופס. יש לפתוח מחדש את הטופס מול המידע המאושר.");
    return this.scope;
  }
  readDraft = <T,>(accountId: string | null, key: string, accessKey?: string): Promise<T | null> => mentoringOfflineStore.readDraft<T>(this.draftScope(accountId, accessKey), key);
  writeDraft = <T,>(accountId: string | null, key: string, value: T, accessKey?: string): Promise<void> => mentoringOfflineStore.writeDraft(this.draftScope(accountId, accessKey), key, value, Date.now(), accessKey).catch((error: unknown) => { this.update({ error: errorFor(error) }); throw error; });
  clearDraft = (accountId: string | null, key: string, accessKey?: string): Promise<void> => mentoringOfflineStore.clearDraft(this.draftScope(accountId, accessKey), key);
  clearRecoveredDraft = async (accountId: string | null, key: string, savedAt: string, recoveredAt: string, accessKey?: string): Promise<void> => {
    await mentoringOfflineStore.clearRecoveredDraft(this.draftScope(accountId, accessKey), key, savedAt, recoveredAt);
    await this.restore();
  };
  acknowledgeLocalFailure = async (accountId: string | null, operationId: string): Promise<void> => {
    await mentoringOfflineStore.acknowledgeLocalFailure(this.draftScope(accountId), operationId);
    await this.restore();
  };
  private async recoveryScope(accountId: string | null): Promise<OfflineScope> {
    if (!this.auth.loaded || !this.auth.userId || !this.reachable || (typeof navigator !== "undefined" && !navigator.onLine)) throw new OfflineStorageError("account_changed", "שחזור עבודה נעולה מחייב חיבור ואימות הרשאות מחדש של אותו חשבון.");
    const authorizationBefore = this.authorizationSequence;
    await this.refresh();
    const scope = this.draftScope(accountId);
    if (!this.reachable || this.authorizedEpoch !== this.epoch || this.authorizationSequence <= authorizationBefore) throw new OfflineStorageError("account_changed", "נדרש אימות הרשאות עדכני לפני שחזור עבודה נעולה.");
    return scope;
  }
  recoverLocalWork = async (accountId: string | null, vaultId: string): Promise<void> => {
    const scope = await this.recoveryScope(accountId);
    await mentoringOfflineStore.recoverLocalWork(scope, vaultId);
    await this.restore();
  };
  discardLocalRecovery = async (accountId: string | null, vaultId: string): Promise<void> => {
    const scope = await this.recoveryScope(accountId);
    await mentoringOfflineStore.discardLocalRecovery(scope, vaultId);
    await this.restore();
  };

  online = () => { this.reachable = true; this.update({}); void this.refresh(); };
  offline = () => { this.reachable = false; this.update({}); void this.restore(); };
  checkLease = () => { if (!this.reachable) void this.restore(); };
  activate = () => { this.disposed = false; if (this.auth.loaded && this.auth.userId) void this.refresh(); };
  dispose = () => { this.disposed = true; ++this.epoch; this.refreshAgain = false; this.refreshTask = null; };
}

function registerStaffWorker() {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/staff-sw.js", { scope: "/staff", updateViaCache: "none" }).then(async (registration) => {
    const worker = registration.active ?? registration.installing ?? registration.waiting;
    worker?.postMessage({ type: "PREPARE_STAFF_SHELL" });
    const ready = await navigator.serviceWorker.ready;
    ready.active?.postMessage({ type: "PREPARE_STAFF_SHELL" });
  }).catch(() => { /* Private IDB drafts remain usable; browser QA checks shell preparation. */ });
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const [controller] = useState(() => new WorkspaceController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);

  useEffect(() => { void controller.updateAuth(Boolean(isLoaded), userId); }, [controller, isLoaded, userId]);
  useEffect(() => {
    controller.activate();
    registerStaffWorker();
    const clear = () => controller.externalClear();
    const storage = () => { if (!isMentoringOfflineAccessPrepared()) controller.externalClear(); };
    const focus = () => { if (document.visibilityState === "visible") { if (navigator.onLine) void controller.refresh(); else controller.checkLease(); } };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(MENTORING_OFFLINE_CHANNEL) : null;
    if (channel) channel.onmessage = (event: MessageEvent<unknown>) => { if (event.data && typeof event.data === "object" && "type" in event.data && (event.data.type === "cleared" || event.data.type === "locked")) clear(); };
    window.addEventListener("online", controller.online);
    window.addEventListener("offline", controller.offline);
    window.addEventListener("mentoring-private-cleared", clear);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", focus);
    const interval = window.setInterval(controller.checkLease, 30_000);
    return () => {
      window.removeEventListener("online", controller.online);
      window.removeEventListener("offline", controller.offline);
      window.removeEventListener("mentoring-private-cleared", clear);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", focus);
      window.clearInterval(interval);
      channel?.close();
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    if (state.isOnline) return;
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname !== "/staff" && !url.pathname.startsWith("/staff/")) || url.pathname === "/staff/logout" || url.pathname === "/staff/login" || url.pathname === "/staff/signup") return;
      event.preventDefault(); event.stopImmediatePropagation();
      window.location.assign(url.href);
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, [state.isOnline]);

  const accountId = state.snapshot?.actor.authUserId ?? null;
  const accessKey = offlineDraftAccessKey(state.snapshot);
  // Form actions remain stable across snapshot refreshes, but bind identity
  // so an old form's delayed write cannot enter the next signed-in account.
  const drafts = useMemo(() => ({
    submit: (command: MentoringCommand) => controller.submit(command, accountId),
    readDraft: <T,>(key: string) => controller.readDraft<T>(accountId, key, accessKey),
    writeDraft: <T,>(key: string, value: T) => controller.writeDraft(accountId, key, value, accessKey),
    clearDraft: (key: string) => controller.clearDraft(accountId, key, accessKey),
    clearRecoveredDraft: (key: string, savedAt: string, recoveredAt: string) => controller.clearRecoveredDraft(accountId, key, savedAt, recoveredAt, accessKey),
    acknowledgeLocalFailure: (operationId: string) => controller.acknowledgeLocalFailure(accountId, operationId),
    recoverLocalWork: (vaultId: string) => controller.recoverLocalWork(accountId, vaultId),
    discardLocalRecovery: (vaultId: string) => controller.discardLocalRecovery(accountId, vaultId),
  }), [controller, accountId, accessKey]);
  const identityMatches = !isLoaded || Boolean(userId && (!state.snapshot || userId === state.snapshot.actor.authUserId));
  const value = useMemo<WorkspaceContextValue>(() => ({ ...state, ...(identityMatches ? {} : { snapshot: null, pendingCount: 0, localFailures: [], recoveryVaults: [], recoveredDrafts: [], draftScopeKey: "locked", loading: Boolean(userId), error: userId ? null : failure("not_authenticated", "יש להיכנס עם חשבון צוות כדי לפתוח את סביבת הליווי.").error }), refresh: controller.refresh, ...drafts }), [state, identityMatches, userId, controller, drafts]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within WorkspaceProvider.");
  return context;
}
