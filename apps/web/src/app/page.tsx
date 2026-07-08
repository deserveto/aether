import { HealthBadge } from '../components/health-badge'

export default function HomePage() {
  return (
    <section className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
      <div className="space-y-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
          foundation · PR-0
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-[var(--color-primary)] md:text-5xl">
          Aether is booting.
        </h1>
        <p className="max-w-[72ch] text-base leading-relaxed text-[var(--color-text)]">
          The agent gateway is being built on a clean foundation. No agents, providers, or tools are
          wired yet — they arrive in later pull requests. This page confirms the web and agent
          servers are running.
        </p>
        <a
          href="https://github.com/deserveto/aether"
          className="inline-block border border-[var(--color-primary)] bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px"
        >
          View repository
        </a>
      </div>
      <div className="flex justify-center md:justify-end">
        <div className="w-full max-w-sm">
          <HealthBadge />
        </div>
      </div>
    </section>
  )
}
