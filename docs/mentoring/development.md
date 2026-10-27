# Mentoring development guide

Updated 27 October 2026. Fix `b15cb77eca4cb9ea4e88a9942949d66b4fb48f5f` is pushed/production Ready; **450 tests** (244 client/206 server),13 focused Google tests and lint/TypeScript passed. Actual first approved Google signup/login reached CEO/Online and user-confirmed working. Identity signup creates no staff authority. Production reload confirmation/unapproved-account test were not completed before user stop; see [deployment record](deployment-preview.md).

Historical local baseline: build `ZtyXUj8St-E_Hpz8dB7UQ`, 400 tests and bounded Chrome12/Firefox15/WebKit15 functional groups. Its WebKit15/2/1 diagnostics/automatic-transition limits and focused accessibility6/1/1 remain separate checkpoints; they are not freshly repeated by the latest Preview QA.

The final settled accessibility **6/1/1** is a separate focused run: eight page audits/nine strict controlled resizes pass; raw dialog guard findings/manual AT remain. Its clean browser-error accounting does not erase the earlier full-matrix failures. No app/core/SW changes or full WCAG/native-zoom/clipping acceptance is claimed.

The development project uses real Clerk authentication and Neon PostgreSQL. Both resources are connected to the development environment only. The interface uses functional shadcn/ui components based on Base UI, a scoped blue theme, Hebrew RTL, and a locally hosted Heebo font. The public website has a separate root layout.

## Production account ownership — launch gate

Production must use **separate client/organization-owned Vercel, Clerk, and Neon accounts**, with the client controlling billing and administrator access. Additional projects or instances in the developer's personal Vercel account or existing Clerk/Neon accounts do not satisfy this requirement.

Keep Development/Preview separate. Production Clerk/Neon, six migrations and three-owner preapproval/replay are verified; the tool passed13 tests. First approved Google CEO login works; read-only proof now shows two bound/one unbound of three active CEO memberships. Final client-owned handoff/operational acceptance remain open. Complete:

- Client-owned accounts and the production Vercel project, Clerk application/production instance, and Neon project/database.
- Client billing/admin ownership and fresh production credentials in the client-owned environment.
- Preserve Development/Preview keys; verify the separate Production instance's matching keys and live SDK/user journey.
- Database migrations and an agreed data handoff, keeping synthetic QA records out of production.
- Production domains and authentication configuration, including the settled every-login OTP solution.
- Verify corrected live-key DNS authentication: the automatic www proxy and official proxy update failed; development keeps `/__clerk`. Google connection settings are now saved, with actual OAuth acceptance pending. Strict every-login OTP remains a client decision/unproved gate.
- Verify Micropay delivery/reconciliation and hosted recurring dispatch separately; Preview is configured, Production sending disabled/no cron.

Account ownership and these integration checks are release gates; passing development tests does not establish production readiness.

Before deployment, use the latest Vercel CLI. The Vercel plugin reported the installed CLI outdated. This recommendation is for the future deployment step; this documentation work changes no global tools and performs no deployment.

## Run locally

Use a current Node.js runtime supporting native TypeScript stripping and `node:module.registerHooks` for the test commands. Install the locked dependencies:

```sh
rtk proxy npm ci
```

Populate `.env.local` from the project's development integrations. The application and setup scripts use these names; never commit or include their values in logs or screenshots.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser configuration for the development Clerk instance. |
| `CLERK_SECRET_KEY` | Server verification of Clerk identity. |
| `MENTORING_DATABASE_URL` | Pooled PostgreSQL application connection. |
| `MENTORING_DATABASE_URL_UNPOOLED` | Direct PostgreSQL connection for migrations and owner setup. |
| `CRON_SECRET` | Exact Bearer secret for the internal scheduled reminder GET endpoint. Configure privately in the intended hosted environment; no secret value belongs in documentation. |
| `MENTORING_REMINDER_ACTOR_ID` | UUID of an existing real active CEO membership in the fixed organization. It is centrally revalidated; no synthetic system account or request-selected actor. |

`.env*` files are ignored by Git. Preserve unrelated existing environment variables when refreshing integration configuration.

Apply all checked-in mentoring migrations to the intended **development database**, then start Next.js:

```sh
rtk proxy npm run db:mentoring:migrate
rtk proxy npm run dev
```

Open [the staff login](http://localhost:3000/staff/login). The migration runner uses a direct connection, checks migration order and applied checksums, and applies changes in a transaction under an advisory lock. It is not itself restricted to development: verify the target environment before running it. All checked-in migrations `001`–`006` have been applied to the existing development database: initial records, resource namespace, contact revision/history, authority/lifecycle, oversight/settings, and canonical reminder jobs/attempts.

For a local production-mode preview, stop the development server, build, and use a matching server/browser origin:

```sh
rtk proxy npm run build
rtk proxy npm run start -- --hostname localhost --port 3000
```

Browse `http://localhost:3000`. Using `localhost` consistently avoids the observed Clerk self-proxy loop caused by binding to `127.0.0.1` while browsing `localhost`. This preview runs locally against the development cloud resources; it is not a production deployment.

## Approve the first staff account

Creating a Clerk account does not grant staff access. An active, preapproved database membership must exist; only a provider-verified matching email can bind it to a Clerk user. Public signup never promotes the first user to CEO.

For an explicitly approved development owner, run:

```sh
rtk proxy node scripts/mentoring/bootstrap-owner.mjs --development --role ceo --email owner@example.org --name 'Approved development owner'
```

Replace the example identity with the approved owner. This creates a database membership only; it does not create a Clerk user, send an invitation, or enroll anyone in production. The owner signs up with the same email and completes verification. The bootstrap refuses production and does not modify, reactivate, or rebind an existing membership. Optional `--auth-user-id` binds an already approved Clerk identity directly.

Production uses its separate reviewed [preapproval tool](../../scripts/mentoring/bootstrap-production-owners.mjs), not a development-guard bypass. Thirteen tests and real three-owner apply/exact replay passed: three unbound CEO memberships/receipts/audit rows, no participant/job/attempt data. Production Clerk-user creation, verified-email binding and real login remain distinct acceptance steps.

The team screen supports scoped staff membership preapproval, staff edits and CEO revocation/reactivation with version checks. Preapproval does not create a Clerk account or send an invitation; the staff member creates a verified login using the approved email. These application intents can queue offline, but provider enrollment and central membership acceptance require connectivity.

### Google sign-in

Google is enabled in Development/Production. Callback allows signup transfer (`transferable: true`), forces post-auth `/staff`, and continues requirements through Clerk SignUp hash state without restarting password signup; link/MFA/reset paths remain. Verified-primary-email/active-preapproval staff access is enforced independently of identity creation. Actual first approved Google signup/login reached CEO/Online, with exact existing-membership binding confirmed read-only. Unapproved identities are denied403 by implementation/tests; an actual unapproved-production-account journey was not run. Production reload was triggered without visual confirmation before the user stopped further tests.

The server still resolves only active memberships, using provider-verified primary email for first binding. Google cannot create staff membership, reactivate an account or replace an existing binding. First-admin selection/consent/login is browser-proven above; additional account-link/MFA/recovery paths retain their recorded coverage and need applicable separate acceptance.

## Implemented workflow and storage

The current application contains staff home, participant list/detail, partial profile forms, primary mentor assignment, contact recording/correction/invalidation, appointment rescheduling/history, independent manual color/history, revision-specific review events, team administration, grants, CEO protection/unlock, lifecycle and logical delete/restore, monthly oversight/notes, settings, reminder diagnostics, and preserved-conflict/recovery views. Private records come from the authenticated API, not bundled demonstration data.

- `GET /api/mentoring/workspace` returns the current authorized working set.
- `POST /api/mentoring/commands` accepts validated, same-origin JSON commands. Identity and role come from the verified session and current membership, not request fields.
- `GET /api/internal/mentoring/reminders` is the reviewed scheduled server entry point. It uses private Bearer configuration and a real current CEO, separately from staff session commands. This route's implementation is not a hosted cron deployment or an SMS provider integration.
- PostgreSQL accepts contact, appointment, idempotency receipt, audit, and reminder-outbox changes within the command transaction. Current access and CEO protection are checked centrally.
- Successful phone/in-person contact anchors the next seven-day obligation at its actual occurrence time. No-answer attempts do not reset it. Manual color and revision-specific management review remain separate from the calculated deadline.
- Reassignment preserves the existing follow-up anchor and next appointment under the provisional continuity policy. The calendar/DST defaults remain documented product decisions, not newly confirmed client requirements.
- Corrections preserve the original contact author/receipt and separate correction attribution. Review events identify their exact revision. Changing the effective successful-contact anchor recomputes tracking and reminder generations atomically; a retained appointment can show `appointment_requires_review` until explicitly resolved.
- CEO-only authority commands manage grants, protection, lifecycle, tombstone/restore and staff authority. Coordinators initially assign within their own team; CEO authority is required to replace an existing primary mentor. Logical deletion is reversible; no hard purge is implemented.
- Provisional CEO protection targets supplied profile keys, `assignment` or `lifecycle` rather than adding a whole-participant lock for every action. Delete/restore preserve existing protection. Existing whole locks never auto-narrow; explicit locks/unlocks remain authoritative. CEO contact/correction/review protects that contact object. New completed contact preserves scheduling history without creating a permanent appointment lock; explicit/reschedule/correction schedule locks remain until CEO release. The [technical contract](technical-spec.md#6-authorization-and-ceo-protection) has current local proof and recorded core/contact PG proof; current browser acceptance remains open.
- Pause/close retain history, anchor and appointment, cancel unsent reminder jobs, and resume without resetting the deadline. Inactive participants reject new contact, assignment and rescheduling; authorized historical correction, review, profile maintenance and manual color remain available subject to protection.
- Monthly oversight distinguishes actual contact and receipt times, uses accepted baselines, and retains scoped versioned management notes. It does not invent a wellbeing score or reconstruct the historical roster from the current roster.
- Organization settings include a bounded offline lease and provisional reminder audience/timing. Canonical reminder jobs/attempts expose blocked, uncertain and delivery states truthfully; no SMS transport is currently configured.
- Fresh participant creation omits blank fields, while updates retain intentional clears. Prepared command ID/payload stays immutable. Stable draft scope/generation and dependency fixes now have current Chrome strict-19/native mentor and Firefox exact-draft proof, within the matrix scopes below.

The four visual requirements have current Chrome measured proof: equal card/flush-footer geometry, 44 px edit tooltip/dialog, centered Online/Offline states with a 20 px divider, and actual desktop/mobile light/dark media fills. Border/focus treatment is retained. This is bounded browser evidence, separate from client visual/accessibility acceptance.

Development/Preview keeps the supported `/__clerk` proxy and recorded SDK/UI authentication proof. Production live keys use the reviewed DNS correction after the rejected www proxy setting; final live verification is in the deployment record. Private auth responses remain separate from public SDK caches; proxy configuration alone does not prove offline reload.

## Scheduled reminder entry

The [route](../../app/api/internal/mentoring/reminders/route.ts) and [scheduled runner](../../lib/mentoring/features/reminders/scheduled.ts) are implemented/frozen with final code/security approval. Exact `Authorization: Bearer <CRON_SECRET>` is checked before database access. Only GET runs work; HEAD returns 405. The fixed organization and configured active CEO determine scope; query parameters cannot select an actor, organization, cursor, recipient or batch size.

Evaluation is at most five pages of 200 participants under a cooperative 20-second budget checked between pages. Incomplete scans return 503. After a complete scan, dispatch considers a batch of at most five under a 10-second budget. `scanComplete`/`more` describe evaluation, not a drained delivery queue. Responses expose aggregate counts, not participant/provider payloads, and are private/no-store.

Fresh work is CEO-guarded, with a final CEO recheck. After an already-authorized claim/provider handoff, exact claim-token outcome recording can preserve provider evidence even if the actor was revoked; it cannot authorize fresh sends or unrelated writes. This prevents losing a known result without treating revocation as permission to keep dispatching.

Missing configuration, incomplete evaluation, unavailable authority and blocked delivery are not success. Recorded empty-development smoke returned HEAD405/missing Bearer401/authenticated503 `delivery_blocked`, with zero dispatch outcomes. Separate populated direct-route/PostgreSQL proof scanned3/planned4 blocked active-assigned jobs, none paused/unassigned; repeat and negative-authority checks preserved jobs. That run's registry was null/attempts/claims/sends/outcomes zero. It is not hosted/provider acceptance. Current Micropay Preview configuration is separate; no hosted cron is configured.

See the [domain policy notes](../../lib/mentoring/domain/README.md) and [technical specification](technical-spec.md) for the rules and outstanding decisions.

## Offline behavior and recovery

The client requires **all authorized application reads and edits to work offline**. The implementation supports the prepared authorized working set, durable mentoring form drafts and offline intent for all domain commands, including review, staff membership/authority, grants, protection, lifecycle/delete/restore, settings, monthly notes and conflict decisions. First-time sign-in/OTP, authentication-provider account enrollment, central acceptance and enforcement on other devices require a connection.

Durable autosave uses the shared form-draft path for mentoring inputs, including administrative forms and selected action intent. Authentication passwords and one-time codes are not persisted as mentoring drafts. A draft is editable input; a finalized operation has an immutable ID/payload. Reopening an incomplete draft must not submit it. An uncertain prior submission reconciles its original operation before a new action is allowed.

After a successful online authorization, IndexedDB stores the authorized snapshot, field drafts, immutable pending commands and receipts scoped to the Clerk account, organization and staff membership. The provisional server-issued lease lasts at most 24 hours and settings can shorten it. Pending grants, staff activation/role changes, assignment changes and protection unlocks do not expand accepted readable or editable authority. An expired lease requires renewed online authorization.

The service worker prepares only the generic anonymous `/staff/offline` shell and public assets. It does not cache private API responses, authentication responses or React Server Component responses. Local drafts, queued operations and centrally accepted changes have distinct feedback. Reconnection revalidates current permissions and versions before accepting any intent.

Identity/authority changes, access denial and expiry lock local work in quarantine rather than automatically wiping it. Fresh online authorization of the same account/organization/membership and explicit recovery are required before authorized payloads become readable. Inaccessible work remains locked. Recovered pending intents stay blocked for review and a fresh action; they are not silently replayed. Explicit logout warns about drafts/pending work before discarding local data.

The earlier Chrome checks establish a bounded cold-restart and reconnect journey. The broader current role/action/recovery flows need current browser execution and agreed device/storage acceptance. The 24-hour validity and recovery choices remain provisional policy, not newly confirmed client guarantees.

## Verification commands

```sh
rtk proxy npm run check:mentoring
rtk proxy npm run build
```

The reviewed `check:mentoring` entry point passed all four local stages: mentoring unit tests, whole-repository ESLint, Next route type generation and TypeScript. It accepts no arguments and does not build/start the app, migrate, run database integration or configure providers. Build and acceptance are separate; repeat checks only for changed code or a new concern. See the [command source](../../scripts/mentoring/check.mjs).

`test:mentoring` discovers non-integration tests under `tests/mentoring` and `components/mentoring`, including the domain, command/schema, reminder, oversight, offline and UI state checks. Real PostgreSQL suites are separate and opt-in. Apply every migration first, reserve an exclusive development database window, and run the suites serially:

```sh
rtk proxy env MENTORING_INTEGRATION_TESTS=1 node --conditions=react-server --import ./tests/mentoring/server/typescript-loader.mjs --test tests/mentoring/server/*.test.mjs
rtk proxy env MENTORING_INTEGRATION_TESTS=1 node --conditions=react-server --import ./tests/mentoring/server/typescript-loader.mjs --test tests/mentoring/contacts/postgres.integration.test.mjs
rtk proxy env MENTORING_INTEGRATION_TESTS=1 node --conditions=react-server --import ./tests/mentoring/server/typescript-loader.mjs --test tests/mentoring/authority/postgres.integration.test.mjs
rtk proxy env MENTORING_INTEGRATION_TESTS=1 node --conditions=react-server --import ./tests/mentoring/server/typescript-loader.mjs --test tests/mentoring/oversight/postgres.integration.test.mjs
rtk proxy env MENTORING_INTEGRATION_TESTS=1 node --conditions=react-server --import ./tests/mentoring/server/typescript-loader.mjs --test tests/mentoring/reminders/postgres.integration.test.mjs
```

The suites create and clean their own synthetic fixtures, refuse production, and have shared organization-wide reminder effects. Do not overlap them with browser fixture creation, reminder scans or other database tests. The core suite requires an empty participant baseline. Check fixture cleanup after the final suite; preserve the approved QA membership. See [server test notes](../../tests/mentoring/server/README.md) and [browser test notes](../../tests/mentoring/e2e/README.md).

Focused scheduled-entry contract tests are included in the full local suite and can run separately:

```sh
rtk proxy node --conditions=react-server --import ./tests/mentoring/server/typescript-loader.mjs --test tests/mentoring/server/scheduled-route.test.mjs tests/mentoring/reminders/scheduled.test.mjs tests/mentoring/reminders/scheduled-outcome.test.mjs
```

The actual route-function/PostgreSQL smoke is opt-in and requires the exclusive empty development baseline with the retained approved QA membership/settings. It generates process-local test authentication; it does not configure hosted credentials or send SMS:

```sh
rtk proxy env MENTORING_SCHEDULED_SMOKE=approved node --conditions=react-server tests/mentoring/reminders/scheduled.smoke.mjs --development-empty-only
```

The separate [populated route harness](../../tests/mentoring/reminders/scheduled-populated.mjs) also requires an exclusive database window, clean baseline and explicit fixture approval. Its guards intentionally bind approved development resources; never bypass them or point it at production. It leaves delivery blocked:

```sh
rtk proxy env MENTORING_SCHEDULER_POPULATED=approved MENTORING_QA_WRITES=approved node --conditions=react-server tests/mentoring/reminders/scheduled-populated.mjs --development-populated-only
```

The current verification checkpoint is recorded in [readiness](readiness.md). At this documentation checkpoint:

| Check | Recorded result |
| --- | --- |
| Earlier first-slice local suite | Historical **87/87 passed**. The new feature tests are not included in that total. |
| Earlier real Neon core server suite with migrations 001–006 | Historical **26 passing results**, including overlapping validation results; fixture cleanup verified. Source changed during that run. |
| Earlier expanded core regression suite | Historical **26 passed / 3 failed** (two failing cases plus their container), exposing overly broad automatic whole-participant protection. Preserved as the failure leading to the fix; unchanged original assertions now pass. |
| Recorded frozen-source core PostgreSQL checkpoint | **30/30 passed, 0 skipped** in about 235.7 seconds; hashes matched within that run. Includes CEO create/empty-create, exact TA-02 SQL `22012` rollback and current-role receipt cases. Assertions unchanged; core PG suite not rerun after new optional dispatcher caller wiring. |
| Current full local suite | **400/400 passed**: 239 client and 161 server, zero failures/skips. Earlier focused/full-suite results overlap and are not added to this total. |
| Current service-worker source tests | **38/38 passed** against actual source. Reviewed durable public-SDK response normalization is frozen at the SHA-256 recorded in [readiness](readiness.md). |
| Authority PostgreSQL suite | Historical **10/10 passed**; historical focused workspace invocation **3/3 passed**. Both predate the final automatic-protection scope change. Post-policy focused unit/handler checks and review passed; no fresh authority PG invocation is claimed. |
| Recorded contact PostgreSQL checkpoint | **16/16 passed**, including 15 subcases; 28 monitored hashes matched within that run and cleanup was verified. Not a newest whole-source hash claim after the dispatcher option. |
| Oversight PostgreSQL suite | Historical **4/4 passed** against feature handlers/PostgreSQL before final protection changes; shared command dispatcher not exercised in this invocation. |
| Reminder PostgreSQL suite / development CLI | Historical **9/9 passed**, including eight subcases, before final protection changes. Actual CLI scanned/planned zero records and explicitly reported delivery blocked. No SMS/provider proof. |
| Recorded empty-smoke cleanup | Scheduled smoke verified **22 zero counters before/after**, exact QA membership/settings unchanged at **v6/v1**, and six source hashes stable within that run. Later runs record their own cleanup. |
| Current build/static checkpoint | Final source build **`ZtyXUj8St-E_Hpz8dB7UQ` passed**. 400 tests, whole TypeScript/scoped lint passed before it; post-build generated-type recheck also passed with exit 0 and empty diagnostics. Earlier builds are historical. Latest recorded audit: zero vulnerabilities. |
| Current HTTP smoke | Public `/`, `/about`, `/contact` **200**; anonymous staff **307** to login and workspace **401**; scheduled GET **503 `not_configured`** / HEAD **405**, both no-store; same-origin SDK **200**, JavaScript **324,867 bytes**. Local production-mode proof only. |
| Final QA/static and health closure | Changed QA/scripts ESLint/diff pass; latest helper hash matched. Zty/worker unchanged, login **200**/anonymous workspace **401**. No app/core/SW/framework/dependency/production changes; all browser profiles closed/deleted. |
| Historical broad Chrome proof | **39 groups passed** on earlier source. Separate from the current bounded 12-group run; do not add overlapping totals. |
| Final current-build Chrome | **12/12 bounded groups passed**, zero failed/not-tested/browser errors, Google Chrome **156.0.8078.48** on exact Zty build. Strict 19 drafts restore across native offline restart; actual assigned mentor with no active personal grant syncs contact/appointment once and duplicate replay stays duplicate-safe. |
| Current Chrome measured style | Populated long-team desktop/mobile media, equal card/footer geometry, centered Online/Offline/20 px divider and 44 px edit tooltip/dialog passed. Four current synthetic images are linked below. |
| Final cleanup | Independent full `to_jsonb` original QA actor/settings equality at v6/v1; 22 counters zero; two participants/three staff/two contacts removed; all private profiles deleted. Updated WebKit also closed/cleaned. Final changed-file lint/diff pass; build/worker unchanged. |
| Recorded Development/Preview proxy proof | `/__clerk` implementation/SDK/UI auth passed in the recorded development checkpoints. Production's rejected www proxy setting/live-key DNS correction and live verification are tracked separately. |
| Firefox online controlled reload | Fixed after reviewed SDK normalization: two real reloads **3.185 s / 3.159 s**, Clerk global/loaded/user/session true and workspace GET **200**. |
| Earlier Firefox offline control | Source-free zero-route warm/cold shell checks passed, cold **1,048 ms**; original registration persisted. Superseded in scope by the exact-draft matrix below. |
| Final Firefox 153 matrix | **15/15 groups passed**: real auth/SW reload/soft RSC, 16 desktop/mobile routes, dialogs/filters/keyboard, actual light/dark at both sizes, exact synthetic draft after strict offline-at-construction native cold restart, five offline routes and same-identity reconnect. Zero mutations/app-fatal errors. |
| Recorded WebKit 26.5 / Playwright 1.62.1 matrix | Historical **13 online passes**, with before-app native failure and no native-draft proof in that run. Two other full-navigation CORS-shaped errors remain recorded. |
| Recorded 1.62.1 matrix closure | Historical **28 passed / 2 failed / 1 not tested**; probe blocked/not-tested. Profiles/processes cleaned. Keep this separate from the newer focused result. |
| Earlier isolated 1.64.1 / WebKit 27.2 r2370 focused run | **Six functional gates passed**: auth/OTP, SDK/UI, SW reload, protected soft RSC, exact strict-native draft/five offline routes/reconnect; 0 mentoring attempts. Recorded **6/1/2** includes one caught local-fetch diagnostic and then-unrepeated full matrix/vendor probe. Historical checkpoint, not current remaining full-matrix work. |
| Earlier full fixed-runtime attempt | Stopped before authentication with preview server off. Exact Zty preview was restarted; retain this separate failed attempt without claiming a source fix. |
| Full fixed-runtime WebKit 27.2 / Playwright 1.64.1 matrix | **15 passed / 2 failed / 1 not tested**: fifteen functional groups include real Continue auth, first-party SDK, reload/soft RSC, all 16 staff routes, desktop/mobile media/keyboard/dialogs, exact native draft/five offline routes/reconnect. **0 mentoring attempts, no protocol-route interception; profile deleted.** |
| Current WebKit limits | Automatic post-verification navigation was unobserved within ten seconds; legitimate Continue worked. Strict no-errors failed with **44 CORS-shaped diagnostics**; passive correlation establishes no cause, with no unexpected failed RSC chain. Source-only auth review found no concrete app bug. Vendor probe/Safari/iPhone remain untested; no fix/zero-diagnostics claim. |
| WebKit deterministic quota-write helper | **Two injections passed**: no false saved indicator; stored A intact/edited B visible; Retry makes B durable and reopen restores it. **0 operations/commands and 0 browser/console fault diagnostics in this helper.** Physical exhaustion and committed-contact response loss are untested. |
| Initial accessibility audit | Eight actual staff pages: axe **0 violations/0 incomplete**. Raw dialog probe has two unnamed role-button findings, one contrast finding and incomplete checks; resize has nine immediate font mismatches. Preserve separately from later evidence. |
| Settled accessibility diagnostic | **500 ms** settling gives contrast **0 violations/0 incomplete**; nine `transition-all` font mismatches settle to **0 after 160 ms** at width 1440. Remaining two unnamed Base UI guards/four hidden-focus incomplete checks sit outside the popup; [upstream explanation](https://github.com/floating-ui/floating-ui/issues/2823) matches Safari VoiceOver design. Recorded separately from final audit; no app fix. |
| Final settled accessibility focused run | **6 passed/1 failed/1 not tested**; real auth/reload/soft RSC and strict browser-error accounting pass in this run. Eight staff pages axe **0 violations/0 incomplete**; all nine text-resize views strictly double checked fonts/glyph ratio2 at width1440, no overflow/popup fits; fonts settle **165–180 ms**, no timeout. |
| Final dialog/cleanup boundary | Raw axe fails **two `aria-command-name` guard findings**; **four `aria-hidden-focus` incomplete** checks outside popup. Contrast **0/0** after **501 ms** readiness. Manual AT not tested; no native-zoom/clipping/full WCAG claim. All profiles closed/deleted,0 mentoring attempts, DB window released; Zty/app/core/SW unchanged. Earlier full-matrix failures retained. |
| Diagnostic restoration | The temporary metadata-only worker trace was restored byte-exactly and removed. Reviewed durable normalization is a separate intentional source change. |
| Scheduled server entry / empty smoke | Implemented/frozen, final code/security approved; empty-dev function/PostgreSQL smoke passed with explicit delivery-blocked 503 and zero scan/dispatch outcomes. No hosted/provider acceptance. |
| Populated scheduled-route integration | **Passed once**: scanned 3/planned 4 blocked active-assigned jobs, none paused/unassigned; canonical repeat unchanged, three negative authorities generic 503/jobs unchanged. Registry null and attempts/claims/sends/outcomes zero. **22 counters zero before/after, full original actor/settings v6/v1 exact, 12 hashes stable.** Outside 400 local tests; no hosted/provider proof. |
| Earlier development browser journeys | Historical password/Device Trust, email binding, basic staff/participant/contact/review/preferences passed. The code has since expanded. |
| Earlier offline/browser checks | Historical cold restart, cached navigation, draft/queue persistence and exactly-once reconnect passed with no observed page/Base UI/hydration errors. Current broader flows remain to be checked. |
| Earlier visual/fixture checks | Bounded Chrome contrast/overflow checks passed and synthetic fixtures/profiles were cleaned; approved development QA identity and CEO membership retained. These are not current full-system or device-matrix acceptance. |

One explicitly approved synthetic Clerk test identity exists only in development. Its backend-created email is administrator-verified, so the historical sign-in checks do not prove the signup email-code flow. That flow, new management/recovery journeys and supported-browser acceptance require their own evidence. Do not add overlapping test counts or treat source/test presence as execution. A local production-mode build and preview do not replace the client-owned production account gate above.

Earlier stopped attempts exposed driver selectors and frontend draft/creation issues; fixes and exact cleanup/restoration were verified. Current Firefox and updated-WebKit have exact native draft recovery/reconnect proof. The old WebKit failure remains historical. Password/OTP proof does not settle production every-login OTP.

The optional dispatcher `resultTransaction` preserves prior callers. Core 30/30/contact 16/16 remain recorded checkpoints and were not rerun after it. Latest proof includes 400 local tests, empty/populated scheduled-route integration and current native Chrome assigned-mentor contact/appointment/sync-once/dedup. The populated route result is not a fresh core/contact PG-suite run; unrelated suites need not repeat without a new concern.

The old WebKit 1.62.1 native error matches [upstream evidence](readiness.md). Measured isolated 1.64.1/WebKit 27.2 r2370 execution now passes the exact native case, including the completed full matrix, without changing app/bundled/global dependencies. Actual Safari/iPhone acceptance remains separate.

The earlier focused diagnostic resolves to `WorkspaceController.loadAuthoritative`'s local workspace GET, caught by `synchronizeUnlocked`. Its catch path restores valid leased data and keeps fresh recovery gated; that run confirmed exact draft/reconnect, two workspace GETs 200, valid Clerk state, no stuck skeleton and zero mutations. Its missing timing/request/failure detail leaves the trigger unattributed. The later full run's 44 CORS-shaped diagnostics have no established cause and are not all attributed to that catch path. Retain automatic-transition and strict-cleanliness failures; source-only auth review established no concrete app bug or justified fix.

## Curated visual evidence

These four current captures show **synthetic records from the passing Chrome run before exact fixture cleanup**. They are review evidence, not populated live data after cleanup.

- [Dashboard desktop](qa/completion-dashboard-desktop.png)
- [Team desktop](qa/completion-team-desktop.png)
- [Contact mobile](qa/completion-contact-mobile.png)
- [Oversight desktop](qa/completion-oversight-desktop.png)

## External blockers and acceptance work

- **Every-login OTP in production:** the free Clerk Device Trust flow verifies new browsers/devices. It does not fulfill a code on every login. The production authentication configuration/plan still needs a settled solution.
- **Allowed sign-in methods:** Development allows email code/Google/password, username disabled. Production email/password defaults and approved Google connection/sign-in settings are saved. Actual OAuth journey and strict every-login OTP remain unproved; a custom password form does not enforce provider policy.
- **Production SDK transport:** rejected www proxy configuration led to pushed live-key DNS/development-key proxy correction. Final live SDK/user verification is recorded in the deployment record.
- **Staff SMS:** Micropay adapter/Preview configuration is implemented and enabled; recorded Preview QA sent nothing. Production sending=false/no cron. Actual provider handoff/delivery/reconciliation require their separate evidence; see the provider record.
- **Scheduled entry and hosted execution:** recorded empty/populated direct-route/PostgreSQL checks used blocked delivery. No hosted cron or scheduled operational acceptance is claimed; current Micropay integration does not convert those earlier runs into delivery proof.
- **Policy acceptance:** cadence boundaries, coordinator/delegation scope, correction/approval, protection, lifecycle/retention, offline validity/recovery, reminder policy and report/intake details remain provisional. Implemented tombstones do not settle hard-purge policy.
- **Retained diagnostic/testing limits:** preserve WebKit's unconfirmed automatic transition, 44 unattributed CORS-shaped diagnostics/strict-cleanliness failure, vendor probe and actual Safari/iPhone limits. Deterministic quota recovery passes; physical exhaustion/contact-response loss remain untested. Final focused audit retains raw Base UI guard findings/manual AT/native zoom/clipping limits. These are separate from production/provider and client acceptance gates.
- **Client acceptance and release:** browser/device/accessibility/scale targets, stakeholder walkthroughs, production account ownership/rollout, data handoff, training, support and acceptance terms remain separate gates. These are not all credential blockers.

Use the [implementation plan](implementation-plan.md) and [decision register](decision-register.md) to close those requirements. A successful local demonstration does not close the release acceptance criteria.

The scope audit found no additional settled staff-workflow gap. Ancillary tasks/calendar/intake/documents/English/export decisions remain open/proposed deferrals. Agreed client/device/volume acceptance, operational rehearsal/handoff, hosted/provider proof and policy decisions mean the remaining work is not credentials alone.
