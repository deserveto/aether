'use client'

import { useState, type FormEvent } from 'react'
import { createConnection, type ProviderConnection, type ProviderType } from '../provider-api'

const providerTypes: readonly { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
]

interface ConnectionFormProps {
  readonly apiBase: string
  readonly onCreated: (connection: ProviderConnection) => void
}

export function ConnectionForm({ apiBase, onCreated }: ConnectionFormProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ProviderType>('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const connection = await createConnection(apiBase, {
        name: name.trim(),
        type,
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        apiKey,
        enabled: true,
      })
      setName('')
      setBaseUrl('')
      onCreated(connection)
      setSuccessMessage(`Connection "${connection.name}" saved.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Connection could not be created.')
    } finally {
      setApiKey('')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-white/15 bg-white/[0.04] p-5 md:p-6">
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-white/15 pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-400">
            01 / Add
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-50">
            New connection
          </h2>
        </div>
        <span className="text-xs text-stone-400">Credentials are encrypted server-side</span>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
          Connection name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="border border-white/20 bg-[#151515] px-3 py-2.5 text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]"
            placeholder="Production OpenAI"
          />
        </label>
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
          Provider
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ProviderType)}
            className="border border-white/20 bg-[#151515] px-3 py-2.5 text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
          >
            {providerTypes.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
          Base URL {type === 'openai-compatible' ? '(required)' : '(optional)'}
          <input
            type="url"
            required={type === 'openai-compatible'}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className="border border-white/20 bg-[#151515] px-3 py-2.5 font-mono text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
            placeholder="https://models.example.com/v1"
          />
        </label>
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-stone-300">
          API key
          <input
            type="password"
            required
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="border border-white/20 bg-[#151515] px-3 py-2.5 font-mono text-sm normal-case tracking-normal text-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-[#b38b6d]"
            placeholder="Stored only after encryption"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-4 border-l-2 border-red-400 pl-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mt-4 border-l-2 border-emerald-400 pl-3 text-sm text-emerald-200" role="status">
          {successMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="mt-6 border border-[#f5f1e8] bg-[#f5f1e8] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#111111] transition-transform duration-200 hover:-translate-y-px disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Save connection'}
      </button>
    </form>
  )
}
