import { notFound } from "next/navigation";
import { StaffSmsHarness } from "@/components/staff/sms-composer-harness";

export const dynamic = "force-dynamic";

export default function StaffSmsHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StaffSmsHarness />;
}
