import type { ReactNode } from 'react'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[var(--color-surface)] text-[var(--color-text)]">
      <header className="sticky top-0 z-[100] border-b border-[var(--color-muted)]/30 bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight text-[var(--color-primary)]">
            Aether
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
            foundation
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-6 py-16">{children}</main>
    </div>
  )
}
