"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Info, Pencil, ShieldCheck, UserRoundCheck, UserRoundMinus, UserRoundPlus, Users, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/staff/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/staff/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/staff/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";
import { PhoneInput } from "@/components/staff/ui/phone-input";
import { parseCommand } from "@/lib/mentoring/validation";
import { normalizePhoneNumber } from "@/lib/phone";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/staff/ui/select";
import { Spinner } from "@/components/staff/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/staff/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/staff/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/staff/ui/tooltip";
import type { ApiFailure, CommandSuccess, StaffProfile } from "@/lib/mentoring/contracts";
import type { StaffRole } from "@/lib/mentoring/domain";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { cn } from "@/lib/mentoring/ui-utils";
import { DraftStatus, useFormDraft } from "./form-draft";
import { changedStaffFields, isPendingStaffPreapproval, staffEditValues } from "./staff-form-state";

const roleLabels: Record<StaffRole, string> = { mentor: "חונך/ת", coordinator: "רכז/ת", ceo: "מנכ״ל" };
function ActionError({ message }: { message: string | null }) {
  return message ? <Alert variant="destructive"><Info aria-hidden="true" /><AlertTitle>הפעולה לא הושלמה</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null;
}
function FieldFailure({ failure, field, formId }: { failure: ApiFailure["error"] | null; field: string; formId: string }) {
  return failure?.field?.split(".").at(-1) === field ? <p id={`${formId}-${field}-error`} role="alert" className="text-sm text-destructive">{failure.message}</p> : null;
}
function OfflineNotice() {
  const { isOnline } = useWorkspace();
  return !isOnline ? <Alert><WifiOff aria-hidden="true" /><AlertTitle>הבקשה תישמר במכשיר עד לחידוש החיבור</AlertTitle><AlertDescription>השינוי ייכנס לתוקף רק לאחר בדיקת ההרשאות ואישור המערכת. עד אז פרטי הגישה והתפקיד המוצגים נשארים לפי המידע האחרון שאושר.</AlertDescription></Alert> : null;
}
function RecoveredStaffSave({ result, clear, onClose, children }: { result: CommandSuccess; clear: () => Promise<void>; onClose: () => void; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="flex flex-col gap-5">
    <Alert><CheckCircle2 aria-hidden="true" /><AlertTitle>נמצאה שמירה קודמת של הבקשה</AlertTitle><AlertDescription>{result.acceptance === "queued" ? "הבקשה כבר שמורה במכשיר וממתינה לאישור המערכת. אין צורך לשלוח אותה שוב; הרשאות חדשות עדיין אינן בתוקף." : "הבקשה הקודמת כבר התקבלה במערכת. אין צורך לשלוח אותה שוב."}</AlertDescription></Alert>
    {children}
    <ActionError message={error} />
    <DialogFooter><Button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError(null);
      try { await clear(); onClose(); }
      catch { setError("לא ניתן לנקות את הטיוטה כרגע. זהות השמירה הקודמת נשארה שמורה לניסיון נוסף."); setBusy(false); }
    }}>{busy && <Spinner data-icon="inline-start" />}סגירת הטיוטה</Button></DialogFooter>
  </div>;
}
function VersionNotice({ stale, children, onReview }: { stale: boolean; children: ReactNode; onReview: () => void }) {
  if (!stale) return null;
  return <Alert><Info aria-hidden="true" /><AlertTitle>פרטי הצוות עודכנו מאז תחילת הטיוטה</AlertTitle><AlertDescription><div className="flex flex-col items-start gap-3"><p>הטיוטה נשמרה. יש לבדוק את הפרטים העדכניים לפני שליחת בקשה חדשה.</p>{children}<Button type="button" variant="outline" onClick={onReview}>בדקתי את הפרטים, המשך עם הטיוטה</Button></div></AlertDescription></Alert>;
}
function AddStaffDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return <Dialog open={open} onOpenChange={(next, details) => { if (busy) details.cancel(); else setOpen(next); }}>
    <DialogTrigger render={<Button />}><UserRoundPlus data-icon="inline-start" />הוספת חבר/ת צוות</DialogTrigger>
    <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>הוספת חבר/ת צוות</DialogTitle><DialogDescription>אישור מראש של חברות בצוות, לפי כתובת דוא״ל אישית ומדויקת.</DialogDescription></DialogHeader>
      {open && <StaffPreapprovalForm onClose={() => setOpen(false)} onBusyChange={setBusy} />}
    </DialogContent>
  </Dialog>;
}
function StaffPreapprovalForm({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { snapshot, submit } = useWorkspace();
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure["error"] | null>(null);
  const submitting = useRef(false);
  const draft = useFormDraft("staff-preapproval:new", { displayName: "", email: "", phone: "", role: "mentor" as "mentor" | "coordinator", coordinatorId: "none" });
  if (!snapshot || snapshot.actor.role === "mentor") return null;
  const values = draft.value;
  const { actor, staff } = snapshot;
  const isCeo = actor.role === "ceo";
  const effectiveRole = isCeo ? values.role : "mentor";
  const coordinators = staff.filter((member) => (member.active || isPendingStaffPreapproval(member)) && member.role === "coordinator" && member.organizationId === actor.organizationId);
  const items = [{ value: "none", label: "ללא שיוך לרכז/ת" }, ...coordinators.map((member) => ({ value: member.id, label: member.displayName + (isPendingStaffPreapproval(member) ? " · בקשת חברות ממתינה לאישור" : "") }))];
  const invalidField = failure?.field?.split(".").at(-1);
  function update<K extends keyof typeof values>(field: K, value: typeof values[K]) { draft.update({ ...values, [field]: value }); if (invalidField === field) setFailure(null); }
  function fail(error: ApiFailure["error"]) { setFailure(error); const field = error.field?.split(".").at(-1); const suffix: Record<string, string> = { displayName: "name", email: "email", phone: "phone", role: "role-mentor", coordinatorId: "coordinator" }; if (field && suffix[field]) document.getElementById(`${formId}-${suffix[field]}`)?.focus(); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || snapshot.actor.role === "mentor" || !draft.hydrated || submitting.current) return;
    if (!values.displayName.trim()) { fail({ code: "validation", field: "displayName", message: "יש להזין את שם חבר/ת הצוות." }); return; }
    if (values.displayName.trim().length > 200) { fail({ code: "validation", field: "displayName", message: "שם מלא יכול להכיל עד 200 תווים. יש לקצר את השם." }); return; }
    if (values.phone.trim() && !normalizePhoneNumber(values.phone)) { fail({ code: "validation", field: "phone", message: "יש להזין מספר טלפון תקין עם קידומת מדינה, או למחוק את המספר." }); return; }
    if (isCeo && values.role !== "mentor" && values.role !== "coordinator") { fail({ code: "validation", field: "role", message: "יש לבחור תפקיד: חונך/ת או רכז/ת." }); return; }
    if (isCeo && effectiveRole === "mentor" && values.coordinatorId !== "none" && !coordinators.some((member) => member.id === values.coordinatorId)) { fail({ code: "validation", field: "coordinatorId", message: "השיוך שנבחר אינו זמין עוד. יש לבחור רכז/ת עם גישה פעילה או להסיר את השיוך." }); return; }
    const payload = { type: "create_staff" as const, fields: { displayName: values.displayName.trim(), email: values.email.trim().toLowerCase(), phone: normalizePhoneNumber(values.phone) ?? (values.phone.trim() || null), role: effectiveRole, coordinatorId: effectiveRole === "coordinator" ? null : isCeo ? values.coordinatorId === "none" ? null : values.coordinatorId : actor.id } };
    const validation = parseCommand({ ...payload, operationId: crypto.randomUUID() });
    if (!validation.ok) { fail(validation.error); return; }
    submitting.current = true; setBusy(true); onBusyChange(true); setFailure(null);
    let prepared = false;
    try {
      const operationId = await draft.prepare(payload);
      prepared = true;
      const result = await submit({ ...payload, operationId });
      if (!result.ok) { fail(result.error); draft.recheck(); return; }
      try { await draft.clear(); } catch { toast.warning("הבקשה נשמרה. הטיוטה תיבדק לפי אותה פעולת שמירה בפתיחה הבאה."); }
      onClose();
      if (result.acceptance === "queued") toast.message("בקשת החברות נשמרה במכשיר וממתינה לאישור. טרם ניתנה גישה.");
      else toast.success("החברות בצוות אושרה מראש. לא נשלחה הזמנה.");
    } catch { setFailure({ code: "unavailable", message: prepared ? "לא התקבל אישור מהמערכת. זהות הבקשה נשמרה ותיבדק לניסיון נוסף." : "לא ניתן להכין את הבקשה לשמירה. הפרטים נשארו בטופס; יש להשאיר אותו פתוח, לבדוק את מצב הטיוטה ולנסות שוב." }); if (prepared) draft.recheck(); }
    finally { submitting.current = false; setBusy(false); onBusyChange(false); }
  }
  if (draft.recovered) return <RecoveredStaffSave result={draft.recovered} clear={draft.clear} onClose={onClose}><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm"><dt>שם</dt><dd>{values.displayName}</dd><dt>כתובת דוא״ל</dt><dd dir="ltr" className="break-all">{values.email}</dd><dt>תפקיד מבוקש</dt><dd>{roleLabels[effectiveRole]}</dd></dl></RecoveredStaffSave>;
  return <form onSubmit={save} noValidate className="flex flex-col gap-5">
    <Alert><ShieldCheck aria-hidden="true" /><AlertTitle>החברות בצוות והחשבון האישי הם שני שלבים</AlertTitle><AlertDescription>הפעולה מאשרת חברות בצוות בלבד. היא אינה יוצרת חשבון התחברות ואינה שולחת הזמנה או דוא״ל. יצירת החשבון מחייבת הרשמה ואימות באמצעות אותה כתובת דוא״ל.</AlertDescription></Alert>
    <OfflineNotice /><ActionError message={failure?.message ?? null} />
    <fieldset disabled={busy || !draft.hydrated} className="min-w-0 border-0 p-0"><FieldGroup>
      <Field data-invalid={invalidField === "displayName" || undefined}><FieldLabel htmlFor={`${formId}-name`}>שם מלא</FieldLabel><Input id={`${formId}-name`} value={values.displayName} onChange={(event) => update("displayName", event.target.value)} maxLength={200} autoComplete="name" required aria-invalid={invalidField === "displayName" || undefined} aria-describedby={invalidField === "displayName" ? `${formId}-displayName-error` : undefined} /><FieldFailure failure={failure} field="displayName" formId={formId} /></Field>
      <Field data-invalid={invalidField === "email" || undefined}><FieldLabel htmlFor={`${formId}-email`}>כתובת דוא״ל להתחברות</FieldLabel><Input id={`${formId}-email`} type="email" inputMode="email" dir="ltr" value={values.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required aria-invalid={invalidField === "email" || undefined} aria-describedby={`${formId}-email-description${invalidField === "email" ? ` ${formId}-email-error` : ""}`} /><FieldDescription id={`${formId}-email-description`}>יש להשתמש באותה כתובת בהרשמה ובהתחברות לחשבון.</FieldDescription><FieldFailure failure={failure} field="email" formId={formId} /></Field>
      <Field data-invalid={invalidField === "phone" || undefined}><FieldLabel htmlFor={`${formId}-phone`}>טלפון צוות · רשות</FieldLabel><PhoneInput id={`${formId}-phone`} value={values.phone} onChange={(value) => update("phone", value)} aria-invalid={invalidField === "phone" || undefined} aria-describedby={invalidField === "phone" ? `${formId}-phone-error` : undefined} /><FieldDescription>המספר מיועד לקשר ולתזכורות לצוות, בהתאם להגדרות השירות.</FieldDescription><FieldFailure failure={failure} field="phone" formId={formId} /></Field>
      <Field><FieldLabel id={`${formId}-role-label`}>תפקיד במערכת</FieldLabel>{isCeo ? <ToggleGroup variant="outline" value={[values.role]} multiple={false} disabled={busy || !draft.hydrated} aria-labelledby={`${formId}-role-label`} onValueChange={(next) => { if (next[0] === "mentor" || next[0] === "coordinator") update("role", next[0]); }}><ToggleGroupItem id={`${formId}-role-mentor`} aria-invalid={invalidField === "role" || undefined} aria-describedby={invalidField === "role" ? `${formId}-role-error` : undefined} value="mentor">חונך/ת</ToggleGroupItem><ToggleGroupItem value="coordinator">רכז/ת</ToggleGroupItem></ToggleGroup> : <p className="text-sm">חונך/ת · שיוך לצוות שלך</p>}<FieldFailure failure={failure} field="role" formId={formId} /></Field>
      {effectiveRole === "mentor" && <Field data-invalid={invalidField === "coordinatorId" || undefined}><FieldLabel htmlFor={isCeo ? `${formId}-coordinator` : undefined}>רכז/ת אחראי/ת</FieldLabel>{isCeo ? <Select items={items} value={values.coordinatorId} onValueChange={(value) => update("coordinatorId", value ?? "none")} disabled={busy || !draft.hydrated}><SelectTrigger id={`${formId}-coordinator`} className="w-full" aria-invalid={invalidField === "coordinatorId" || undefined} aria-describedby={invalidField === "coordinatorId" ? `${formId}-coordinatorId-error` : undefined}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectLabel>שיוך לצוות</SelectLabel>{items.map((item) => <SelectItem key={item.value} value={item.value} className="min-h-11">{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select> : <p className="text-sm">{actor.displayName}</p>}<FieldFailure failure={failure} field="coordinatorId" formId={formId} /></Field>}
    </FieldGroup></fieldset>
    <DraftStatus status={draft.status} onRetry={draft.retry} />
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>סגירה ושמירת הטיוטה</Button><Button type="submit" disabled={busy || !draft.hydrated}>{busy ? <Spinner data-icon="inline-start" /> : <UserRoundPlus data-icon="inline-start" />}אישור חברות בצוות</Button></DialogFooter>
  </form>;
}
function StaffEditForm({ member, onClose, onBusyChange }: { member: StaffProfile; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { snapshot, submit } = useWorkspace();
  const formId = useId();
  const draft = useFormDraft(`staff-edit:${member.id}`, staffEditValues(member));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure["error"] | null>(null);
  const submitting = useRef(false);
  if (!snapshot || snapshot.actor.role !== "ceo") return null;
  const values = draft.value;
  const stale = draft.hydrated && values.baseVersion !== member.version;
  const coordinators = snapshot.staff.filter((person) => person.id !== member.id && (person.active || isPendingStaffPreapproval(person)) && person.role === "coordinator" && person.organizationId === snapshot.actor.organizationId);
  const items = [{ value: "none", label: "ללא שיוך לרכז/ת" }, ...coordinators.map((person) => ({ value: person.id, label: person.displayName + (isPendingStaffPreapproval(person) ? " · בקשת חברות ממתינה לאישור" : "") }))];
  const invalidField = failure?.field?.split(".").at(-1);
  function update<K extends keyof typeof values>(field: K, value: typeof values[K]) { draft.update({ ...values, [field]: value }); if (invalidField === field) setFailure(null); }
  function fail(error: ApiFailure["error"]) { setFailure(error); const field = error.field?.split(".").at(-1); const suffix: Record<string, string> = { displayName: "name", email: "email", phone: "phone", role: "role-mentor", coordinatorId: "coordinator" }; if (field && suffix[field]) document.getElementById(`${formId}-${suffix[field]}`)?.focus(); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || snapshot.actor.role !== "ceo" || !draft.hydrated || stale || submitting.current) return;
    if (!values.displayName.trim()) { fail({ code: "validation", field: "displayName", message: "יש להזין את שם חבר/ת הצוות." }); return; }
    if (values.displayName.trim().length > 200) { fail({ code: "validation", field: "displayName", message: "שם מלא יכול להכיל עד 200 תווים. יש לקצר את השם." }); return; }

    if (member.role !== "ceo" && values.role !== "mentor" && values.role !== "coordinator") { fail({ code: "validation", field: "role", message: "יש לבחור תפקיד: חונך/ת או רכז/ת." }); return; }
    const fields = changedStaffFields(member, values);
    if ("phone" in fields && values.phone.trim() && !normalizePhoneNumber(values.phone)) { fail({ code: "validation", field: "phone", message: "יש להזין מספר טלפון תקין עם קידומת מדינה, או למחוק את המספר." }); return; }
    if (!Object.keys(fields).length) { setFailure({ code: "validation", message: "לא בוצע שינוי בפרטים." }); return; }
    if (fields.coordinatorId && !coordinators.some((person) => person.id === fields.coordinatorId)) { fail({ code: "validation", field: "coordinatorId", message: "יש לבחור רכז/ת עם גישה פעילה מהארגון או להסיר את השיוך." }); return; }
    const payload = { type: "update_staff" as const, staffId: member.id, expectedVersion: values.baseVersion, fields };
    const validation = parseCommand({ ...payload, operationId: crypto.randomUUID() });
    if (!validation.ok) { fail(validation.error); return; }
    submitting.current = true; setBusy(true); onBusyChange(true); setFailure(null);
    let prepared = false;
    try {
      const operationId = await draft.prepare(payload);
      prepared = true;
      const result = await submit({ ...payload, operationId });
      if (!result.ok) { fail(result.error); draft.recheck(); return; }
      try { await draft.clear(); } catch { toast.warning("הבקשה נשמרה. הטיוטה תיבדק לפי אותה פעולת שמירה בפתיחה הבאה."); }
      onClose();
      if (result.acceptance === "queued") toast.message("עדכון הצוות נשמר במכשיר וממתין לאישור. תפקיד ושיוך חדשים טרם נכנסו לתוקף.");
      else toast.success("פרטי חבר/ת הצוות עודכנו");
    } catch { setFailure({ code: "unavailable", message: prepared ? "לא התקבל אישור מהמערכת. זהות הבקשה נשמרה ותיבדק לניסיון נוסף." : "לא ניתן להכין את הבקשה לשמירה. הפרטים נשארו בטופס; יש להשאיר אותו פתוח, לבדוק את מצב הטיוטה ולנסות שוב." }); if (prepared) draft.recheck(); }
    finally { submitting.current = false; setBusy(false); onBusyChange(false); }
  }
  if (draft.recovered) return <RecoveredStaffSave result={draft.recovered} clear={draft.clear} onClose={onClose}><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm"><dt>שם בטיוטה</dt><dd>{values.displayName}</dd><dt>טלפון בטיוטה</dt><dd dir="ltr">{values.phone || "ללא טלפון"}</dd><dt>תפקיד בטיוטה</dt><dd>{roleLabels[values.role]}</dd><dt>רכז/ת בטיוטה</dt><dd>{snapshot.staff.find((person) => person.id === values.coordinatorId)?.displayName ?? "ללא רכז/ת"}</dd></dl></RecoveredStaffSave>;
  return <form onSubmit={save} noValidate className="flex flex-col gap-5">
    <ActionError message={failure?.message ?? null} /><OfflineNotice />
    <VersionNotice stale={stale} onReview={() => { update("baseVersion", member.version); setFailure(null); }}><p>המידע העדכני: {member.displayName} · {member.phone ?? "ללא טלפון"} · {roleLabels[member.role]} · {snapshot.staff.find((person) => person.id === member.coordinatorId)?.displayName ?? "ללא רכז/ת"}</p><p>הטיוטה: {values.displayName || "ללא שם"} · {values.phone || "ללא טלפון"} · {roleLabels[values.role]} · {snapshot.staff.find((person) => person.id === values.coordinatorId)?.displayName ?? "ללא רכז/ת"}</p></VersionNotice>
    <fieldset disabled={busy || !draft.hydrated || stale} className="min-w-0 border-0 p-0"><FieldGroup>
      <Field data-invalid={invalidField === "displayName" || undefined}><FieldLabel htmlFor={`${formId}-name`}>שם מלא</FieldLabel><Input id={`${formId}-name`} value={values.displayName} onChange={(event) => update("displayName", event.target.value)} maxLength={200} required aria-invalid={invalidField === "displayName" || undefined} aria-describedby={invalidField === "displayName" ? `${formId}-displayName-error` : undefined} /><FieldFailure failure={failure} field="displayName" formId={formId} /></Field>
      <Field data-invalid={invalidField === "phone" || undefined}><FieldLabel htmlFor={`${formId}-phone`}>טלפון צוות · רשות</FieldLabel><PhoneInput id={`${formId}-phone`} value={values.phone} onChange={(value) => update("phone", value)} aria-invalid={invalidField === "phone" || undefined} aria-describedby={invalidField === "phone" ? `${formId}-phone-error` : undefined} /><FieldFailure failure={failure} field="phone" formId={formId} /></Field>
      <Field><FieldLabel>כתובת דוא״ל להתחברות</FieldLabel><p dir="ltr" className="break-all text-sm">{member.email ?? "לא הוגדרה כתובת דוא״ל"}</p><FieldDescription>הדוא״ל ופרטי חשבון ההתחברות מנוהלים בנפרד ואינם ניתנים לעריכה בטופס זה.</FieldDescription></Field>
      <Field data-invalid={invalidField === "role" || undefined}><FieldLabel id={`${formId}-role-label`}>תפקיד במערכת</FieldLabel>{member.role === "ceo" ? <p className="text-sm">מנכ״ל · התפקיד נשמר</p> : <ToggleGroup variant="outline" value={[values.role]} multiple={false} disabled={busy || !draft.hydrated || stale} aria-labelledby={`${formId}-role-label`} onValueChange={(next) => { if (next[0] === "mentor" || next[0] === "coordinator") update("role", next[0]); }}><ToggleGroupItem id={`${formId}-role-mentor`} aria-invalid={invalidField === "role" || undefined} aria-describedby={invalidField === "role" ? `${formId}-role-error` : undefined} value="mentor">חונך/ת</ToggleGroupItem><ToggleGroupItem value="coordinator">רכז/ת</ToggleGroupItem></ToggleGroup>}<FieldDescription>לפני שינוי תפקיד או צוות, יש להעביר שיוכים והרשאות קיימים שאינם מתאימים לתפקיד החדש.</FieldDescription><FieldFailure failure={failure} field="role" formId={formId} /></Field>
      {member.role !== "ceo" && values.role === "mentor" && <Field data-invalid={invalidField === "coordinatorId" || undefined}><FieldLabel htmlFor={`${formId}-coordinator`}>רכז/ת אחראי/ת</FieldLabel><Select items={items} value={values.coordinatorId} disabled={busy || !draft.hydrated || stale} onValueChange={(value) => update("coordinatorId", value ?? "none")}><SelectTrigger id={`${formId}-coordinator`} className="w-full" aria-invalid={invalidField === "coordinatorId" || undefined} aria-describedby={invalidField === "coordinatorId" ? `${formId}-coordinatorId-error` : undefined}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectLabel>שיוך לצוות</SelectLabel>{items.map((item) => <SelectItem key={item.value} value={item.value} className="min-h-11">{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldFailure failure={failure} field="coordinatorId" formId={formId} /></Field>}
    </FieldGroup></fieldset>
    <DraftStatus status={draft.status} onRetry={draft.retry} />
    <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy}>סגירה ושמירת הטיוטה</Button><Button type="submit" disabled={busy || !draft.hydrated || stale}>{busy && <Spinner data-icon="inline-start" />}שמירת פרטי צוות</Button></DialogFooter>
  </form>;
}
function StaffAccessForm({ member, onClose, onBusyChange }: { member: StaffProfile; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { snapshot, submit } = useWorkspace();
  const draft = useFormDraft(`staff-access:${member.id}`, { active: !member.active, baseVersion: member.version });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  if (!snapshot || snapshot.actor.role !== "ceo" || snapshot.actor.id === member.id) return null;
  const values = draft.value;
  const stale = draft.hydrated && values.baseVersion !== member.version;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || snapshot.actor.role !== "ceo" || snapshot.actor.id === member.id || !draft.hydrated || stale || submitting.current) return;
    if (member.active === values.active) { setError("מצב הגישה המבוקש כבר מוצג. יש לבדוק את רשימת הצוות המעודכנת."); return; }
    const payload = { type: "set_staff_active" as const, staffId: member.id, expectedVersion: values.baseVersion, active: values.active };
    const validation = parseCommand({ ...payload, operationId: crypto.randomUUID() });
    if (!validation.ok) { setError(validation.error.message); return; }
    submitting.current = true; setBusy(true); onBusyChange(true); setError(null);
    let prepared = false;
    try {
      const operationId = await draft.prepare(payload);
      prepared = true;
      const result = await submit({ ...payload, operationId });
      if (!result.ok) { setError(result.error.message); draft.recheck(); return; }
      try { await draft.clear(); } catch { toast.warning("הבקשה נשמרה. הטיוטה תיבדק לפי אותה פעולת שמירה בפתיחה הבאה."); }
      onClose();
      if (result.acceptance === "queued") toast.message("בקשת שינוי הגישה נשמרה במכשיר וממתינה לאישור. הגישה עדיין לפי המצב האחרון שאושר.");
      else toast.success(values.active ? "הגישה לצוות הופעלה" : "ההרשאה לצוות בוטלה");
    } catch { setError(prepared ? "לא התקבל אישור מהמערכת. זהות הבקשה נשמרה ותיבדק לניסיון נוסף." : "לא ניתן להכין את הבקשה לשמירה. יש להשאיר את הטופס פתוח, לבדוק את מצב הטיוטה ולנסות שוב."); if (prepared) draft.recheck(); }
    finally { submitting.current = false; setBusy(false); onBusyChange(false); }
  }
  if (draft.recovered) return <RecoveredStaffSave result={draft.recovered} clear={draft.clear} onClose={onClose}><p className="text-sm">הבקשה שנשמרה: {values.active ? "הפעלת גישה" : "ביטול גישה"} עבור {member.displayName}.</p></RecoveredStaffSave>;
  return <form onSubmit={save} className="flex flex-col gap-5">
    <p className="text-sm leading-relaxed">{values.active ? "לאחר אישור המערכת תופעל הגישה לצוות לפי התפקיד וההרשאות." : "לאחר אישור המערכת תבוטל הגישה לצוות. פרטי הפעילות הקיימים יישמרו. יש לדאוג להמשך הליווי של החניכות שבאחריות חבר/ת הצוות, ואפשר להפעיל את הגישה בהמשך."}</p>
    <ActionError message={error} /><OfflineNotice />
    <VersionNotice stale={stale} onReview={() => { draft.update({ ...values, baseVersion: member.version }); setError(null); }}><p>המצב העדכני: {member.active ? "גישה פעילה" : "ללא גישה"}. הבקשה השמורה: {values.active ? "הפעלת גישה" : "ביטול גישה"}.</p></VersionNotice>
    <DraftStatus status={draft.status} onRetry={draft.retry} />
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>סגירה</Button><Button type="submit" variant={values.active ? "default" : "destructive"} disabled={busy || !draft.hydrated || stale || member.active === values.active}>{busy ? <Spinner data-icon="inline-start" /> : values.active ? <UserRoundCheck data-icon="inline-start" /> : <UserRoundMinus data-icon="inline-start" />}{values.active ? "אישור הפעלת הגישה" : "אישור ביטול הגישה"}</Button></DialogFooter>
  </form>;
}
export function StaffManagement() {
  const { snapshot } = useWorkspace();
  const [target, setTarget] = useState<{ id: string; mode: "edit" | "access" } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;
  const { actor, staff } = snapshot;
  const isCeo = actor.role === "ceo";
  const canCreate = isCeo || actor.role === "coordinator";
  const activeCount = staff.filter((member) => member.active).length;
  const pendingCount = staff.filter(isPendingStaffPreapproval).length;
  const inactiveCount = staff.filter((member) => !member.active && !isPendingStaffPreapproval(member)).length;
  const selected = staff.find((member) => member.id === target?.id);
  function controls(member: StaffProfile) {
    if (!isCeo) return null;
    if (isPendingStaffPreapproval(member)) return <p className="text-xs text-muted-foreground">ניהול הגישה יתאפשר לאחר אישור החברות במערכת</p>;
    return <div className="flex flex-wrap items-center gap-2"><Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon" aria-label="עריכת פרטים" onClick={() => setTarget({ id: member.id, mode: "edit" })} />}><Pencil aria-hidden="true" /></TooltipTrigger><TooltipContent>עריכת פרטי הצוות</TooltipContent></Tooltip>{member.id !== actor.id && <Button variant="outline" onClick={() => setTarget({ id: member.id, mode: "access" })}>{member.active ? <UserRoundMinus data-icon="inline-start" /> : <UserRoundCheck data-icon="inline-start" />}{member.active ? "ביטול גישה" : "הפעלת גישה"}</Button>}</div>;
  }
  function accessStatus(member: StaffProfile, pendingLabel: string) {
    return <div className="flex min-w-0 max-w-full flex-col items-start gap-2"><div className="flex min-w-0 max-w-full items-center gap-1"><Badge className="h-auto min-h-5 max-w-full whitespace-normal" variant={member.active ? "secondary" : "outline"}>{isPendingStaffPreapproval(member) ? pendingLabel : member.active ? "גישה פעילה" : "ללא גישה"}</Badge>{isCeo && member.id === actor.id && <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon" aria-label="אין אפשרות לבטל את הגישה של החשבון שלך" />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>אין אפשרות לבטל את הגישה של החשבון שלך</TooltipContent></Tooltip>}</div>{member.localPending && !isPendingStaffPreapproval(member) && <Badge className="h-auto min-h-5 max-w-full whitespace-normal" variant="outline">עדכון ממתין לאישור</Badge>}</div>;
  }
  return <TooltipProvider><div className="flex min-w-0 flex-col gap-4">
    {canCreate && <OfflineNotice />}
    <Card className="min-w-0 max-w-full"><CardHeader><CardTitle>צוות הליווי</CardTitle><CardDescription>{activeCount} עם גישה פעילה · {inactiveCount} ללא גישה{pendingCount > 0 ? ` · ${pendingCount} בקשות חברות ממתינות לאישור` : ""}</CardDescription><CardAction>{canCreate ? <AddStaffDialog /> : <Badge variant="secondary">{staff.length} בצוות</Badge>}</CardAction></CardHeader>
      <CardContent className="min-w-0 max-w-full">{staff.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Users aria-hidden="true" /></EmptyMedia><EmptyTitle>אין צוות להצגה</EmptyTitle><EmptyDescription>{canCreate ? "אפשר לאשר חברות חדשה בצוות באמצעות הכפתור למעלה." : "רשימת הצוות תוצג לאחר הגדרת חשבונות הצוות."}</EmptyDescription></EmptyHeader></Empty> : <>
        <div className="hidden min-w-0 max-w-full md:block">
          <Table className={cn("table-fixed", isCeo ? "min-w-[60rem]" : "min-w-[44rem]")} aria-label="צוות הליווי">
            <colgroup><col /><col className="w-24" /><col /><col /><col className="w-36" />{isCeo && <col className="w-48" />}</colgroup>
            <TableHeader><TableRow><TableHead scope="col">שם</TableHead><TableHead scope="col">תפקיד</TableHead><TableHead scope="col">פרטי קשר</TableHead><TableHead scope="col">רכז/ת אחראי/ת</TableHead><TableHead scope="col">גישה</TableHead>{isCeo && <TableHead scope="col">ניהול צוות</TableHead>}</TableRow></TableHeader>
            <TableBody>{staff.map((member) => <TableRow key={member.id}>
              <TableCell className="whitespace-normal"><div className="flex min-w-0 flex-col gap-1"><span className="font-medium [overflow-wrap:anywhere]">{member.displayName}</span>{member.id === actor.id && <span className="text-xs text-muted-foreground">החשבון שלך</span>}</div></TableCell>
              <TableCell><Badge className="h-auto min-h-5 max-w-full whitespace-normal" variant="outline">{isPendingStaffPreapproval(member) ? "תפקיד מבוקש: " : ""}{roleLabels[member.role]}</Badge></TableCell>
              <TableCell className="whitespace-normal"><div className="flex min-w-0 flex-col gap-1"><span dir="ltr" className="[overflow-wrap:anywhere]">{member.phone ?? "לא הוזן טלפון"}</span>{member.email && <span dir="ltr" title={member.email} className="block max-w-full truncate text-xs text-muted-foreground">{member.email}</span>}</div></TableCell>
              <TableCell className="whitespace-normal"><span className="[overflow-wrap:anywhere]">{isPendingStaffPreapproval(member) ? "שיוך מבוקש: " : ""}{staff.find((person) => person.id === member.coordinatorId)?.displayName ?? "ללא שיוך"}</span></TableCell>
              <TableCell>{accessStatus(member, "בקשת חברות ממתינה לאישור")}</TableCell>
              {isCeo && <TableCell>{controls(member)}</TableCell>}
            </TableRow>)}</TableBody>
          </Table>
        </div>
        <div className="grid gap-3 md:hidden">{staff.map((member) => <Card key={member.id} size="sm"><CardHeader><CardTitle className="min-w-0 break-words">{member.displayName}</CardTitle><CardDescription>{isPendingStaffPreapproval(member) ? "תפקיד מבוקש: " : ""}{roleLabels[member.role]}{member.id === actor.id ? " · החשבון שלך" : ""}</CardDescription><CardAction>{accessStatus(member, "בקשת חברות ממתינה לאישור")}</CardAction></CardHeader><CardContent><dl className="flex min-w-0 flex-col gap-2 text-sm"><div className="flex flex-col gap-1"><dt className="text-muted-foreground">פרטי קשר</dt><dd><span dir="ltr">{member.phone ?? "לא הוזן טלפון"}</span></dd>{member.email && <dd dir="ltr" className="break-all text-start">{member.email}</dd>}</div><div className="flex flex-col gap-1"><dt className="text-muted-foreground">{isPendingStaffPreapproval(member) ? "רכז/ת מבוקש/ת" : "רכז/ת אחראי/ת"}</dt><dd>{staff.find((person) => person.id === member.coordinatorId)?.displayName ?? "ללא שיוך"}</dd></div></dl></CardContent>{isCeo && <CardFooter>{controls(member)}</CardFooter>}</Card>)}</div>
      </>}</CardContent><CardFooter><p className="text-xs leading-relaxed text-muted-foreground">{isCeo ? "אפשר לאשר חברות מראש, לערוך פרטים ולהפעיל או לבטל גישה. היסטוריית הפעילות נשמרת גם לאחר ביטול גישה." : actor.role === "coordinator" ? "אפשר להוסיף חונכים וחונכות לצוות שלך. שינוי פרטי צוות וגישה נמצא בידי המנכ״ל." : "שינוי חברות בצוות והרשאות נעשה על ידי ההנהלה."}</p></CardFooter>
    </Card>
    <Dialog open={target !== null && isCeo} onOpenChange={(next, details) => { if (busy) details.cancel(); else if (!next) setTarget(null); }}><DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{target?.mode === "edit" ? "עריכת פרטי צוות" : "שינוי גישה לצוות"} · {selected?.displayName ?? "חבר/ת צוות"}</DialogTitle><DialogDescription>{target?.mode === "edit" ? "עדכון פרטי הצוות, התפקיד והשיוך הארגוני." : "הבקשה תיבדק מול מצב הצוות וההרשאות העדכניים במערכת."}</DialogDescription></DialogHeader>{selected && target ? target.mode === "edit" ? <StaffEditForm key={`edit:${selected.id}`} member={selected} onClose={() => setTarget(null)} onBusyChange={setBusy} /> : <StaffAccessForm key={`access:${selected.id}`} member={selected} onClose={() => setTarget(null)} onBusyChange={setBusy} /> : <ActionError message="פרטי חבר/ת הצוות אינם זמינים במידע העדכני. יש לסגור את הטופס ולרענן את הרשימה." />}</DialogContent></Dialog>
  </div></TooltipProvider>;
}
