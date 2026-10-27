import assert from "node:assert/strict";

const DATABASE = "sherut-mentoring-private-v1";
const DRAFT_KEY = "participant-profile:new";
const CONTROL = "__mentoringDraftQuotaScenario";
const FAULT_MESSAGE = "QA owned draft quota injection";
const SAVED = "הטיוטה נשמרה במכשיר הזה";
const FAILED = "השמירה האוטומטית נכשלה. יש להשאיר את הטופס פתוח ולשמור את הדיווח לפני היציאה.";
const RETRY = "ניסיון נוסף לשמירת הטיוטה";

/**
 * Browser autosave failure/retry proof, without submitting a domain command.
 * The caller owns an already authorized, disposable development profile and
 * predispatch mutation guards. Importing this module performs no operations.
 * This injects a quota exception; it does not exhaust device storage or prove
 * committed-command response-loss/idempotency acceptance.
 */
export async function runDraftStorageFaultScenario({
  page,
  origin,
  runId,
  assertNoMutations,
  screenshot,
  expectedExistingDraftName = null,
}) {
  const app = new URL(origin);
  assert.ok(["http:", "https:"].includes(app.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(app.hostname), "Storage faults are restricted to a local development origin.");
  assert.ok(typeof runId === "string" && runId.length > 0 && runId.length <= 160);
  assert.equal(typeof assertNoMutations, "function", "The owner must supply its fail-fast mutation guard assertion.");
  assert.ok(expectedExistingDraftName === null || typeof expectedExistingDraftName === "string");
  const names = { a: `בדיקת אחסון ${runId}: A`, b: `בדיקת אחסון ${runId}: B` };
  const diagnosticEvents = [];
  let diagnosticCount = 0;
  let injectedQuotaDiagnosticCount = 0;
  let phase = "setup";
  let installed = false;
  let scenarioFailure = null;
  let scenarioEvidence = null;
  let dialog;
  const recordDiagnostic = (kind, message) => {
    const injectedQuotaMarker = String(message).includes(FAULT_MESSAGE);
    ++diagnosticCount;
    if (injectedQuotaMarker) ++injectedQuotaDiagnosticCount;
    if (diagnosticEvents.length < 30) diagnosticEvents.push({ kind, phase, injectedQuotaMarker });
  };
  const pageError = (error) => recordDiagnostic("pageerror", error.message);
  const consoleError = (message) => { if (message.type() === "error") recordDiagnostic("console", message.text()); };
  page.on("pageerror", pageError);
  page.on("console", consoleError);

  try {
    await assertNoMutations();
    await page.goto(`${app.origin}/staff/participants`, { waitUntil: "domcontentloaded" });
    assert.equal(new URL(page.url()).origin, app.origin);
    await page.getByRole("button", { name: "חניכה חדשה", exact: true }).waitFor({ state: "visible" });
    const before = await page.evaluate(async ({ database, draftKey, controlName, faultMessage, names: ownedNames, expectedName }) => {
      if (Object.hasOwn(window, controlName)) throw new Error("Another storage fault scenario is already active.");
      const account = window.Clerk?.loaded && window.Clerk.user?.id;
      if (!account) throw new Error("A real, currently loaded Clerk identity is required.");
      if (!Array.isArray(window.__mentoringQAMutations)) throw new Error("The owner's predispatch mutation guards are required.");
      const requestValue = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const open = () => new Promise((resolve, reject) => {
        const request = indexedDB.open(database);
        request.onupgradeneeded = () => { request.transaction.abort(); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("The existing authorized local database could not be opened."));
      });
      let scopeKey;
      let key;
      let baseline;
      const inspect = async () => {
        if (window.Clerk?.user?.id !== account) throw new Error("The authenticated account changed during the storage scenario.");
        const db = await open();
        try {
          const tx = db.transaction(["session", "drafts", "operations"], "readonly");
          const done = new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onabort = tx.onerror = () => reject(new Error("Read-only draft inspection failed."));
          });
          void done.catch(() => undefined);
          const session = await requestValue(tx.objectStore("session").get("active"));
          if (!session || session.scope.accountId !== account || session.snapshot.actor.active !== true) throw new Error("The local session does not belong to the currently authorized identity.");
          if (scopeKey && session.scope.key !== scopeKey) throw new Error("The authorized local scope changed during the storage scenario.");
          scopeKey ??= session.scope.key;
          key ??= JSON.stringify([scopeKey, draftKey]);
          const row = await requestValue(tx.objectStore("drafts").get(key));
          const operations = await requestValue(tx.objectStore("operations").index("scope").count(scopeKey));
          await done;
          if (row && (row.scopeKey !== scopeKey || row.draftKey !== draftKey || row.value?.kind !== "mentoring-form-draft-v1" || row.value.intent !== null)) throw new Error("The existing draft is not an ordinary unsubmitted form draft.");
          return { row, operations };
        } finally { db.close(); }
      };
      const initial = await inspect();
      if (initial.operations !== 0) throw new Error("The disposable QA scope already contains operations.");
      if (initial.row && (expectedName === null || initial.row.value.value?.displayName !== expectedName)) throw new Error("An existing draft is not owned by this QA scenario.");
      const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, "put");
      if (!descriptor?.value || descriptor.configurable !== true) throw new Error("The native draft put method cannot be safely restored.");
      let enabled = false;
      let hits = 0;
      let restored = false;
      const put = function (...args) {
        const row = args[0];
        if (enabled && window.Clerk?.user?.id === account && this.transaction.db.name === database && this.name === "drafts" &&
            row?.key === key && row.scopeKey === scopeKey && row.draftKey === draftKey &&
            row.value?.kind === "mentoring-form-draft-v1" && row.value.intent === null && row.value.value?.displayName === ownedNames.b) {
          ++hits;
          throw new DOMException(faultMessage, "QuotaExceededError");
        }
        return descriptor.value.apply(this, args);
      };
      const control = {
        enable(value) { enabled = value; },
        stats() { return { enabled, hits, restored }; },
        async markBaseline() {
          const state = await inspect();
          if (state.row?.value.value?.displayName !== ownedNames.a || state.operations !== 0) throw new Error("The baseline draft was not durably saved.");
          baseline = JSON.stringify(state.row);
        },
        async check(expectedName) {
          const state = await inspect();
          return { operations: state.operations, expectedName: state.row?.value.value?.displayName === expectedName, unchangedBaseline: JSON.stringify(state.row) === baseline };
        },
        restorePut() {
          enabled = false;
          if (restored) return;
          if (IDBObjectStore.prototype.put !== put) throw new Error("The put shim changed; do not overwrite another owner's method.");
          Object.defineProperty(IDBObjectStore.prototype, "put", descriptor);
          restored = true;
        },
        restore() {
          control.restorePut();
          if (window[controlName] === control) delete window[controlName];
        },
      };
      Object.defineProperty(window, controlName, { value: control, configurable: true });
      try { Object.defineProperty(IDBObjectStore.prototype, "put", { ...descriptor, value: put }); }
      catch (error) { delete window[controlName]; throw error; }
      return { existingOwnedDraft: Boolean(initial.row), operations: initial.operations };
    }, { database: DATABASE, draftKey: DRAFT_KEY, controlName: CONTROL, faultMessage: FAULT_MESSAGE, names, expectedName: expectedExistingDraftName });
    installed = true;
    assert.equal(before.operations, 0);

    await page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    const input = dialog.getByLabel("שם החניכה", { exact: true });
    await page.waitForFunction(() => { const input = document.getElementById("participant-name"); return input && !input.matches(":disabled"); });
    await input.fill(names.a);
    await page.waitForFunction(async ({ name, expected }) => (await window[name].check(expected)).expectedName, { name: CONTROL, expected: names.a });
    await dialog.getByText(SAVED, { exact: true }).waitFor({ state: "visible" });
    await page.evaluate((name) => window[name].markBaseline(), CONTROL);
    await assertNoMutations();

    phase = "injected-failure";
    await page.evaluate((name) => window[name].enable(true), CONTROL);
    await input.fill(names.b);
    await dialog.getByText(FAILED, { exact: true }).waitFor({ state: "visible" });
    assert.equal(await input.inputValue(), names.b);
    assert.equal(await dialog.getByText(SAVED, { exact: true }).count(), 0, "An unsuccessful write must not display saved feedback.");
    const retry = dialog.getByRole("button", { name: RETRY, exact: true });
    await retry.waitFor({ state: "visible" });
    let stored = await page.evaluate(({ name, expected }) => window[name].check(expected), { name: CONTROL, expected: names.a });
    assert.deepEqual(stored, { operations: 0, expectedName: true, unchangedBaseline: true });
    const firstHits = await page.evaluate((name) => window[name].stats().hits, CONTROL);
    assert.ok(firstHits >= 1);
    await retry.click();
    await page.waitForFunction(({ name, hits }) => window[name].stats().hits > hits, { name: CONTROL, hits: firstHits });
    await dialog.getByText(FAILED, { exact: true }).waitFor({ state: "visible" });
    assert.equal(await input.inputValue(), names.b);
    stored = await page.evaluate(({ name, expected }) => window[name].check(expected), { name: CONTROL, expected: names.a });
    assert.deepEqual(stored, { operations: 0, expectedName: true, unchangedBaseline: true });
    await assertNoMutations();
    const failureScreenshot = screenshot ? await screenshot("owned-draft-quota-failure") : null;

    phase = "retry-after-restoration";
    await page.evaluate((name) => window[name].restorePut(), CONTROL);
    await retry.click();
    await page.waitForFunction(async ({ name, expected }) => (await window[name].check(expected)).expectedName, { name: CONTROL, expected: names.b });
    await dialog.getByText(SAVED, { exact: true }).waitFor({ state: "visible" });
    assert.equal(await dialog.getByText(FAILED, { exact: true }).count(), 0);
    stored = await page.evaluate(({ name, expected }) => window[name].check(expected), { name: CONTROL, expected: names.b });
    assert.equal(stored.operations, 0);
    assert.equal(stored.expectedName, true);
    const injectedCalls = await page.evaluate((name) => window[name].stats().hits, CONTROL);

    phase = "reopen";
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByText(SAVED, { exact: true }).waitFor({ state: "visible" });
    assert.equal(await dialog.getByLabel("שם החניכה", { exact: true }).inputValue(), names.b);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    stored = await page.evaluate(({ name, expected }) => window[name].check(expected), { name: CONTROL, expected: names.b });
    assert.equal(stored.operations, 0);
    assert.equal(stored.expectedName, true);
    await assertNoMutations();
    return {
      injectedQuotaFailure: true,
      physicalStorageExhaustionTested: false,
      committedResponseLossTested: false,
      baselinePreservedDuringFailures: true,
      enteredValueRetained: true,
      retrySavedAndReopenedExactValue: true,
      nativePutRestoredBeforeRetry: true,
      operationsBefore: before.operations,
      operationsAfter: stored.operations,
      injectedCalls,
      diagnosticEvents: [...diagnosticEvents],
      injectedQuotaDiagnosticCount,
      otherDiagnosticCount: diagnosticCount - injectedQuotaDiagnosticCount,
      diagnosticEventsDropped: diagnosticCount - diagnosticEvents.length,
      failureScreenshot,
    };
  } catch (error) {
    scenarioFailure = error;
    scenarioEvidence = { phase, diagnosticEvents: [...diagnosticEvents], injectedQuotaDiagnosticCount, otherDiagnosticCount: diagnosticCount - injectedQuotaDiagnosticCount, diagnosticEventsDropped: diagnosticCount - diagnosticEvents.length };
    if (error && typeof error === "object") {
      try { Object.defineProperty(error, "storageFaultEvidence", { value: scenarioEvidence, configurable: true }); }
      catch { /* Preserve a nonextensible primary error without replacing it. */ }
    }
    throw error;
  } finally {
    try {
      try {
        if (installed) await page.evaluate((name) => {
          if (!window[name]) throw new Error("The owned storage fault control disappeared before cleanup.");
          window[name].restore();
        }, CONTROL);
      } catch (cleanupError) {
        const failure = scenarioFailure
          ? new AggregateError([scenarioFailure, cleanupError], "The storage scenario and its shim cleanup both failed.", { cause: scenarioFailure })
          : new Error("The storage scenario's put shim could not be restored.", { cause: cleanupError });
        failure.storageFaultEvidence = { ...(scenarioEvidence ?? { phase, diagnosticEvents: [...diagnosticEvents] }), cleanupFailed: true };
        throw failure;
      }
    } finally {
      page.off("pageerror", pageError);
      page.off("console", consoleError);
    }
  }
}
