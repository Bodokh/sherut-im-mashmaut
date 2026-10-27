# Mentoring workspace visual design system

Version 0.3 · 26 October 2026 · Styling principles for the shadcn implementation

The developed product will use actual functional shadcn/ui components, customized with a coherent blue color scheme. It should feel like a carefully made Hebrew staff workspace: clear, composed, personal, and quick to use. The [component specification](component-spec.md) is the implementation foundation. The [interactive wireframe](wireframes.html) established flows and initial visual exploration; its custom controls and exact styling are not the production design standard.

## Context and visual direction

A mentor opens the product on her phone between conversations, often in daylight and with limited time. A coordinator uses a larger screen to identify follow-up gaps. Both need trustworthy information, clear next actions, and a sense that each record represents a person.

Use a restrained light composition with techelet actions, deep navy text, cool neutral space, and precise semantic color. Carry the existing organization's identity through its blue palette, Hebrew typography, and respectful language. Keep the staff product visually distinct from the public site's storytelling and donation flows.

The recognizable composition is a people-first work list with a compact upcoming-contact area. The hierarchy is **person → action needed → appointment → action**. Review controls, explanatory copy, and secondary metadata never lead the page.

## Typography

Use locally bundled **Heebo Variable** for Hebrew and Latin, with system sans fallbacks. One deliberate family across product controls is intentional; craft comes from weight, scale, line height, and grouping. Keep normal Hebrew letter spacing. Isolate phone numbers and date/time strings as LTR content inside RTL layouts.

| Role | Proposed scale | Usage |
| --- | --- | --- |
| Page heading | 28–32 px, 600–700 weight | One clear title per screen; no oversized marketing headline. |
| Section heading | 18–20 px, 600 weight | Action groups and participant context. |
| Participant name | 16–18 px, 600 weight | Human anchor in lists and profiles. |
| Body and form values | 15–16 px, 400–500 weight | Comfortable reading and reliable inputs. |
| Labels and metadata | 12–14 px, 500 weight | Short, useful secondary context with sufficient contrast. |

Font source/license are recorded in [assets/README.md](assets/README.md). The preview loads its font from this folder, without a runtime font CDN request.

## Color and surfaces

The implementation must use named tokens rather than choosing slightly different colors per component. The existing application's `brand-*`, `ink-*`, and semantic palette are the source identity; the revised preview provides a focused product subset in OKLCH.

| Role | Direction | Constraint |
| --- | --- | --- |
| Canvas | Very light blue-tinted neutral | Quiet behind work; no beige preview chrome or decorative background effects. |
| Work surface | White | Use for actual records, forms, and grouped work, not nested decorative panels. |
| Navigation | Light neutral with navy text | Current selection uses a focused blue treatment; inactive items remain quiet. |
| Primary | Existing techelet/blue family | Main task action, selection, focus; avoid saturating every component. |
| Primary ink | Deep navy | Strong reading contrast and coherent brand identity. |
| Secondary ink | Darkened cool neutral | Secondary does not mean faint or hard to read. |
| Success / delay / overdue | Green / orange / red | Text and icons accompany color. Do not turn these into participant wellbeing assessments. |

Normal text targets 4.5:1 contrast; large text and control boundaries target 3:1 where required. Validate real component pairs after implementation. Pale semantic backgrounds must carry dark semantic text. Focus should remain visible on every surface.

The wireframe's initial token exploration is recorded below. During implementation, map the selected blue palette to shadcn's semantic theme variables as specified in component-spec.md; do not carry these private wireframe variable names into screens as a competing theme API.

| Token | Value |
| --- | --- |
| `--canvas` | `oklch(.977 .006 250)` |
| `--surface` | `oklch(1 0 0)` |
| `--surface-muted` | `oklch(.962 .009 250)` |
| `--ink` | `oklch(.285 .043 258)` |
| `--muted` | `oklch(.48 .027 255)` |
| `--brand` | `oklch(.49 .17 255)` |
| `--brand-soft` | `oklch(.95 .025 250)` |
| `--line` | `oklch(.906 .015 251)` |
| `--green` | `oklch(.425 .10 155)` |
| `--orange` | `oklch(.49 .105 55)` |
| `--red` | `oklch(.49 .16 24)` |
| `--radius-control` / `--radius-surface` | `9px` / `14px` |

These are a proposed product subset of the existing identity, not a global replacement of the public site's tokens.

## Layout and spacing

- Use a 4 px spacing base with 8, 12, 16, 20, 24, 32, 40, and 48 px steps. Tight spacing expresses a relationship; larger gaps separate different jobs.
- Desktop uses a disciplined right navigation rail, a clear work area, and optional secondary appointment context. Useful content earns the width; do not stretch a sparse form across the screen.
- Participant rows are compact and aligned. Use clear list structure and limited dividers instead of giving every field its own card.
- Use 8–12 px corners for controls and 12–16 px for grouped surfaces. Pills are appropriate for short state tags, not entire panels.
- Prefer surface separation or a clean border. Do not combine a decorative fine border with a large blurry shadow on every panel.
- No marketing hero, decorative metric grid, glass panels, thick colored side stripes, or ornamental charts.

## Component language

| Component | Production design contract |
| --- | --- |
| Workspace shell | Compact brand, clear active navigation, a readable account identity, and honest connectivity state. The review-only toolbar is separate from the real product shell. |
| Participant identity | Name first, a restrained initial/avatar marker, service context, and accountable mentor where relevant. Sample initials are not real participant photos. |
| Action row/card | Put the calculated need for contact beside the name and primary action. Place the mentor's manually reported flag in a quieter, explicitly labeled position. |
| Appointment summary | Clearly distinguish the chosen next appointment from the latest permitted contact deadline. Display date/time with consistent LTR formatting. |
| Primary button | One dominant action per task. Consistent shape, icon treatment, hover/focus/pressed/disabled states, and loading state in production. |
| Secondary action | Quieter but still visible; clear verb labels. No icon-only action without an accessible name. |
| Contact outcome | Make completed phone contact, completed visit, and unanswered attempt easy to distinguish. Choice must be keyboard accessible. |
| Form field | Stable label, generous interaction area, predictable value style, nearby error, and preserved input. Group contact information separately from next-appointment scheduling. |
| Status tag | Icon/text plus semantic color. Manual flag, calculated deadline, and approval are separate concepts and separate labels. |
| History | A readable contact timeline/list distinguishing completion from attempts. Attribution and dates support trust. |
| Notification preference | Explain mandatory staff SMS and the CEO's personal mute exception without pretending that a disabled toggle is broken. |
| Conflict review | Clearly label the CEO's authoritative value and the preserved mentor draft. Show authorship, resolution authority, and next action with restrained surface hierarchy. |
| Feedback | Brief confirmation of the action performed. Distinguish local save, pending central update, accepted update, and conflict; never fake provider delivery or persistence. |

## Mobile behavior

At 375–390 px, a mentor must see the page's actual job and the first actionable participant without scrolling through an expanded review banner and multiple headers. The prototype disclosure stays visible in a compact strip; detailed review controls expand on demand.

Navigation must have visible, reachable destinations or an explicit menu. Do not rely on discovering clipped horizontal text. Participant rows become compact cards with the same information priority. Forms use a single-column layout with context near the task. If an action area is sticky, reserve enough space for the last field and respect device safe areas.

Tap targets are at least 44 px. Do not hide deadlines, errors, or save state to make the layout fit. Test long names, 200% zoom, narrow widths, expanded review controls, and a virtual-keyboard-equivalent reduced viewport.

## Motion and states

Use approximately 150–200 ms transitions for selection, opening contextual controls, and action feedback. Motion should explain what changed. No decorative page-load sequence or delayed content reveal. Honor reduced-motion settings with immediate transitions.

Before production approval, design the default, hover, focus, selected, pressed, disabled, loading, empty, error, success, offline, pending-sync, conflict, and access-denied states applicable to each component. The six-screen preview is not evidence that all production states exist.

## Production design acceptance

1. The main mentor flow and management flow share the same component language.
2. Manual mentor color cannot visually conceal a calculated contact breach. The business decision to separate them remains proposed in D-01.
3. Contact entry provides immediate participant context, clear outcomes, grouped fields, and an accessible save action.
4. Desktop and mobile layouts have deliberate hierarchy, no clipped navigation, and no document-level overflow at supported sizes.
5. Normal reading text, field help, and semantic badges meet their contrast targets; all primary journeys work with keyboard and visible focus.
6. Loading, error, empty, denied-access, offline, and conflict states receive design review alongside happy paths.
7. Login/OTP, staff invitation/recovery, detailed access editing, deletion confirmation, and real notification/sync states require a subsequent complete design pass before their implementation is called design-ready.

These are proposed design quality gates. They do not settle pending product scope, prove working backend behavior, or replace user acceptance by the CEO and staff.
