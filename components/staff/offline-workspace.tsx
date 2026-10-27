"use client";

import { useSyncExternalStore } from "react";
import { WorkspaceProvider } from "@/lib/mentoring/workspace-client";
import { MentoringShell } from "@/components/mentoring/shell";
import { DashboardView } from "@/components/mentoring/dashboard";
import { ParticipantDetailView, ParticipantsView } from "@/components/mentoring/participants";
import { ContactFormView } from "@/components/mentoring/contact-form";
import { ConflictsView, ReviewsView, SettingsView, TeamView } from "@/components/mentoring/management";
import { MonthlyOversightView } from "@/components/mentoring/monthly-oversight";
import { ReminderCenter } from "@/components/mentoring/reminder-center";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
const serverLocation = () => "/staff";
const browserLocation = () => window.location.pathname + window.location.search;

function OfflineRouteContent() {
  const location = useSyncExternalStore(subscribe, browserLocation, serverLocation);
  const url = new URL(location, "https://staff.invalid");
  const path = url.pathname.replace(/\/$/, "");
  if (path === "/staff/participants") return <ParticipantsView />;
  const participant = path.match(/^\/staff\/participants\/([^/]+)$/);
  if (participant) return <ParticipantDetailView participantId={decodeURIComponent(participant[1])} />;
  if (path === "/staff/contacts/new") return <ContactFormView initialParticipantId={url.searchParams.get("participant") ?? undefined} />;
  if (path === "/staff/reviews") return <ReviewsView />;
  if (path === "/staff/team") return <TeamView />;
  if (path === "/staff/conflicts") return <ConflictsView />;
  if (path === "/staff/settings") return <SettingsView />;
  if (path === "/staff/oversight") return <MonthlyOversightView initialMonth={url.searchParams.get("month") ?? undefined} />;
  if (path === "/staff/reminders") return <ReminderCenter />;
  return <DashboardView />;
}

export function OfflineWorkspace() {
  return <WorkspaceProvider><MentoringShell><OfflineRouteContent /></MentoringShell></WorkspaceProvider>;
}
