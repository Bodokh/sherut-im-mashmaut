# SMS production rollout — 9 November 2026

**Status: production SMS is enabled and deployed.** The user explicitly authorized pushing the latest version and enabling production SMS. The reminder and manual staff-message paths have recorded Micropay acceptance. Handset delivery is unconfirmed.

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

## Staff-message and reminder-phone update

**Follow-up deployed; Micropay accepted the controlled staff-message batch for all seven unique destinations.** Migration `010` was applied after a verified private `before-staff-messages.dump` backup. The earlier enabled reminder release above retains its own proof. Handset delivery remains unconfirmed.

The source adds an optional normalized mentee phone to automatic reminder text only after checking that the staff recipient currently has participant view access, including timed grants. SMS destinations remain validated staff mobiles; unauthorized or invalid mentee phones are omitted.

The CEO-only reminders-page composer supports selected staff or all available staff, a reviewed message of up to 1,000 characters, and explicit confirmation. `send_staff_sms` bypasses the offline queue and creates an audited central batch with one delivery per normalized destination phone. The same operation identity reuses its receipt; uncertain handoffs are not automatically replayed. Sender/recipient eligibility is rechecked at claim time, and recent CEO history distinguishes pending, provider-accepted and uncertain outcomes.

`010_staff_messages.sql` adds the durable batch and delivery tables. The source appends the sibling `/api/internal/mentoring/staff-messages` five-minute cron while preserving both existing crons and their shared authentication secret.

| Follow-up evidence | Verified result |
| --- | --- |
| Source and production deployment | `d36ef33b62c597feb6000a13369121b662359c55` is pushed to `main`. Deployment `dpl_HZTV1Gsx8pbWRDS3Z7WMNjSkuRJa` was Ready and aliased to both `www.imashmaut.co.il` and `staff.imashmaut.co.il` at `2026-11-09T13:46Z`. |
| Policy | Version 3 remains at 4,320 minutes, `responsible_team`, overdue reminders enabled and a 60-hour repeat. |
| Local checks | All 598 mentoring unit tests passed: 294 client and 304 server. An additional final eight-composer-test run, whole-repository lint, TypeScript and production build passed. |
| Focused PostgreSQL checks | Seven manual-queue cases and five reminder-phone cases passed. The full reminder PostgreSQL contention suite encountered local timeouts and did not pass; the focused cases are the retained database proof for this update. |
| UI evidence | HTTP/SSR fixture checks returned 200. Repeated browser-control timeouts prevented fresh interactive or mobile acceptance. The temporary QA fixture returned 404 in production. |
| Registered schedules | All three `*/5 * * * *` jobs are registered: staff onboarding, reminders and staff messages. Existing schedules and shared authentication are preserved. |
| Manual-message endpoint | The native cron preflight reached this exact deployment at `2026-11-09T13:47:16.654Z`, with `vercel-cron/1.0` and GET HTTP 200. Unauthenticated GET remained 401. |
| Controlled batch | Audited administrative rollout batch `9747ebde-115c-4f7c-989b-094fb26410f7` used a real bound CEO and the queue-creation helper, with explicit administrative attribution. No browser identity was fabricated; the provider token remained in Vercel. Two CEO accounts without mobiles were excluded. |
| Provider outcome | The manually triggered native run at `13:49:35.750Z` processed five deliveries. The registered schedule ran at `13:50:13.109Z` and completed the remaining two before a later manual trigger at `13:50:31.083Z`; each invocation returned HTTP 200. All seven unique staff destinations reached Micropay `provider_accepted` between `13:49:39Z` and `13:50:18Z`, with seven distinct task references and zero pending, failed or uncertain deliveries in this batch. |
| Receipt follow-up | Daniel was updated through WhatsApp at `13:51:30Z` and asked to confirm his and the staff's receipt. Missing staff numbers had been requested earlier. No handset-delivery confirmation was recorded at this checkpoint. |

The controlled send verifies the durable administrative batch and native production dispatch path. Interactive composer/mobile acceptance and handset receipt remain separate, unconfirmed checks.

## Pause and rollback

1. Set production `MENTORING_SMS_SENDING_ENABLED=false` and redeploy the matching source. Verify the deployed runtime reports delivery blocked before treating dispatch as paused.
2. Preserve the shared cron secret and existing onboarding schedule. If reminder execution also needs to stop, remove or disable only the reminder schedule through the existing Vercel controls.
3. Retain jobs, attempts, operation receipts, settings history and provider references. Inspect in-flight or uncertain outcomes before resuming; never automatically replay an uncertain SMS handoff.
4. Prefer pausing sending over downgrading the application. Review schema and delivery-identity compatibility before any code rollback; do not edit applied migration checksums. A data restore requires a separately verified recovery procedure.

See the [operations guide](operations-handoff.md), [Micropay contract](micropay-integration.md) and [deployment history](deployment-preview.md) for the earlier evidence and operational boundaries.
