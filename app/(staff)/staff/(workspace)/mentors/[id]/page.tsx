import { MentorCardView } from "@/components/mentoring/mentor-cards";

export default async function MentorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MentorCardView mentorId={id} />;
}
