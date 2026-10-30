"use client";

import { ShieldCheck, UserRoundPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/staff/ui/alert-dialog";
import { Button } from "@/components/staff/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/staff/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";
import { PhoneInput } from "@/components/staff/ui/phone-input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/staff/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/staff/ui/toggle-group";

export function DialogHarness({ popup }: { popup: "add-staff" | "alert" | "sheet" }) {
  return (
    <main className="min-h-dvh bg-background p-6 text-foreground">
      <h1 className="mb-4 text-2xl font-semibold">הצוות שלנו</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        אישור מראש של חברות בצוות, לפי כתובת דוא״ל אישית ומדויקת.
      </p>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start">
            <tr>
              <th className="px-4 py-3 font-medium">שם</th>
              <th className="px-4 py-3 font-medium">תפקיד</th>
              <th className="px-4 py-3 font-medium">פרטי קשר</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-4 py-3">דניאל</td>
              <td className="px-4 py-3">מנכ״ל</td>
              <td className="px-4 py-3" dir="ltr">daniel@imashmaut.co.il</td>
            </tr>
            <tr className="border-t">
              <td className="px-4 py-3">ישראל</td>
              <td className="px-4 py-3">חונך/ת</td>
              <td className="px-4 py-3" dir="ltr">israel@imashmaut.co.il</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Dialog open={popup === "add-staff"}>
        <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>הוספת חבר/ת צוות</DialogTitle>
            <DialogDescription>אישור מראש של חברות בצוות, לפי כתובת דוא״ל אישית ומדויקת.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-5" onSubmit={(event) => event.preventDefault()}>
            <Alert>
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>החברות בצוות והחשבון האישי הם שני שלבים</AlertTitle>
              <AlertDescription>
                הפעולה מאשרת חברות בצוות בלבד. היא אינה יוצרת חשבון התחברות ואינה שולחת הזמנה או דוא״ל. יצירת החשבון מחייבת הרשמה ואימות באמצעות אותה כתובת דוא״ל.
              </AlertDescription>
            </Alert>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="harness-name">שם מלא</FieldLabel>
                <Input id="harness-name" defaultValue="" autoComplete="name" />
              </Field>
              <Field>
                <FieldLabel htmlFor="harness-email">כתובת דוא״ל להתחברות</FieldLabel>
                <Input id="harness-email" type="email" inputMode="email" dir="ltr" defaultValue="" autoComplete="email" />
                <FieldDescription>יש להשתמש באותה כתובת בהרשמה ובהתחברות לחשבון.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="harness-phone">טלפון צוות · רשות</FieldLabel>
                <PhoneInput id="harness-phone" value="" onChange={() => undefined} />
                <FieldDescription>המספר מיועד לקשר ולתזכורות לצוות, בהתאם להגדרות השירות.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel id="harness-role-label">תפקיד במערכת</FieldLabel>
                <ToggleGroup variant="outline" value={["mentor"]} multiple={false} aria-labelledby="harness-role-label">
                  <ToggleGroupItem value="mentor">חונך/ת</ToggleGroupItem>
                  <ToggleGroupItem value="coordinator">רכז/ת</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="harness-coordinator">רכז/ת אחראי/ת</FieldLabel>
                <Input id="harness-coordinator" defaultValue="ללא שיוך לרכז/ת" readOnly />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline">סגירה ושמירת הטיוטה</Button>
              <Button type="submit"><UserRoundPlus data-icon="inline-start" />אישור חברות בצוות</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={popup === "alert"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את העבודה המקומית שנבחרה?</AlertDialogTitle>
            <AlertDialogDescription>
              הפעולה תמחק מהמכשיר 3 עדכונים לבדיקה ו־2 טיוטות בעותק הנעול הזה. אי אפשר לשחזר אותו אחרי המחיקה. מידע שכבר התקבל במערכת נשאר במערכת.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>חזרה</AlertDialogCancel>
            <AlertDialogAction variant="destructive">מחיקת העותק מהמכשיר</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={popup === "sheet"}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>פרטי חבר/ת צוות</SheetTitle>
            <SheetDescription>כרטיס צד לבדיקת גיליון שנפתח במלואו בתוך המסך.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 text-sm">
            <p>שם: דניאל</p>
            <p>תפקיד: מנכ״ל</p>
            <p dir="ltr">daniel@imashmaut.co.il</p>
          </div>
          <SheetFooter>
            <Button type="button">סגירה</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}
