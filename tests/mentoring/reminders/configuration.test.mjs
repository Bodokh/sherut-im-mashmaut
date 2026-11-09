import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "../server/typescript-loader.mjs";
import { hostedReminderSchedulerConfigured } from "../../../lib/mentoring/features/reminders/configuration.ts";
import { createScheduledReminderHandler } from "../../../lib/mentoring/features/reminders/scheduled.ts";
import { loadReminderExtras } from "../../../lib/mentoring/features/reminders/server.ts";

const actorId = "22222222-2222-4222-8222-222222222222";
const production = { VERCEL: "1", VERCEL_ENV: "production", CRON_SECRET: "unit-schedule-secret", MENTORING_REMINDER_ACTOR_ID: actorId };

test("hosted reminder readiness requires production hosting, a secret and a valid configured actor", () => {
  assert.equal(hostedReminderSchedulerConfigured(production), true);
  for (const patch of [
    { VERCEL: undefined }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" },
    { CRON_SECRET: undefined }, { CRON_SECRET: " " }, { MENTORING_REMINDER_ACTOR_ID: undefined }, { MENTORING_REMINDER_ACTOR_ID: "invalid" },
  ]) assert.equal(hostedReminderSchedulerConfigured({ ...production, ...patch }), false);
});

test("native five-minute reminder scheduling preserves the staff onboarding schedule", async () => {
  const config = JSON.parse(await readFile(new URL("../../../vercel.json", import.meta.url), "utf8"));
  for (const path of ["/api/internal/mentoring/reminders", "/api/internal/mentoring/staff-onboarding"]) {
    assert.deepEqual(config.crons.filter((cron) => cron.path === path), [{ path, schedule: "*/5 * * * *" }]);
  }
});

test("authenticated aggregate and workspace readiness use trusted hosted configuration", async () => {
  const previous = Object.fromEntries(Object.keys(production).map((key) => [key, process.env[key]]));
  Object.assign(process.env, production);
  try {
    const result = { state: "completed", scanned: 0, planned: 0, pages: 1, scanComplete: true, more: false,
      deliveryBlocked: false, considered: 0, claimed: 0,
      outcomes: { provider_accepted: 0, delivered: 0, failed: 0, uncertain: 0 }, hostedSchedulerConfigured: false };
    const handler = createScheduledReminderHandler({ secret: () => production.CRON_SECRET, actorId: () => actorId, run: async () => result });
    const response = await handler(new Request("https://example.test/api/internal/mentoring/reminders", { headers: { authorization: `Bearer ${production.CRON_SECRET}` } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).hostedSchedulerConfigured, true);
    const client = { query: async (sql) => {
      assert.match(sql, /FROM mentoring.organization_settings/);
      return { rows: [] };
    } };
    const { reminderReadiness } = await loadReminderExtras(client, { organizationId: "org", id: actorId, active: true, role: "ceo" }, []);
    assert.equal(reminderReadiness.hostedSchedulerConfigured, true);
    assert.equal(reminderReadiness.evaluationMode, "hosted_and_manual");
    assert.equal(reminderReadiness.blockedReasons.includes("hosted_scheduler_not_configured"), false);
    delete process.env.VERCEL;
    const manual = (await loadReminderExtras(client, { organizationId: "org", id: actorId, active: true, role: "ceo" }, [])).reminderReadiness;
    assert.equal(manual.hostedSchedulerConfigured, false);
    assert.equal(manual.evaluationMode, "manual_and_cli");
    assert.equal(manual.blockedReasons.includes("hosted_scheduler_not_configured"), true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
