"use client";

import { useState } from "react";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/staff/ui/alert";
import { Button } from "@/components/staff/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/staff/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/staff/ui/table";
import { useWorkspace } from "@/lib/mentoring/workspace-client";

export interface DraftComparison {
  label: string;
  current: string;
  draft: string;
}

export function DraftRecovery({
  rows,
  onRebase,
  contact = false,
}: {
  rows: DraftComparison[];
  onRebase: () => void;
  contact?: boolean;
}) {
  const { refresh, isOnline } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshData() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Alert>
      <CircleAlertIcon />
      <AlertTitle>הכרטיס עודכן מאז תחילת הטיוטה</AlertTitle>
      <AlertDescription>
        <p>
          הפרטים שהזנת נשמרו. יש לבדוק את המידע העדכני לפני שממשיכים עם הטיוטה.
        </p>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!refreshing) setOpen(next);
          }}
        >
          <DialogTrigger
            render={<Button type="button" variant="outline" className="mt-3" />}
            onClick={() => {
              if (isOnline) void refreshData();
            }}
          >
            בדיקת העדכון והמשך עם הטיוטה
          </DialogTrigger>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>בדיקת השינויים בכרטיס</DialogTitle>
              <DialogDescription>
                {contact
                  ? "המשך עם הטיוטה יוסיף דיווח חדש להיסטוריית הקשר, בהתייחס למצב העדכני של הכרטיס והפגישה הבאה."
                  : "יש לבדוק את ההבדלים. המשך עם הטיוטה ישמור את הפרטים שבטור הטיוטה במקום הפרטים המקבילים בכרטיס."}
              </DialogDescription>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>פרט</TableHead>
                  <TableHead>המידע הזמין בכרטיס</TableHead>
                  <TableHead>הטיוטה שלך</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="align-top font-medium">
                      {row.label}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-pre-wrap break-words align-top">
                      {row.current || "טרם הוזן"}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-pre-wrap break-words align-top">
                      {row.draft || "טרם הוזן"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!isOnline && (
              <p className="text-sm text-muted-foreground">
                ללא חיבור, מוצג המידע הזמין במכשיר מהעדכון האחרון. השמירה תיבדק
                מחדש כשיחזור החיבור.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={refreshing}
                onClick={() => setOpen(false)}
              >
                חזרה לטיוטה
              </Button>
              <Button
                type="button"
                disabled={refreshing}
                onClick={() => {
                  onRebase();
                  setOpen(false);
                }}
              >
                {refreshing && (
                  <RefreshCwIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                )}
                בדקתי, להמשיך עם הטיוטה
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AlertDescription>
    </Alert>
  );
}
