import type { Metadata } from 'next'
import { AgentCatalog } from '../../features/agents'

export const metadata: Metadata = { title: 'Agents — Aether' }

export default function AgentsPage() {
  return (
    <div>
      <header className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Catalog
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[var(--color-primary)]">
          Agents
        </h1>
      </header>
      <AgentCatalog />
    </div>
  )
}
