'use client'

import { useState } from 'react'
import {
  deleteConnection,
  testConnection,
  type ConnectionTestResult,
  type ProviderConnection,
} from '../provider-api'
import { useToast } from '../../../components/toast/toast-provider'

interface ConnectionListProps {
  readonly apiBase: string
  readonly connections: readonly ProviderConnection[]
  readonly onStatusChange: (connectionId: string, healthy: boolean) => void
  readonly onDeleted: (connectionId: string) => void
}

export function ConnectionList({
  apiBase,
  connections,
  onStatusChange,
  onDeleted,
}: ConnectionListProps) {
  const toast = useToast()
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ConnectionTestResult>>({})

  async function runTest(connectionId: string) {
    setTestingId(connectionId)
    const startedAt = performance.now()
    try {
      const result = await testConnection(apiBase, connectionId)
      const latencyMs = result.latencyMs ?? Math.max(1, Math.round(performance.now() - startedAt))
      const finalResult: ConnectionTestResult = { ...result, latencyMs }
      setResults((current) => ({ ...current, [connectionId]: finalResult }))
      onStatusChange(connectionId, finalResult.ok)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Connection test failed.'
      const latencyMs = Math.max(1, Math.round(performance.now() - startedAt))
      setResults((current) => ({
        ...current,
        [connectionId]: { ok: false, message, latencyMs },
      }))
      onStatusChange(connectionId, false)
    } finally {
      setTestingId(null)
    }
  }

  async function handleDelete(connection: ProviderConnection) {
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            `Remove connection "${connection.name}"? This also deletes its model profiles and routing bindings.`,
          )
    if (!confirmed) return
    setDeletingId(connection.id)
    try {
      await deleteConnection(apiBase, connection.id)
      setResults((current) => {
        const next = { ...current }
        delete next[connection.id]
        return next
      })
      onDeleted(connection.id)
      toast.success(`Connection "${connection.name}" removed.`)
    } catch (caught) {
      toast.error(
        'Connection could not be removed.',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section
      aria-labelledby="connections-heading"
      className="border border-[var(--color-muted)]/40 bg-[var(--color-surface)]"
    >
      <div className="flex items-end justify-between gap-4 border-b border-[var(--color-muted)]/40 p-5 md:p-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            02 / Registry
          </p>
          <h2
            id="connections-heading"
            className="mt-2 text-xl font-semibold text-[var(--color-primary)]"
          >
            Provider connections
          </h2>
        </div>
        <span className="font-mono text-xs text-[var(--color-muted)]">
          {connections.length} total
        </span>
      </div>

      {connections.length === 0 ? (
        <p className="p-6 text-sm leading-relaxed text-[var(--color-muted)]">
          No connections registered. Add one to unlock model discovery.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
              <tr className="border-b border-[var(--color-muted)]/30">
                <th scope="col" className="px-5 py-3 font-medium">
                  Connection
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Provider
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  State
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => {
                const result = results[connection.id]
                return (
                  <tr
                    key={connection.id}
                    className="border-b border-[var(--color-muted)]/30 last:border-0"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-[var(--color-text)]">{connection.name}</p>
                      <p className="mt-1 max-w-[300px] truncate font-mono text-xs text-[var(--color-muted)]">
                        {connection.baseUrl ?? 'Provider default endpoint'}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs uppercase text-[var(--color-muted)]">
                      {connection.type}
                    </td>
                    <td className="px-5 py-4">
                      <span className="border border-[var(--color-muted)]/40 px-2 py-1 font-mono text-[11px] uppercase text-[var(--color-muted)]">
                        {connection.enabled ? connection.status : 'disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {result ? (
                          <span
                            className={
                              result.ok
                                ? 'bg-[var(--color-beige)] px-2 py-1 font-mono text-[11px] text-[var(--color-success)]'
                                : 'bg-[var(--color-beige)] px-2 py-1 font-mono text-[11px] text-[var(--color-danger)]'
                            }
                            title={result.message}
                            aria-label={`${result.ok ? 'Connection passed' : 'Connection failed'}${result.latencyMs !== undefined ? ` in ${result.latencyMs} milliseconds` : ''}${result.message ? `: ${result.message}` : ''}`}
                          >
                            {result.ok ? 'PASS' : 'FAIL'}
                            {result.latencyMs !== undefined ? ` · ${result.latencyMs} ms` : ''}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          disabled={testingId === connection.id || !connection.enabled}
                          onClick={() => void runTest(connection.id)}
                          className={`border border-[var(--color-primary)] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)] transition-colors hover:bg-[var(--color-beige)] disabled:opacity-50 ${
                            testingId === connection.id
                              ? 'cursor-wait'
                              : 'disabled:cursor-not-allowed'
                          }`}
                        >
                          {testingId === connection.id ? 'Testing…' : 'Test'}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove connection ${connection.name}`}
                          disabled={deletingId === connection.id || testingId === connection.id}
                          onClick={() => void handleDelete(connection)}
                          className={`border border-[var(--color-danger)] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10 disabled:opacity-50 ${
                            deletingId === connection.id
                              ? 'cursor-wait'
                              : 'disabled:cursor-not-allowed'
                          }`}
                        >
                          {deletingId === connection.id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
