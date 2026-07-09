'use client'

import { useState, type FormEvent } from 'react'
import {
  deleteAgentBinding,
  saveAgentBinding,
  type AgentBinding,
  type ModelProfile,
} from '../provider-api'
import { useToast } from '../../../components/toast/toast-provider'

interface AgentBindingManagerProps {
  readonly apiBase: string
  readonly profiles: readonly ModelProfile[]
  readonly bindings: readonly AgentBinding[]
  readonly catalogAgents: readonly { readonly id: string; readonly name: string }[]
  readonly onSaved: (binding: AgentBinding) => void
  readonly onUnbound: (agentId: string) => void
}

export function AgentBindingManager({
  apiBase,
  profiles,
  bindings,
  catalogAgents,
  onSaved,
  onUnbound,
}: AgentBindingManagerProps) {
  const toast = useToast()
  const eligibleProfiles = profiles.filter((profile) => profile.approved && profile.enabled)
  const defaultAgentId = catalogAgents[0]?.id ?? bindings[0]?.agentId ?? ''
  const initialBinding = bindings.find((binding) => binding.agentId === defaultAgentId)
  const [agentId, setAgentId] = useState(defaultAgentId)
  const [primaryId, setPrimaryId] = useState(initialBinding?.primaryModelProfileId ?? '')
  const [fallbackIds, setFallbackIds] = useState<readonly string[]>(
    initialBinding?.fallbackModelProfileIds ?? [],
  )
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const hasBinding = bindings.some((binding) => binding.agentId === agentId)

  function loadBinding(nextAgentId: string) {
    setAgentId(nextAgentId)
    const binding = bindings.find((item) => item.agentId === nextAgentId)
    setPrimaryId(binding?.primaryModelProfileId ?? '')
    setFallbackIds(binding?.fallbackModelProfileIds ?? [])
  }

  function toggleFallback(profileId: string, checked: boolean) {
    setFallbackIds((current) =>
      checked ? [...current, profileId] : current.filter((id) => id !== profileId),
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const saved = await saveAgentBinding(apiBase, {
        agentId,
        primaryModelProfileId: primaryId,
        fallbackModelProfileIds: fallbackIds.filter((id) => id !== primaryId),
      })
      onSaved(saved)
      toast.success(`Routing updated for ${saved.agentId}.`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Agent binding could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUnbind() {
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            `Remove routing for ${agentId}? This agent will have no model until you bind it again.`,
          )
    if (!confirmed) return
    setRemoving(true)
    try {
      await deleteAgentBinding(apiBase, agentId)
      setPrimaryId('')
      setFallbackIds([])
      onUnbound(agentId)
      toast.success(`Routing removed for ${agentId}.`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Agent binding could not be removed.')
    } finally {
      setRemoving(false)
    }
  }

  const labelClass =
    'grid gap-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]'
  const selectClass =
    'border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5 text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]'

  return (
    <section
      aria-labelledby="bindings-heading"
      className="border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-5 md:p-6"
    >
      <div className="mb-6 border-b border-[var(--color-muted)]/40 pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          04 / Routing
        </p>
        <h2
          id="bindings-heading"
          className="mt-2 text-xl font-semibold text-[var(--color-primary)]"
        >
          Agent model binding
        </h2>
      </div>
      <form
        onSubmit={handleSubmit}
        className="grid gap-5 lg:grid-cols-[0.75fr_1fr_1.25fr_auto] lg:items-end"
      >
        <label className={labelClass}>
          Registered agent
          <select
            value={agentId}
            onChange={(event) => loadBinding(event.target.value)}
            className={`${selectClass} font-mono`}
          >
            {catalogAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.id}
              </option>
            ))}
            {bindings
              .filter((binding) => !catalogAgents.some((agent) => agent.id === binding.agentId))
              .map((binding) => (
                <option key={binding.agentId} value={binding.agentId}>
                  {binding.agentId}
                </option>
              ))}
          </select>
        </label>
        <label className={labelClass}>
          Primary profile
          <select
            required
            value={primaryId}
            onChange={(event) => setPrimaryId(event.target.value)}
            className={selectClass}
          >
            <option value="">Select approved profile</option>
            {eligibleProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.displayName}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
            Fallback profiles
          </legend>
          <div className="flex min-h-10 flex-wrap gap-x-4 gap-y-2 border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2">
            {eligibleProfiles
              .filter((profile) => profile.id !== primaryId)
              .map((profile) => (
                <label
                  key={profile.id}
                  className="flex items-center gap-2 text-sm text-[var(--color-text)]"
                >
                  <input
                    type="checkbox"
                    checked={fallbackIds.includes(profile.id)}
                    onChange={(event) => toggleFallback(profile.id, event.target.checked)}
                    className="accent-[var(--color-taupe)]"
                  />
                  {profile.displayName}
                </label>
              ))}
            {eligibleProfiles.length === 0 ? (
              <span className="text-sm text-[var(--color-muted)]">Approve a profile first</span>
            ) : null}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || removing || !primaryId}
            className="border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save binding'}
          </button>
          <button
            type="button"
            aria-label={`Remove routing for ${agentId}`}
            disabled={!hasBinding || saving || removing}
            onClick={() => void handleUnbind()}
            className="border border-[var(--color-danger)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10 disabled:cursor-wait disabled:opacity-50"
          >
            {removing ? 'Removing…' : 'Unbind'}
          </button>
        </div>
      </form>
    </section>
  )
}
