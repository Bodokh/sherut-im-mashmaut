# SMS production rollout — 9 November 2026

**Status: production SMS is enabled and deployed.** The user explicitly authorized pushing the latest version and enabling production SMS. The scheduled production path ran and Micropay accepted two overdue reminders. Handset delivery is unconfirmed.

## Release scope

- The gallery and dual contact reminders are pushed to `main` as `db2f378768a9124208ab86b50d69affd94a8a5b8`, on top of `8c53651`, preserving the staff subdomain, staff invitations and existing onboarding cron.
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

| Step | Verified result |
| --- | --- |
| Source checks | Full local quality command and production build passed. The expiry change passed 65 targeted tests and an independent 27-check policy review. |
| Reminder reconciliation | Five past appointment jobs are cancelled as `superseded`. There were still zero attempts before live activation. Advance notices expire after the scheduled instant; scheduled-day notices remain valid until Israel midnight. |
| Audited policy operation | `77058b22-2229-4b08-812a-027bc5b36258` was accepted through the existing settings handler, with its operation receipt, settings history and administrative-rollout audit. |
| Saved policy | Version 3: advance interval **4,320 minutes**. `responsible_team`, overdue reminders enabled and the 60-hour repeat are unchanged. |
| Production environment | `MENTORING_SMS_SENDING_ENABLED=true` was saved for Production only. `MENTORING_REMINDER_ACTOR_ID` identifies an existing active, identity-bound CEO. Micropay token, sender and shared `CRON_SECRET` are unchanged. |
| Production deployment | [Feature deployment](https://sherut-im-mashmaut-6kkgjnbo7-bodokhs-projects.vercel.app), ID `dpl_8GxmtnP8E6UB75VSy4umpMyrb4VU`, is Ready and aliased to `www.imashmaut.co.il`. Its `codexReleaseSha` metadata matches `db2f378768a9124208ab86b50d69affd94a8a5b8`. The Git push had not queued a deployment, so the release used an explicit CLI production deployment. |
| Registered schedules | Vercel reports cron enabled, with both `/api/internal/mentoring/staff-onboarding` and `/api/internal/mentoring/reminders` set to `*/5 * * * *` on the exact feature deployment host. No undeployed or modified cron definitions remained. |
| Live routes | `/gallery` and `/en/gallery` returned 200 with eight photos each; a static gallery image and staff login returned 200. Anonymous workspace access remained 401. Unauthenticated reminder GET remained 401 and HEAD remained 405. SEO validation passed for all 26 localized pages. |
| Scheduled execution | `vercel crons run /api/internal/mentoring/reminders` triggered at `2026-11-09T09:50:49.404Z`. Production claims followed at `09:51:04Z` and `09:51:14Z`. |
| Provider outcome | Two overdue reminder attempts reached `provider_accepted`, each retaining a Micropay provider reference. At this checkpoint there were no `failed`, `uncertain` or `delivered` outcomes. |
| Remaining queue at the checkpoint | The five expired appointment jobs remained cancelled. There were 21 pending overdue jobs, including future work, and 18 jobs blocked by staff phone validation. The existing five-message batch continues on subsequent five-minute runs; future jobs wait until due. |

The live provider check exercised overdue reminders. Future three-day and scheduled-day deliveries were not due in this check; their timing and expiry have local regression coverage. Provider acceptance is separate from handset delivery. The earlier October controlled SMS and confirmed receipt retain their own evidence in the [Micropay contract](micropay-integration.md#confirmed-evidence).

## Pause and rollback

1. Set production `MENTORING_SMS_SENDING_ENABLED=false` and redeploy the matching source. Verify the deployed runtime reports delivery blocked before treating dispatch as paused.
2. Preserve the shared cron secret and existing onboarding schedule. If reminder execution also needs to stop, remove or disable only the reminder schedule through the existing Vercel controls.
3. Retain jobs, attempts, operation receipts, settings history and provider references. Inspect in-flight or uncertain outcomes before resuming; never automatically replay an uncertain SMS handoff.
4. Prefer pausing sending over downgrading the application. Review schema and delivery-identity compatibility before any code rollback; do not edit applied migration checksums. A data restore requires a separately verified recovery procedure.

See the [operations guide](operations-handoff.md), [Micropay contract](micropay-integration.md) and [deployment history](deployment-preview.md) for the earlier evidence and operational boundaries.
