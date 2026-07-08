# Provider UI Swiss-Style Conformance + Toast System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the provider admin UI conform to `docs/DESIGN.md` (token-driven light Swiss theme matching the Shell/home/health-badge) and replace all inline `<p role="status/alert">` notification banners with a reusable custom Toast system.

**Architecture:** Add two semantic CSS tokens; build a custom toast system as a pure reducer (`toast-reducer.ts`, unit-tested) + a React context provider (`toast-provider.tsx`) rendered app-wide from `layout.tsx`; then reskin the four provider components + `index.tsx` from raw dark hex to the existing `var(--color-*)` token system, migrating every inline banner to `useToast()`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-provider-ui-swiss-toast-design.md`

## Global Constraints

- Color values come ONLY from CSS variables in `apps/web/src/app/globals.css` — never raw hex or Tailwind palette names (`stone-*`, `emerald-*`, `red-*`, `white`) in component JSX.
- Existing established tokens (do not change): `--color-primary:#0a0a0a`, `--color-surface:#ffffff`, `--color-beige:#f5f1e8`, `--color-muted:#808080`, `--color-taupe:#b38b6d`, `--color-text:#1a1a1a`, `--color-text-inverted:#f5f1e8`, `--font-sans`, `--font-mono`.
- DESIGN.md contracts: toast z-index = `z-[500]`; entry motion = fade + translate-Y 16px→0 over 420ms ease-out, exit fade 200ms, animate ONLY `transform`/`opacity`; base corner radius 0px (sharp edges, no `rounded-*`); inputs = label above + 1px border + focus ring `ring-2 ring-[var(--color-taupe)] ring-offset-2`; no emojis (Lucide only); no pure black; no `h-screen` (use `min-h-[100dvh]`).
- No behavior changes: endpoints, payloads, state flow, props, the abort-on-connection-change logic, latency measurement, delete cascade/409 logic, and unbind flow remain identical. This is presentation + the toast channel only.
- No new runtime dependencies. `apps/web` keeps only `next`, `react`, `react-dom`, `lucide-react`, `zod`.
- No React Testing Library / jsdom added. Only the pure toast reducer is unit-tested; components are verified via typecheck/lint/build + manual dev check.
- No comments in code (repo AGENTS.md rule) unless the step explicitly includes them.
- Commands run from repo root: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` (build = web + agent-server).

---

### Task 1: Add semantic design tokens

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: `--color-danger` and `--color-success` CSS variables on `:root`, consumed by Tasks 2 and 4–8.

- [ ] **Step 1: Add the two tokens to `:root`**

In `apps/web/src/app/globals.css`, inside the existing `:root { ... }` block, add after `--color-text-inverted`:

```css
  --color-danger: #b42318;
  --color-success: #1d6f42;
```

- [ ] **Step 2: Verify build picks up the CSS**

Run: `npm run build --workspace @aether/web`
Expected: build succeeds, `/settings/providers` prerenders (no CSS errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): add semantic danger/success design tokens"
```

---

### Task 2: Toast system (pure reducer + provider)

**Files:**
- Create: `apps/web/src/components/toast/toast-reducer.ts`
- Create: `apps/web/src/components/toast/__tests__/toast-reducer.test.ts`
- Create: `apps/web/src/components/toast/toast-provider.tsx`

**Interfaces:**
- Produces:
  - `ToastVariant = 'success' | 'error' | 'info'`
  - `Toast { id: string; variant: ToastVariant; title: string; description?: string; leaving?: boolean }`
  - `toastReducer(state: Toast[], action: ToastAction): Toast[]`
  - `MAX_VISIBLE = 5`
  - `<ToastProvider>` React component
  - `useToast()` hook returning `{ show, success, error, info }` where each convenience takes `(title: string, description?: string)` and `show` takes a `ToastInput`.

- [ ] **Step 1: Write the failing reducer test**

Create `apps/web/src/components/toast/__tests__/toast-reducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toastReducer, MAX_VISIBLE, type Toast } from '../toast-reducer'

const toast = (id: string): Toast => ({ id, variant: 'info', title: id })

describe('toastReducer', () => {
  it('adds a toast to an empty queue', () => {
    const next = toastReducer([], { type: 'add', toast: toast('a') })
    expect(next).toHaveLength(1)
    expect(next[0]?.id).toBe('a')
  })

  it('drops the oldest (FIFO) when exceeding MAX_VISIBLE', () => {
    const start: Toast[] = Array.from({ length: MAX_VISIBLE }, (_, i) => toast(`t${i}`))
    const next = toastReducer(start, { type: 'add', toast: toast('new') })
    expect(next).toHaveLength(MAX_VISIBLE)
    expect(next[0]?.id).toBe('t1')
    expect(next[next.length - 1]?.id).toBe('new')
  })

  it('marks a toast as leaving on dismiss without removing it', () => {
    const start = [toast('a'), toast('b')]
    const next = toastReducer(start, { type: 'dismiss', id: 'a' })
    expect(next).toHaveLength(2)
    expect(next[0]?.leaving).toBe(true)
    expect(next[1]?.leaving).toBeUndefined()
  })

  it('removes a toast by id', () => {
    const start = [toast('a'), toast('b')]
    const next = toastReducer(start, { type: 'remove', id: 'a' })
    expect(next).toHaveLength(1)
    expect(next[0]?.id).toBe('b')
  })

  it('returns state unchanged for unknown action types', () => {
    const start = [toast('a')]
    const next = toastReducer(start, { type: 'noop' } as never)
    expect(next).toBe(start)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- toast-reducer`
Expected: FAIL — `Cannot find module '../toast-reducer'`.

- [ ] **Step 3: Implement the reducer**

Create `apps/web/src/components/toast/toast-reducer.ts`:

```ts
export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  readonly id: string
  readonly variant: ToastVariant
  readonly title: string
  readonly description?: string
  readonly leaving?: boolean
}

export interface ToastInput {
  readonly variant: ToastVariant
  readonly title: string
  readonly description?: string
}

export type ToastAction =
  | { readonly type: 'add'; readonly toast: Toast }
  | { readonly type: 'dismiss'; readonly id: string }
  | { readonly type: 'remove'; readonly id: string }

export const MAX_VISIBLE = 5

export function toastReducer(state: readonly Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case 'add': {
      const base = state.length >= MAX_VISIBLE ? state.slice(1) : state
      return [...base, action.toast]
    }
    case 'dismiss':
      return state.map((item) =>
        item.id === action.id && !item.leaving ? { ...item, leaving: true } : item,
      )
    case 'remove':
      return state.filter((item) => item.id !== action.id)
    default:
      return state as Toast[]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- toast-reducer`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the provider**

Create `apps/web/src/components/toast/toast-provider.tsx`:

```tsx
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import {
  toastReducer,
  type Toast,
  type ToastInput,
  type ToastVariant,
} from './toast-reducer'

const AUTO_DISMISS_MS = 4000
const EXIT_MS = 200

interface ToastApi {
  readonly show: (input: ToastInput) => void
  readonly success: (title: string, description?: string) => void
  readonly error: (title: string, description?: string) => void
  readonly info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

function makeToast(input: ToastInput): Toast {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    variant: input.variant,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const scheduleRemoval = useCallback(
    (id: string) => {
      clearTimer(id)
      const handle = setTimeout(() => dispatch({ type: 'remove', id }), EXIT_MS)
      timers.current.set(id, handle)
    },
    [clearTimer],
  )

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id)
      dispatch({ type: 'dismiss', id })
      scheduleRemoval(id)
    },
    [clearTimer, scheduleRemoval],
  )

  const show = useCallback(
    (input: ToastInput) => {
      const toast = makeToast(input)
      dispatch({ type: 'add', toast })
      if (input.variant !== 'error') {
        const handle = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
        timers.current.set(toast.id, handle)
      }
    },
    [dismiss],
  )

  const api: ToastApi = {
    show,
    success: (title, description) => show({ variant: 'success', title, description }),
    error: (title, description) => show({ variant: 'error', title, description }),
    info: (title, description) => show({ variant: 'info', title, description }),
  }

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((handle) => clearTimeout(handle))
      map.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[500] flex w-[min(92vw,24rem)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={[
        'pointer-events-auto flex items-start gap-3 border border-[var(--color-muted)]/40 bg-[var(--color-surface)] px-4 py-3',
        'shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-200 ease-out',
        toast.leaving ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
      ].join(' ')}
    >
      <ToastIcon variant={toast.variant} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--color-primary)]">{toast.title}</p>
        {toast.description ? (
          <p className="mt-1 break-words text-xs text-[var(--color-muted)]">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-primary)]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden />
  }
  if (variant === 'error') {
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" aria-hidden />
  }
  return <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-taupe)]" aria-hidden />
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
```

Note: the entry translate-Y animation uses a mount effect — to get the 16px→0 entry, wrap the item's initial render in a `useEffect` that flips a `mounted` flag (start `translate-y-4 opacity-0`, then `translate-y-0 opacity-100`). If the simpler transition above renders acceptably in manual testing (Task 9), leave it; otherwise add the mounted-flag. Keep the change scoped to `ToastItem`.

- [ ] **Step 6: Run typecheck + reducer tests**

Run: `npm run typecheck`
Run: `npm run test -- toast-reducer`
Expected: typecheck clean; 5 reducer tests PASS.

- [ ] **Step 7: Verify Tailwind v4 alpha-on-CSS-var compiles**

Run: `npm run build --workspace @aether/web`
Expected: build succeeds. If Tailwind v4 errors on `border-[var(--color-muted)]/40`, add an explicit soft token to `:root` in `globals.css` (`--color-muted-soft: rgba(128,128,128,0.4)`) and replace the `/40` usages with `[var(--color-muted-soft)]`. (Fallback only if needed.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/toast
git commit -m "feat(web): add token-driven toast system with pure reducer"
```

---

### Task 3: Wire ToastProvider into the app layout

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `<ToastProvider>` from Task 2.
- Produces: app-wide toast availability for all pages/components under the Shell.

- [ ] **Step 1: Wrap Shell children with ToastProvider**

In `apps/web/src/app/layout.tsx`, change the `<Shell>` block from:

```tsx
<Shell>{children}</Shell>
```

to:

```tsx
import { ToastProvider } from '../components/toast/toast-provider'
```
(at top, with the other imports)

and:

```tsx
<Shell>
  <ToastProvider>{children}</ToastProvider>
</Shell>
```

- [ ] **Step 2: Verify build**

Run: `npm run build --workspace @aether/web`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): mount ToastProvider app-wide"
```

---

### Task 4: Reskin + toast-migrate ConnectionForm

**Files:**
- Modify: `apps/web/src/features/providers/components/ConnectionForm.tsx`

**Interfaces:**
- Consumes: `useToast()` from Task 2, design tokens from Task 1.

- [ ] **Step 1: Replace the toast import + remove banner state**

At top, add:
```tsx
import { useToast } from '../../../components/toast/toast-provider'
```
Inside the component, add `const toast = useToast()` after the existing hooks, and DELETE the `successMessage` and `error` state declarations (`const [successMessage, setSuccessMessage] = useState<string | null>(null)` and `const [error, setError] = useState<string | null>(null)`).

- [ ] **Step 2: Rewrite handleSubmit to use toasts**

Replace the body of `handleSubmit` so that on success it calls `toast.success(\`Connection "${connection.name}" saved.\`)` instead of `setSuccessMessage(...)`, and in the `catch` it calls `toast.error(caught instanceof Error ? caught.message : 'Connection could not be created.')` instead of `setError(...)`. Remove the `setSuccessMessage(null)` / `setError(null)` calls at the top of the function. Keep the `try/finally` with `setApiKey('')` in `finally` (security fix from prior work — do not change).

Target shape:
```tsx
async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  setSubmitting(true)
  try {
    const connection = await createConnection(apiBase, {
      name: name.trim(),
      type,
      ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      apiKey,
      enabled: true,
    })
    setName('')
    setBaseUrl('')
    onCreated(connection)
    toast.success(`Connection "${connection.name}" saved.`)
  } catch (caught) {
    toast.error(caught instanceof Error ? caught.message : 'Connection could not be created.')
  } finally {
    setApiKey('')
    setSubmitting(false)
  }
}
```

- [ ] **Step 3: Delete the inline banner JSX**

Remove the two blocks:
```tsx
{error ? ( <p ... role="alert"> ... </p> ) : null}
{successMessage ? ( <p ... role="status"> ... </p> ) : null}
```

- [ ] **Step 4: Apply the token reskin (class substitutions)**

Apply these exact replacements throughout the component's JSX:

| Find | Replace |
|---|---|
| `border border-white/15 bg-white/[0.04] p-5 md:p-6` | `border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-5 md:p-6` |
| `border-b border-white/15 pb-4` | `border-b border-[var(--color-muted)]/40 pb-4` |
| `text-stone-400` | `text-[var(--color-muted)]` |
| `text-stone-50` | `text-[var(--color-primary)]` |
| `text-stone-300` | `text-[var(--color-muted)]` |
| `border border-white/20 bg-[#151515] px-3 py-2.5` | `border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5` |
| `focus-visible:ring-2 focus-visible:ring-[#b38b6d]` (and any `focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]`) | `focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]` |
| `border border-[#f5f1e8] bg-[#f5f1e8] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#111111]` | `border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-inverted)]` |

Then add `transition-transform duration-200 hover:-translate-y-px` to the submit button className (match home CTA hover).

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck`
Run: `npm run build --workspace @aether/web`
Expected: clean; `/settings/providers` prerenders.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/providers/components/ConnectionForm.tsx
git commit -m "feat(web): reskin ConnectionForm to tokens + toasts"
```

---

### Task 5: Reskin + toast-migrate ConnectionList

**Files:**
- Modify: `apps/web/src/features/providers/components/ConnectionList.tsx`

**Interfaces:**
- Consumes: `useToast()` from Task 2, design tokens from Task 1.

- [ ] **Step 1: Swap notification state for toasts**

Add `import { useToast } from '../../../components/toast/toast-provider'`, add `const toast = useToast()`, and DELETE the `actionError` and `actionMessage` state declarations.

- [ ] **Step 2: Migrate runTest result feedback to toasts**

In `runTest`, keep the `setResults(...)` writes and `onStatusChange(...)` calls unchanged. REMOVE the `setActionError(null)` / `setActionMessage(null)` lines. The PASS/FAIL is still shown inline via the result badge (reskinned in Step 5); toasts are NOT added for the per-row test result (the badge is the feedback). This task only removes the action banner state.

- [ ] **Step 3: Migrate handleDelete to toasts (incl. 409)**

Rewrite `handleDelete` so:
- on success: `toast.success(\`Connection "${connection.name}" removed.\`)`
- in `catch`: `toast.error('Connection could not be removed.', caught instanceof Error ? caught.message : undefined)` — the server's 409 message (e.g. "Cannot remove connection ... routed to agent(s): qa-web-agent") arrives as `caught.message` and is passed as the toast `description`.
Remove `setActionError`/`setActionMessage` calls. Keep `window.confirm`, the `setResults` cleanup, `onDeleted(connection.id)`, and the `deletingId` state.

Target `catch`:
```tsx
} catch (caught) {
  toast.error(
    'Connection could not be removed.',
    caught instanceof Error ? caught.message : undefined,
  )
}
```

- [ ] **Step 4: Delete the inline banner JSX**

Remove:
```tsx
{actionError ? ( <p role="alert" ...> ... </p> ) : null}
{actionMessage ? ( <p role="status" ...> ... </p> ) : null}
```

- [ ] **Step 5: Apply the token reskin**

| Find | Replace |
|---|---|
| `border border-white/15 bg-white/[0.04]` (section) | `border border-[var(--color-muted)]/40 bg-[var(--color-surface)]` |
| `border-b border-white/15 p-5 md:p-6` | `border-b border-[var(--color-muted)]/40 p-5 md:p-6` |
| `text-stone-400` / `text-stone-500` | `text-[var(--color-muted)]` |
| `text-stone-50` | `text-[var(--color-primary)]` |
| `text-stone-100` / `text-stone-300` | `text-[var(--color-text)]` / `text-[var(--color-muted)]` (body text → `--color-text`; labels/captions → `--color-muted`) |
| `border-white/10` / `divide-white/10` (table borders) | `border-[var(--color-muted)]/30` / `divide-[var(--color-muted)]/30` |
| `bg-emerald-950 px-2 py-1 font-mono text-[11px] text-emerald-200` (PASS) | `bg-[var(--color-beige)] px-2 py-1 font-mono text-[11px] text-[var(--color-success)]` |
| `bg-red-950 px-2 py-1 font-mono text-[11px] text-red-200` (FAIL) | `bg-[var(--color-beige)] px-2 py-1 font-mono text-[11px] text-[var(--color-danger)]` |
| `border border-white/15 px-2 py-1 font-mono text-[11px] uppercase text-stone-300` (state badge) | `border border-[var(--color-muted)]/40 px-2 py-1 font-mono text-[11px] uppercase text-[var(--color-muted)]` |
| Test button `border border-white/25 ... text-stone-100 hover:bg-white/10` | `border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-beige)]` |
| Remove button `border border-red-400/40 ... text-red-200 hover:bg-red-400/10` | `border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10` |
| shared `disabled:cursor-wait disabled:opacity-50` | keep as-is |

If `hover:bg-[var(--color-danger)]/10` fails to compile (Tailwind v4 alpha-on-var), fall back per Task 2 Step 7 fallback.

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck`
Run: `npm run build --workspace @aether/web`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/providers/components/ConnectionList.tsx
git commit -m "feat(web): reskin ConnectionList to tokens + toasts"
```

---

### Task 6: Reskin + toast-migrate ModelProfileManager

**Files:**
- Modify: `apps/web/src/features/providers/components/ModelProfileManager.tsx`

**Interfaces:**
- Consumes: `useToast()` from Task 2, design tokens from Task 1.

- [ ] **Step 1: Swap notification state for toasts**

Add the import + `const toast = useToast()`. DELETE the `error` and `successMessage` state declarations.

- [ ] **Step 2: Migrate handlers to toasts**

- `handleDiscovery`: remove `setError(...)`/`setSuccessMessage(...)` calls; in `catch` (non-Abort) call `toast.error(caught instanceof Error ? caught.message : 'Models could not be discovered.')`.
- `handleCreate`: on success `toast.success(\`Profile "${profile.displayName}" approved.\`)`; in `catch` `toast.error(caught instanceof Error ? caught.message : 'Model profile could not be saved.')`.
- `toggleProfile`: on success `toast.success(...)` with the same message text previously used for `successMessage`; in `catch` `toast.error(caught instanceof Error ? caught.message : 'Model profile could not be updated.')`.
- Remove all `setError(null)` / `setSuccessMessage(null)` lines.

- [ ] **Step 3: Delete the inline banner JSX**

Remove both `<p role="alert">` and `<p role="status">` blocks at the bottom of the section.

- [ ] **Step 4: Apply the token reskin**

| Find | Replace |
|---|---|
| `border border-white/15 bg-white/[0.04] p-5 md:p-6` | `border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-5 md:p-6` |
| `border-b border-white/15 pb-4` / `border-b border-white/15 pb-6 ... lg:border-r` | replace `border-white/15` → `border-[var(--color-muted)]/40` |
| `text-stone-400` / `text-stone-500` | `text-[var(--color-muted)]` |
| `text-stone-50` / `text-stone-100` | `text-[var(--color-primary)]` / `text-[var(--color-text)]` |
| `text-stone-300` | `text-[var(--color-muted)]` (labels/legends) or `text-[var(--color-text)]` (body) |
| `divide-white/10 border-y border-white/10` | `divide-[var(--color-muted)]/30 border-[var(--color-muted)]/30` |
| inputs `border border-white/20 bg-[#151515] px-3 py-2.5` | `border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5` |
| `focus-visible:ring-2 focus-visible:ring-[#b38b6d]` | `focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]` |
| checkbox `accent-[#b38b6d]` | `accent-[var(--color-taupe)]` |
| Discover button `border border-white/25 ... text-stone-100 hover:bg-white/10` | `border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-beige)]` |
| Approve button `border border-[#f5f1e8] bg-[#f5f1e8] ... text-[#111111]` | `border border-[var(--color-primary)] bg-[var(--color-primary)] ... text-[var(--color-text-inverted)]` |
| Revoke/Enable toggle buttons `border border-white/20 ... text-stone-200 hover:bg-white/10` | `border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-beige)]` |

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck`
Run: `npm run build --workspace @aether/web`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/providers/components/ModelProfileManager.tsx
git commit -m "feat(web): reskin ModelProfileManager to tokens + toasts"
```

---

### Task 7: Reskin + toast-migrate AgentBindingManager

**Files:**
- Modify: `apps/web/src/features/providers/components/AgentBindingManager.tsx`

**Interfaces:**
- Consumes: `useToast()` from Task 2, design tokens from Task 1.

- [ ] **Step 1: Swap notification state for toasts**

Add import + `const toast = useToast()`. DELETE the `message` and `error` state declarations.

- [ ] **Step 2: Migrate handlers to toasts**

- `loadBinding`: keep clearing primaryId/fallbackIds; remove `setMessage(null)`/`setError(null)` (no state to clear now). Keep `setAgentId`.
- `handleSubmit`: on success `toast.success(\`Routing updated for ${saved.agentId}.\`)`; in `catch` `toast.error(caught instanceof Error ? caught.message : 'Agent binding could not be saved.')`.
- `handleUnbind`: on success `toast.success(\`Routing removed for ${agentId}.\`)`; in `catch` `toast.error(caught instanceof Error ? caught.message : 'Agent binding could not be removed.')`.
- Remove `setMessage`/`setError` calls elsewhere.

- [ ] **Step 3: Delete the inline banner JSX**

Remove the `<p role="status">` (message) and `<p role="alert">` (error) blocks.

- [ ] **Step 4: Apply the token reskin**

| Find | Replace |
|---|---|
| `border border-white/15 bg-white/[0.04] p-5 md:p-6` | `border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-5 md:p-6` |
| `border-b border-white/15 pb-4` | `border-b border-[var(--color-muted)]/40 pb-4` |
| `text-stone-400` / `text-stone-300` (labels/legends) | `text-[var(--color-muted)]` |
| `text-stone-50` / `text-stone-100` | `text-[var(--color-primary)]` / `text-[var(--color-text)]` |
| selects `border border-white/20 bg-[#151515] px-3 py-2.5` | `border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5` |
| `focus-visible:ring-2 focus-visible:ring-[#b38b6d]` | `focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]` |
| fallback checkbox container `border border-white/20 bg-[#151515]` | `border border-[var(--color-muted)]/60 bg-[var(--color-surface)]` |
| checkbox `accent-[#b38b6d]` | `accent-[var(--color-taupe)]` |
| text-stone-300 / text-stone-500 in checkbox labels / "Approve a profile first" | `text-[var(--color-muted)]` |
| Save button `border border-[#f5f1e8] bg-[#f5f1e8] ... text-[#111111]` | `border border-[var(--color-primary)] bg-[var(--color-primary)] ... text-[var(--color-text-inverted)]` |
| Unbind button `border border-red-400/40 ... text-red-200 hover:bg-red-400/10` | `border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10` |

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck`
Run: `npm run build --workspace @aether/web`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/providers/components/AgentBindingManager.tsx
git commit -m "feat(web): reskin AgentBindingManager to tokens + toasts"
```

---

### Task 8: Reskin providers page wrapper (index.tsx)

**Files:**
- Modify: `apps/web/src/features/providers/index.tsx`

**Interfaces:**
- Consumes: design tokens from Task 1.

- [ ] **Step 1: Remove the dark slab wrapper**

Replace the outer wrapper:
```tsx
<div className="-mx-6 -my-16 min-h-[calc(100dvh-73px)] bg-[#111111] px-6 py-12 text-stone-100 md:py-16">
  <div className="mx-auto max-w-[1280px]">
```
with:
```tsx
<div className="grid gap-6">
```
(removing the matching extra closing `</div>` so the tree stays balanced — delete one `</div>` at the end of the component).

- [ ] **Step 2: Reskin header + status text**

| Find | Replace |
|---|---|
| `text-[#b38b6d]` (eyebrow) | `text-[var(--color-taupe)]` |
| `text-stone-50` (h1) | `text-[var(--color-primary)]` |
| `text-stone-400` / `text-stone-500` | `text-[var(--color-muted)]` |
| `text-stone-100` (any) | `text-[var(--color-text)]` |

- [ ] **Step 3: Reskin the loading + fatal error blocks**

Loading block:
```tsx
<div aria-label="Loading provider registry" className="grid gap-5" role="status">
  <div className="h-48 animate-pulse border border-white/10 bg-white/[0.04]" />
  <div className="h-56 animate-pulse border border-white/10 bg-white/[0.04]" />
  <span className="sr-only">Loading provider registry</span>
</div>
```
becomes:
```tsx
<div aria-label="Loading provider registry" className="grid gap-5" role="status">
  <div className="h-48 animate-pulse border border-[var(--color-muted)]/30 bg-[var(--color-beige)]/60" />
  <div className="h-56 animate-pulse border border-[var(--color-muted)]/30 bg-[var(--color-beige)]/60" />
  <span className="sr-only">Loading provider registry</span>
</div>
```

Fatal "Registry unavailable" block (kept inline — it is page-level, not a transient action toast) — reskin:
```tsx
<div className="border border-[var(--color-danger)]/40 bg-[var(--color-beige)] p-6" role="alert">
  <h2 className="font-semibold text-[var(--color-danger)]">Registry unavailable</h2>
  <p className="mt-2 text-sm text-[var(--color-text)]">{error}</p>
  <button
    type="button"
    onClick={() => setReloadToken((value) => value + 1)}
    className="mt-5 border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px"
  >
    Retry
  </button>
</div>
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck`
Run: `npm run build --workspace @aether/web`
Expected: clean; `/settings/providers` prerenders.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/providers/index.tsx
git commit -m "feat(web): reskin providers page to tokens, remove dark slab"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full suite**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run test`
Run: `npm run build`
Expected: all clean; tests green (prior count + 5 reducer tests); web prerenders `/` and `/settings/providers`; agent-server Mastra bundle succeeds.

- [ ] **Step 2: Manual dev smoke test**

Run: `npm run dev`
Exercise on `http://localhost:3000/settings/providers`:
1. Add a connection → success toast appears top-right, auto-dismisses.
2. Test a connection → PASS/FAIL badge renders inline (token colors), no banner.
3. Try to delete a connection whose model is routed → error toast with the 409 agent list.
4. Unbind the agent → success toast.
5. Delete the connection → success toast.
6. Approve / Revoke / Enable / Disable a profile → success toasts.
7. Save / Unbind a binding → success toasts.
8. Trigger an error (e.g. invalid input) → error toast stays until dismissed.
9. Dismiss a toast via X → exits with fade.
10. Confirm: no raw `#111111` / `stone-*` / `white/` colors remain (visually light Swiss theme, taupe accents).

- [ ] **Step 3: Grep guard for residual raw colors**

Run from repo root:
```
rg -n "#111111|#151515|stone-50|stone-100|stone-300|stone-400|stone-500|emerald-|red-950|bg-white/|border-white/|text-white" apps/web/src/features/providers apps/web/src/components/toast
```
Expected: no matches (or only intentional ones — investigate any hit).

- [ ] **Step 4: Commit verification note (optional)**

If the manual check surfaced fixes, commit them. Otherwise no commit.
