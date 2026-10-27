# shadcn UI component specification

Version 0.3 · 26 October 2026 · Required implementation foundation; proposed screen composition

The developed staff application will use actual **shadcn/ui components**, customized through a coherent blue design system. This is the project owner's explicit implementation requirement. [wireframes.html](wireframes.html) remains a reference for journeys, information, and exceptional states; its hand-built controls and exact appearance are not the production implementation or final visual approval.

shadcn supplies the interaction foundation. The application supplies domain state, validation, authorization, persistence, synchronization, and notification delivery. The component foundation and those business behaviors are separate acceptance obligations.

## 1. Current project and integration boundary

The repository currently has Next.js 16.2.9, React 19.2.4, and Tailwind CSS 4. There is no `components.json` in the repository and shadcn has not been initialized by this specification. No components, presets, dependencies, authentication services, or databases have been installed in this documentation phase.

During the UI-foundation work package:

1. Inspect the project with its package runner and the current shadcn CLI. Record aliases, primitive base, style, icon library, and component destinations.
2. Use the official shadcn registry, inspect available components, and retrieve current component documentation before adding source. Use one coherent primitive base and its matching composition APIs.
3. Add the needed components as maintained application source. Do not replace them with HTML approximations or independently recreate their dialog/menu/focus behavior.
4. Configure the staff theme through semantic variables in the existing global theme structure, scoped to the staff surface where necessary so public pages retain their appearance.
5. Review the actual composed screens, including Hebrew/RTL, loading/error states, keyboard behavior, and mobile use. Component availability alone does not approve the result.

The implementation team chooses CLI/preset mechanics and primitive base after inspection. This is not a product question for the client, and this document does not assume Radix-only or Base-only APIs.

## 2. Screen-to-component map

| Screen/workflow | shadcn foundation | Application responsibility |
| --- | --- | --- |
| Staff shell | Sidebar, Breadcrumb, Sheet, DropdownMenu, Separator, Avatar with fallback | Role-aware destinations, account state, current scope, responsive navigation. |
| Mentor home | Table, Badge, Avatar, Button, Empty, Skeleton | Due-first people list, calculated deadline, independently selected mentor color, next appointment, and scoped data. |
| Participant profile | Tabs where useful, Card composition, Badge, Avatar, Separator | Service/contact details, assignment, history, attributable manual reports, and CEO-protected information. Tabs are a design proposal, not required extra workflow. |
| Record contact | FieldGroup, Field, FieldSet/FieldLegend, Input, Textarea, Select, ToggleGroup, Button, Spinner | Outcome/method, actual occurrence, manual color, next date/time, draft/finalization rules, and server validation. |
| Next-appointment picker | Popover with Calendar plus time Input, or an accessible Input control selected in foundation review | An actual date/time, correct locale/timezone interpretation, required-field errors, and the agreed seven-day policy. A date picker does not introduce a full calendar product. |
| Coordinator coverage | Table, Badge, Button, DropdownMenu, Alert, Empty, Skeleton | Team scope, overdue cases, report revision review, intervention attribution, and real approval results. |
| Notification preferences | Field, Switch, Alert | Mandatory staff SMS, CEO self-mute exception, clear disabled reason, server-enforced preference rules. |
| Staff invitation/access | FieldGroup, Field, Input, Select, Dialog/Sheet, AlertDialog | Authorized role/grant ceiling, actual invitation/account creation, revocation, and CEO authority. |
| Login and code verification | FieldGroup, Field, Input, InputOTP, Button, Alert | Credential verification, actual code delivery, expiry/retry/recovery, and session establishment. |
| CEO conflict review | Card composition, Badge, Alert, Separator, Button; Sheet/Dialog only if needed | Authoritative CEO revision, preserved mentor submission, permission to resolve, and audit result. |
| Delete/revoke confirmation | AlertDialog | CEO-only authority, exact affected record/account, policy validation, and confirmed server result. |
| Feedback and exceptional states | Sonner, Alert, Empty, Skeleton, Spinner | Honest distinction between local save, pending upload, central acceptance, conflict, failed action, and actual message delivery. |

Prefer an ordinary Table for the initial participant list, pending agreed volume and interaction requirements, until real sorting/pagination/search needs justify a more elaborate data-table composition. Charts, command palettes, a report builder, and elaborate scheduling remain separate scope decisions.

## 3. Blue semantic theme

Use semantic theme tokens and component variants, not scattered one-off blue classes or screen-specific typography overrides. The blue palette is confirmed as the theme direction; exact final values and component styling are selected during real screen design.

| Semantic role | Proposed mapping from the visual direction | Use |
| --- | --- | --- |
| `background` / `foreground` | Cool light neutral / deep navy | Workspace canvas and readable text. |
| `card` / `card-foreground` | White / navy | Grouped work and profile areas. |
| `popover` / `popover-foreground` | White / navy | Menus, pickers, and overlays. |
| `primary` / `primary-foreground` | Techelet blue / white | Primary action and key selection. |
| `secondary` / `secondary-foreground` | Pale blue / dark blue | Secondary components with useful hierarchy. |
| `muted` / `muted-foreground` | Cool tinted neutral / readable slate | Supporting surfaces and metadata. |
| `accent` / `accent-foreground` | Light blue / deep blue | Hover/selection treatments. |
| `border`, `input`, `ring` | Deliberate neutral boundary / control boundary / blue focus | Components and keyboard focus. |
| `sidebar-*` | Light navigation, navy text, blue current selection | A coherent staff shell across sizes. |
| Follow-up variants | Semantic green/orange/red pairs | Manual report and deadline badges retain distinct labels and meanings. |

Normal text must meet the agreed contrast target against its actual surface; primary, selected, disabled, hover, focus, and error pairs need review. Colors alone do not convey meaning. Dark mode is not included simply because token-based theming supports it.

The local Heebo font is available as a candidate; type scale, spacing, radius, and icon choices belong in the shared theme/component variants. The palette values and compositions in [design-system.md](design-system.md) are starting references rather than a requirement to reproduce the wireframe pixel for pixel.

## 4. Composition and interaction rules

- Use standard component variants first. Extend a shared variant when a product state needs a consistent visual treatment.
- Use proper Field composition, visible labels, associated descriptions, and invalid state on both field and control. Group related controls semantically.
- Three contact outcomes and three manual colors should use a suitable single-choice component such as ToggleGroup or Select, following its actual current API. A manual-color selection never fabricates a completed contact.
- Preserve component grouping requirements. Overlays have meaningful titles and descriptions; menus retain focus, Escape, and outside-click behavior from their primitives.
- Every Avatar has a fallback. Every icon-only action has an accessible name. Icons and radii follow one shared vocabulary.
- Buttons show a composed pending state and suppress duplicate UI submissions; server idempotency remains required independently.
- Production contact input is durably autosaved according to the offline contract. A styled toast does not prove save success.
- Destructive operations use an explicit confirmation component plus server authorization; a disabled or hidden button is not the permission boundary.

## 5. Hebrew and responsive behavior

Use Hebrew-first document language/direction and the chosen shadcn direction support for primitives and portal content. Use logical spacing/alignment properties. Check popover placement, menu keyboard behavior, directional icons, Calendar locale, and tab focus order in RTL. Keep phone numbers, usernames where needed, OTP digits, and date/time strings legible using appropriate local direction isolation.

Mobile is a deliberate composition: reachable primary actions, visible navigation or an explicit Sheet/menu, clear participant context, and no clipped labels. Layout may change between desktop/mobile without changing domain behavior. Use a composed Sheet/Drawer when appropriate rather than inventing a custom overlay. Touch targets, field values, error messages, and save state remain usable at the agreed sizes and zoom targets.

## 6. Foundation acceptance checklist

- Actual shadcn component source/configuration is present, with documented primitive base, imports, aliases, and semantic theme.
- The core mentor flow is composed from those functional components and works with keyboard, touch, and Hebrew RTL.
- Real composed dialogs/menus/pickers manage opening, focus, dismissal, validation, and disabled/pending states.
- Blue theme changes apply consistently across forms, tables, navigation, overlays, and feedback while preserving semantic red/orange/green meaning.
- Default, loading, empty, error, access-denied, offline/pending, conflict, and success states are reviewed on real application screens.
- The production UI receives its own visual review. Passing the old HTML preview checks does not satisfy this checklist.

## 7. Official reference baseline

Current official-source documentation was consulted on 26 October 2026 for the foundation requirements:

- [Theming](https://ui.shadcn.com/docs/theming): semantic CSS-variable tokens and shared customization.
- [RTL support](https://ui.shadcn.com/docs/rtl): direction-aware application and component behavior.
- [Components](https://ui.shadcn.com/docs/components): retrieve the current component-specific docs and CLI output during implementation.

Revalidate current installed/generated component APIs when implementing rather than copying historical example props from this specification.
