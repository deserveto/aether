'use client'

interface ApprovalBarProps {
  readonly toolName: string
  readonly args: unknown
  readonly onApprove: () => void
  readonly onDeny: () => void
  readonly pending: boolean
}

export function ApprovalBar({ toolName, args, onApprove, onDeny, pending }: ApprovalBarProps) {
  return (
    <div className="border border-[var(--color-taupe)] bg-[var(--color-beige)] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Approval required
      </p>
      <p className="mt-1 text-sm text-[var(--color-text)]">
        <span className="font-mono">{toolName}</span>{' '}
        <span className="text-[var(--color-muted)]">{JSON.stringify(args)}</span>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onApprove}
          className="border border-[var(--color-success)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-success)] hover:bg-[var(--color-success)]/10 disabled:cursor-wait disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDeny}
          className="border border-[var(--color-danger)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:cursor-wait disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
