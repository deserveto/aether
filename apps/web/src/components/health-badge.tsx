'use client'

import { Activity, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { HealthStatus } from '@aether/shared'
import { fetchHealth } from '../lib/api-client'

type DisplayState = HealthStatus | 'unknown'

const POLL_INTERVAL_MS = 10_000

export function HealthBadge() {
  const [state, setState] = useState<DisplayState>('unknown')

  useEffect(() => {
    const controller = new AbortController()

    async function check() {
      try {
        const health = await fetchHealth(controller.signal)
        setState(health.status)
      } catch {
        setState('down')
      }
    }

    void check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      clearInterval(id)
      controller.abort()
    }
  }, [])

  return (
    <div className="flex items-center gap-3 border border-[var(--color-muted)]/40 bg-[var(--color-beige)] px-5 py-4 transition-opacity duration-200">
      <Icon state={state} />
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
          agent-server
        </p>
        <p className="text-base font-medium text-[var(--color-text)]">{label(state)}</p>
      </div>
    </div>
  )
}

function label(state: DisplayState): string {
  switch (state) {
    case 'ok':
      return 'Reachable'
    case 'degraded':
      return 'Degraded'
    case 'down':
      return 'Unreachable'
    default:
      return 'Checking…'
  }
}

function Icon({ state }: { state: DisplayState }) {
  if (state === 'ok') {
    return <CheckCircle2 className="h-5 w-5 text-[var(--color-primary)]" aria-hidden />
  }
  if (state === 'down' || state === 'degraded') {
    return <AlertTriangle className="h-5 w-5 text-[var(--color-taupe)]" aria-hidden />
  }
  return <Activity className="h-5 w-5 text-[var(--color-muted)]" aria-hidden />
}
