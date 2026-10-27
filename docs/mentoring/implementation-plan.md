# Mentoring system implementation plan

Version 0.4 · 27 October 2026 · Full-scope implementation and acceptance work

This plan turns the [product specification](product-spec.md) into dependent work packages. Read it with the [technical specification](technical-spec.md), [shadcn component specification](component-spec.md), [visual design system](design-system.md), and [decision register](decision-register.md). Current source and execution evidence are recorded in [readiness](readiness.md); this plan does not invent an agreed delivery schedule or acceptance.

The developed interface uses actual functional shadcn/ui components customized through a coherent blue theme. The HTML wireframe remains a reference for flows and information priority; final component and device acceptance use the application itself.

## Current full-scope checkpoint

The project owner directed continued parallel implementation through the whole staff system, deferring dependencies that require unavailable credentials. The initial contact slice is a verification baseline, not the delivery stopping point. Existing Clerk/Neon resources remain development-only, and migrations `001`–`006` are applied there.

| Package | Current source status | Remaining exit evidence |
| --- | --- | --- |
| M0 | Development authentication/storage connected; provisional defaults and client account ownership recorded. | Business-policy acceptance; client production accounts, domain/proxy configuration and authentication/SMS decisions. Use latest Vercel CLI before deployment; no global tool change now. |
| M1 | Current Chrome 12/Firefox 15 and full updated-WebKit 15 functional groups pass; four current synthetic images are linked. Final focused accessibility 6/1/1 passes eight page audits/nine strict controlled resize views. | Retain raw Base UI guard findings/manual AT/native zoom/clipping, unconfirmed automatic transition/44 diagnostics, vendor probe and actual Safari/iPhone limits. Client visual/accessibility acceptance remains separate. |
| M2 | Identity, current scope, staff authority and supported Clerk `/__clerk` proxy implemented/reviewed; public SDK/modern UI real authentication pass. | Current-build browser acceptance; future production-domain `proxy_url`, every-login OTP, recovery and allowed first factors. |
| M3 | Partial profiles, single primary assignment/history, lifecycle, reversible tombstone/restore implemented. | Final database/UI checks; policy approval for scope, lifecycle, minimum/military fields and retention. No hard purge. |
| M4 | Contact/attempt, correction/invalidation, rescheduling, manual color/history and revision-specific review implemented. | Final integrated transaction/history/replay checks and policy acceptance. |
| M5 | Prepared reads/full authorized intent, durable drafts/outbox/quarantine/recovery implemented. Current native browser proof and two deterministic WebKit quota-write/retry/reopen injections pass. | Physical exhaustion/committed-contact response loss, broader agreed role/device/retention acceptance. |
| M6 | Canonical engine/diagnostics and secure scheduled GET entry implemented/frozen, code/security approved; local, empty and populated direct-route/PostgreSQL checks pass with delivery blocked. | Hosted cron/deployment and operational timing/recovery, real provider adapter/credentials/sender and controlled delivery/reconciliation. |
| M7 | Scoped monthly activity, accepted timing baselines, versioned notes/review/settings implemented. | Final checks, client acceptance, production account/data handoff, training and support terms. |

Residual “Final checks” use the [readiness legend](readiness.md#product-acceptance-coverage): requirement-specific acceptance/untested scope, not blanket pending developer work or an instruction to repeat completed suites.

Recorded bounded local implementation/testing is complete. Build **`ZtyXUj8St-E_Hpz8dB7UQ`**, **400 tests** (239 client/161 server), lint/typecheck/HTTP, Chrome **12/12**, Firefox **15** and full updated-WebKit **15 functional groups** pass. Exact Chrome cleanup restores full original actor/settings v6/v1 and all 22 zero counters, with private profiles deleted; build/worker remain unchanged. Current synthetic captures are linked in [readiness](readiness.md). Historical Chrome 39, older matrix 28/2/1 and focused WebKit 6/1/2 stay separate from current full WebKit **15/2/1**.

The upstream-matched old native WebKit failure is superseded by measured isolated 1.64.1/WebKit 27.2 r2370 exact-draft recovery/reconnect for that pair. No app/bundled/global dependency changed. The completed full matrix retains two failures: automatic post-verification navigation unconfirmed within ten seconds and strict no-errors with 44 CORS-shaped diagnostics. Legitimate Continue worked; no cause, unexpected failed RSC chain or concrete app bug was established. Vendor probe and actual Safari/iPhone remain untested; no fix is claimed.

Optional dispatcher `resultTransaction` preserves prior callers and records exact claim outcomes after revocation; fresh work stays CEO-guarded. Recorded core/contact PG assertions are unchanged; those suites were not rerun after it. Latest proof includes 400 local tests, empty/populated scheduled-route integration and current native Chrome assigned-mentor contact/appointment/dedup. The new populated scheduler proof is outside 400 and does not imply a core/contact-suite rerun. Final settled accessibility is a separate 6/1/1 focused run with raw guard findings/manual AT/native zoom/clipping retained; no app fix or full WCAG claim.

Keep production/SMS/provider/scheduler/every-login OTP and future-domain Clerk `proxy_url` work as explicit later account/credential gates. Before deployment, use the latest Vercel CLI following the plugin's outdated-CLI report; do not change global tools during this testing/documentation work.

The scope audit found no additional settled staff-workflow gap. Ancillary tasks/calendar/intake/documents/English/export decisions remain open/proposed deferrals. Agreed client/device/volume acceptance, operational rehearsal/handoff, hosted/provider proof and policy decisions remain work alongside credentials; a real SMS adapter is still absent.

The final provisional [protection contract](technical-spec.md#6-authorization-and-ceo-protection) preserves existing whole/explicit locks while allowing ordinary new-contact cycles. Source/projection/recorded database checks and current bounded browser proof cover their mapped scopes. Earlier protected-field assertions stay unchanged; remaining client/device acceptance is listed in readiness, without implying another blanket browser run.

## Scope and sequencing

The proposed minimum release includes staff authentication, scoped accounts, partial participant profiles, one primary mentor, contact recording, next appointments, seven-day tracking, manual colors, separate approval, authorized offline work, CEO conflict review, and staff SMS. Offline support is a core requirement, not an optional post-launch enhancement.

General task management, a full calendar product, participant mentoring accounts, custom reports, document management, migration, and external calendar synchronization are not part of the proposed baseline unless expressly included. Public joining requests, English, monthly report format, and additional notification channels still need scope decisions. These are proposed boundaries, not a claim that every deferral has been approved.

Build the first vertical slice through real authorized storage before broadening screen coverage: **staff sign-in → participant assignment → completed phone contact → one next appointment → coordinator review**. A collection of visually finished screens with disconnected sample data does not complete this slice.

## Work packages and exit evidence

### M0 Product and integration readiness

Confirm the release boundary and resolve the decisions needed by the next package. Maintain each rule's confirmed/proposed/open status rather than requiring every later delivery question to stop current specification work.

During authorized implementation, discover the real authentication, storage and messaging capabilities before their dependent work. Development Clerk and Neon are connected. Installed marketplace discovery provides email capability, which does not satisfy staff SMS; real SMS integration remains blocked. Production provisioning must use separate client-owned Vercel, Clerk and Neon accounts.

**Exit evidence:** approved phase-specific rules, capability inventory, named dependencies, data/access ownership, and an acceptance checklist. No invented dates, participant volumes, commercial terms, or success targets.

### M1 Functional component foundation

Inspect the current project and component configuration. Use the actual shadcn CLI and current documentation to select and add the required components; do not assume the wireframe or existing public UI constitutes a shadcn installation. Preserve the public website while establishing the staff surface.

Apply semantic blue tokens, local Hebrew typography, RTL direction, consistent spacing, and shared component variants. Compose real navigation, forms, status badges, menus, confirmations, and feedback using the chosen component foundation. Design the relevant loading, empty, error, disabled, offline, and denied-access states alongside normal states.

**Exit evidence:** representative desktop/mobile staff screens reviewed visually, actual component source/configuration verified, keyboard/focus/overlay interactions checked, and agreed browser/zoom/contrast/touch targets tested. Working menu or dialog behavior does not establish working authentication, persistence, or SMS.

**Depends on:** visual direction and support targets; independent of final SMS routing.

### M2 Identity and authorization

Implement username/password plus the agreed OTP flow, staff activation/recovery, organizational scope, roles, and explicit grants. CEO/coordinator staff creation follows agreed authority limits. Enforce participant scope and CEO protection centrally on every supported read and write; UI visibility alone is insufficient.

**Exit evidence:** sign-in and recovery journeys, revocation, direct-record access, role/grant changes, and audit attribution. Negative cases cover another mentor's records, coordinator overreach, unauthorized approval/deletion, and attempts to overwrite CEO-protected changes.

**Depends on:** real identity/storage capabilities and D-05, D-06, D-10. Offline validity is finalized with M5, not assumed from an online session.

### M3 Staff, participant, and assignment records

Implement partial profiles with agreed minimum identity fields, service details, staff responsibility, and assignment history. Enforce one primary mentor and the CEO-involved replacement process. Start the first-contact clock at assignment, not enrollment approval.

**Exit evidence:** a participant can be added, assigned, viewed by the authorized mentor, and subsequently reassigned without losing history. Concurrent assignment attempts cannot create two primary mentors. Retention, deletion, service completion, and pause behavior follow agreed rules rather than silently removing cases from reminders.

**Depends on:** M2; D-03 and D-09. Military-specific fields and public intake are delivered only once defined.

### M4 Contact and follow-up vertical slice

Implement completed phone/in-person contact, unsuccessful attempts, manual mentor color, notes, next appointment, and separate review. Finalization follows the agreed draft rule. Centrally accepted contact and its required next-appointment update must be atomic; retries must not create duplicate entries or obligations.

Use actual occurrence times for seven-day tracking. Failed attempts and rescheduling do not count as successful contact. Additional completed contact retains one continuing appointment obligation. Management approval remains independent of contact completion.

**Exit evidence:** the complete vertical slice works with real scoped records. Tests cover first/subsequent deadlines, before/at/after boundaries, missing next appointment, repeated submissions, extra contacts, manual-color/deadline disagreement, and approval/correction attribution.

**Depends on:** M1–M3; D-01, D-02, D-04 and correction policy. This is the first meaningful product demonstration, not launch acceptance.

### M5 Offline reliability and conflict handling

Implement durable local autosave, the agreed prepared authorized working set, pending operations, reconnect processing, idempotency, and visible synchronization states. Include all authorized application commands, including administrative intent; the former online-only administration proposal is superseded by C-12/U-04. Demonstrate behavior after closing/reopening the app to the extent of the agreed persistence guarantee. Pending authority changes cannot expand accepted access. First-time OTP/provider onboarding and central enforcement require connectivity.

On a conflict with a CEO change, keep the CEO version authoritative and preserve the mentor revision for authorized review. Define ordinary concurrent edits separately. Revalidate current scope/protection centrally before accepting queued changes after revocation, reassignment or deletion. Lock denied/changed-authority work in quarantine; require fresh same-identity authorization and explicit permitted recovery rather than automatically wiping or replaying it. Explicit logout warns before local discard.

**Exit evidence:** interrupted saving, connection loss, browser restart, duplicate retries, conflicting edits, denied writes, and storage failure are recoverable under the agreed policy. Local work is not labeled centrally accepted. Pending-work retention and cache access follow the approved validity rules.

**Depends on:** stable M2–M4 contracts and D-07/D-08. Complete this before accepting offline support or central reminders against synchronized data.

### M6 Staff reminders and delivery

Implement the agreed reminder policy using the real messaging capability. The current provider boundary deliberately has no configured transport: provider selection must be followed by a real adapter implementation, provisioning/credentials and hosted recurring execution. Adding keys alone will not complete this package. Preserve mandatory SMS for ordinary staff and the CEO's personal opt-out. Participant mobile numbers are never recipients. Re-evaluate eligibility before dispatch and handle rescheduled appointments, late synchronized contacts, retries, failures and stale queued reminders.

**Exit evidence:** correct recipient/timing/content decisions, no duplicate logical reminders, ordinary-staff mute rejection, CEO-only self-mute, and no participant/developer recipient. Controlled delivery checks use explicitly authorized test recipients. Record provider acceptance separately from verifiable handset delivery; neither is inferred from the other.

**Depends on:** M4/M5, D-11, and provisioned messaging. Additional channels require explicit inclusion.

### M7 Oversight and acceptance

Complete coordinator coverage, separate approval/correction, protected conflict review, and the agreed monthly oversight format. Distinguish activity counts from management's assessment of participant progress. Then perform mentor/coordinator/CEO walkthroughs against the finalized acceptance scenarios.

**Exit evidence:** agreed device/accessibility coverage, end-to-end tests, real integration evidence, resolved launch defects, data/account ownership, administrator training, handover material, and defined support/acceptance terms. No production claim is based solely on a green unit suite, provider handoff, or uploaded build.

**Depends on:** preceding packages and D-12–D-15. Launch date, pilot size, acceptance window, and support term remain uncommitted.

## Decision ownership and parallel work

The CEO settles product authority, scope, cadence exceptions, permissions, notification recipients/timing, retention, and acceptance terms. The delivery team proposes technical choices such as version identifiers, outbox mechanics, transaction boundaries, and component composition, documenting consequences that affect the product guarantee.

After the vertical slice contracts are stable, component/state refinement, domain acceptance tests, notification policy work, and management-view development can proceed in parallel. Shared data/access contracts and overlapping files need explicit ownership. Offline and messaging must not invent competing definitions of contact completion.

## Test evidence to retain

- Domain tests for assignment-based first deadlines, later successful-contact deadlines, timezone boundaries, and non-qualifying attempts.
- API tests for scoped reads/writes, protected CEO changes, grants/revocation, concurrent assignments, and atomic/idempotent contact submission.
- Fault tests for persistence failure, interruption/retry, reconnect conflicts, stale permissions, and reminder deduplication.
- Browser journeys for real component interactions, Hebrew RTL, mobile forms, errors, keyboard/focus, and ordinary/CEO notification preferences.
- Integration evidence distinguishing centrally accepted data, provider acceptance, actual delivery where available, and stakeholder acceptance.

Map evidence to product acceptance IDs and the agreed environment/version. State implementation, validation, deployment, and real acceptance separately.
