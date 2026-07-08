'use client'

import { useState } from 'react'
import {
  deleteConnection,
  testConnection,
  type ConnectionTestResult,
  type ProviderConnection,
} from '../provider-api'

interface ConnectionListProps {
  readonly apiBase: string
  readonly connections: readonly ProviderConnection[]
  readonly onStatusChange: (connectionId: string, healthy: boolean) => void
  readonly onDeleted: (connectionId: string) => void
}

export function ConnectionList({ apiBase, connections, onStatusChange, onDeleted }: ConnectionListProps) {
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ConnectionTestResult>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  async function runTest(connectionId: string) {
    setTestingId(connectionId)
    setActionError(null)
    setActionMessage(null)
    const startedAt = performance.now()
    try {
      const result = await testConnection(apiBase, connectionId)
      const latencyMs =
        result.latencyMs ?? Math.max(1, Math.round(performance.now() - startedAt))
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
    setActionError(null)
    setActionMessage(null)
    try {
      await deleteConnection(apiBase, connection.id)
      setResults((current) => {
        const next = { ...current }
        delete next[connection.id]
        return next
      })
      onDeleted(connection.id)
      setActionMessage(`Connection "${connection.name}" removed.`)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Connection could not be removed.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section
      aria-labelledby="connections-heading"
      className="border border-white/15 bg-white/[0.04]"
    >
      <div className="flex items-end justify-between gap-4 border-b border-white/15 p-5 md:p-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-400">
            02 / Registry
          </p>
          <h2 id="connections-heading" className="mt-2 text-xl font-semibold text-stone-50">
            Provider connections
          </h2>
        </div>
        <span className="font-mono text-xs text-stone-400">{connections.length} total</span>
      </div>

      {connections.length === 0 ? (
        <p className="p-6 text-sm leading-relaxed text-stone-400">
          No connections registered. Add one to unlock model discovery.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone-500">
              <tr className="border-b border-white/10">
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
                  <tr key={connection.id} className="border-b border-white/10 last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-medium text-stone-100">{connection.name}</p>
                      <p className="mt-1 max-w-[300px] truncate font-mono text-xs text-stone-500">
                        {connection.baseUrl ?? 'Provider default endpoint'}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs uppercase text-stone-300">
                      {connection.type}
                    </td>
                    <td className="px-5 py-4">
                      <span className="border border-white/15 px-2 py-1 font-mono text-[11px] uppercase text-stone-300">
                        {connection.enabled ? connection.status : 'disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {result ? (
                          <span
                            className={
                              result.ok
                                ? 'bg-emerald-950 px-2 py-1 font-mono text-[11px] text-emerald-200'
                                : 'bg-red-950 px-2 py-1 font-mono text-[11px] text-red-200'
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
                          className="border border-white/25 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-stone-100 hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
                        >
                          {testingId === connection.id ? 'Testing…' : 'Test'}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove connection ${connection.name}`}
                          disabled={deletingId === connection.id || testingId === connection.id}
                          onClick={() => void handleDelete(connection)}
                          className="border border-red-400/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-red-200 hover:bg-red-400/10 disabled:cursor-wait disabled:opacity-50"
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
      {actionError ? (
        <p role="alert" className="m-5 border-l-2 border-red-400 pl-3 text-sm text-red-200">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p role="status" className="m-5 border-l-2 border-emerald-400 pl-3 text-sm text-emerald-200">
          {actionMessage}
        </p>
      ) : null}
    </section>
  )
}
