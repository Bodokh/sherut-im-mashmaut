import type { PoolClient } from "pg";
import type { ApiFailure, CommandResult, CommandSuccess, MentoringCommand, ParticipantView, StaffProfile } from "../contracts";

/** Shared transaction envelope; feature handlers never commit or send externally. */
export interface CommandContext {
  readonly client: PoolClient;
  readonly actor: StaffProfile;
  readonly view: ParticipantView | null;
  readonly now: string;
  readonly audit: (command: MentoringCommand, participantId?: string, details?: Record<string, unknown>) => Promise<void>;
  readonly success: (command: MentoringCommand, participantId?: string) => CommandSuccess;
  readonly failure: (code: ApiFailure["error"]["code"], message: string, field?: string) => ApiFailure;
  readonly preserveConflict: (command: MentoringCommand, view: ParticipantView) => Promise<ApiFailure>;
  readonly protect: (resourceId: string, revision: number, fieldPaths?: readonly string[]) => Promise<void>;
  readonly refreshReminders: (participantId: string) => Promise<void>;
}

export type FeatureCommandHandler = (context: CommandContext, command: MentoringCommand) => Promise<CommandResult | null>;
