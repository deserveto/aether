'use client'

import { useState, type FormEvent } from 'react'
import { saveAgentBinding, type AgentBinding, type ModelProfile } from '../provider-api'

interface AgentBindingManagerProps {
  readonly apiBase: string
  readonly profiles: readonly ModelProfile[]
  readonly bindings: readonly AgentBinding[]
  readonly onSaved: (binding: AgentBinding) => void
}

export function AgentBindingManager({
  apiBase,
  profiles,
  bindings,
  onSaved,
}: AgentBindingManagerProps) {
  const eligibleProfiles = profiles.filter((profile) => profile.approved && profile.enabled)
  const initialBinding = bindings.find((binding) => binding.agentId === 'qa-web-agent')
  const [agentId, setAgentId] = useState('qa-web-agent')
  const [primaryId, setPrimaryId] = useState(initialBinding?.primaryModelProfileId ?? '')
  const [fallbackIds, setFallbackIds] = useState<readonly string[]>(
    initialBinding?.fallbackModelProfileIds ?? [],
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadBinding(nextAgentId: string) {
    setAgentId(nextAgentId)
    const binding = bindings.find((item) => item.agentId === nextAgentId)
    setPrimaryId(binding?.primaryModelProfileId ?? '')
    setFallbackIds(binding?.fallbackModelProfileIds ?? [])
    setMessage(null)
  }

  function toggleFallback(profileId: string, checked: boolean) {
    setFallbackIds((current) =>
      checked ? [...current, profileId] : current.filter((id) => id !== profileId),
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const saved = await saveAgentBinding(apiBase, {
        agentId,
        primaryModelProfileId: primaryId,
        fallbackModelProfileIds: fallbackIds.filter((id) => id !== primaryId),
      })
      onSaved(saved)
      setMessage(`Routing updated for ${saved.agentId}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Agent binding could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-labelledby="bindings-heading"
      className="border border-white/15 bg-white/[0.04] p-5 md:p-6"
    >
      <div className="mb-6 border-b border-white/15 pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-400">
          04 / Routing
        </p>
        <h2 id="bindings-heading" className="mt-2 text-xl font-semibold text-stone-50">
          Agent model binding
        </h2>
      </div>
      <form
        onSubmit={handleSubmit}
        className="grid gap-5 lg:grid-cols-[0.75fr_1fr_1.25fr_auto] lg:items-end"
      >
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
          Registered agent
          <select
            value={agentId}
            onChange={(event) => loadBinding(event.target.value)}
            className="border border-white/20 bg-[#151515] px-3 py-2.5 font-mono text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
          >
            <option value="qa-web-agent">qa-web-agent</option>
            {bindings
              .filter((binding) => binding.agentId !== 'qa-web-agent')
              .map((binding) => (
                <option key={binding.agentId} value={binding.agentId}>
                  {binding.agentId}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
          Primary profile
          <select
            required
            value={primaryId}
            onChange={(event) => setPrimaryId(event.target.value)}
            className="border border-white/20 bg-[#151515] px-3 py-2.5 text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
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
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-300">
            Fallback profiles
          </legend>
          <div className="flex min-h-10 flex-wrap gap-x-4 gap-y-2 border border-white/20 bg-[#151515] px-3 py-2">
            {eligibleProfiles
              .filter((profile) => profile.id !== primaryId)
              .map((profile) => (
                <label key={profile.id} className="flex items-center gap-2 text-sm text-stone-300">
                  <input
                    type="checkbox"
                    checked={fallbackIds.includes(profile.id)}
                    onChange={(event) => toggleFallback(profile.id, event.target.checked)}
                    className="accent-[#b38b6d]"
                  />
                  {profile.displayName}
                </label>
              ))}
            {eligibleProfiles.length === 0 ? (
              <span className="text-sm text-stone-500">Approve a profile first</span>
            ) : null}
          </div>
        </fieldset>
        <button
          type="submit"
          disabled={saving || !primaryId}
          className="border border-[#f5f1e8] bg-[#f5f1e8] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#111111] disabled:cursor-wait disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save binding'}
        </button>
      </form>
      {message ? (
        <p
          role="status"
          className="mt-5 border-l-2 border-emerald-400 pl-3 text-sm text-emerald-200"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 border-l-2 border-red-400 pl-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </section>
  )
}
