'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '../../../components/toast/toast-provider'
import { listModelProfiles, type ModelProfile } from '../../providers/provider-api'
import { createStoredAgent, updateStoredAgent, type StoredAgent } from '../builder-api'
import { publicConfig } from '../../../lib/config'

interface AgentFormProps {
  readonly initialAgent?: StoredAgent
}

const AVAILABLE_TOOLS = [
  { id: 'browser.navigate', name: 'browser.navigate', desc: 'Navigate to a URL' },
  { id: 'browser.snapshot', name: 'browser.snapshot', desc: 'Read page ARIA snapshot' },
  { id: 'browser.screenshot', name: 'browser.screenshot', desc: 'Capture page screenshot' },
  { id: 'browser.click', name: 'browser.click', desc: 'Click selectors (Requires approval)' },
  { id: 'browser.type', name: 'browser.type', desc: 'Type text into selector (Requires approval)' },
]

export function AgentForm({ initialAgent }: AgentFormProps) {
  const router = useRouter()
  const toast = useToast()
  const apiBase = publicConfig.agentServerUrl

  const [id, setId] = useState(initialAgent?.id ?? '')
  const [name, setName] = useState(initialAgent?.name ?? '')
  const [description, setDescription] = useState(initialAgent?.description ?? '')
  const [instructions, setInstructions] = useState(initialAgent?.instructions ?? '')
  const [category, setCategory] = useState<StoredAgent['category']>(initialAgent?.category ?? 'custom')
  const [selectedTools, setSelectedTools] = useState<string[]>(
    initialAgent?.toolIds ? [...initialAgent.toolIds] : ['browser.navigate', 'browser.snapshot', 'browser.screenshot']
  )
  const [primaryModelProfileId, setPrimaryModelProfileId] = useState<string>(
    initialAgent?.primaryModelProfileId ?? ''
  )
  const [memoryEnabled, setMemoryEnabled] = useState(initialAgent?.memoryEnabled ?? true)
  const [memoryMode, setMemoryMode] = useState<StoredAgent['memoryMode']>(initialAgent?.memoryMode ?? 'thread')
  const [visibility, setVisibility] = useState<StoredAgent['visibility']>(initialAgent?.visibility ?? 'public')

  const [profiles, setProfiles] = useState<readonly ModelProfile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [saving, setSaving] = useState(false)

  const isEdit = Boolean(initialAgent)

  useEffect(() => {
    let cancelled = false
    listModelProfiles(apiBase)
      .then((data) => {
        if (!cancelled) {
          const approved = data.filter((p) => p.approved && p.enabled)
          setProfiles(approved)
          if (!initialAgent && approved.length > 0) {
            const first = approved[0]
            if (first) {
              setPrimaryModelProfileId(first.id)
            }
          }
        }
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Could not load model profiles.')
      })
      .finally(() => {
        if (!cancelled) setLoadingProfiles(false)
      })

    return () => {
      cancelled = true
    }
  }, [apiBase, initialAgent, toast])

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!id.trim()) {
      toast.error('Agent ID is required.')
      return
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      toast.error('Invalid ID format. Use lowercase kebab-case (e.g. my-custom-agent).')
      return
    }

    if (!name.trim()) {
      toast.error('Agent Name is required.')
      return
    }

    setSaving(true)
    try {
      const payload: Partial<StoredAgent> = {
        id,
        name,
        description,
        instructions,
        category,
        capabilities: category === 'qa' ? ['browser-testing', 'evidence-collection'] : ['general-tasking'],
        toolIds: selectedTools,
        primaryModelProfileId: primaryModelProfileId || null,
        fallbackModelProfileIds: [],
        memoryEnabled,
        memoryMode,
        visibility,
      }

      if (isEdit) {
        await updateStoredAgent(apiBase, id, payload)
        toast.info('Agent draft updated successfully.')
      } else {
        await createStoredAgent(apiBase, payload)
        toast.info('Agent draft created successfully.')
      }
      router.push('/builder')
    } catch (caught: unknown) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to save agent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[800px]">
      <div className="mb-8">
        <Link
          href="/builder"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-taupe)] hover:text-[var(--color-primary)]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Dashboard
        </Link>
      </div>

      <header className="mb-10 border-b border-[var(--color-muted)]/40 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-primary)]">
          {isEdit ? `Edit Agent: ${id}` : 'Create Custom Agent'}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {isEdit
            ? 'Modify agent instructions, bound models, and available tools.'
            : 'Configure a new database-backed custom agent instance.'}
        </p>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-8">
        {/* Basic Information */}
        <section className="grid gap-6 border border-[var(--color-muted)]/30 bg-[var(--color-surface)] p-6">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--color-taupe)]">
            Basic Details
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-id" className="text-xs font-semibold text-[var(--color-primary)]">
                Agent ID *
              </label>
              <input
                id="agent-id"
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                disabled={isEdit}
                placeholder="my-custom-agent"
                className="border border-[var(--color-muted)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-muted)]/10 disabled:cursor-not-allowed"
                required
              />
              <span className="text-[10px] text-[var(--color-muted)]">
                Lowercase kebab-case only. Immutable once created.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-name" className="text-xs font-semibold text-[var(--color-primary)]">
                Display Name *
              </label>
              <input
                id="agent-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Creative Writer"
                className="border border-[var(--color-muted)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-desc" className="text-xs font-semibold text-[var(--color-primary)]">
              Description
            </label>
            <input
              id="agent-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explains complex concepts in simple terms."
              className="border border-[var(--color-muted)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-cat" className="text-xs font-semibold text-[var(--color-primary)]">
                Category
              </label>
              <select
                id="agent-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as StoredAgent['category'])}
                className="border border-[var(--color-muted)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              >
                <option value="custom">Custom</option>
                <option value="qa">Quality Assurance (QA)</option>
                <option value="research">Research</option>
                <option value="productivity">Productivity</option>
                <option value="social">Social Media</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-vis" className="text-xs font-semibold text-[var(--color-primary)]">
                Visibility
              </label>
              <select
                id="agent-vis"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as StoredAgent['visibility'])}
                className="border border-[var(--color-muted)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>
        </section>

        {/* System Instructions / Prompt */}
        <section className="grid gap-4 border border-[var(--color-muted)]/30 bg-[var(--color-surface)] p-6">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--color-taupe)]">
            Instructions
          </h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-prompt" className="text-xs font-semibold text-[var(--color-primary)]">
              System Prompt *
            </label>
            <textarea
              id="agent-prompt"
              rows={8}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="You are an assistant that..."
              className="border border-[var(--color-muted)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] font-mono resize-y"
              required
            />
          </div>
        </section>

        {/* LLM & Model Binding */}
        <section className="grid gap-4 border border-[var(--color-muted)]/30 bg-[var(--color-surface)] p-6">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--color-taupe)]">
            Model Routing
          </h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-model" className="text-xs font-semibold text-[var(--color-primary)]">
              Primary Model Profile
            </label>
            {loadingProfiles ? (
              <div className="flex items-center gap-2 py-2 text-xs text-[var(--color-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading model profiles…
              </div>
            ) : profiles.length === 0 ? (
              <p className="text-xs text-[var(--color-danger)] font-medium">
                No approved model profiles available. Connect providers and approve profiles in settings first.
              </p>
            ) : (
              <select
                id="agent-model"
                value={primaryModelProfileId}
                onChange={(e) => setPrimaryModelProfileId(e.target.value)}
                className="border border-[var(--color-muted)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">No model profile bound (Draft only)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.modelId})
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {/* Tools Selection */}
        <section className="grid gap-4 border border-[var(--color-muted)]/30 bg-[var(--color-surface)] p-6">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--color-taupe)]">
            Capabilities & Tools
          </h2>
          <div className="grid gap-3">
            {AVAILABLE_TOOLS.map((tool) => {
              const isChecked = selectedTools.includes(tool.id)
              return (
                <label
                  key={tool.id}
                  className={`flex items-start gap-3 border p-3 cursor-pointer transition-colors duration-150 ${
                    isChecked
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                      : 'border-[var(--color-muted)]/30 bg-[var(--color-surface)] hover:bg-[var(--color-beige)]/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleTool(tool.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-semibold text-[var(--color-primary)] font-mono block">
                      {tool.name}
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)] block mt-0.5">
                      {tool.desc}
                    </span>
                  </div>
                </label>
              )
            })}
          </div>
        </section>

        {/* Memory Settings */}
        <section className="grid gap-4 border border-[var(--color-muted)]/30 bg-[var(--color-surface)] p-6">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--color-taupe)]">
            Memory Configuration
          </h2>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={memoryEnabled}
              onChange={(e) => setMemoryEnabled(e.target.checked)}
            />
            <span className="text-xs font-semibold text-[var(--color-primary)]">
              Enable Memory Persistence
            </span>
          </label>

          {memoryEnabled ? (
            <div className="flex flex-col gap-1.5 mt-2">
              <label htmlFor="agent-mem-mode" className="text-xs font-semibold text-[var(--color-primary)]">
                Memory Isolation Mode
              </label>
              <select
                id="agent-mem-mode"
                value={memoryMode}
                onChange={(e) => setMemoryMode(e.target.value as StoredAgent['memoryMode'])}
                className="border border-[var(--color-muted)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              >
                <option value="thread">Thread (Isolated by conversation)</option>
                <option value="resource-and-thread">Resource and Thread (Shared profile-level context)</option>
              </select>
            </div>
          ) : null}
        </section>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-4 mt-4">
          <Link
            href="/builder"
            className="border border-[var(--color-muted)]/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text)] hover:bg-[var(--color-muted)]/10"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="border border-[var(--color-primary)] bg-[var(--color-primary)] px-6 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] hover:-translate-y-px transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving Draft…' : 'Save Draft'}
          </button>
        </div>
      </form>
    </div>
  )
}
