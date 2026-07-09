'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Lock, AlertCircle } from 'lucide-react'
import { listAgents, createConversation, type CatalogAgentDto } from '../chat/chat-api'
import { publicConfig } from '../../lib/config'
import { useToast } from '../../components/toast/toast-provider'

export function AgentCatalog() {
  const router = useRouter()
  const toast = useToast()
  const [agents, setAgents] = useState<readonly CatalogAgentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listAgents(publicConfig.agentServerUrl)
      .then((result) => {
        if (!cancelled) setAgents(result)
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Could not load agents.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  async function start(agent: CatalogAgentDto) {
    if (!agent.configured) {
      toast.info(`${agent.manifest.name} needs a bound model. Add one in Provider settings.`)
      return
    }
    setStarting(agent.manifest.id)
    try {
      const conversation = await createConversation(
        publicConfig.agentServerUrl,
        agent.manifest.id,
        `Chat with ${agent.manifest.name}`,
      )
      router.push(`/chat/${conversation.id}`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not start conversation.')
    } finally {
      setStarting(null)
    }
  }

  if (loading) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Loading agents…
      </p>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <article
          key={agent.manifest.id}
          className="flex flex-col justify-between border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-5 md:p-6"
        >
          <div>
            <div className="flex items-center justify-between">
              <Bot className="h-5 w-5 text-[var(--color-taupe)]" aria-hidden />
              {agent.manifest.protected ? (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                  <Lock className="h-3 w-3" aria-hidden /> Built-in
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-[var(--color-primary)]">
              {agent.manifest.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{agent.manifest.description}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {agent.manifest.capabilities.map((capability) => (
                <li
                  key={capability}
                  className="border border-[var(--color-muted)]/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]"
                >
                  {capability}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void start(agent)}
              disabled={!agent.configured || starting === agent.manifest.id}
              className={`border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px disabled:opacity-50 ${
                starting === agent.manifest.id ? 'cursor-wait' : 'disabled:cursor-not-allowed'
              }`}
            >
              {starting === agent.manifest.id ? 'Starting…' : 'Start conversation'}
            </button>
            {!agent.configured ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-danger)]">
                <AlertCircle className="h-3 w-3" aria-hidden /> Not configured
              </span>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}
