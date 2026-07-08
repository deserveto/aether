// Postinstall hook: applies the zod toJSONSchema patch that lets `mastra dev` boot.
//
// Why: Mastra's dev-server schema walk calls zod v4's toJSONSchema via a path
// that builds a context with an EMPTY processors map; wrapper types
// (optional/default/nullable) then crash as "Non-representable type". The patch
// (in patches/zod-4.4.3.to-json-schema.js) falls back to zod's allProcessors.
// The built server does not hit this bug — only `mastra dev` does.
//
// This script finds every installed copy of zod/v4/core/to-json-schema.js and
// overwrites it with the patched version, guarded so it never clobbers a
// different zod release. Idempotent and safe to run on every `npm install`.
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PATCH_FILE = join(root, 'patches', 'zod-4.4.3.to-json-schema.js')
const TARGET_REL = join('zod', 'v4', 'core', 'to-json-schema.js')
const MARKER = '[Aether patch]'
const ORIG_LINE = 'const processor = ctx.processors[def.type];'
// Directories that never contain a real zod install we want to patch.
const PRUNE = new Set(['.mastra', '.next', 'dist', 'build', 'out', 'coverage', '.git'])

async function findTargets(dir, found) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.git')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (PRUNE.has(e.name)) continue
      await findTargets(p, found)
    } else if (e.isFile() && p.endsWith(TARGET_REL) && p.includes(join('node_modules', 'zod'))) {
      found.push(p)
    }
  }
}

const patched = await readFile(PATCH_FILE, 'utf8')
const targets = []
await findTargets(root, targets)

if (targets.length === 0) {
  console.log('[aether-zod-patch] no zod installs found; nothing to do.')
} else {
  let applied = 0
  let skipped = 0
  let warned = 0
  for (const t of targets) {
    const cur = await readFile(t, 'utf8')
    if (cur.includes(MARKER)) {
      skipped++
      continue
    }
    if (!cur.includes(ORIG_LINE)) {
      console.warn(
        `[aether-zod-patch] WARN: ${relative(root, t)} does not match expected zod 4.4.3 shape — skipping (review patches/ if zod was upgraded).`,
      )
      warned++
      continue
    }
    await writeFile(t, patched, 'utf8')
    console.log(`[aether-zod-patch] patched ${relative(root, t)}`)
    applied++
  }
  console.log(
    `[aether-zod-patch] done: ${applied} applied, ${skipped} already patched, ${warned} skipped (unexpected shape).`,
  )
}
