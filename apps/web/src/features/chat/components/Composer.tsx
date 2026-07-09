'use client'

import { type FormEvent } from 'react'

interface ComposerProps {
  readonly value: string
  onChange(value: string): void
  onSubmit(): void
  readonly disabled: boolean
}

export function Composer({ value, onChange, onSubmit, disabled }: ComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Message the agent…"
        className="flex-1 border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)]"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send
      </button>
    </form>
  )
}
