import "server-only";

export const REMINDER_ACTOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function hostedReminderSchedulerConfigured(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return environment.VERCEL === "1" && environment.VERCEL_ENV === "production" &&
    Boolean(environment.CRON_SECRET?.trim()) && REMINDER_ACTOR_ID_PATTERN.test(environment.MENTORING_REMINDER_ACTOR_ID ?? "");
}
