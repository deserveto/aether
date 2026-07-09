'use client'

import { CheckCircle2, Clock } from 'lucide-react'

export interface ToolTimelineItem {
  readonly toolCallId: string
  readonly toolName: string
  readonly status: 'requested' | 'success' | 'error'
  readonly args?: unknown
  readonly result?: unknown
}

export function ToolTimeline({ items }: { readonly items: readonly ToolTimelineItem[] }) {
  if (items.length === 0) return null
  return (
    <aside className="border border-[var(--color-muted)]/40 bg-[var(--color-beige)] p-4">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Tool timeline
      </p>
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.toolCallId}
            className="flex items-start gap-2 text-xs text-[var(--color-text)]"
          >
            {item.status === 'success' ? (
              <CheckCircle2
                className="mt-0.5 h-3.5 w-3.5 text-[var(--color-success)]"
                aria-hidden
              />
            ) : (
              <Clock className="mt-0.5 h-3.5 w-3.5 text-[var(--color-taupe)]" aria-hidden />
            )}
            <span className="font-mono">{item.toolName}</span>
            <span className="text-[var(--color-muted)]">{item.status}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
