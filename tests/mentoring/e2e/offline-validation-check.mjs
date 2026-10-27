import assert from "node:assert/strict";

// These scenarios use real authentication and real writes to run-owned fixtures.
// Response interception is deliberately limited to a single known command.
async function localState(page, draftKey) {
  return page.evaluate(async (key) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sherut-mentoring-private-v1");
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const tx = db.transaction(["session", "operations", "drafts"], "readonly");
      const read = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const [session, operations, drafts] = await Promise.all([
        read(tx.objectStore("session").get("active")),
        read(tx.objectStore("operations").getAll()),
        read(tx.objectStore("drafts").getAll()),
      ]);
      if (!session || session.scope.accountId !== window.Clerk?.user?.id) throw new Error("Unexpected local account scope");
      return {
        operations: operations.filter((row) => row.scopeKey === session.scope.key),
        draft: drafts.find((row) => row.scopeKey === session.scope.key && row.draftKey === key) ?? null,
      };
    } finally { db.close(); }
  }, draftKey);
}

export async function runOfflineValidationChecks(h) {
  const { page } = h;
  const participantId = h.fixture.participantId;
  const draftKey = `participant-profile:${participantId}`;
  const open = async (recovering = false) => {
    await h.openParticipant(participantId, "פרטי החניכה והליווי");
    await page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    const dialog = page.getByRole("dialog");
    if (!recovering) await h.poll(() => dialog.locator("#participant-place").isEnabled(), Boolean, 10000);
    return dialog;
  };
  for (const fault of ["501", "429", "unknown-400", "network"]) {
    await h.scenario(`Simulated ${fault} after a real commit preserves and retries the same command`, async () => {
      const before = (await h.participant()).participant;
      const value = `בדיקת דפדפן ${h.runId} ${fault}`;
      const dialog = await open();
      await dialog.locator("#participant-place").fill(value);
      let command, firstResult, replayResult;
      const attempts = [];
      const handler = async (route) => {
        const request = route.request();
        if (request.method() !== "POST") return route.fallback();
        const current = request.postDataJSON();
        if (current.type !== "update_participant" || current.participantId !== participantId || current.fields.servicePlace !== value) {
          await route.abort("blockedbyclient"); throw new Error("Unexpected command during isolated response fault");
        }
        h.track(current); await h.saveManifest();
        attempts.push(current);
        if (attempts.length > 2) { await route.abort("blockedbyclient"); throw new Error("Unexpected duplicate attempt"); }
        const upstream = await route.fetch();
        const result = await upstream.json();
        if (attempts.length === 1) {
          command = current; firstResult = result;
          assert.equal(result.ok, true); assert.equal(result.acceptance, "accepted"); assert.equal(result.replayed, false);
          if (fault === "network") return route.abort("failed");
          const status = fault === "unknown-400" ? 400 : Number(fault);
          const body = fault === "unknown-400" ? { ok: false, error: { code: "proxy_unknown", message: "QA_SECRET_SERVER_DETAIL" } } : { ok: false, error: { code: "unavailable", message: "QA_SECRET_SERVER_DETAIL" } };
          return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        }
        replayResult = result;
        await route.fulfill({ response: upstream });
      };
      await page.route("**/api/mentoring/commands", handler);
      try {
        await dialog.getByRole("button", { name: "שמירת פרטים", exact: true }).click();
        await h.poll(() => localState(page, draftKey), (state) => state.operations.some((row) => row.command.operationId === command?.operationId && row.status === "pending"));
        await dialog.waitFor({ state: "hidden" });
        assert.equal(firstResult.operationId, command.operationId);
        const pending = (await localState(page, draftKey)).operations.find((row) => row.command.operationId === command.operationId);
        assert.deepEqual(pending.command, command);
        assert.equal((await h.participant()).participant.servicePlace, value, "The real first request committed before its response was replaced");
        assert.equal((await h.participant()).participant.version, before.version + 1);
        assert.doesNotMatch(await page.locator("body").innerText(), /QA_SECRET_SERVER_DETAIL|proxy_unknown/);
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await h.poll(() => localState(page, draftKey), (state) => !state.operations.some((row) => row.command.operationId === command.operationId));
        await h.poll(() => Promise.resolve(replayResult), Boolean);
        assert.deepEqual(attempts, [command, command]);
        assert.equal(replayResult.ok, true); assert.equal(replayResult.replayed, true);
        assert.equal(replayResult.operationId, command.operationId);
        await new Promise((resolve) => setTimeout(resolve, 750));
        assert.equal(attempts.length, 2);
        const after = (await h.participant()).participant;
        assert.equal(after.version, before.version + 1); assert.equal(after.servicePlace, value);
        const rows = await h.database.query("SELECT (SELECT count(*) FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3)::int AS receipts, (SELECT count(*) FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3)::int AS audits", [h.manifest.organizationId, h.actorId, command.operationId]);
        assert.deepEqual(rows.rows[0], { receipts: 1, audits: 1 });
        return { fault: `simulated ${fault} after real accepted commit`, operationId: command.operationId, immutableAttempts: 2, acceptedWrites: 1, replayedReceipt: true, serverDetailHidden: true };
      } finally { await page.unroute("**/api/mentoring/commands", handler); }
    });
  }

  await h.scenario("Prepared draft survives failed cleanup and reload without a second write", async () => {
    const dialog = await open();
    const value = `בדיקת דפדפן ${h.runId} prepared reload`;
    await dialog.locator("#participant-notes").fill(value);
    await dialog.getByText("הטיוטה נשמרה במכשיר הזה", { exact: true }).waitFor({ state: "visible" });
    await page.evaluate((key) => {
      const original = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, "delete");
      if (!original?.configurable || window.__ownedDraftDelete) throw new Error("Cannot install owned delete fault");
      const shim = function (...args) {
        let parsed; try { parsed = JSON.parse(args[0]); } catch { /* Not a draft key. */ }
        if (this.transaction.db.name === "sherut-mentoring-private-v1" && this.name === "drafts" && parsed?.[1] === key) throw new DOMException("QA draft cleanup fault", "QuotaExceededError");
        return original.value.apply(this, args);
      };
      window.__ownedDraftDelete = { original, shim };
      Object.defineProperty(IDBObjectStore.prototype, "delete", { ...original, value: shim });
    }, draftKey);
    let installed = true;
    const restore = () => page.evaluate(() => {
      const state = window.__ownedDraftDelete;
      if (!state || IDBObjectStore.prototype.delete !== state.shim) throw new Error("Owned delete fault changed");
      Object.defineProperty(IDBObjectStore.prototype, "delete", state.original); delete window.__ownedDraftDelete;
    });
    try {
      const before = (await h.participant()).participant;
      const { command } = await h.action("update_participant", () => dialog.getByRole("button", { name: "שמירת פרטים", exact: true }).click());
      await dialog.waitFor({ state: "hidden" });
      const draft = (await localState(page, draftKey)).draft;
      assert.equal(draft.value.value.profileNotes, value);
      assert.equal(draft.value.value.baseVersion, before.version);
      assert.equal(draft.value.intent.operationId, command.operationId);
      assert.deepEqual(JSON.parse(draft.value.intent.signature), { type: command.type, participantId, expectedVersion: before.version, fields: command.fields });
      await restore(); installed = false;
      const postsBefore = h.commandRequestCount;
      await page.reload({ waitUntil: "domcontentloaded" });
      const recovered = await open(true);
      await recovered.getByText("נמצאה שמירה קודמת של הטיוטה", { exact: true }).waitFor({ state: "visible" });
      await recovered.getByText(value, { exact: true }).waitFor({ state: "visible" });
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.equal(h.commandRequestCount, postsBefore, "Local accepted receipt must prevent a second POST on recovery");
      assert.equal((await h.participant()).participant.version, before.version + 1);
      await recovered.getByRole("button", { name: "סגירת הטיוטה ומעבר לכרטיס", exact: true }).click();
      await h.poll(() => localState(page, draftKey), (state) => state.draft === null);
      return { simulatedCleanupFailure: true, savedVersionAndValueRestored: true, operationId: command.operationId, duplicatePosts: 0 };
    } finally { if (installed) await restore(); }
  });
}
