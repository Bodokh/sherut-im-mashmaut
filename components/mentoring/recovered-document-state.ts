import type { WorkspaceSnapshot } from "../../lib/mentoring/contracts";

export interface RecoveredDocumentRow { readonly label: string; readonly value: string; readonly date?: "local" | "instant" }
export interface RecoveredDocument { readonly title: string; readonly participantName: string | null; readonly rows: readonly RecoveredDocumentRow[]; readonly orphan: boolean; readonly href: string | null }

const labels: Record<string, string> = {
  displayName: "שם", email: "דוא״ל", phone: "טלפון", role: "תפקיד בצוות", coordinatorId: "רכז/ת", mentorId: "חונך/ת", serviceType: "סוג השירות", servicePlace: "מקום השירות", serviceRole: "תפקיד בשירות", profileNotes: "מידע נוסף לליווי", appointment: "הפגישה הבאה", assignment: "שיוך לצוות הליווי",
  method: "דרך הקשר", outcome: "תוצאת הקשר", occurredAt: "מועד הקשר בפועל", nextAppointmentAt: "מועד הקשר הבא", scheduledAt: "מועד הפגישה", notes: "סיכום הקשר", manualColor: "דיווח הצבע", color: "דיווח הצבע", reason: "סיבת השינוי", lifecycle: "מצב הליווי", active: "גישה פעילה", muted: "השתקת תזכורות SMS", summary: "סיכום", reviewed: "הבדיקה הושלמה", actions: "הרשאות", grantAction: "פעולת ההרשאה", staffId: "חבר/ת צוות", expiresAtLocal: "תוקף ההרשאה", expiresAt: "תוקף ההרשאה", resourceId: "הרשומה להגנה", protectionMode: "היקף ההגנה", fieldPaths: "הפרטים להגנה", decision: "החלטת הבקרה",
  offlineLeaseHours: "תוקף עבודה ללא חיבור בשעות", reminderAudience: "קהל התזכורות", appointmentReminderMinutesBefore: "דקות לפני הפגישה לשליחת תזכורת", overdueRemindersEnabled: "תזכורות על איחור", overdueRepeatHours: "שעות בין תזכורות חוזרות",
};
const values: Record<string, string> = { national: "שירות לאומי", military: "שירות צבאי", mentor: "חונך/ת", coordinator: "רכז/ת", ceo: "מנכ״ל", phone: "שיחה טלפונית", in_person: "פגישה פנים אל פנים", completed: "הקשר התקיים", no_answer: "ללא מענה", green: "ירוק", orange: "כתום", red: "אדום", unchanged: "ללא שינוי", none: "ללא שיוך", unknown: "טרם נבחר", active: "בליווי פעיל", paused: "הליווי בהשהיה", closed: "הליווי הסתיים", view: "צפייה", edit: "עריכה", approve: "אישור דיווחים", set: "הגדרת הרשאה", revoke: "ביטול הרשאה", whole: "הרשומה כולה", fields: "פרטים מסוימים", unlock: "הסרת הגנה", approved: "אישור הדיווח", returned_for_correction: "החזרה להשלמה", keep_ceo: "שמירת גרסת המנכ״ל", management: "צוות ההנהלה", all_staff: "כל הצוות", mentors: "חונכים וחונכות" };
const technical = new Set(["kind", "intent", "operationId", "signature", "type", "key", "successMessage", "baseVersion", "baseTargetVersion", "expectedVersion", "expectedRevision", "expectedAppointmentVersion", "expectedGrantVersion", "expectedProtectionVersion", "contactRevision", "appointmentVersion", "sourceOccurredAt", "revision", "contactId", "conflictId", "participantId"]);
const timeFields = new Set(["occurredAt", "nextAppointmentAt", "scheduledAt", "expiresAtLocal", "expiresAt"]);
const namedFields = new Set(["staffId", "mentorId", "coordinatorId"]);
const enumFields = new Set(["role", "serviceType", "method", "outcome", "manualColor", "color", "lifecycle", "grantAction", "protectionMode", "decision", "reminderAudience", "mentorId", "coordinatorId"]);
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

/** Render only the already-authorized recovery document supplied by context.
 * Prepared command identities and concurrency metadata never enter this view. */
export function recoveredDocument(key: string, stored: unknown, snapshot: Pick<WorkspaceSnapshot, "staff" | "participants">): RecoveredDocument {
  const envelope = record(stored);
  const value = record(envelope?.kind === "mentoring-form-draft-v1" ? envelope.value : stored);
  const parts = key.split(":");
  const prefix = parts[0];
  const participantId = prefix === "contact-action" ? parts[2] : ["contact", "assignment", "participant-profile"].includes(prefix) ? parts[1] : prefix === "authority" ? parts[2] : undefined;
  const participant = snapshot.participants.find((view) => view.participant.id === participantId)?.participant;
  const participantForm = ["contact", "contact-action", "assignment", "participant-profile", "authority"].includes(prefix);
  const orphan = participantForm && participantId !== "new" && !participant;
  const titles: Record<string, string> = { contact: "טיוטת תיעוד קשר", "contact-action": "טיוטת שינוי בדיווח או במעקב", assignment: "טיוטת שיוך לצוות הליווי", "participant-profile": "טיוטת פרטי חניכה", authority: "טיוטת פעולה ניהולית בכרטיס", "staff-preapproval": "טיוטת חברות בצוות", "staff-edit": "טיוטת עריכת פרטי צוות", "staff-access": "טיוטת שינוי גישה לצוות", "monthly-review": "טיוטת בקרה חודשית", "organization-settings": "טיוטת הגדרות הארגון", "management-action": "טיוטת החלטה ניהולית" };
  const href = orphan ? null : participant ? prefix === "contact" ? `/staff/contacts/new?participant=${encodeURIComponent(participant.id)}` : `/staff/participants/${encodeURIComponent(participant.id)}` : prefix === "participant-profile" ? "/staff/participants" : prefix.startsWith("staff-") ? "/staff/team" : prefix === "monthly-review" ? "/staff/oversight" : prefix === "organization-settings" ? "/staff/settings" : null;
  const rows: RecoveredDocumentRow[] = [];
  let context = "";
  if (prefix === "monthly-review") {
    const month = /^(\d{4})-(\d{2})$/.exec(parts[1] ?? "");
    if (month) rows.push({ label: "חודש הבקרה", value: `${month[2]}/${month[1]}` });
    const scope = parts[2];
    const scopeName = !scope || scope === "organization" ? "כלל הארגון" : snapshot.staff.find((member) => member.id === scope)?.displayName;
    rows.push({ label: "צוות הבקרה", value: scopeName ?? `שם לא זמין ברשימת הצוות העדכנית (מזהה לאיתור: ${scope})` });
    context = [month ? `${month[2]}/${month[1]}` : null, scopeName ?? "צוות שאינו ברשימה העדכנית"].filter(Boolean).join(" · ");
  }
  if ((prefix === "staff-edit" || prefix === "staff-access") && parts[1]) {
    const name = snapshot.staff.find((member) => member.id === parts[1])?.displayName;
    rows.push({ label: "חבר/ת הצוות בטיוטה", value: name ?? `שם לא זמין ברשימת הצוות העדכנית (מזהה לאיתור: ${parts[1]})` });
    context = name ?? "שם לא זמין ברשימת הצוות העדכנית";
  }
  function describe(field: string, input: unknown, depth = 0) {
    if (technical.has(field) || depth > 3) return;
    const nested = record(input);
    if (nested) { for (const [child, childValue] of Object.entries(nested)) describe(child, childValue, depth + 1); return; }
    if (Array.isArray(input)) {
      rows.push({ label: labels[field] ?? "פרטים נוספים שנשמרו", value: input.map((item) => typeof item === "string" ? labels[item] ?? values[item] ?? item : typeof item === "number" || typeof item === "boolean" ? String(item) : "פרט נוסף").join(", ") || "לא נבחרו פרטים" });
      return;
    }
    if (!["string", "number", "boolean"].includes(typeof input) && input !== null) return;
    let text = input === null || input === "" ? "טרם הוזן" : typeof input === "boolean" ? input ? "כן" : "לא" : String(input);
    if (typeof input === "string" && namedFields.has(field) && input && input !== "none") text = snapshot.staff.find((member) => member.id === input)?.displayName ?? "שם לא זמין ברשימת הצוות העדכנית";
    else if (field === "resourceId" && typeof input === "string") text = snapshot.participants.some((view) => view.participant.id === input) ? "כרטיס החניכה" : "דיווח קשר";
    else if (typeof input === "string" && enumFields.has(field)) text = input === "responsible_team" ? "הצוות האחראי לליווי" : values[input] ?? text;
    const date = typeof input === "string" && input && timeFields.has(field) ? /(?:Z|[+-]\d\d:\d\d)$/.test(input) ? "instant" as const : "local" as const : undefined;
    rows.push({ label: labels[field] ?? "פרט נוסף שנשמר", value: text, ...(date ? { date } : {}) });
  }
  if (value) for (const [field, input] of Object.entries(value)) describe(field, input);
  else if (typeof stored === "string" && stored) rows.push({ label: "תוכן הטיוטה", value: stored });
  const title = titles[prefix] ?? "טיוטה ששוחזרה";
  return { title: context ? `${title} · ${context}` : title, participantName: participant?.displayName ?? null, orphan, href, rows };
}
