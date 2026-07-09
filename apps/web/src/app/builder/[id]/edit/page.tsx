'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useToast } from '../../../../components/toast/toast-provider'
import { AgentForm } from '../../../../features/builder/components/AgentForm'
import { listStoredAgents, type StoredAgent } from '../../../../features/builder/builder-api'
import { publicConfig } from '../../../../lib/config'

export default function EditAgentPage() {
  const params = useParams()
  const id = params.id as string
  const toast = useToast()
  const apiBase = publicConfig.agentServerUrl

  const [agent, setAgent] = useState<StoredAgent | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listStoredAgents(apiBase)
      .then((data) => {
        if (!cancelled) {
          // Find draft first, fallback to published or archived
          const draft = data.find((a) => a.id === id && a.status === 'draft')
          const published = data.find((a) => a.id === id && a.status === 'published')
          const archived = data.find((a) => a.id === id && a.status === 'archived')
          const found = draft ?? published ?? archived
          if (found) {
            setAgent(found)
          } else {
            toast.error('Agent not found.')
          }
        }
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Could not load agent.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [apiBase, id, toast])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-sm text-[var(--color-muted)] font-mono">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-taupe)]" />
        LOADING AGENT DATA…
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="text-center py-16">
        <p className="text-sm font-semibold text-[var(--color-primary)]">Agent not found</p>
      </div>
    )
  }

  return <AgentForm initialAgent={agent} />
}
