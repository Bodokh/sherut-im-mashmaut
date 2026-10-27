# Operations and handoff guide

Prepared 27 October 2026. **Production first-admin Google login is user-confirmed working; operational acceptance/restore rehearsal remain open.** See [deployment status](deployment-preview.md), [development commands](development.md#verification-commands) and the [decision register](decision-register.md).

## Ownership and configuration

Final production Vercel/Clerk/Neon accounts must be separate and client-owned, including billing/admin control. Distinct production resources/configuration now exist; Development/Preview are preserved and final ownership/handoff is not accepted. Record build/target/migrations, administrators, restore evidence, exceptions and support terms.

| Responsibility | Named owner / backup / contact |
| --- | --- |
| Client account, billing and domain | TBD / TBD / TBD |
| Product/incident authority | CEO name/contact TBD |
| Technical incident lead | TBD / TBD / TBD |
| Backup/restore operator | TBD / TBD / TBD |
| Staff access/onboarding | TBD / TBD / TBD |
| SMS/hosted-schedule operations | TBD / TBD / TBD |

Store values privately; never in docs/screenshots/logs. Preserve unrelated public-site configuration.

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Selected Clerk instance browser/server configuration. |
| `MENTORING_DATABASE_URL` | Runtime PostgreSQL connection. |
| `MENTORING_DATABASE_URL_UNPOOLED` | Required direct migration/bootstrap connection, without `-pooler`. |
| `CRON_SECRET` | Exact Bearer secret for internal reminder GET. |
| `MENTORING_REMINDER_ACTOR_ID` | Existing real active CEO membership in the fixed organization. |
| `NODE_ENV`, `VERCEL_ENV` | Environment guards; not independent database-target verification. |

Production live-key DNS/development-key proxy and Google identity signup now work: first approved administrator reached CEO/Online, user confirmed. Reload confirmation and an unapproved-production-account test were not completed before user stop. Identity signup creates no staff authorization. Production SMS remains paused/brand-restricted/no automatic cron; see deployment/provider records without credentials.

## Target, migration and owner setup

Independently verify account owner, environment/project/branch/database and direct endpoint using approved provider records. Record non-secret target IDs and change/backup approval. The [runner](../../scripts/mentoring/migrate.mjs) has **no dry-run, production prohibition or target-identity check**.

Order: `001_initial.sql` → `002_resource_namespace.sql` → `003_contacts.sql` → `004_authority.sql` → `005_oversight.sql` → `006_reminders.sql`.

Applied SHA-256 history is in `mentoring.schema_migrations`; missing/changed applied files, duplicate versions and older pending versions fail. All pending SQL/registry inserts use one transaction/advisory lock. Failure rolls back that pending batch. Never edit applied SQL/checksums or delete records to force success.

After verified target/backup/change review:

```sh
rtk proxy npm run db:mentoring:migrate
```

Retain versions/checksums/outcome without connection strings or narratives. The reviewed local quality command has passed all four stages: unit tests, whole-repository ESLint, Next route type generation and TypeScript. It does not build/start the app, migrate, run DB integration or configure providers:

```sh
rtk proxy npm run check:mentoring
```

Use it for a changed-code preflight; do not repeat completed suites without a new concern. Production build and real acceptance remain separate.

[Development bootstrap](../../scripts/mentoring/bootstrap-owner.mjs) remains guarded; never bypass it for production. Separate [production preapproval](../../scripts/mentoring/bootstrap-production-owners.mjs) passed13 tests/real three-owner apply/exact replay, initially three unbound memberships/receipts/audits. Later read-only proof found three active CEOs/two bound/one unbound, participants/jobs/attempts0; the first Google administrator is browser-proven with verified primary email/exact existing active membership binding. The tool itself creates no Clerk users; identity and staff authority remain separate.

## Backup/restore rehearsal and rollback

No backup/restore command or down migrations exists in the repo. The named operator must verify official provider instructions, plan capabilities, retention and access; no unverified provider-specific command is prescribed.

1. Record source app/schema, target IDs, approved dataset, recovery point/objectives and maintenance/write-control procedure. Do not invent a maintenance flag.
2. Create the backup using the verified method; record identifier/time, access/retention and evidence location without secret/data payloads.
3. Restore into an **isolated approved target**, not the live source. Match application/schema; later migrations require review.
4. Keep future hosted reminders/provider sending paused. Verify scoped access, CEO protection, assignment/contact/appointment/review history, receipts and reminder state; compare agreed counts/relationships and unintended-send checks.
5. Record recovery duration/loss window/exceptions and operator/approver sign-off. Reconcile pending local work and uncertain provider results before resuming. Record target retention/disposal. Until executed, mark **not rehearsed**.

A failed pending transaction rolls back; a committed migration does not. With no down scripts, use rehearsed restore or reviewed forward migration. Older deployment rollback requires schema compatibility. Preserve history/receipts/claim evidence; logical delete is not backup/hard purge. Never blindly resend uncertain SMS or drain stale offline intent after restore.

## Scheduler and launch gates

Reviewed `GET /api/internal/mentoring/reminders` checks exact Bearer before DB, rejects HEAD405 and uses a current configured CEO/fixed scope with no query override. Cooperative scan: 5×200 records/20s; incomplete503. Dispatcher: at most five/10s. `scanComplete` is evaluation, not queue drain. Exact existing claim outcomes remain recordable after revocation; fresh work stays guarded.

Recorded direct-route/PostgreSQL checks used blocked delivery. Micropay is configured in Preview; Production SMS stays paused/brand-restricted and **no automatic cron** is configured. First-admin Google login is accepted as above. Provider delivery/reconciliation, hosted scheduling, strict every-login OTP/client decisions and final client-owned handoff remain open. CEO self-mute is not an organizational delivery pause. Deployment used CLI65.4.0 via `npx`; no global tool change is claimed.

## Incident handoff

- Capture exact case, build/environment, time and operation/job reference with the named lead; omit credentials/cookies/narratives.
- Distinguish draft/pending/central acceptance and provider accepted/delivered/uncertain. Check current authority, lease, revision and history.
- Use only approved maintenance/schedule/provider controls; record their eventual procedures before launch. Preserve in-flight claims rather than promising recall.
- Record impact, containment, owner, next update and real recovery evidence. Readiness retains WebKit's unconfirmed automatic auth transition and CORS-shaped diagnostics with unestablished cause; tested native recovery passes and no concrete app bug was established.
