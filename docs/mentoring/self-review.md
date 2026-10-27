# Product and design self-review

26 October 2026 · Review of version 0.1, followed by a version 0.2 visual-direction revision

**Current direction update, version 0.3:** the project owner clarified that the HTML remains a wireframe. The developed product will use functional shadcn/ui components with a blue color scheme and a separately designed higher-quality visual treatment. This review is historical flow/visual evidence, not approval of the wireframe as the final design. See [component-spec.md](component-spec.md).

The first draft is useful for product decisions and flow discussion, but its visual treatment is not a suitable production design target. The developed version needs a coherent modern component language, a properly composed Hebrew interface, and a much stronger mobile experience. This review records the gap and the revised standard in [design-system.md](design-system.md).

## What holds up

- The core workflow matches the agreed mentoring process: one accountable mentor, completed contact within seven days, a chosen next appointment, unsuccessful attempts retained without resetting the clock, and management approval kept separate.
- Manual mentor color, calculated contact timing, and management approval are distinguishable concepts. Their visual separation is a proposed product decision, not an automatically approved rule.
- The documents identify delivery risks honestly: offline availability/revocation, CEO protection granularity, OTP, notification routing, and acceptance terms remain open. A working design preview does not establish working infrastructure.

## Priority findings from the first preview

| Priority | Finding and user impact | Required correction |
| --- | --- | --- |
| P1 | Expanded review controls and navy mobile navigation consume roughly 490 px before the work area; the first participant appears below roughly 740 px in the inspected mobile image. | Compact persistent disclosure, expandable review controls, smaller product shell, and explicit mobile navigation. |
| P1 | A manually chosen green flag can appear more reassuring than the separate overdue indicator is urgent. | Put the calculated need for action beside the participant's name; keep the manual report secondary and clearly labeled. Preserve the separate underlying fields. |
| P2 | Repeated outlined panels, large rows, and similar text weights create administrative sameness instead of hierarchy. | Consistent local Hebrew type, more deliberate weights, compact person-centered rows, fewer framing devices, and stronger grouping. |
| P2 | Mobile navigation clips destinations and expects users to discover horizontal scrolling. | Visible core destinations and an explicit accessible menu/contextual navigation. |
| P2 | The contact form is a long sequence of similarly weighted native controls and helper paragraphs. | Participant context, clear outcome choice, grouped contact/next-step fields, and an accessible mobile action area. |
| P2 | The visual specification describes component sizes but does not establish enough finish or complete production states. | A shared component contract including empty, loading, error, denied-access, offline, and conflict states; a later pass for authentication and administration flows. |

## Product and delivery findings

| Finding | Treatment |
| --- | --- |
| “Green/orange/red chosen by mentor” and automatic seven-day visibility need a precise combined product rule. | Retain D-01 and show the recommended separation; never claim it is already accepted. |
| An autosaved incomplete form could be confused with a completed submitted contact. | R-07 and acceptance cases distinguish draft, submitted contact, and incomplete next scheduling. This is a proposed finalization rule requiring agreement. |
| “Counts immediately” could imply that an offline action is already known to central reminders. | R-08 and AC-21 distinguish local pending tracking from centrally accepted data. Management approval is not the gate. |
| “Everything works offline” is not an estimable guarantee until prepared data, cache lifetime, sessions, concurrent edits, and revoked access are defined. | Keep these as launch-blocking technical/product decisions. CEO conflict handling is confirmed, but it is only one part of offline behavior. |
| “Not relevant,” “later,” and “recommended” do not settle what is included in delivery. | Retain the included/deferred scope table and decision register; do not treat every earlier feature as an agreed exclusion. |
| Numeric outcome targets and the meaning of “about ten” are undefined. | Do not invent an impact target or a scale promise. Management assessment remains narrative until agreed otherwise. |

## Independent review evidence

Assessment A independently inspected the original desktop and mobile screenshots and current source/UX structure. Assessment B separately ran the bundled source detector and inspected the same archived screenshots. Neither assessment changed the user's browser tab.

The initial deterministic scan reported two warnings: a thick side-accent border in the conflict comparison and a single-font heuristic. The side-accent warning is actionable. The single-font heuristic is not itself a product defect: a deliberately chosen Hebrew/Latin family is appropriate for a staff tool. The original fallback-stack detection does not prove which font rendered.

No user-visible detector overlay was injected. Browser verification of the revised preview is performed in fresh headless browser contexts, not the user's signed-in browser. Review claims must distinguish screenshot/source evidence from measured browser behavior.

## Revised direction and remaining design work

The version 0.2 direction uses a compact review strip, refined Hebrew typography, a lighter product shell, person-first action hierarchy, a consistent component vocabulary, and deliberate desktop/mobile compositions. The [interactive preview](wireframes.html) illustrates the proposed visual target using fictional data.

Verification after revision:

- Separate code review completed, including fixes to touch targets and mobile feedback positioning.
- All six screen flows passed regression checks at widths of 1,440, 768, 390, and 375 px without document-level horizontal overflow or JavaScript page errors.
- At 390×844, the first participant action starts at approximately 431 px; the review controls are collapsed by default.
- Local Heebo loading, rendered normal-text contrast, visible focus, 44×44 px button/summary targets, More-menu Escape behavior, reduced motion, and next-appointment input visibility at a reduced 390×530 viewport were checked. This is bounded browser evidence, not a complete assistive-technology audit.
- Final desktop/mobile screenshots were inspected. The repeated detector scan reported zero findings. No detector overlay or critique server was started, and the user's browser tab was not modified.

This is a visual design revision. Production implementation still needs real data access, authentication, SMS delivery, persistent autosave, offline synchronization, and acceptance against the finalized product rules. Authentication/OTP, invitation/recovery, detailed permissions, deletion, and complete loading/error/empty states require further screen coverage before development handoff is complete.
