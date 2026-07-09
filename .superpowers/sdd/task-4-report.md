# Task 4 Report: packages/tools — Playwright browser engine

## Status: DONE_WITH_CONCERNS

One deviation from the brief's verbatim source was required (documented below). All gates pass.

## What I implemented

New workspace package `@aether/tools` (`packages/tools`) holding the Playwright browser engine:

- `BrowserSessionStore` — one isolated persistent context per `conversationId`; `get()` reuses (returns same `BrowserSession`), `close(id)` closes + removes one, `closeAll()` drains the map.
- `BrowserSession` interface — `{ readonly context: BrowserContext; close(): Promise<void> }`.
- Pure action functions operating on a `BrowserSession`: `navigatePage`, `snapshotPage`, `clickElement`, `typeIntoElement`, `screenshotPage`.
- `BROWSER_TOOL_RISK` constant map (exact 5 keys/values).
- Structural types `BrowserPage`, `BrowserContext`, `ToolRiskLevel`.

No `@mastra/core` import anywhere in `packages/tools` (verified via grep — zero matches). Engine only; wrappers deferred to agent-server.

## Files changed (commit 2404bfe, 8 files, +235)

| File | Notes |
|---|---|
| `packages/tools/package.json` | mirrors providers; adds `./*` subpath export + `playwright` dep |
| `packages/tools/tsconfig.json` | extends `tsconfig.base.json`, `types:["node"]`, `src/**/*` |
| `packages/tools/src/types.ts` | `ToolRiskLevel`, `BrowserPage`, `BrowserContext` |
| `packages/tools/src/session-store.ts` | `BrowserSession` + `BrowserSessionStore` (**see deviation**) |
| `packages/tools/src/actions.ts` | 5 pure action fns |
| `packages/tools/src/index.ts` | re-exports + `BROWSER_TOOL_RISK` |
| `packages/tools/src/__tests__/browser.test.ts` | brief's exact test |
| `package-lock.json` | +61 lines: `@aether/tools` link, `playwright` 1.61.1, `playwright-core` 1.61.1, optional `fsevents` metadata (darwin-only, harmless). No other churn. |

## TDD evidence

**RED** (test written first, before any config/source):
```
FAIL packages/tools/src/__tests__/browser.test.ts
Error: Cannot find module '.../packages/tools/src/index.js' imported from ...browser.test.ts
Test Files 1 failed (1)   Tests no tests
```
Failed for the expected reason (package/source missing), not a typo.

**GREEN** (after minimal implementation + `npm install`):
```
✓ packages/tools/src/__tests__/browser.test.ts (2 tests) 3ms
Test Files 1 passed (1)   Tests 2 passed (2)
```

## Typecheck

`npm run typecheck` from repo root (runs all 7 workspaces) → **PASS**, zero errors. Includes `@aether/tools@0.0.0 tsc --noEmit`.

## BROWSER_TOOL_RISK annotation option used

**Option 1** — top-of-file `import type { ToolRiskLevel } from './types.js'`, used in the value-position annotation `Record<string, ToolRiskLevel>`. Typechecks cleanly: type annotations count as usage under `noUnusedLocals`, so no unused-import warning. The type is also re-exported via `export type { ... ToolRiskLevel } from './types.js'`. Option 2 (inline `import(...)`) was not needed.

## Deviation from brief (CONCERN — please review)

The brief's verbatim `session-store.ts` does NOT typecheck against the installed Playwright (`playwright@1.61.1`, resolved from `^1.49.0`). Reason: Playwright removed `page.accessibility` from its `Page` type (it survives only inside a doc comment about role selectors). Our structural `BrowserPage` declares `accessibility: { snapshot(): Promise<unknown> }`, so Playwright's real `BrowserContext.newPage(): Promise<Page>` is not assignable to our `BrowserContext.newPage(): Promise<BrowserPage>` → `TS2322` at the `chromium.launchPersistentContext(...)` assignment.

**Fix applied** (minimal, contract-preserving): cast the launched context:
```ts
const context = (await chromium.launchPersistentContext(
  `./.browser-sessions/${conversationId}`,
  { headless: true },
)) as unknown as BrowserContext
```
Rationale: our `BrowserContext`/`BrowserPage` interfaces are the contract other tasks consume; actions.ts operates on our interface and typechecks independently of Playwright's real types. The cast only bridges the real Playwright object into our structural type at the one boundary. No contract names/shapes changed.

Runtime note (out of scope for this task per brief — "documented later, not this task"): `page.accessibility.snapshot()` was also removed from Playwright's runtime API in recent versions, so `snapshotPage` will need a real implementation (e.g. ARIA snapshot via `page.locator('...').ariaSnapshot()` or similar) when the agent-server wires actual browser use. Tests mock Playwright, so this does not affect the GREEN gate.

## Self-review

- [x] RED then GREEN captured (above).
- [x] No `@mastra/core` import in `packages/tools` (grep: zero matches).
- [x] `BROWSER_TOOL_RISK` has exactly 5 keys with exact values: `browser.navigate=interactive`, `browser.snapshot=read`, `browser.screenshot=read`, `browser.click=interactive`, `browser.type=interactive`. Verified by the passing test.
- [x] Session-isolation test genuinely proves reuse (`expect(a).toBe(b)` — same object for same conv) and isolation (`expect(a).not.toBe(c)` — different object for different conv); `mockContext.close` called exactly once on `close('conv-1')`.
- [x] Lockfile churn limited to `@aether/tools` link + `playwright`/`playwright-core` (+ optional `fsevents` metadata). Nothing unexpected.
- [x] No strict-mode warnings. Lint (`eslint packages/tools`) clean.

## Fix (follow-up: Playwright ARIA snapshot API + drop context cast)

Resolves the CONCERN above. The original `page.accessibility.snapshot()` is removed at both the type level (Playwright 1.61) and runtime, so `snapshotPage` would crash. Switched to the modern `Locator.ariaSnapshot()` API and dropped the now-unnecessary `as unknown as BrowserContext` cast.

### Exact diffs

`packages/tools/src/types.ts` — `BrowserPage`:
```diff
 export interface BrowserPage {
   goto(url: string): Promise<unknown>
-  accessibility: { snapshot(): Promise<unknown> }
-  locator(selector: string): { click(): Promise<unknown>; fill(text: string): Promise<unknown> }
+  locator(selector: string): {
+    click(): Promise<unknown>
+    fill(text: string): Promise<unknown>
+    ariaSnapshot(): Promise<string>
+  }
   screenshot(): Promise<Buffer>
   close(): Promise<unknown>
 }
```

`packages/tools/src/actions.ts` — `snapshotPage`:
```diff
-export async function snapshotPage(session: BrowserSession): Promise<{ tree: unknown }> {
+export async function snapshotPage(session: BrowserSession): Promise<{ tree: string }> {
   const page = await pageOf(session)
-  return { tree: await page.accessibility.snapshot() }
+  return { tree: await page.locator('body').ariaSnapshot() }
 }
```

`packages/tools/src/session-store.ts` — cast removed:
```diff
-    const context = (await chromium.launchPersistentContext(
+    const context = await chromium.launchPersistentContext(
       `./.browser-sessions/${conversationId}`,
       { headless: true },
-    )) as unknown as BrowserContext
+    )
```

`packages/tools/src/__tests__/browser.test.ts` — `mockPage`:
```diff
 const mockPage = {
   goto: vi.fn(async () => undefined),
-  accessibility: { snapshot: vi.fn(async () => ({ role: 'WebArea', name: 'Home' })) },
-  locator: vi.fn(() => ({ click: vi.fn(async () => undefined), fill: vi.fn(async () => undefined) })),
+  locator: vi.fn(() => ({
+    click: vi.fn(async () => undefined),
+    fill: vi.fn(async () => undefined),
+    ariaSnapshot: vi.fn(async () => 'page:\n  -heading "Home"'),
+  })),
   screenshot: vi.fn(async () => Buffer.from('png')),
   close: vi.fn(async () => undefined),
 }
```

### Cast removal: YES — fully removable

The `as unknown as BrowserContext` cast was removed with no replacement cast. After dropping the `accessibility` field and adding `ariaSnapshot()` to the `locator` return type, Playwright's real `BrowserContext` is **structurally assignable** to our local `BrowserContext`:

- `launchPersistentContext()` → `playwright.BrowserContext` has `newPage(): Promise<Page>` and `close(): Promise<void>`.
- `playwright.Page` carries `goto`, `locator`, `screenshot` (→ `Buffer`), `close`.
- `playwright.Locator` carries `click`, `fill`, **and `ariaSnapshot(): Promise<string>`** (≥1.49; installed 1.61).

Every member our structural `BrowserPage`/`BrowserContext` declare exists on the real Playwright types with compatible signatures, so `tsc --noEmit` accepts the direct assignment with zero casts. No remaining member mismatch.

### Verification

Test command + output:
```
$ npm run test -- --run packages/tools
✓ packages/tools/src/__tests__/browser.test.ts (2 tests) 3ms
Test Files 1 passed (1)
     Tests 2 passed (2)
```
Both the risk-map assertion and the session-isolation assertion pass unchanged.

Typecheck (repo root, all 7 workspaces):
```
$ npm run typecheck
> tsc --noEmit   (shared, database, providers, agents, web, agent-server, tools — all clean, 0 errors)
```

No `@mastra/core` or other new dependency introduced.
