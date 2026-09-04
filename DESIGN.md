---
name: IMMapp
description: Financial OS for Romanian SMEs — an institutional-grade, editorially calm product surface, translated from Coinbase's design discipline (single scarce accent, weight-400 page titles, pill/rounded-xl geometry, one shadow tier, value-vs-status color discipline) into a non-crypto B2B financial/Document-AI context.
colors:
  primary: "oklch(0.4 0.11 245)"
  primary-foreground: "oklch(0.99 0.003 95)"
  secondary: "oklch(0.95 0.004 95)"
  secondary-foreground: "oklch(0.22 0.02 245)"
  background: "oklch(0.985 0.002 95)"
  foreground: "oklch(0.17 0.004 95)"
  card: "oklch(1 0 0)"
  muted: "oklch(0.96 0.003 95)"
  muted-foreground: "oklch(0.48 0.008 95)"
  border: "oklch(0.91 0.004 95)"
  success: "oklch(0.55 0.13 155)"
  warning: "oklch(0.78 0.15 75)"
  destructive: "oklch(0.58 0.21 25)"
  sidebar: "#0a0b0d"
  sidebar-foreground: "oklch(0.98 0 0)"
typography:
  page-title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
    note: "Page-level titles and hero headlines only — the one deliberate 'calm institutional' signal."
  component-title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 600
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
  number:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontWeight: 500
    note: "Every RON amount, percentage, and count — tabular-nums."
rounded:
  button: "9999px (pill)"
  sm: "12px"
  md: "14px"
  lg: "16px"
  xl: "20px"
  full: "9999px"
---

# Design System: IMMapp

## Overview

**Creative North Star: translated Coinbase discipline, not Coinbase branding.**

In 2026 the product design system moved from "The Control Room" (a dark-navy-sidebar,
two-blue system) to a design language translated from a Coinbase marketing-site reference
(`coinbase/DESIGN.md`, fetched via `getdesign`) — stripped of every crypto-specific and
branded element and re-applied to IMMapp's actual domain: Romanian SME invoicing, e-Factura,
Document AI, and financial reporting.

What was translated is the *discipline*, not the palette or the vocabulary:
- **One accent color, spent scarcely** — IMMapp kept its own primary navy rather than adopting
  Coinbase's literal blue. Adopting their hex would have read as "Coinbase branding," which
  directly contradicts this system's non-crypto requirement.
- **Editorial, calm typography** — page-level titles (one per screen: `PageHeader`, `ReportHero`,
  `OverviewHero`, and the three AI-workspace hero panels) render at **weight 400**, not 600.
  Component/card titles stay at 600 for small-size legibility. This is the single most
  distinctive typographic signal in the system — do not bold a page title.
- **Pill buttons, softly rounded cards, one shadow tier** — geometry is consistent and
  restrained. No sharp corners, no shadow stacking.
- **Semantic color as a dual convention** — see "The Value-vs-Status Rule" below. This is a
  deliberate, documented deviation from Coinbase's own "text-only, never a background fill"
  rule, because that rule is scoped to Coinbase's *marketing* site — their own doc says
  in-product trading surfaces are out of scope. IMMapp's authenticated app is the opposite of a
  marketing site, so categorical status keeps a scannable tinted pill.
- **Dark "hero band" as the signature structural motif** — every major screen's page-level
  header (dashboard, each financial report, each AI workspace) is a full-bleed dark panel on
  `--sidebar` (#0a0b0d, sourced directly from Coinbase's documented `surface-dark`), holding the
  page title, key actions, and often a "featured" inverted KPI.

**Key Characteristics:**
- Exactly one accent hue (the existing primary navy) for anything interactive
- Page titles are weight 400; every other heading stays 600 — a two-tier system, not
  "semibold everywhere"
- Financial value deltas (revenue, cash-flow, profitability trend) render as colored **text**,
  never a colored background; categorical status (document/invoice state) stays a tinted pill
- Buttons are full pills; cards are `rounded-xl`/`rounded-3xl`; icon-only controls are circular
- The sidebar and every page hero share one dark-surface vocabulary sourced from Coinbase's
  `surface-dark` (#0a0b0d)

## Scoping architecture

The system lives in `src/styles.css` as a scoped class, **not** merged into the global
`:root`/`.dark` tokens:

- `.immapp-app` — applied to the authenticated app shell's root (`src/routes/app.tsx`). Overrides
  `--font-sans`, `--radius`, `--radius-button`, and the `--sidebar*` tokens. Every `/app/*` route
  inherits it automatically because the shared primitives (`Button`, `Card`, `Badge`, `Table`,
  `PageHeader`, `KpiCard`, `StatusBadge`, `admin-ui.tsx`, `report-ui.tsx`) already consume
  semantic tokens rather than hardcoded values.
- `.immapp-landing` — applied to the public marketing page (`src/routes/index.tsx`) only. A
  separate, deliberately different token set (its own font, its own radius scale, tinted-only
  status badges) for the pre-login marketing surface.

**This is a deliberate, permanent architecture, not a rollout staging step.** The two scopes are
allowed to diverge because they serve different audiences (marketing vs. authenticated product).
Do not merge `.immapp-app`'s values into `:root` without first explicitly freezing
`.immapp-landing`'s own `--radius`/`--radius-button` — right now the landing page relies on
*not* inheriting the app's pill-button/soft-radius values, and a blind promotion would silently
change its buttons to pills and its cards to a larger radius.

### Named Rules

**The Two-Blue Rule (carried forward from "The Control Room").** The brand still runs on one
scarce accent color (primary) plus semantic status colors — no second brand hue was introduced
during the Coinbase translation.

**The Two-Tier Weight Rule.** Page-level titles (`PageHeader`'s `<h1>`, every hero's `<h1>`/`<h2>`)
render at weight 400 with `tracking-tight`. Every other heading — card titles, section titles,
dialog titles — stays at 600. Never bold (700) anywhere except inline emphasis in body text.

**The Value-vs-Status Rule.** Two distinct conventions, chosen by what the color is describing:
- *Financial value deltas* (revenue vs. last period, cash-flow direction, profitability change) →
  `TrendBadge`-style: colored **text only**, mono numerals, directional arrow icon, no
  background fill. See `src/components/trend-badge.tsx`.
- *Categorical operational status* (document "Procesat"/"În procesare"/"Eroare", invoice
  compliance state, diagnostic severity) → `StatusBadge`-style: tinted pill (`bg-success/15
  text-success border-success/30` and equivalents). See `src/components/status-badge.tsx`.

Never mix the two — a value delta should never be wrapped in a colored pill, and a categorical
status should never be rendered as bare colored text.

## Colors

Unchanged from the prior system's actual values (see frontmatter) — the Coinbase translation
did not touch the color palette itself, only how those colors are *applied* (see the
Value-vs-Status Rule). Chart-series colors (multiple lines/bars needing distinct hues) are the
one legitimate exception to the one-accent rule — use the existing `--chart-1` through
`--chart-5` tokens (`bg-chart-2`, etc.), never a raw Tailwind color name.

## Typography

**Font:** Inter (`--font-sans`, scoped via `.immapp-app`) for everything except tabular numbers,
which use Geist Mono at weight 500 (`.tabular-nums`, `[data-money]`, also scoped via
`.immapp-app`). Both were already installed dependencies — no new fonts were added for this
migration.

**The one rule that matters:** page titles are 400, not 600. Everything else follows the prior
system's ordinary hierarchy (component titles 600, body 400).

## Shapes

- **Buttons** (`src/components/ui/button.tsx`): `rounded-[var(--radius-button)]` — pill (9999px)
  inside `.immapp-app`, unchanged `rounded-md` outside it (landing page, any future non-app
  surface). This indirection (`--radius-button` as its own token, not derived from `--radius`)
  exists specifically so the two scopes can disagree on button shape without forking the
  component.
- **Cards**: `rounded-xl` (resolves to 20px inside `.immapp-app`) for standard cards; several
  hero/report components use a fixed `rounded-3xl` (24px, Tailwind's built-in scale, not derived
  from `--radius`) — both are acceptable, `rounded-3xl` is reserved for hero bands and the
  largest report/admin panels.
- **Badges/pills**: always `rounded-full` — unaffected by scope, already correct everywhere.
- **Icon-only controls**: circular (`rounded-full`) inside the app shell — see
  `src/components/app-header.tsx`'s menu/theme/notification/user buttons and the search bar.

## Elevation

Unchanged from the prior system: `shadow-sm` at rest, the existing `.card-lift` utility
(`translateY(-2px)` + a two-layer shadow, 200ms, disabled under `prefers-reduced-motion`) on
hover. One shadow tier — a shadow always signals "this is a surface" or "this is elevated," never
ambient texture.

## Components

- **Button** (`src/components/ui/button.tsx`) — pill inside the app shell (see Shapes).
  Variants (`default`/`secondary`/`outline`/`ghost`/`destructive`) and sizing (`h-9` default)
  unchanged.
- **Card** (`src/components/ui/card.tsx`) — `rounded-xl border bg-card shadow-sm`, unchanged
  structurally; radius softens automatically inside `.immapp-app`.
- **StatusBadge** (`src/components/status-badge.tsx`) — categorical status, tinted pill. No
  changes made; already fully token-driven.
- **TrendBadge** (`src/components/trend-badge.tsx`) — value delta, text-only + mono + arrow icon.
  Rewritten during this migration to drop a hardcoded emerald background and implement the
  Value-vs-Status Rule.
- **Hero bands** — `OverviewHero` (dashboard), `ReportHero` (all 6 `rapoarte` pages, via
  `report-ui.tsx`), and the three AI-workspace hero panels (Document AI, Layout AI, Evaluare AI)
  all share the same anatomy: `rounded-3xl bg-sidebar text-sidebar-foreground`, a pill eyebrow
  badge, a weight-400 title, and often a "featured" inverted KPI panel
  (`bg-sidebar-accent/40`) for the single most important number on the screen.
- **admin-ui.tsx / report-ui.tsx kits** — unchanged structurally; both were already pure
  semantic-token consumers, confirmed by direct read during this migration. One hardcoded
  focus-ring color (`admin-ui.tsx`) was fixed to `ring-ring`.

## Do's and Don'ts

### Do
- Keep the app to one accent hue (primary) — reach for a status color or a `--chart-*` token
  before introducing anything else.
- Render page-level titles at weight 400; every other heading at 600.
- Apply the Value-vs-Status Rule: value deltas are colored text, categorical status is a tinted
  pill — never the other way around.
- Use `rounded-[var(--radius-button)]` (via the shared `Button` component) for anything
  clickable that should read as a pill inside the app shell.
- Source any new dark surface from the same `--sidebar`/`--sidebar-accent` tokens the hero bands
  already use, rather than a new hardcoded dark value.

### Don't
- Don't adopt Coinbase's literal blue (`#0052ff`) or any crypto terminology/iconography —
  the translation is of the design *discipline*, never the brand.
- Don't bold (700) a heading anywhere — hierarchy comes from size and the 400/600 weight tier,
  not from going bolder.
- Don't wrap a financial value delta in a colored badge/pill, and don't render categorical status
  as bare colored text — the two conventions are deliberately different.
- Don't merge `.immapp-app`'s token values into global `:root` without first freezing
  `.immapp-landing`'s own radius tokens — see "Scoping architecture" above.
- Don't reach for a raw Tailwind color class (`bg-blue-500`, `text-emerald-600`, etc.) for
  anything except a chart series, and even then prefer the existing `--chart-*` tokens.
