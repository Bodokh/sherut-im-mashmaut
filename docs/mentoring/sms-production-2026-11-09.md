# SMS production rollout — 9 November 2026

**Status: migration applied; activation and delivery verification are in progress.** The user explicitly authorized pushing the latest version and enabling production SMS. Final deployment, policy and provider results will be recorded here when verified.

## Release scope

- Integrate the gallery and dual contact reminders with `main` at `8c53651`, preserving the staff subdomain, staff invitations and existing onboarding cron.
- Send an advance reminder three days before the scheduled contact and another at the scheduled time. Both ask staff to call the mentee and record the follow-up.
- Preserve an unchanged future appointment when the preparation call is recorded, so its accepted advance reminder cannot be rearmed.
- Expire advance notices after the scheduled instant and scheduled-day notices after their Israel calendar day. Existing seven-day-overdue reminders retain their policy.
- Add `/api/internal/mentoring/reminders` every five minutes beside the existing five-minute staff-onboarding cron. The reminder runner retains its authenticated CEO checks, bounded scan and five-message dispatch batch.

## Verified production preflight

| Item | Evidence |
| --- | --- |
| Vercel target | `bodokhs-projects/sherut-im-mashmaut`, project `prj_n3PT8jLhjFEdA3FesktCdfFkSKWu`. |
| Production database | Neon project `frosty-shadow-69602805`, database `neondb`; direct endpoint independently matched the existing production release record. |
| Schema | Existing migrations `001`–`008` matched their source checksums. `009_appointment_reminder_timing.sql` was applied successfully. |
| Backup | Private custom-format `pg_dump` created with a PostgreSQL 18 client for the PostgreSQL 18 server; its archive listing was checked. Restore rehearsal was not performed in this release. |
| Data before activation | Eight active participants, eight active assignments, 68 reminder jobs and zero attempts. The queue included a past appointment dated 3 November. |
| Saved policy before activation | Version 2: advance interval 120 minutes, `responsible_team`, overdue reminders enabled with a 60-hour repeat. |
| SMS configuration | Production sending was explicitly disabled. Existing Micropay token and sender records are retained. |

Migration `009` expands the allowed advance interval to 4,320 minutes and relabels existing early reminder identities without replacing job IDs, attempt evidence or external outcomes. It preserves saved organization settings.

## Activation sequence and evidence

Keep dispatch disabled through the matching source deployment and reminder reconciliation. Set the advance interval to **4,320 minutes** through the existing validated, audited settings handler, preserving the other policy values. The administrative update must retain its operation receipt, settings history and explicit rollout attribution. The scheduler uses an existing active, identity-bound CEO membership.

The release still needs the pushed commit, Ready production deployment, accepted policy operation, production sending flag, registered reminder cron, and authenticated scheduled-run result recorded. Separate provider acceptance from handset delivery; an enabled flag or configured cron alone does not establish either result.

## Pause and rollback

1. Set production `MENTORING_SMS_SENDING_ENABLED=false` and redeploy the matching source. Verify the deployed runtime reports delivery blocked before treating dispatch as paused.
2. Preserve the shared cron secret and existing onboarding schedule. If reminder execution also needs to stop, remove or disable only the reminder schedule through the existing Vercel controls.
3. Retain jobs, attempts, operation receipts, settings history and provider references. Inspect in-flight or uncertain outcomes before resuming; never automatically replay an uncertain SMS handoff.
4. Prefer pausing sending over downgrading the application. Review schema and delivery-identity compatibility before any code rollback; do not edit applied migration checksums. A data restore requires a separately verified recovery procedure.

See the [operations guide](operations-handoff.md), [Micropay contract](micropay-integration.md) and [deployment history](deployment-preview.md) for the earlier evidence and operational boundaries.
