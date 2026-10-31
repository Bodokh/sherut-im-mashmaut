import { notFound } from "next/navigation";
import { DialogHarness } from "@/components/staff/dialog-harness";

export const dynamic = "force-dynamic";

const popups = ["add-staff", "alert", "sheet"] as const;
type Popup = (typeof popups)[number];

function isPopup(value: string | string[] | undefined): value is Popup {
  return typeof value === "string" && popups.includes(value as Popup);
}

export default async function DialogHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ popup?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.DIALOG_HARNESS !== "1") {
    notFound();
  }

  const { popup } = await searchParams;
  return <DialogHarness popup={isPopup(popup) ? popup : "add-staff"} />;
}
