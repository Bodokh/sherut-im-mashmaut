import { ContactFormView } from "@/components/mentoring/contact-form";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ participant?: string | string[] }>;
}) {
  const query = await searchParams;
  return (
    <ContactFormView
      initialParticipantId={
        typeof query.participant === "string" ? query.participant : undefined
      }
    />
  );
}
