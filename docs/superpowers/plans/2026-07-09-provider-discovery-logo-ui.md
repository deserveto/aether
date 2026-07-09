# Provider Discovery Search + Logo UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix disabled cursor affordances, add searchable bounded discovered-model picker, and render `docs/logo.svg` as the web header logo.

**Architecture:** Keep UI changes in `apps/web`. Add one pure helper module for discovered-model filtering and keyboard index calculation so search behavior can be tested under current Node Vitest setup. Keep combobox markup in `ModelProfileManager.tsx` to avoid introducing new dependencies or broad component splits.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind CSS v4, Vitest node environment.

## Global Constraints

- No new UI dependencies.
- No provider API contract changes.
- Search matches both `displayName` and `modelId`, case-insensitive.
- Keep `docs/logo.svg` intact; copy it to `apps/web/public/logo.svg` for website serving.
- Use `cursor-wait` only while active async work is in progress; use `cursor-not-allowed` for disabled prerequisites.
- Do not commit unless user explicitly requests commit.

---

## File Structure

- Create: `apps/web/public/logo.svg` - static website logo served at `/logo.svg`.
- Create: `apps/web/src/features/providers/components/model-picker.ts` - pure model picker helpers.
- Create: `apps/web/src/features/providers/components/__tests__/model-picker.test.ts` - Vitest coverage for filtering, labels, and keyboard index movement.
- Modify: `apps/web/src/components/shell.tsx` - render logo image in brand link.
- Modify: `apps/web/src/app/layout.tsx` - add metadata icon reference.
- Modify: `apps/web/src/features/providers/components/ModelProfileManager.tsx` - replace native discovered-model select with searchable listbox and update cursor classes.
- Modify cursor classes in files found by `grep "disabled:cursor-wait|cursor-wait" apps/web/src`: `apps/web/src/features/agents/index.tsx`, `apps/web/src/features/chat/components/ApprovalBar.tsx`, `apps/web/src/features/chat/components/Composer.tsx`, `apps/web/src/features/providers/components/AgentBindingManager.tsx`, `apps/web/src/features/providers/components/ConnectionForm.tsx`, `apps/web/src/features/providers/components/ConnectionList.tsx`, `apps/web/src/features/providers/components/ModelProfileManager.tsx`.

---

### Task 1: Model Picker Helpers

**Files:**
- Create: `apps/web/src/features/providers/components/model-picker.ts`
- Create: `apps/web/src/features/providers/components/__tests__/model-picker.test.ts`

**Interfaces:**
- Consumes: `DiscoveredModel` type from `../provider-api`.
- Produces: `formatModelOptionLabel(model: Pick<DiscoveredModel, 'displayName' | 'modelId'>): string`, `filterDiscoveredModels(models: readonly DiscoveredModel[], query: string): readonly DiscoveredModel[]`, `moveModelActiveIndex(currentIndex: number, direction: 1 | -1, optionCount: number): number`.

- [ ] **Step 1: Write failing helper tests**

Create `apps/web/src/features/providers/components/__tests__/model-picker.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  filterDiscoveredModels,
  formatModelOptionLabel,
  moveModelActiveIndex,
} from '../model-picker'

const capabilities = {
  streaming: true,
  toolCalling: false,
  structuredOutput: false,
  vision: false,
  fileInput: false,
  reasoning: false,
}

const models = [
  {
    modelId: 'openrouter/deepseek/deepseek-r1-0528:free',
    displayName: 'DeepSeek R1 0528 Free With Very Long Provider Name',
    capabilities,
  },
  {
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o mini',
    capabilities,
  },
  {
    modelId: 'claude-4-sonnet',
    displayName: 'Claude Sonnet 4',
    capabilities,
  },
] as const

describe('model picker helpers', () => {
  it('formats a readable label from display name and model id', () => {
    expect(formatModelOptionLabel(models[1])).toBe('GPT-4o mini - gpt-4o-mini')
  })

  it('filters models by display name case-insensitively', () => {
    expect(filterDiscoveredModels(models, 'deepseek')).toEqual([models[0]])
  })

  it('filters models by model id case-insensitively', () => {
    expect(filterDiscoveredModels(models, '4O-MINI')).toEqual([models[1]])
  })

  it('returns all models for an empty query', () => {
    expect(filterDiscoveredModels(models, '   ')).toEqual(models)
  })

  it('wraps active index movement through available options', () => {
    expect(moveModelActiveIndex(-1, 1, 3)).toBe(0)
    expect(moveModelActiveIndex(2, 1, 3)).toBe(0)
    expect(moveModelActiveIndex(0, -1, 3)).toBe(2)
    expect(moveModelActiveIndex(0, 1, 0)).toBe(-1)
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test -- apps/web/src/features/providers/components/__tests__/model-picker.test.ts`

Expected: FAIL with module not found for `../model-picker`.

- [ ] **Step 3: Add helper implementation**

Create `apps/web/src/features/providers/components/model-picker.ts`:

```ts
import type { DiscoveredModel } from '../provider-api'

export function formatModelOptionLabel(
  model: Pick<DiscoveredModel, 'displayName' | 'modelId'>,
) {
  return `${model.displayName} - ${model.modelId}`
}

export function filterDiscoveredModels(
  models: readonly DiscoveredModel[],
  query: string,
): readonly DiscoveredModel[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return models

  return models.filter((model) => {
    const displayName = model.displayName.toLowerCase()
    const modelId = model.modelId.toLowerCase()
    return displayName.includes(normalizedQuery) || modelId.includes(normalizedQuery)
  })
}

export function moveModelActiveIndex(
  currentIndex: number,
  direction: 1 | -1,
  optionCount: number,
) {
  if (optionCount <= 0) return -1
  if (currentIndex < 0) return direction === 1 ? 0 : optionCount - 1
  return (currentIndex + direction + optionCount) % optionCount
}
```

- [ ] **Step 4: Run helper tests and verify pass**

Run: `npm run test -- apps/web/src/features/providers/components/__tests__/model-picker.test.ts`

Expected: PASS for all five helper tests.

- [ ] **Step 5: Review diff**

Run: `git diff -- apps/web/src/features/providers/components/model-picker.ts apps/web/src/features/providers/components/__tests__/model-picker.test.ts`

Expected: only helper and helper test files changed.

---

### Task 2: Searchable Discovered Model Combobox

**Files:**
- Modify: `apps/web/src/features/providers/components/ModelProfileManager.tsx`

**Interfaces:**
- Consumes: `filterDiscoveredModels`, `formatModelOptionLabel`, `moveModelActiveIndex` from `./model-picker`.
- Produces: searchable combobox behavior that still calls existing `selectModel(modelId: string)` and existing `handleCreate` payload.

- [ ] **Step 1: Add imports and picker state**

In `ModelProfileManager.tsx`, change imports and add helper import:

```ts
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  filterDiscoveredModels,
  formatModelOptionLabel,
  moveModelActiveIndex,
} from './model-picker'
```

Inside component after `selectedModelId` state, add:

```ts
  const modelListboxId = useId()
  const [modelQuery, setModelQuery] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [activeModelIndex, setActiveModelIndex] = useState(-1)
```

Add filtered data near class constants:

```ts
  const filteredModels = useMemo(
    () => filterDiscoveredModels(discovered, modelQuery),
    [discovered, modelQuery],
  )
  const activeModel = activeModelIndex >= 0 ? filteredModels[activeModelIndex] : undefined
```

- [ ] **Step 2: Reset picker state when discovery resets**

Update `resetDiscovery()` to include:

```ts
    setModelQuery('')
    setModelPickerOpen(false)
    setActiveModelIndex(-1)
```

Update `handleDiscovery()` success after `setDiscovered(models)`:

```ts
      setModelQuery('')
      setModelPickerOpen(models.length > 0)
      setActiveModelIndex(models.length > 0 ? 0 : -1)
```

Update `selectModel(modelId: string)` to include:

```ts
    if (model) setModelQuery(formatModelOptionLabel(model))
    setModelPickerOpen(false)
    setActiveModelIndex(-1)
```

- [ ] **Step 3: Add keyboard handler**

Add this function before `handleCreate`:

```ts
  function handleModelKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setModelPickerOpen(true)
      setActiveModelIndex((current) =>
        moveModelActiveIndex(current, event.key === 'ArrowDown' ? 1 : -1, filteredModels.length),
      )
      return
    }

    if (event.key === 'Enter' && modelPickerOpen && activeModel) {
      event.preventDefault()
      selectModel(activeModel.modelId)
      return
    }

    if (event.key === 'Escape') {
      setModelPickerOpen(false)
      setActiveModelIndex(-1)
    }
  }
```

- [ ] **Step 4: Replace native discovered-model select with bounded combobox**

Replace lines containing the `Discovered model` `<select>` block with:

```tsx
          <label className={labelClass}>
            Discovered model
            <div className="relative min-w-0">
              <input
                required
                role="combobox"
                aria-expanded={modelPickerOpen}
                aria-controls={modelListboxId}
                aria-activedescendant={activeModel ? `${modelListboxId}-${activeModel.modelId}` : undefined}
                disabled={discovered.length === 0}
                value={modelQuery}
                onBlur={() => window.setTimeout(() => setModelPickerOpen(false), 100)}
                onChange={(event) => {
                  setModelQuery(event.target.value)
                  setSelectedModelId('')
                  setDisplayName('')
                  setCapabilities(emptyCapabilities)
                  setModelPickerOpen(true)
                  setActiveModelIndex(0)
                }}
                onFocus={() => {
                  if (discovered.length > 0) setModelPickerOpen(true)
                }}
                onKeyDown={handleModelKeyDown}
                placeholder={discovered.length ? 'Search model name or ID' : 'Run discovery first'}
                className={`${inputClass} w-full disabled:cursor-not-allowed disabled:opacity-60`}
              />
              {modelPickerOpen ? (
                <div
                  id={modelListboxId}
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-[200] mt-2 max-h-64 min-w-0 overflow-y-auto border border-[var(--color-muted)]/40 bg-[var(--color-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                >
                  {filteredModels.length ? (
                    filteredModels.map((model, index) => (
                      <button
                        id={`${modelListboxId}-${model.modelId}`}
                        key={model.modelId}
                        type="button"
                        role="option"
                        aria-selected={model.modelId === selectedModelId}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectModel(model.modelId)}
                        className={`block w-full min-w-0 px-3 py-2 text-left text-sm hover:bg-[var(--color-beige)] ${
                          index === activeModelIndex ? 'bg-[var(--color-beige)]' : ''
                        }`}
                      >
                        <span className="block truncate font-medium text-[var(--color-text)]">
                          {model.displayName}
                        </span>
                        <span className="mt-1 block truncate font-mono text-xs text-[var(--color-muted)]">
                          {model.modelId}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-3 text-sm normal-case tracking-normal text-[var(--color-muted)]">
                      No models match this search.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </label>
```

- [ ] **Step 5: Run checks for component compile**

Run: `npm run typecheck --workspace @aether/web`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Run helper tests**

Run: `npm run test -- apps/web/src/features/providers/components/__tests__/model-picker.test.ts`

Expected: PASS.

- [ ] **Step 7: Review diff**

Run: `git diff -- apps/web/src/features/providers/components/ModelProfileManager.tsx`

Expected: native discovered-model select replaced by combobox; existing create/update API calls unchanged.

---

### Task 3: Logo Asset and Shell Branding

**Files:**
- Create: `apps/web/public/logo.svg`
- Modify: `apps/web/src/components/shell.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `docs/logo.svg` as source asset.
- Produces: `/logo.svg` served by Next static assets and visible Shell brand logo.

- [ ] **Step 1: Create public asset directory and copy logo**

Run: `Test-Path -LiteralPath "apps/web"`

Expected: `True`.

Run: `New-Item -ItemType Directory -Path "apps/web/public" -Force; Copy-Item -LiteralPath "docs/logo.svg" -Destination "apps/web/public/logo.svg"`

Expected: `apps/web/public/logo.svg` exists.

- [ ] **Step 2: Update Shell brand link**

Modify `apps/web/src/components/shell.tsx` brand link to:

```tsx
          <Link
            href="/"
            aria-label="Aether home"
            className="flex items-center gap-3 text-lg font-bold tracking-tight text-[var(--color-primary)]"
          >
            <img src="/logo.svg" alt="" className="h-8 w-8 object-contain" />
            <span>Aether</span>
          </Link>
```

- [ ] **Step 3: Add metadata icon**

Modify `metadata` in `apps/web/src/app/layout.tsx` to:

```ts
export const metadata: Metadata = {
  title: 'Aether',
  description: 'A multi-agent gateway. Foundation build.',
  icons: {
    icon: '/logo.svg',
  },
}
```

- [ ] **Step 4: Run web typecheck**

Run: `npm run typecheck --workspace @aether/web`

Expected: PASS.

- [ ] **Step 5: Review diff**

Run: `git diff -- apps/web/src/components/shell.tsx apps/web/src/app/layout.tsx apps/web/public/logo.svg`

Expected: Shell displays `/logo.svg`; metadata references `/logo.svg`; docs asset remains untouched.

---

### Task 4: Cursor Affordance Cleanup and Full Verification

**Files:**
- Modify: `apps/web/src/features/agents/index.tsx`
- Modify: `apps/web/src/features/chat/components/ApprovalBar.tsx`
- Modify: `apps/web/src/features/chat/components/Composer.tsx`
- Modify: `apps/web/src/features/providers/components/AgentBindingManager.tsx`
- Modify: `apps/web/src/features/providers/components/ConnectionForm.tsx`
- Modify: `apps/web/src/features/providers/components/ConnectionList.tsx`
- Modify: `apps/web/src/features/providers/components/ModelProfileManager.tsx`

**Interfaces:**
- Consumes: existing boolean loading state in each component.
- Produces: no `disabled:cursor-wait` classes remain; explicit `cursor-wait` only appears behind active loading booleans.

- [ ] **Step 1: Locate current wait cursor usage**

Run: `rg "disabled:cursor-wait|cursor-wait" apps/web/src`

Expected: list of current button class strings.

- [ ] **Step 2: Replace prerequisite-disabled buttons with not-allowed cursor**

For disabled buttons that can be disabled because prerequisites are missing, replace `disabled:cursor-wait` with `disabled:cursor-not-allowed`.

Example for submit/composer style buttons:

```tsx
className="... disabled:cursor-not-allowed disabled:opacity-50"
```

- [ ] **Step 3: Preserve wait cursor for active async buttons**

For buttons with known loading state, use conditional class interpolation.

Example in `ModelProfileManager.tsx` discovery button:

```tsx
className={`border border-[var(--color-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)] transition-colors hover:bg-[var(--color-beige)] disabled:opacity-50 ${
  loadingDiscovery ? 'cursor-wait' : 'disabled:cursor-not-allowed'
}`}
```

Example in `ModelProfileManager.tsx` approve button:

```tsx
className={`border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px disabled:opacity-50 ${
  saving ? 'cursor-wait' : 'disabled:cursor-not-allowed'
}`}
```

- [ ] **Step 4: Verify no blanket disabled wait cursor remains**

Run: `rg "disabled:cursor-wait" apps/web/src`

Expected: no matches.

Run: `rg "cursor-wait" apps/web/src`

Expected: only conditional/loading-state cursor classes remain.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run test`

Expected: PASS, including new model-picker tests.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Manual browser check**

Run: `npm run dev:web`

Open `/settings/providers`. Verify:

- Header shows logo and Aether text.
- Clicking brand link routes home.
- Discover models button shows normal disabled cursor before connection selection and wait cursor only while discovering.
- Long discovered model labels stay inside field/list width.
- Search finds display names and model IDs.
- Selecting model fills display name/capabilities and enables Approve profile.

- [ ] **Step 7: Final diff review**

Run: `git status --short`

Expected: includes planned files only plus any pre-existing unrelated dirty files. Do not revert unrelated user changes.

Run: `git diff -- apps/web/src apps/web/public docs/superpowers/plans docs/superpowers/specs`

Expected: changes match this plan and approved spec.
