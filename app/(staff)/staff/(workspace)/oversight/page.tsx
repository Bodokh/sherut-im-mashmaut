import { MonthlyOversightView } from "@/components/mentoring/monthly-oversight";

export default async function OversightPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { month } = await searchParams;
  return (
    <MonthlyOversightView
      initialMonth={typeof month === "string" ? month : undefined}
    />
  );
}
