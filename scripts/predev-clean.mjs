import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const mastraDir = path.join(repoRoot, 'apps', 'agent-server', '.mastra')
const libsqlDir = path.join(mastraDir, 'output', 'node_modules', '@libsql')

function killStaleMastra() {
  if (process.platform !== 'win32') return
  const cmd =
    'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
    "Where-Object { $_.CommandLine -and $_.CommandLine -match '@mastra' -and $_.ProcessId -ne $PID } | " +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  try {
    spawnSync('powershell', ['-NoProfile', '-Command', cmd], { stdio: 'ignore' })
  } catch {
    // best-effort; ignore if PowerShell is unavailable
  }
}

async function remove(target) {
  await rm(target, { recursive: true, force: true })
}

killStaleMastra()

try {
  await remove(libsqlDir)
  console.log('[predev] cleared @libsql native pkg to avoid EPERM on mastra rebuild')
} catch {
  try {
    await remove(mastraDir)
    console.log('[predev] cleared .mastra to avoid EPERM on mastra rebuild')
  } catch {
    // ignore; mastra dev will attempt its own rebuild
  }
}
