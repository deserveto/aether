# Provider Discovery Search + Logo UI - Design Spec

**Date:** 2026-07-09
**Status:** Approved (pending user spec review)
**Scope:** `apps/web` plus relocating `docs/logo.svg` into web static assets

## Problem

Provider settings has three polish issues:

1. Disabled buttons show wait cursor even when nothing is loading, which implies work is happening when button is only unavailable.
2. Discovery and approval uses a native model `<select>`. Long provider/model names can stretch the field and make the layout too wide. Users also cannot search discovered model catalogs.
3. Shell logo is plain text. User provided `docs/logo.svg` and wants production-ready placement for website logo.

## Goals

1. Disabled controls use normal unavailable cursor semantics; wait cursor appears only for active async operations.
2. Discovered model picker stays within existing form width, truncates long labels safely, and supports search by display name and model ID.
3. Logo asset is served from web static assets and rendered in the Shell brand area.

## Non-Goals

- Add new UI dependencies.
- Redesign provider settings layout beyond affected controls.
- Change provider API contracts or discovered model data shape.
- Optimize/compress the SVG asset beyond placing it in the right app-owned static location.

## Design

### 1. Cursor Semantics

Replace `disabled:cursor-wait` on buttons with state-specific classes:

- Buttons disabled only because required input is missing: `disabled:cursor-not-allowed`.
- Buttons disabled because async work is in progress: `cursor-wait` while loading flag is true.

Target files include provider/admin buttons and chat/agent buttons found by existing `cursor-wait` search. No behavior changes; only cursor affordance changes.

### 2. Searchable Discovered Model Picker

Replace discovered-model native `<select>` inside `ModelProfileManager` with a small custom combobox built in the same file.

State:

- `modelQuery`: user search text.
- `modelPickerOpen`: whether listbox is open.
- Existing `selectedModelId`, `displayName`, and `capabilities` remain source of truth for selected model.

Filtering:

- Case-insensitive match against both `model.displayName` and `model.modelId`.
- Empty query shows all discovered models.

UI behavior:

- Search input is disabled until discovery returns at least one model.
- Opening list shows bounded panel under input: `max-h-64 overflow-y-auto`.
- Each option renders display name and model ID on separate lines with `truncate`, `min-w-0`, and bounded container width so long names do not stretch layout.
- Selecting an option calls existing `selectModel(modelId)`, fills display name/capabilities as today, closes list, and sets query to selected model label.
- If no filtered results match, show a muted "No models match this search." row.

A11y:

- Input uses `role="combobox"`, `aria-expanded`, `aria-controls`, and `aria-activedescendant` for the active keyboard option.
- List uses `role="listbox"`; options use `role="option"` and `aria-selected`.
- Keyboard support: ArrowDown/ArrowUp moves active option, Enter selects it, Escape closes the list.
- Existing label text "Discovered model" remains.

### 3. Logo Asset Placement

- Copy `docs/logo.svg` to `apps/web/public/logo.svg` so Next serves it as `/logo.svg`. Keep the docs copy intact because it is documentation/source material.
- Render logo in `Shell` brand link with a plain `<img>`. Use fixed square dimensions and `object-contain` so source aspect does not distort header.
- Keep `Aether` text beside logo for accessible brand recognition; add `aria-label="Aether home"` on link.
- Add metadata icon reference in `app/layout.tsx`: `icons: { icon: '/logo.svg' }`.

## Testing & Verification

- `npm run typecheck`
- `npm run lint`
- `npm run build` if typecheck/lint pass
- Manual provider settings check: long model labels do not widen field, search finds by display name and model ID, selecting model still populates form.
- Manual Shell check: logo appears in header and home link remains accessible.

## Risks

- `docs/logo.svg` is currently a very large embedded PNG-in-SVG. Serving it directly may work but increase payload. This spec places it correctly first; later optimization can replace asset contents without UI changes.
- Native select keyboard behavior will be replaced by custom listbox behavior. Implementation should preserve basic keyboard focus and click selection; full arrow-key combobox support can be added if needed.
