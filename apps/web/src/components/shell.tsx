import type { ReactNode } from 'react'
import Link from 'next/link'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[var(--color-surface)] text-[var(--color-text)]">
      <header className="sticky top-0 z-[100] border-b border-[var(--color-muted)]/30 bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-[var(--color-primary)]">
            Aether
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-5">
            <Link
              href="/agents"
              className="text-xs font-medium uppercase tracking-widest text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-taupe)]"
            >
              Agents
            </Link>
            <Link
              href="/settings/providers"
              className="text-xs font-medium uppercase tracking-widest text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-taupe)]"
            >
              Provider settings
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-6 py-16">{children}</main>
    </div>
  )
}
