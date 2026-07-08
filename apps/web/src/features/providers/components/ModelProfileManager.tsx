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
import { useToast } from '../../../components/toast/toast-provider'

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
  const toast = useToast()
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
  const discoveryController = useRef<AbortController | null>(null)

  useEffect(() => () => discoveryController.current?.abort(), [])

  function resetDiscovery() {
    discoveryController.current?.abort()
    discoveryController.current = null
    setDiscovered([])
    setSelectedModelId('')
    setDisplayName('')
    setCapabilities(emptyCapabilities)
    setLoadingDiscovery(false)
  }

  async function handleDiscovery() {
    if (!connectionId) return
    discoveryController.current?.abort()
    const controller = new AbortController()
    discoveryController.current = controller
    setLoadingDiscovery(true)
    try {
      const models = await discoverModels(apiBase, connectionId, controller.signal)
      setDiscovered(models)
      if (models.length === 0) setSelectedModelId('')
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      toast.error(caught instanceof Error ? caught.message : 'Models could not be discovered.')
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
      toast.success(`Profile "${profile.displayName}" approved.`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Model profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleProfile(profile: ModelProfile, field: 'approved' | 'enabled') {
    setUpdatingId(profile.id)
    try {
      const updated = await updateModelProfile(apiBase, profile.id, { [field]: !profile[field] })
      onUpdated(updated)
      toast.success(
        `${field === 'approved' ? 'Approval' : 'Availability'} for "${updated.displayName}" ${updated[field] ? 'enabled' : 'disabled'}.`,
      )
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Model profile could not be updated.')
    } finally {
      setUpdatingId(null)
    }
  }

  const inputClass =
    'border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5 text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]'
  const monoInputClass = inputClass.replace('text-sm ', 'font-mono text-sm ')
  const labelClass = 'grid gap-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]'

  return (
    <section
      aria-labelledby="models-heading"
      className="border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-5 md:p-6"
    >
      <div className="mb-6 border-b border-[var(--color-muted)]/40 pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          03 / Models
        </p>
        <h2 id="models-heading" className="mt-2 text-xl font-semibold text-[var(--color-primary)]">
          Discovery and approval
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form
          onSubmit={handleCreate}
          className="space-y-5 border-b border-[var(--color-muted)]/40 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6"
        >
          <label className={labelClass}>
            Provider connection
            <select
              required
              value={connectionId}
              onChange={(event) => {
                setConnectionId(event.target.value)
                resetDiscovery()
              }}
              className={inputClass}
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
            className="border border-[var(--color-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)] transition-colors hover:bg-[var(--color-beige)] disabled:cursor-wait disabled:opacity-50"
          >
            {loadingDiscovery ? 'Discovering…' : 'Discover models'}
          </button>

          <label className={labelClass}>
            Discovered model
            <select
              required
              value={selectedModelId}
              onChange={(event) => selectModel(event.target.value)}
              className={inputClass}
            >
              <option value="">{discovered.length ? 'Select a model' : 'Run discovery first'}</option>
              {discovered.map((model) => (
                <option key={model.modelId} value={model.modelId}>
                  {model.displayName} — {model.modelId}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Display name
            <input
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className={inputClass}
            />
          </label>
          <fieldset>
            <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
              Capabilities
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {capabilityOptions.map((option) => (
                <label key={option.key} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={capabilities[option.key]}
                    onChange={(event) =>
                      setCapabilities((current) => ({
                        ...current,
                        [option.key]: event.target.checked,
                      }))
                    }
                    className="accent-[var(--color-taupe)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-4">
            <label className={labelClass}>
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
                className={monoInputClass}
              />
            </label>
            <label className={labelClass}>
              Max output
              <input
                type="number"
                min="1"
                step="1"
                value={maxOutputTokens}
                onChange={(event) => setMaxOutputTokens(event.target.value)}
                className={monoInputClass}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !selectedModelId}
            className="border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? 'Approving…' : 'Approve profile'}
          </button>
        </form>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Configured profiles
          </h3>
          {profiles.length === 0 ? (
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">No profiles approved yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--color-muted)]/30 border-y border-[var(--color-muted)]/30">
              {profiles.map((profile) => (
                <li
                  key={profile.id}
                  className="grid gap-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{profile.displayName}</p>
                    <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{profile.modelId}</p>
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
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
                      className="border border-[var(--color-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)] transition-colors hover:bg-[var(--color-beige)] disabled:opacity-50"
                    >
                      {profile.approved ? 'Revoke' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === profile.id}
                      onClick={() => void toggleProfile(profile, 'enabled')}
                      className="border border-[var(--color-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)] transition-colors hover:bg-[var(--color-beige)] disabled:opacity-50"
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
    </section>
  )
}
