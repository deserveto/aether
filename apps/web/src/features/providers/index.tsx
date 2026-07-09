'use client'

import { useEffect, useState } from 'react'
import { publicConfig } from '../../lib/config'
import { AgentBindingManager } from './components/AgentBindingManager'
import { ConnectionForm } from './components/ConnectionForm'
import { ConnectionList } from './components/ConnectionList'
import { ModelProfileManager } from './components/ModelProfileManager'
import {
  listAgentBindings,
  listConnections,
  listModelProfiles,
  type AgentBinding,
  type ModelProfile,
  type ProviderConnection,
} from './provider-api'
import { listAgents } from '../chat/chat-api'

export function ProviderSettings() {
  const apiBase = publicConfig.agentServerUrl
  const [connections, setConnections] = useState<readonly ProviderConnection[]>([])
  const [profiles, setProfiles] = useState<readonly ModelProfile[]>([])
  const [bindings, setBindings] = useState<readonly AgentBinding[]>([])
  const [catalogAgents, setCatalogAgents] = useState<
    readonly { readonly id: string; readonly name: string }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadRegistry() {
      setLoading(true)
      setError(null)
      try {
        const [nextConnections, nextProfiles, nextBindings, nextCatalogAgents] = await Promise.all([
          listConnections(apiBase, controller.signal),
          listModelProfiles(apiBase, controller.signal),
          listAgentBindings(apiBase, controller.signal),
          listAgents(apiBase, controller.signal),
        ])
        setConnections(nextConnections)
        setProfiles(nextProfiles)
        setBindings(nextBindings)
        setCatalogAgents(
          nextCatalogAgents.map((agent) => ({ id: agent.manifest.id, name: agent.manifest.name })),
        )
      } catch (caught) {
        if (caught instanceof Error && caught.name === 'AbortError') return
        setError(
          caught instanceof Error ? caught.message : 'Provider registry could not be loaded.',
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadRegistry()
    return () => controller.abort()
  }, [apiBase, reloadToken])

  function updateProfile(profile: ModelProfile) {
    setProfiles((current) => current.map((item) => (item.id === profile.id ? profile : item)))
  }

  function updateBinding(binding: AgentBinding) {
    setBindings((current) => {
      const found = current.some((item) => item.agentId === binding.agentId)
      return found
        ? current.map((item) => (item.agentId === binding.agentId ? binding : item))
        : [...current, binding]
    })
  }

  return (
    <div className="grid gap-10">
      <header className="grid gap-6 border-b border-[var(--color-muted)]/40 pb-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-taupe)]">
            System / Providers
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-[-0.035em] text-[var(--color-primary)] md:text-5xl">
            Provider registry
          </h1>
          <p className="mt-4 max-w-[68ch] text-sm leading-relaxed text-[var(--color-text)] md:text-base">
            Register encrypted provider connections, approve model profiles, and assign explicit
            routing for each agent.
          </p>
        </div>
        <div className="font-mono text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Agent server · {apiBase}
        </div>
      </header>

      {loading ? (
        <div aria-label="Loading provider registry" className="grid gap-5" role="status">
          <div className="h-48 animate-pulse border border-[var(--color-muted)]/30 bg-[var(--color-beige)]/60" />
          <div className="h-56 animate-pulse border border-[var(--color-muted)]/30 bg-[var(--color-beige)]/60" />
          <span className="sr-only">Loading provider registry</span>
        </div>
      ) : error ? (
        <div
          className="border border-[var(--color-danger)]/40 bg-[var(--color-beige)] p-6"
          role="alert"
        >
          <h2 className="font-semibold text-[var(--color-danger)]">Registry unavailable</h2>
          <p className="mt-2 text-sm text-[var(--color-text)]">{error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            className="mt-5 border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          <ConnectionForm
            apiBase={apiBase}
            onCreated={(connection) => setConnections((current) => [...current, connection])}
          />
          <ConnectionList
            apiBase={apiBase}
            connections={connections}
            onStatusChange={(connectionId, healthy) =>
              setConnections((current) =>
                current.map((connection) =>
                  connection.id === connectionId
                    ? { ...connection, status: healthy ? 'healthy' : 'unavailable' }
                    : connection,
                ),
              )
            }
            onDeleted={(connectionId) => {
              setConnections((current) =>
                current.filter((connection) => connection.id !== connectionId),
              )
              setProfiles((current) =>
                current.filter((profile) => profile.providerConnectionId !== connectionId),
              )
            }}
          />
          <ModelProfileManager
            apiBase={apiBase}
            connections={connections}
            profiles={profiles}
            onCreated={(profile) => setProfiles((current) => [...current, profile])}
            onUpdated={updateProfile}
          />
          <AgentBindingManager
            apiBase={apiBase}
            profiles={profiles}
            bindings={bindings}
            catalogAgents={catalogAgents}
            onSaved={updateBinding}
            onUnbound={(agentId) =>
              setBindings((current) => current.filter((binding) => binding.agentId !== agentId))
            }
          />
        </div>
      )}
    </div>
  )
}
