import { ParticipantDetailView } from "@/components/mentoring/participants";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ParticipantDetailView participantId={id} />;
}
