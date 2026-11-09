import { createScheduledStaffSmsHandler } from "../../../../../lib/mentoring/features/staff-messages/scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createScheduledStaffSmsHandler({ secret: () => process.env.CRON_SECRET });

export const GET = handler;
export const HEAD = handler;
