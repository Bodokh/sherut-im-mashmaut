# Mentoring workspace UX design

Version 0.3 · 26 October 2026 · Flow specification; production composition uses shadcn/ui

Read with [Product specification](product-spec.md), [shadcn component specification](component-spec.md), [Visual design system](design-system.md), and [Decision register](decision-register.md). Open [Interactive wireframe](wireframes.html) for the six connected flow examples. The [self-review](self-review.md) records the earlier visual exploration. The developed product uses actual shadcn/ui components with a blue theme and receives its own visual design review. These documents describe a new staff experience; the repository's existing public website remains a separate product surface.

## Design intent and evidence

The main job is to help a mentor complete and document genuine contact within seven days, choose the next appointment, and give coordinators a reliable view of gaps. The interface opens on people who need action. Hebrew is the default language and the product flows right to left. English in this document explains the design; Hebrew examples are proposed interface copy.

The production visual requirement is a refined modern product built from functional shadcn/ui components with a coherent blue theme. Exact wireframe styling is not the delivery target. Its compact shell, person-centered records, action priority, and mobile flows inform the production composition; actual component styling is developed and reviewed separately. The visual system must extend to loading, errors, empty records, access denial, and administration before handoff is complete.

The client confirmed manual mentor-selected green/orange/red flags, one accountable mentor per participant, and a rolling seven-day requirement. **Proposed design:** show the manual flag and the calculated deadline as separate labeled fields. A manual green flag must not conceal elapsed time. This separation needs product sign-off; the preview demonstrates it without silently changing the mentor's color. Neither field describes clinical risk or a participant's emotional condition.

The preview uses fictional information and a fixed example time of 26 October 2026 at 12:00 UTC, with illustrative 168-hour arithmetic. The production timezone and daylight-saving rule remain open in D-02. It has no authentication, real saving, notifications, external requests, or working offline storage. Its role and connectivity selectors live in an expandable design-review panel outside the product frame; a compact disclosure stays visible. Refreshing discards its in-memory examples.

## Information architecture and access

| Area | Main job | Eligible role |
| --- | --- | --- |
| `המעקב שלי` | Act on due contacts and open assigned profiles | Mentor; management examples scoped by final permissions |
| `כרטיס חניכה` | Read service details, appointment, notes, and contact history | Assigned mentor; authorized coordinator/CEO |
| `תיעוד קשר` | Record successful contact or an unsuccessful attempt; choose the next appointment | Assigned mentor; authorized staff |
| `בקרה ואישורים` | Review contact coverage and separately approve reports | Coordinator/CEO |
| `הגדרות צוות` | Review notifications, staff permissions, and CEO authority | CEO; coordinator actions subject to final matrix |
| `בדיקת עדכונים` | Inspect a preserved offline draft against the CEO's authoritative version | Affected mentor can inspect their submission; CEO resolves protected conflicts |

This is an information architecture, not a commitment to route paths. It adds no participant mentoring portal, questionnaire builder, task suite, advanced calendar, or chat. A participant enrollment request flow still needs a separate scope decision.

## Role flows

**Mentor:** open action list → participant profile → record outcome → choose manual flag and notes → supply next appointment for a completed contact → save → see history and deadline update. Phone and in-person contact qualify. An unanswered call is retained as an attempt and leaves the completed-contact clock unchanged. The preview allows one next appointment per participant: additional successful contact replaces the same next obligation.

**Coordinator:** open coverage view → identify overdue contact independently of manual flags → open the participant → follow up with the mentor or participant according to organizational practice → review and approve the report. Approval is separate from the contact clock and does not delay a mentor's recorded completion.

**CEO:** review scoped staff access and approvals → grant access or revoke an account through the final administration flow → inspect conflicting offline drafts → retain the authoritative version and review any preserved submission. A design role selector is not a permission system.

## Screen and interaction specifications

### S01 Mentor action list

```text
Desktop, RTL                                      Right-side navigation
┌───────────────────────────────────────────────────────────────────────┐
│ Workspace name               User / connectivity                 Nav │
├───────────────────────────────────────────────────────────────────────┤
│ המעקב השבועי שלי                                                   │
│ Participants needing contact, followed by upcoming appointments       │
│ Name | last completed | next appointment | mentor flag | due status   │
│ [Open profile] [Record contact]                                       │
└───────────────────────────────────────────────────────────────────────┘
```

Default ordering is overdue first, then appointment time. This is a proposed automatic ordering, not a new advanced-filter requirement. A participant's name and initial/avatar marker anchor the row. The calculated need for contact is prominent; the manual flag remains explicitly labeled and secondary. Upcoming contacts provide a small secondary context area rather than a full calendar commitment. Each row has an explicit name link and record action; clicking blank row space is unnecessary. Empty assigned list: `עדיין לא שויכו אלייך חניכות. אפשר לפנות לרכזת.` An unavailable record must never reveal another mentor's information through a direct link.

### S02 Participant profile

The name, service type, mentor, and next appointment precede the history. Manual flag includes its author and update time in production. Deadline explains its basis: assignment before the first contact, otherwise the last completed contact. History distinguishes `שיחה שהתקיימה`, `פגישה שהתקיימה`, and `ניסיון ללא מענה`; dates never imply a successful meeting without an outcome. Missing details display `טרם הוזן`. Partial profiles remain usable. Military-specific fields and attachment handling are pending product decisions.

### S03 Record contact

```text
Mobile, RTL
┌──────────────────────────────┐
│ תיעוד קשר — שם החניכה        │
│ Outcome                      │
│ Actual contact date and time │
│ Notes                        │
│ Mentor-selected flag         │
│ Next appointment date/time   │
│ Save state                   │
│ [שמירת תיעוד]                │
└──────────────────────────────┘
```

Keep participant identity visible near the form. Group the contact outcome, actual occurrence, and note separately from the next appointment. The outcome is selected before scheduling fields. A completed phone/in-person contact requires an actual contact time and next appointment time; next appointment must be later than the completed contact. An unsuccessful attempt does not require a new appointment and does not overwrite the existing appointment. The manual color is independently editable and never computed from the selected outcome. Choosing a date beyond the seven-day deadline is an open policy: the preview shows a warning without pretending that rescheduling cures lateness. Production must implement the final block/warn policy from the decision register.

Notes are multiline plain text. Proposed limits: 4,000 characters for a contact note and 120 for a short placement/role; these are design recommendations, not confirmed business limits. Show validation beside the relevant field and focus the first invalid control. Following R-07, safely save incomplete input as a draft and display the unfinished action when next-appointment information is missing; a draft does not satisfy the completed-contact requirement. Real autosave and interrupted-save recovery need implementation acceptance tests. The preview supports entering new completed contact after the most recent completed contact; it explicitly blocks older completed entries rather than inventing a policy for retrospective entry/correction. That policy remains open in the product decision register.

### S04 Coordinator coverage and approval

Coverage rows show participant, accountable mentor, deadline, and manually selected flag separately. Pending report approval is a separate column/state: `ממתין לאישור` / `אושר`. Approving a report cannot fabricate contact or reset a deadline. Team scope, correction/rejection actions, and monthly report contents need decisions before development.

### S05 Staff settings

Explain mandatory staff SMS in plain language. An ordinary staff member cannot disable it; the CEO can mute messages to the CEO's own account. Participants are not recipients. OTP destination and reminder recipients/timing remain undecided. Show CEO protection as a named permission, not a mysterious disabled control. Deletion is CEO-only and requires a dedicated confirmation design once deletion/retention semantics are agreed.

### S06 Offline conflict review

Show the CEO's authoritative value and the mentor's preserved draft in two labeled panels. Mobile stacks them. Explain `המידע עודכן בזמן שהיית ללא חיבור. העריכה שלך נשמרה לבדיקה.` Preserve authorship and timestamps. The mentor cannot overwrite the CEO version from this screen. A CEO review action must record its outcome in the final implementation. Ordinary concurrent edits, deleted/reassigned records, revoked access while offline, and cache expiry are unresolved.

## Components and state language

| Component | Required states and behavior |
| --- | --- |
| Manual flag | Green/orange/red plus text; editable by mentor; timestamped; separate from computed deadline |
| Deadline label | First contact due / upcoming / appointment passed / seven-day breach; include date and textual reason |
| Save indicator | `שומר…`, `נשמר במכשיר`, `ממתין לעדכון במערכת`, `עודכן במערכת`, `נדרש טיפול בעדכון`; never equate local saving with synchronized data |
| Outcome control | Completed telephone / completed visit / unanswered attempt; every outcome has explanatory text |
| Next appointment | Required for completed contact; visible even while the device is disconnected |
| CEO protection | State who last protected/changed the value and explain available review action |
| Error panel | Describe the failed action, retain input, and offer a relevant retry or review action |

Loading uses a static skeleton, not fake empty counts. Long names wrap to two lines and remain accessible in full. Phone numbers and date inputs isolate left-to-right text within the RTL page. Avoid free-text notes in SMS. Prototype notification controls only demonstrate the preference rule.

## Proposed visual and responsive system

Use the identity from `app/globals.css`: techelet primary actions, deep navy ink, cool tinted neutrals, and labeled semantic colors. The product composition uses a lighter navigation surface with navy text; a full navy slab is not required to preserve identity. Strengthen warning text contrast independently of pale warning backgrounds. The preview uses self-contained OKLCH tokens rather than importing application CSS. The [visual design system](design-system.md) defines the production quality bar and component contract.

| Token proposal | Value | Purpose |
| --- | --- | --- |
| Font | Local Heebo Variable, system sans fallbacks | Deliberate Hebrew/Latin typography; no runtime font CDN dependency |
| Body / secondary / heading | 16 / 14 / 28–32 px | Data readability and hierarchy |
| Spacing steps | 4, 8, 12, 16, 24, 32 px | Consistent controls and grouped records |
| Main width | 1,200 px maximum | Keep records scannable on large screens |
| Navigation / side detail | Approximately 216–240 / 280–320 px | Stable orientation without shrinking work area; responsive secondary context |
| Field / button minimum | 44 px | Comfortable touch and keyboard targeting |
| Corner radius | 9 px controls, 14 px grouped surfaces | Shared component vocabulary from the revised design system |

At ≥1,024 px, use right navigation and an action-first list; at 768–1,023 px, compact the shell and stack supplementary detail. Below 768 px, use visible primary destinations plus an explicit accessible More control and compact participant cards. Do not rely on clipped, horizontally scrolling navigation text. Forms remain one column on narrow screens. A mobile save area must reserve enough space for the final input and device safe area. Do not hide the next appointment, deadline reason, save state, or primary action to make mobile fit. The preview is designed for 375 px and up; the production support matrix remains open.

Keyboard order follows visible reading order. All fields need visible labels, grouped controls use fieldsets/legends, status updates use polite live regions, and page navigation moves focus to the new title. Use text/icons alongside every color, visible focus, 200% zoom, and reduced-motion behavior. These are proposed accessibility targets, not a claim of compliance or completed testing. Motion is limited to short user-triggered state changes; no gesture-only actions.

## Review boundaries

The six wireframes can validate vocabulary, information priority, contact entry, and management oversight. They cannot validate real authentication, permissions, phone delivery, persistent saving, cross-device synchronization, offline security, or stakeholder approval. Those are implementation and acceptance work identified in the product spec and decision register.
