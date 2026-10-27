import type { ParticipantView, StaffProfile } from "../../lib/mentoring/contracts";

export interface ParticipantHistoryItem {
  readonly key: string;
  readonly title: string;
  readonly at: string;
  readonly actor: string;
  readonly pending?: boolean;
  readonly localTime?: boolean;
  readonly lines: readonly string[];
  readonly relatedTimes?: readonly { readonly label: string; readonly at: string }[];
}

const lifecycleNames: Record<string, string> = { active: "בליווי פעיל", paused: "הליווי בהשהיה", closed: "הליווי הסתיים" };
const colorNames: Record<string, string> = { green: "ירוק", orange: "כתום", red: "אדום" };
const actionNames: Record<string, string> = {
  set_access_grant: "עדכון הרשאה אישית",
  set_ceo_protection: "עדכון הגנת המנכ״ל",
  set_participant_lifecycle: "שינוי מצב הליווי",
  delete_participant: "העברה לסל המחזור",
  restore_participant: "שחזור מסל המחזור",
  assign_participant: "עדכון שיוך לליווי",
  create_participant: "פתיחת הכרטיס",
  update_participant: "עדכון פרטי הכרטיס",
};
const fieldNames: Record<string, string> = { displayName: "שם", phone: "טלפון", serviceType: "סוג שירות", servicePlace: "מקום השירות", serviceRole: "תפקיד בשירות", profileNotes: "הערות לכרטיס", lifecycle: "מצב הליווי", assignment: "שיוך לצוות", contacts: "דיווחי קשר", manualColor: "דיווח הצבע", appointment: "הפגישה הבאה", nextAppointment: "הפגישה הבאה", method: "דרך הקשר", outcome: "תוצאת הקשר", occurredAt: "מועד הקשר", notes: "סיכום הקשר", invalidatedAt: "ביטול הדיווח" };
const grantNames: Record<string, string> = { view: "צפייה", edit: "עריכה", approve: "אישור דיווחים" };

function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function isPending(value: object): boolean { return "localPending" in value && value.localPending === true; }
function localTime(value: object): boolean { return isPending(value) || ("localTimestamp" in value && value.localTimestamp === true); }

/** Build readable, attributed entries from accepted evidence. Unknown audit
 * details are deliberately not printed as JSON or substituted for evidence. */
export function participantHistory(view: ParticipantView, staff: readonly Pick<StaffProfile, "id" | "displayName">[]): ParticipantHistoryItem[] {
  const name = (id: string | null | undefined) => staff.find((member) => member.id === id)?.displayName ?? "שם לא זמין ברשימת הצוות הנוכחית";
  const items: ParticipantHistoryItem[] = [];
  for (const revision of view.contactRevisions ?? []) {
    items.push({ key: `contact:${revision.id}:${revision.revision}`, title: revision.changeKind === "invalidation" ? "ביטול דיווח קשר" : revision.changeKind === "correction" ? "תיקון דיווח קשר" : "תיעוד קשר", at: revision.revisedAt, actor: name(revision.revisedByStaffId), pending: isPending(revision), localTime: localTime(revision), lines: [
      `גרסה ${revision.revision} · ${revision.method === "phone" ? "שיחה טלפונית" : "פגישה פנים אל פנים"} · ${revision.outcome === "completed" ? "הקשר התקיים" : "לא היה מענה"}`,
      `הדיווח המקורי נרשם על ידי ${name(revision.actorId)}`,
      ...(revision.reason ? [`סיבה: ${revision.reason}`] : []),
      ...(revision.notes ? [revision.notes] : []),
    ], relatedTimes: [{ label: "מועד הקשר", at: revision.occurredAt }] });
  }
  for (const review of view.reviewEvents ?? []) {
    items.push({ key: `review:${review.id}`, title: review.decision === "approved" ? "אישור דיווח קשר" : "החזרת דיווח להשלמה", at: review.reviewedAt, actor: name(review.reviewedByStaffId), pending: isPending(review), localTime: localTime(review), lines: [`ההחלטה מתייחסת לגרסה ${review.revision} של הדיווח.`] });
  }
  for (const change of view.manualColorHistory ?? []) {
    items.push({ key: `color:${change.id}`, title: "עדכון דיווח צבע", at: change.setAt, actor: name(change.setByStaffId), pending: isPending(change), localTime: localTime(change), lines: [`דיווח החונך/ת: ${colorNames[change.color]}`, ...(change.reason ? [`סיבה: ${change.reason}`] : [])] });
  }
  for (const change of view.appointmentHistory ?? []) {
    items.push({ key: `appointment:${change.id}`, title: change.changeKind === "prior_state" ? "מועד הפגישה שנשמר לפני שינוי" : change.changeKind === "rescheduled" ? "שינוי מועד הפגישה" : "עדכון הפגישה בעקבות דיווח קשר", at: change.changedAt, actor: name(change.changedByStaffId), pending: isPending(change), localTime: localTime(change), lines: [
      `חונך/ת: ${name(change.mentorId)} · גרסת הפגישה ${change.appointmentVersion}`,
      ...(change.requiresReview ? ["מועד הפגישה דורש בדיקה בעקבות שינוי בדיווח."] : []),
      ...(change.reason ? [`סיבה: ${change.reason}`] : []),
    ], relatedTimes: [{ label: "הפגישה שנקבעה", at: change.scheduledAt }] });
  }
  for (const assignment of view.assignmentHistory ?? []) {
    const evidence = view.authorityHistory?.find((event) => event.action === "assign_participant" && event.details.assignmentVersion === assignment.version && event.details.mentorId === assignment.mentorId);
    items.push({ key: `assignment:${assignment.id}`, title: assignment.endedAt ? "שיוך קודם לליווי" : "שיוך לליווי", at: assignment.assignedAt, actor: evidence ? name(evidence.actorId) : "זהות מבצע/ת הפעולה אינה כלולה ברשומה הזמינה", pending: isPending(assignment), localTime: localTime(assignment), lines: [`חונך/ת: ${name(assignment.mentorId)}`, `רכז/ת: ${assignment.coordinatorId ? name(assignment.coordinatorId) : "לא הוגדר שיוך"}`], ...(assignment.endedAt ? { relatedTimes: [{ label: "סיום השיוך", at: assignment.endedAt }] } : {}) });
  }
  for (const event of view.authorityHistory ?? []) {
    const details = event.details;
    const specificFields = Array.isArray(details.fieldPaths) && details.fieldPaths.length > 0;
    const fields = Array.isArray(details.fieldPaths) ? details.fieldPaths.filter((field): field is string => typeof field === "string" && Boolean(fieldNames[field])) : [];
    const actions = Array.isArray(details.actions) ? details.actions.filter((action): action is string => typeof action === "string" && Boolean(grantNames[action])) : [];
    const reason = text(details.reason);
    items.push({ key: `authority:${event.id}`, title: actionNames[event.action] ?? "עדכון ניהולי בכרטיס", at: event.createdAt, actor: name(event.actorId), pending: isPending(event), localTime: localTime(event), lines: [
      ...(text(details.staffId) ? [`חבר/ת צוות: ${name(text(details.staffId))}`] : []),
      ...(event.action === "set_access_grant" ? [actions.length ? `הרשאות: ${actions.map((action) => grantNames[action]).join(", ")}` : "ההרשאה בוטלה"] : []),
      ...(event.action === "set_ceo_protection" ? [details.active === false ? "ההגנה הוסרה במפורש" : fields.length ? `פרטים מוגנים: ${fields.map((field) => fieldNames[field]).join(", ")}` : specificFields ? "הגנה על פרטים מסוימים שאינם מפורטים בתצוגה זו" : "הגנה על הרשומה כולה"] : []),
      ...(typeof details.lifecycle === "string" && lifecycleNames[details.lifecycle] ? [`מצב הליווי: ${lifecycleNames[details.lifecycle]}`] : []),
      ...(reason ? [`סיבה: ${reason}`] : []),
    ], ...(text(details.expiresAt) ? { relatedTimes: [{ label: "תוקף ההרשאה", at: text(details.expiresAt)! }] } : {}) });
  }
  return items.sort((left, right) => {
    const leftTime = Date.parse(left.at); const rightTime = Date.parse(right.at);
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime) || left.key.localeCompare(right.key);
  });
}
