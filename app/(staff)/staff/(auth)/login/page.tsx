import { SignInForm } from "@/components/staff/auth/sign-in-form";

export default async function StaffLoginPage({ searchParams }: {
  searchParams: Promise<{ google?: string | string[] }>;
}) {
  const { google } = await searchParams;
  return <SignInForm googleResult={typeof google === "string" ? google : undefined} />;
}
