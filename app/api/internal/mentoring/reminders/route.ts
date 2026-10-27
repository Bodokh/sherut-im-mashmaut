import { createScheduledReminderHandler } from "../../../../../lib/mentoring/features/reminders/scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const handler = createScheduledReminderHandler({
  secret: () => process.env.CRON_SECRET,
  actorId: () => process.env.MENTORING_REMINDER_ACTOR_ID,
});

export const GET = handler;
export const HEAD = handler;
