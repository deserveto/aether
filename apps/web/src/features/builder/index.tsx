'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bot, Plus, Trash2, Archive, Play, Edit, Check } from 'lucide-react'
import { useToast } from '../../components/toast/toast-provider'
import { publicConfig } from '../../lib/config'
import { createConversation } from '../chat/chat-api'
import {
  listStoredAgents,
  publishStoredAgent,
  archiveStoredAgent,
  deleteStoredAgent,
  type StoredAgent,
} from './builder-api'

export function AgentBuilderDashboard() {
  const router = useRouter()
  const toast = useToast()
  const apiBase = publicConfig.agentServerUrl

  const [agents, setAgents] = useState<readonly StoredAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null)

  const loadAgents = () => {
    setLoading(true)
    listStoredAgents(apiBase)
      .then((data) => {
        setAgents(data)
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Could not load custom agents.')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    loadAgents()
  }, [])

  const handlePublish = async (id: string) => {
    setBusyAgentId(id)
    try {
      await publishStoredAgent(apiBase, id)
      toast.info('Agent published successfully. It is now active in the catalog.')
      loadAgents()
    } catch (caught: unknown) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to publish agent.')
    } finally {
      setBusyAgentId(null)
    }
  }

  const handleArchive = async (id: string) => {
    if (!confirm('Are you sure you want to archive this agent? Historical conversations will survive but new ones cannot be started.')) return
    setBusyAgentId(id)
    try {
      await archiveStoredAgent(apiBase, id)
      toast.info('Agent archived successfully.')
      loadAgents()
    } catch (caught: unknown) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to archive agent.')
    } finally {
      setBusyAgentId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this agent?')) return
    setBusyAgentId(id)
    try {
      await deleteStoredAgent(apiBase, id)
      toast.info('Agent deleted successfully.')
      loadAgents()
    } catch (caught: unknown) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to delete agent.')
    } finally {
      setBusyAgentId(null)
    }
  }

  const handleTestDraft = async (agent: StoredAgent) => {
    setBusyAgentId(agent.id)
    try {
      const conv = await createConversation(
        apiBase,
        agent.id,
        `Draft Test Session: ${agent.name}`,
        'draft'
      )
      toast.info(`Draft test session started for ${agent.name}`)
      router.push(`/chat/${conv.id}`)
    } catch (caught: unknown) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to initiate draft testing session.')
    } finally {
      setBusyAgentId(null)
    }
  }

  const getStatusBadge = (status: StoredAgent['status']) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center border border-[var(--color-taupe)]/60 bg-[var(--color-beige)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-taupe)]">
            Draft
          </span>
        )
      case 'published':
        return (
          <span className="inline-flex items-center border border-green-500/50 bg-green-50/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-green-700">
            Published
          </span>
        )
      case 'archived':
        return (
          <span className="inline-flex items-center border border-[var(--color-muted)]/50 bg-[var(--color-muted)]/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-muted)]">
            Archived
          </span>
        )
    }
  }

  return (
    <div className="grid gap-10">
      <header className="grid gap-6 border-b border-[var(--color-muted)]/40 pb-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-taupe)]">
            Control Plane / Customization
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-[-0.035em] text-[var(--color-primary)] md:text-5xl">
            Agent Builder
          </h1>
          <p className="mt-4 max-w-[68ch] text-sm leading-relaxed text-[var(--color-text)] md:text-base">
            Create, edit, test, and publish your own database-backed custom agents. Assign specific system instructions, tools, and bound model routing profiles.
          </p>
        </div>
        <div>
          <Link
            href="/builder/new"
            className="inline-flex items-center gap-2 border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] hover:-translate-y-px transition-transform duration-200"
          >
            <Plus className="h-4 w-4" /> Create Agent
          </Link>
        </div>
      </header>

      {loading ? (
        <div aria-label="Loading custom agents" className="grid gap-5" role="status">
          <div className="h-32 animate-pulse border border-[var(--color-muted)]/30 bg-[var(--color-beige)]/60" />
          <div className="h-32 animate-pulse border border-[var(--color-muted)]/30 bg-[var(--color-beige)]/60" />
        </div>
      ) : agents.length === 0 ? (
        <div className="border border-dashed border-[var(--color-muted)]/50 p-12 text-center">
          <Bot className="mx-auto h-10 w-10 text-[var(--color-taupe)]/60" />
          <h3 className="mt-4 text-sm font-semibold text-[var(--color-primary)]">No custom agents</h3>
          <p className="mt-2 text-xs text-[var(--color-muted)] max-w-sm mx-auto">
            You haven't built any custom database agents yet. Click "Create Agent" above to configure your first one.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const isBusy = busyAgentId === agent.id
            return (
              <article
                key={`${agent.id}-${agent.status}`}
                className="flex flex-col justify-between border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-6"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <Bot className="h-5 w-5 text-[var(--color-taupe)]" />
                    {getStatusBadge(agent.status)}
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-[var(--color-primary)]">
                    {agent.name}
                  </h2>
                  <span className="font-mono text-[9px] text-[var(--color-muted)] uppercase tracking-wider block mt-0.5">
                    ID: {agent.id}
                  </span>
                  <p className="mt-2 text-xs text-[var(--color-muted)] min-h-[3rem] line-clamp-3">
                    {agent.description || 'No description provided.'}
                  </p>

                  <div className="mt-4 border-t border-[var(--color-muted)]/20 pt-4">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--color-muted)] font-mono uppercase tracking-wider">
                        Model profile
                      </span>
                      <span className="font-semibold text-[var(--color-primary)] truncate max-w-[15ch]">
                        {agent.primaryModelProfileId || 'None bound'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] mt-1.5">
                      <span className="text-[var(--color-muted)] font-mono uppercase tracking-wider">
                        Tools count
                      </span>
                      <span className="font-mono font-semibold text-[var(--color-primary)]">
                        {agent.toolIds.length} active
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--color-muted)]/20 pt-4">
                  {/* Actions based on lifecycle status */}
                  {agent.status === 'draft' && (
                    <>
                      <Link
                        href={`/builder/${agent.id}/edit`}
                        className="inline-flex items-center gap-1 border border-[var(--color-muted)]/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text)] hover:bg-[var(--color-muted)]/10"
                      >
                        <Edit className="h-3 w-3" /> Edit
                      </Link>

                      <button
                        type="button"
                        onClick={() => void handleTestDraft(agent)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 border border-[var(--color-taupe)]/60 bg-[var(--color-beige)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-taupe)] hover:bg-[var(--color-taupe)]/10 disabled:opacity-50"
                      >
                        <Play className="h-3 w-3" /> Test
                      </button>

                      <button
                        type="button"
                        onClick={() => void handlePublish(agent.id)}
                        disabled={isBusy || !agent.primaryModelProfileId}
                        title={!agent.primaryModelProfileId ? 'Requires a model profile to publish' : ''}
                        className="inline-flex items-center gap-1 border border-green-600 bg-green-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        <Check className="h-3 w-3" /> Publish
                      </button>
                    </>
                  )}

                  {agent.status === 'published' && (
                    <>
                      <Link
                        href={`/builder/${agent.id}/edit`}
                        className="inline-flex items-center gap-1 border border-[var(--color-muted)]/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text)] hover:bg-[var(--color-muted)]/10"
                      >
                        <Edit className="h-3 w-3" /> Edit
                      </Link>

                      <button
                        type="button"
                        onClick={() => void handleArchive(agent.id)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 border border-orange-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                      >
                        <Archive className="h-3 w-3" /> Archive
                      </button>
                    </>
                  )}

                  {agent.status === 'archived' && (
                    <span className="text-[10px] text-[var(--color-muted)] italic py-1">
                      Archived (Immutable)
                    </span>
                  )}

                  <div className="ml-auto">
                    <button
                      type="button"
                      onClick={() => void handleDelete(agent.id)}
                      disabled={isBusy}
                      className="inline-flex items-center p-1.5 border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 disabled:opacity-50"
                      aria-label="Delete agent"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
