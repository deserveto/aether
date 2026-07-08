# Provider UI Swiss-Style Conformance + Toast System — Design Spec

**Date:** 2026-07-09
**Status:** Approved (pending user spec review)
**Scope:** `apps/web` only

## Problem

The provider admin UI built in PR-1 does not conform to `docs/DESIGN.md` (Minimalism & Swiss Style) nor to the design system already established by the Shell, home page, and health badge. It also uses inline `<p role="status">` / `<p role="alert">` banners as notifications ("ugly web notif thingy") instead of toasts.

### Evidence

Established system (`apps/web/src/app/globals.css`, `components/shell.tsx`, `app/page.tsx`, `components/health-badge.tsx`):
- Light Swiss theme driven by CSS-variable tokens: `--color-surface:#fff`, `--color-text:#1a1a1a`, `--color-primary:#0a0a0a` (off-black), `--color-beige:#f5f1e8`, `--color-muted:#808080`, `--color-taupe:#b38b6d`, `--color-text-inverted:#f5f1e8`.
- All color via `var(--color-*)`. Lucide icons. `font-mono uppercase tracking-widest` labels. `max-w-[1280px]` `px-6`.
- Primary button pattern (home CTA): `border + bg-[var(--color-primary)] text-[var(--color-text-inverted)] hover:-translate-y-px`.
- Card pattern (health-badge): `border-[var(--color-muted)]/40 bg-[var(--color-beige)]`.

PR-1 provider UI violations:
- Hardcoded dark palette: `bg-[#111111]`, `text-stone-50`, `border-white/15`, `bg-white/[0.04]`, raw `#151515`, raw `#b38b6d`, raw `#f5f1e8`.
- `features/providers/index.tsx` escapes the Shell with `-mx-6 -my-16 min-h-[...] bg-[#111111]`, imposing a dark slab over the light Shell.
- Inline `<p role="status">` / `<p role="alert">` banners used as notifications across `ConnectionForm`, `ConnectionList`, `ModelProfileManager`, `AgentBindingManager`.
- No toast system exists in `apps/web`.

## Goals

1. Make the provider settings UI token-driven and visually consistent with the Shell/home/health-badge light Swiss theme.
2. Introduce a reusable, app-wide Toast system (custom, no new dependency) and migrate all inline success/error banners to toasts.
3. Keep behavior intact (same actions, same endpoints, same data flow); this is a presentation-layer change plus the toast system.

## Non-Goals

- Building a Swiss modal component. Destructive confirmations continue to use native `window.confirm`.
- Adding React Testing Library / jsdom to `apps/web`. Component render tests are out of scope (web has none today).
- Touching the agent-server, providers package, or any non-UI code.
- Theming the (not-yet-present) PR-2 chat UI; the toast provider is wired app-wide so chat can reuse it later, but no chat UI is built here.
- Dark mode toggle. DESIGN.md supports light/dark, but the current single theme is light; this spec keeps it light.

## DESIGN.md Contracts Honored

- **Tokens only:** all color/radius/font values come from CSS variables in `globals.css`.
- **z-index contract (§Layout):** base 0 / sticky-nav 100 / overlay 200 / modal 300 / **toast 500**.
- **Motion (§Elevation & Depth):** entry = fade + translate-Y 16px→0 over 420ms ease-out; exit fade 200ms; only `transform`/`opacity` animated.
- **Shapes (§Shapes):** base corner radius 0px — toast and buttons use sharp edges.
- **Components (§Components):** Inputs = label above, 1px border, focus ring 2px accent offset 2px. Cards = 1px border + subtle surface. Primary button = accent fill, hover lift, no outer glows.
- **Skeletons (§Components):** shimmer, no circular spinners (n/a here — existing loading uses `animate-pulse` blocks, retained).
- **Don'ts:** no emojis (Lucide only); no pure black (off-black `#0a0a0a` already in tokens); saturation cap 80% (new semantic tokens below comply); no `h-screen` (uses `min-h-[100dvh]`); no AI cliché copy.

## Design

### 1. Token additions (`apps/web/src/app/globals.css`)

Add two semantic tokens (saturation ≤ 80% per DESIGN.md cap) so success/error states are token-driven rather than raw Tailwind palette:

```css
--color-danger: #b42318;   /* semantic red, for errors */
--color-success: #1d6f42;  /* muted green, for success accents */
```

No other token changes. `:root` remains the single source of truth.

### 2. Toast system (NEW)

**File:** `apps/web/src/components/toast/toast-provider.tsx` (single file; provider + consumer + item).

**API:**
```ts
type ToastVariant = 'success' | 'error' | 'info'
interface ToastInput { variant: ToastVariant; title: string; description?: string }
const toast = useToast()
toast.show(input)
toast.success(title, description?) // convenience
toast.error(title, description?)
toast.info(title, description?)
```

**State model:** queue of `{ id, variant, title, description?, dismissAt? }`. `id` via `crypto.randomUUID()`. Default auto-dismiss 4000ms; **error toasts do not auto-dismiss** (must be explicitly closed). `dismissAt` drives a `setTimeout` per toast.

**Rendering:**
- Container: `fixed top-4 right-4 z-[500] flex w-[min(92vw,24rem)] flex-col gap-2`, `aria-live="polite"`.
- Each toast: `role="alert"` when `variant === 'error'`, else `role="status"`.
- Styling (sharp edges, token-driven):
  - Shell: `border border-[var(--color-muted)]/40 bg-[var(--color-surface)] px-4 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`
  - Icon column (Lucide): `CheckCircle2` success → `text-[var(--color-success)]`; `AlertTriangle` error → `text-[var(--color-danger)]`; `Info` info → `text-[var(--color-taupe)]`.
  - Title: `text-sm font-semibold text-[var(--color-primary)]`.
  - Description: `text-xs text-[var(--color-muted)]`.
  - Dismiss button (Lucide `X`): `text-[var(--color-muted)] hover:text-[var(--color-primary)]`.
- Motion (entry/exit): implemented with a `visible` flag + Tailwind transition classes — enter `opacity-0 translate-y-4` → `opacity-100 translate-y-0` over 420ms ease-out; exit `opacity-0` over 200ms then unmount. Only `opacity`/`transform` animated.
- Stack limit: max 5 visible; oldest dismissed when exceeded (FIFO).

**A11y:** live region + explicit roles; icons `aria-hidden`; dismiss button has `aria-label="Dismiss"`.

### 3. App wiring (`apps/web/src/app/layout.tsx`)

Wrap the Shell's children with `<ToastProvider>` so toasts are available app-wide (reusable by future chat UI):

```tsx
<Shell>
  <ToastProvider>{children}</ToastProvider>
</Shell>
```

`ToastProvider` renders children + the fixed container.

### 4. Provider UI reskin

Applies to: `features/providers/index.tsx`, `components/ConnectionForm.tsx`, `components/ConnectionList.tsx`, `components/ModelProfileManager.tsx`, `components/AgentBindingManager.tsx`.

**Token mapping (applied uniformly):**

| Current | Target |
|---|---|
| `index.tsx` `-mx-6 -my-16 … bg-[#111111]` wrapper | removed; content sits directly on Shell white surface |
| `bg-white/[0.04]` section/card | `bg-[var(--color-surface)] border border-[var(--color-muted)]/40` for all section containers; `bg-[var(--color-beige)]` is reserved for status accents (PASS/FAIL badges), matching health-badge |
| `text-stone-50` / `text-stone-100` | `text-[var(--color-primary)]` (headings) / `text-[var(--color-text)]` (body) |
| `text-stone-300/400/500` | `text-[var(--color-muted)]` |
| `border-white/10` / `border-white/15` / `divide-white/10` | `border-[var(--color-muted)]/40` / `divide-[var(--color-muted)]/20` |
| `bg-[#151515]` inputs | `bg-[var(--color-surface)] border border-[var(--color-muted)]/60` + `focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]` |
| `bg-[#f5f1e8] text-[#111111]` primary button | `border border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-text-inverted)] hover:-translate-y-px` (matches home CTA) |
| secondary/ghost buttons (`border-white/25 … text-stone-100`) | `border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-beige)]` |
| destructive buttons (`border-red-400/40 text-red-200`) | `border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10` |
| `text-[#b38b6d]`, `accent-[#b38b6d]`, `ring-[#b38b6d]`, `focus-visible:ring-[#b38b6d]` | `var(--color-taupe)` |
| PASS badge (`bg-emerald-950 text-emerald-200`) | `bg-[var(--color-beige)] text-[var(--color-success)]` |
| FAIL badge (`bg-red-950 text-red-200`) | `bg-[var(--color-beige)] text-[var(--color-danger)]` |
| loading `animate-pulse border-white/10 bg-white/[0.04]` | `animate-pulse border-[var(--color-muted)]/20 bg-[var(--color-beige)]/60` |

Typography classes (`font-mono`, `uppercase`, `tracking-[...]`, `text-xs/sm/base/xl`, grid layouts, `max-w-[1280px]`) are retained — they already align with DESIGN.md.

**Inline banners → toasts:** Every `<p role="status">` (success) and `<p role="alert">` (error) block in the four components is removed. Each call site that previously set a `message`/`error`/`successMessage`/`actionMessage`/`actionError` state now calls `useToast()`:
- success path → `toast.success(...)`
- error/catch path → `toast.error(...)`
- The DELETE 409 conflict message (from `ConnectionList.handleDelete`) → `toast.error('Cannot remove connection', { description: serverMessage })`.

The `successMessage`/`error`/`message`/`actionError`/`actionMessage` state variables and their JSX are deleted as part of this migration. The red "Registry unavailable" full-page error block in `index.tsx` is kept as an inline error region (it is a fatal page state, not a transient action result) but reskinned to tokens.

**Confirm dialogs retained:** `window.confirm` for delete-connection and unbind-agent stays (genuine destructive choice, native + accessible). Only the *result* of those actions moves to a toast.

### 5. Behavior preservation

No endpoint, payload, state-flow, or prop changes. The only behavioral change is the notification channel (inline banner → toast) and the visual treatment. All existing provider-api functions, the abort-on-connection-change logic, the latency measurement, the delete cascade/409 logic, and the unbind flow remain byte-for-byte identical in behavior.

## Testing & Verification

- `npm run typecheck` — all workspaces clean.
- `npm run lint` — clean.
- `npm run build` — web builds, `/settings/providers` prerenders.
- `npm run test` — existing 91 tests stay green (no UI tests added; web has no RTL).
- Manual visual check via `npm run dev`: exercise each action (add connection, test PASS/FAIL, delete → 409 then unbind then delete, approve/revoke profile, enable/disable, save/unbind binding) and confirm toast feedback + token styling.

## Risks

- **Tailwind v4 arbitrary `bg-[var(--color-danger)]/10` opacity syntax:** must confirm Tailwind v4 applies the `/10` alpha to a CSS-variable color. If not, fall back to a dedicated `--color-danger-soft` token. (Mitigation: verified during implementation; fallback is a one-line token add.)
- **Toast exit animation unmount timing:** the 200ms exit must complete before removal from the queue or the transition won't show. Mitigation: a `leaving` flag per toast; remove from state after the 200ms timeout.

## Out of Scope (explicit)

- Chat / agent catalog UI (PR-2).
- Modal component replacing `window.confirm`.
- RTL/jsdom component tests.
- Dark-mode toggle.
- Changes outside `apps/web`.
