'use client'

import { useState, type FormEvent } from 'react'
import { createConnection, type ProviderConnection, type ProviderType } from '../provider-api'
import { useToast } from '../../../components/toast/toast-provider'

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
  const toast = useToast()
  const [name, setName] = useState('')
  const [type, setType] = useState<ProviderType>('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
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
      toast.success(`Connection "${connection.name}" saved.`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Connection could not be created.')
    } finally {
      setApiKey('')
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-5 md:p-6"
    >
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-[var(--color-muted)]/40 pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            01 / Add
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-primary)]">
            New connection
          </h2>
        </div>
        <span className="text-xs text-[var(--color-muted)]">
          Credentials are encrypted server-side
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
          Connection name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5 text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            placeholder="Production OpenAI"
          />
        </label>
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
          Provider
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ProviderType)}
            className="border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5 text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
          >
            {providerTypes.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
          Base URL {type === 'openai-compatible' ? '(required)' : '(optional)'}
          <input
            type="url"
            required={type === 'openai-compatible'}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className="border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5 font-mono text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            placeholder="https://models.example.com/v1"
          />
        </label>
        <label className="grid gap-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
          API key
          <input
            type="password"
            required
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5 font-mono text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            placeholder="Stored only after encryption"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className={`mt-6 border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px disabled:opacity-60 ${
          submitting ? 'cursor-wait' : 'disabled:cursor-not-allowed'
        }`}
      >
        {submitting ? 'Saving…' : 'Save connection'}
      </button>
    </form>
  )
}
