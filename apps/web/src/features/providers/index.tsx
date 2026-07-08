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

export function ProviderSettings() {
  const apiBase = publicConfig.agentServerUrl
  const [connections, setConnections] = useState<readonly ProviderConnection[]>([])
  const [profiles, setProfiles] = useState<readonly ModelProfile[]>([])
  const [bindings, setBindings] = useState<readonly AgentBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadRegistry() {
      setLoading(true)
      setError(null)
      try {
        const [nextConnections, nextProfiles, nextBindings] = await Promise.all([
          listConnections(apiBase, controller.signal),
          listModelProfiles(apiBase, controller.signal),
          listAgentBindings(apiBase, controller.signal),
        ])
        setConnections(nextConnections)
        setProfiles(nextProfiles)
        setBindings(nextBindings)
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
    <div className="-mx-6 -my-16 min-h-[calc(100dvh-73px)] bg-[#111111] px-6 py-12 text-stone-100 md:py-16">
      <div className="mx-auto max-w-[1280px]">
        <header className="mb-10 grid gap-6 border-b border-white/20 pb-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#b38b6d]">
              System / Providers
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-[-0.035em] text-stone-50 md:text-5xl">
              Provider registry
            </h1>
            <p className="mt-4 max-w-[68ch] text-sm leading-relaxed text-stone-400 md:text-base">
              Register encrypted provider connections, approve model profiles, and assign explicit
              routing for each agent.
            </p>
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-stone-500">
            Agent server · {apiBase}
          </div>
        </header>

        {loading ? (
          <div aria-label="Loading provider registry" className="grid gap-5" role="status">
            <div className="h-48 animate-pulse border border-white/10 bg-white/[0.04]" />
            <div className="h-56 animate-pulse border border-white/10 bg-white/[0.04]" />
            <span className="sr-only">Loading provider registry</span>
          </div>
        ) : error ? (
          <div className="border border-red-400/40 bg-red-950/40 p-6" role="alert">
            <h2 className="font-semibold text-red-100">Registry unavailable</h2>
            <p className="mt-2 text-sm text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              className="mt-5 border border-red-200/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-100 hover:bg-red-100/10"
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
              onSaved={updateBinding}
            />
          </div>
        )}
      </div>
    </div>
  )
}
