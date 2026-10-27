# Existing-account Vercel preview

Updated 27 October 2026. **Production first-time Google administrator login passed and the user confirmed it works.** Fix `b15cb77eca4cb9ea4e88a9942949d66b4fb48f5f` is pushed, production Ready; 450 tests pass. Testing stopped at the user's request.

## Scope

- Existing linked `bodokhs-projects/sherut-im-mashmaut`: initial Preview followed by authorized `main` production deployment; preserve public website content.
- Current `main`, no preview branch: application `e25bc6f518a6c42dac357de49ab632f8754b2026` and auth fix `9a9b901` are **pushed**. Root owns releases; unrelated public-privacy edits are outside this record.
- Preview retains development Clerk/Neon. Newly prepared production resources are separate; final separate client-owned production accounts/control and handoff acceptance remain open.
- Vercel CLI **65.4.0** via `npx`. The initial upload had no application/dependency changes; the later worker correction has actual hosted login/reload proof.

## Configuration and upload boundary

Three existing development values were successfully configured for **Preview only**, stored privately:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `MENTORING_DATABASE_URL` (pooled runtime connection)

No values belong in this record. `MENTORING_DATABASE_URL_UNPOOLED` and `CRON_SECRET` were outside the initial Preview configuration. Later integration code does not by itself establish hosted scheduling or actual SMS delivery.

The reviewed root `.vercelignore` upload preflight identified **223 regular inputs, approximately 5.73 MB**, retaining all 13 required inputs, with no excluded private files or symlinks in the upload manifest. It excludes private environment/local tool settings, `.agents`, docs, test artifacts, scripts and database files. All 223 source fingerprints remained stable during the initial upload.

## Initial hosted checkpoint — not accepted

[Initial preview](https://sherut-im-mashmaut-2in5b5nsr-bodokhs-projects.vercel.app): Vercel **Ready in 36 seconds**.

- Actual in-app-browser password/test-OTP sign-in automatically reached the Online dashboard with the approved QA CEO. Vercel request logs confirmed two workspace GETs **200**.
- Normal reload **failed**, stuck loading the SDK. Main SDK/UI requests reported `ERR_FAILED`; 22 Next static responses were **200** through the worker.
- Source diagnosis: forced `credentials: omit` on same-origin `/__clerk` JavaScript conflicted with protected Preview SSO. The later correction preserves caller credentials for first-party SDK requests and keeps external SDK requests anonymous.
- Preview HTTP checks redirected **302** to `/sso-api`, preserving platform protection. No production/account resources changed in this initial checkpoint.

## Corrected candidate checkpoint

[Second preview](https://sherut-im-mashmaut-539woj5pu-bodokhs-projects.vercel.app/staff) was **Ready** with the worker-only correction/earlier copy. QA password/OTP sign-in reached Online and full reload returned Online. This historical bounded proof predates neutral copy/SMS. Its local checkpoint was405 passed (244 client/161 server).

## Integrated Preview — bounded hosted QA passed

[Integrated preview](https://sherut-im-mashmaut-eotac3uky-bodokhs-projects.vercel.app/staff) was **Ready** with442 tests (244 client/198 server) and static stages passed. All232 runtime hashes matched the upload. Neutral staff copy, feminine participant references and existing names/data/public marketing copy are preserved.

| Check | Confirmed result |
| --- | --- |
| Integrated immutable URL / Vercel result | Ready, linked above |
| Hosted staff/reload | Approved development QA login/email code → `/staff` Online; full reload preserved signed-in workspace/Online. |
| Hosted reminders/team | Provider configured/sending enabled/automatic scan unconfigured; neutral team roles and compact icon edit action verified. No scan, mutation or send in this QA run. |
| Broader hosted/anonymous/device acceptance | Not repeated by this bounded run; earlier platform protection and local evidence retain their own scope. |
| `main` commit / push | Application `e25bc6f518a6c42dac357de49ab632f8754b2026` pushed; later auth fix `9a9b901` pushed. |

## Production deployment and auth correction

[Production deployment](https://sherut-im-mashmaut-gzf78baka-bodokhs-projects.vercel.app) is **Ready for exactly `e25bc6f518a6c42dac357de49ab632f8754b2026`**. Canonical www login/signup returned **200**, private/no-store/noindex; anonymous workspace returned **401**. SDK initialization failed `host_invalid`, so real sign-in was not accepted.

The official www proxy update was rejected `form_param_format_invalid` (“Cannot be on a different domain”); domain remained root/proxy unset. Fix **`9a9b901`** uses verified live Clerk DNS, retaining the development-key proxy. **445 tests** (244 client/201 server) and lint/typegen/TypeScript passed.

[Corrected production](https://sherut-im-mashmaut-p6agna04y-bodokhs-projects.vercel.app) was **Ready for `9a9b901`**. Live login reload showed Google/email/password enabled; direct FAPI200/errors empty. The first Google attempt failed the old existing-account-only callback. That failure predates the successful onboarding fix below.

Onboarding fix **`b15cb77eca4cb9ea4e88a9942949d66b4fb48f5f`** is **pushed; production Ready**. It permits identity signup transfer/post-auth `/staff` and Clerk SignUp continuation without restarting password signup; account-link/MFA/reset paths remain. Identity creation grants no staff membership: verified primary email/active preapproval still govern access. **450 tests** (244 client/206 server),13 focused Google tests and lint/TypeScript passed.

Actual first-time Google signup/consent for an approved administrator reached [production staff](https://www.imashmaut.co.il/staff), **Online, CEO**; the user confirmed it works. Read-only provider/database proof found two approved identities, three active CEO memberships, **two bound/one unbound**, and zero participants/jobs/attempts. The browser-tested identity's verified primary email/external Google identity matched its exact existing active CEO membership/version2. No personal identifiers are recorded here. A full reload was triggered but not visually confirmed before the user stopped testing; no actual unapproved-production-account test was performed. Do not infer fresh team visuals or a second browser login from the read-only counts.

## Separate production preparation

- New free Clerk resource **`sherut-mentoring-production-auth`** uses `imashmaut.co.il`, connected to **Production only**; live keys' decoded host `clerk.imashmaut.co.il` was verified. Original `sherut-mentoring-staff` is Development-only; Preview retains development keys.
- A fresh independent production Neon project/branch received all six migrations; its sensitive runtime connection was saved privately.
- Reviewed production preapproval tool: **13 tests passed**, real three-owner apply/exact replay passed: **three unbound CEO memberships, three receipts, three audit rows**, no participants/jobs/attempts. This creates memberships, not production Clerk users/login.
- Clerk Frontend API, Account Portal and **three email DNS checks** Verified/SSL issued; original **15 records exact**. Email/password minimum15, verification/Device Trust defaults verified. Strict every-login OTP remains a client decision/unproved acceptance gate.
- Production Google credentials, enabled connection and sign-in switch were saved/confirmed after explicit approval; callback remains `https://clerk.imashmaut.co.il/v1/oauth_callback`. First-admin account selection/consent/sign-in passed as recorded above; account-linking acceptance remains separate.
- Four production Micropay settings were saved with **sending=false**; no production cron or production SMS send. Preview sending is enabled; this hosted QA sent nothing.

## Remaining launch work

Keep [local evidence](readiness.md), [client acceptance](acceptance-checklist.md), and [operational handoff](operations-handoff.md) separate. Production [SMS](micropay-integration.md) stays paused/brand-restricted with no automatic cron; configuration is not handset-delivery proof. Future WhatsApp is optional alongside required SMS. Strict every-login OTP/client decisions, restore rehearsal and separate client-owned account/control handoff remain open. No further browser testing was performed after the user stopped it.
