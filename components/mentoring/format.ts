const ORGANIZATION_TIME_ZONE = "Asia/Jerusalem";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "טרם נקבע";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "מועד לא זמין";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: ORGANIZATION_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "טרם הוזן";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "מועד לא זמין";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: ORGANIZATION_TIME_ZONE,
    day: "numeric",
    month: "long",
  }).format(date);
}

/** A datetime-local control uses the organization's wall clock, not the device zone. */
export function toDateTimeInput(value: string | Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ORGANIZATION_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value: part }) => [type, part]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Reject clock-change gaps; use the earlier instant when a wall time occurs twice. */
export function fromDateTimeInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall)) return null;
  const offsets = new Set<number>();
  for (const delta of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = wall + delta * 3_600_000;
    const local = toDateTimeInput(new Date(sample));
    offsets.add(Date.parse(`${local}:00Z`) - sample);
  }
  const candidates = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => toDateTimeInput(new Date(instant)) === value)
    .sort((a, b) => a - b);
  return candidates.length ? new Date(candidates[0]).toISOString() : null;
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? "")
      .join("") || "ח"
  );
}
