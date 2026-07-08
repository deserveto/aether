'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  createModelProfile,
  discoverModels,
  updateModelProfile,
  type DiscoveredModel,
  type ModelCapabilities,
  type ModelProfile,
  type ProviderConnection,
} from '../provider-api'

const capabilityOptions: readonly { key: keyof ModelCapabilities; label: string }[] = [
  { key: 'streaming', label: 'Streaming' },
  { key: 'toolCalling', label: 'Tool calling' },
  { key: 'structuredOutput', label: 'Structured output' },
  { key: 'vision', label: 'Vision' },
  { key: 'fileInput', label: 'File input' },
  { key: 'reasoning', label: 'Reasoning' },
]

const emptyCapabilities: ModelCapabilities = {
  streaming: false,
  toolCalling: false,
  structuredOutput: false,
  vision: false,
  fileInput: false,
  reasoning: false,
}

interface ModelProfileManagerProps {
  readonly apiBase: string
  readonly connections: readonly ProviderConnection[]
  readonly profiles: readonly ModelProfile[]
  readonly onCreated: (profile: ModelProfile) => void
  readonly onUpdated: (profile: ModelProfile) => void
}

export function ModelProfileManager({
  apiBase,
  connections,
  profiles,
  onCreated,
  onUpdated,
}: ModelProfileManagerProps) {
  const [connectionId, setConnectionId] = useState('')
  const [discovered, setDiscovered] = useState<readonly DiscoveredModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(emptyCapabilities)
  const [temperature, setTemperature] = useState('')
  const [maxOutputTokens, setMaxOutputTokens] = useState('')
  const [loadingDiscovery, setLoadingDiscovery] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const discoveryController = useRef<AbortController | null>(null)

  useEffect(() => () => discoveryController.current?.abort(), [])

  async function handleDiscovery() {
    if (!connectionId) return
    discoveryController.current?.abort()
    const controller = new AbortController()
    discoveryController.current = controller
    setLoadingDiscovery(true)
    setError(null)
    try {
      const models = await discoverModels(apiBase, connectionId, controller.signal)
      setDiscovered(models)
      if (models.length === 0) setSelectedModelId('')
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'Models could not be discovered.')
    } finally {
      if (discoveryController.current === controller) setLoadingDiscovery(false)
    }
  }

  function selectModel(modelId: string) {
    setSelectedModelId(modelId)
    const model = discovered.find((item) => item.modelId === modelId)
    setDisplayName(model?.displayName ?? '')
    setCapabilities(model?.capabilities ?? emptyCapabilities)
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!connectionId || !selectedModelId) return
    setSaving(true)
    setError(null)
    try {
      const profile = await createModelProfile(apiBase, {
        providerConnectionId: connectionId,
        modelId: selectedModelId,
        displayName: displayName.trim(),
        capabilities,
        approved: true,
        enabled: true,
        defaultSettings: {
          ...(temperature ? { temperature: Number(temperature) } : {}),
          ...(maxOutputTokens ? { maxOutputTokens: Number(maxOutputTokens) } : {}),
        },
      })
      onCreated(profile)
      setSelectedModelId('')
      setDisplayName('')
      setCapabilities(emptyCapabilities)
      setTemperature('')
      setMaxOutputTokens('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Model profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleProfile(profile: ModelProfile, field: 'approved' | 'enabled') {
    setUpdatingId(profile.id)
    setError(null)
    try {
      onUpdated(await updateModelProfile(apiBase, profile.id, { [field]: !profile[field] }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Model profile could not be updated.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section
      aria-labelledby="models-heading"
      className="border border-white/15 bg-white/[0.04] p-5 md:p-6"
    >
      <div className="mb-6 border-b border-white/15 pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-400">
          03 / Models
        </p>
        <h2 id="models-heading" className="mt-2 text-xl font-semibold text-stone-50">
          Discovery and approval
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form
          onSubmit={handleCreate}
          className="space-y-5 border-b border-white/15 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6"
        >
          <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
            Provider connection
            <select
              required
              value={connectionId}
              onChange={(event) => {
                setConnectionId(event.target.value)
                setDiscovered([])
                selectModel('')
              }}
              className="border border-white/20 bg-[#151515] px-3 py-2.5 text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
            >
              <option value="">Select a connection</option>
              {connections
                .filter((connection) => connection.enabled)
                .map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!connectionId || loadingDiscovery}
            onClick={() => void handleDiscovery()}
            className="border border-white/25 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-100 hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
          >
            {loadingDiscovery ? 'Discovering…' : 'Discover models'}
          </button>

          <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
            Discovered model
            <select
              required
              value={selectedModelId}
              onChange={(event) => selectModel(event.target.value)}
              className="border border-white/20 bg-[#151515] px-3 py-2.5 text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
            >
              <option value="">
                {discovered.length ? 'Select a model' : 'Run discovery first'}
              </option>
              {discovered.map((model) => (
                <option key={model.modelId} value={model.modelId}>
                  {model.displayName} — {model.modelId}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
            Display name
            <input
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="border border-white/20 bg-[#151515] px-3 py-2.5 text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
            />
          </label>
          <fieldset>
            <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-stone-300">
              Capabilities
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {capabilityOptions.map((option) => (
                <label key={option.key} className="flex items-center gap-2 text-sm text-stone-300">
                  <input
                    type="checkbox"
                    checked={capabilities[option.key]}
                    onChange={(event) =>
                      setCapabilities((current) => ({
                        ...current,
                        [option.key]: event.target.checked,
                      }))
                    }
                    className="accent-[#b38b6d]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
                className="border border-white/20 bg-[#151515] px-3 py-2.5 font-mono text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
              />
            </label>
            <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
              Max output
              <input
                type="number"
                min="1"
                step="1"
                value={maxOutputTokens}
                onChange={(event) => setMaxOutputTokens(event.target.value)}
                className="border border-white/20 bg-[#151515] px-3 py-2.5 font-mono text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !selectedModelId}
            className="border border-[#f5f1e8] bg-[#f5f1e8] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#111111] disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? 'Approving…' : 'Approve profile'}
          </button>
        </form>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-300">
            Configured profiles
          </h3>
          {profiles.length === 0 ? (
            <p className="mt-4 text-sm leading-relaxed text-stone-400">No profiles approved yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
              {profiles.map((profile) => (
                <li
                  key={profile.id}
                  className="grid gap-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-medium text-stone-100">{profile.displayName}</p>
                    <p className="mt-1 font-mono text-xs text-stone-500">{profile.modelId}</p>
                    <p className="mt-2 text-xs text-stone-400">
                      {capabilityOptions
                        .filter(({ key }) => profile.capabilities[key])
                        .map(({ label }) => label)
                        .join(' · ') || 'No capabilities declared'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={updatingId === profile.id}
                      onClick={() => void toggleProfile(profile, 'approved')}
                      className="border border-white/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-200 hover:bg-white/10 disabled:opacity-50"
                    >
                      {profile.approved ? 'Revoke' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === profile.id}
                      onClick={() => void toggleProfile(profile, 'enabled')}
                      className="border border-white/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-200 hover:bg-white/10 disabled:opacity-50"
                    >
                      {profile.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-5 border-l-2 border-red-400 pl-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </section>
  )
}
