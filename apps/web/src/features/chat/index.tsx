'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getConversation,
  streamMessage,
  submitApproval,
  type ChatEvent,
  type ConversationDto,
} from './chat-api'
import { publicConfig } from '../../lib/config'
import { useToast } from '../../components/toast/toast-provider'
import { MessageList, type ChatMessage } from './components/MessageList'
import { Composer } from './components/Composer'
import { ToolTimeline, type ToolTimelineItem } from './components/ToolTimeline'
import { ApprovalBar } from './components/ApprovalBar'

export function Chat({ conversationId }: { readonly conversationId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [conversation, setConversation] = useState<ConversationDto | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [tools, setTools] = useState<ToolTimelineItem[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [approval, setApproval] = useState<{ toolCallId: string; toolName: string; args: unknown } | null>(null)
  const [approving, setApproving] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    getConversation(publicConfig.agentServerUrl, conversationId)
      .then((detail) => {
        setConversation(detail.conversation)
        setMessages(detail.messages.map((message) => ({ role: message.role as 'user' | 'assistant', content: String(message.content) })))
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Conversation not found.')
        router.push('/agents')
      })

    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort()
      }
    }
  }, [conversationId, router, toast])

  async function send() {
    if (!draft.trim() || sending) return
    const text = draft
    setDraft('')
    setSending(true)

    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    const controller = new AbortController()
    controllerRef.current = controller

    setMessages((current) => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    try {
      for await (const event of streamMessage(publicConfig.agentServerUrl, conversationId, { text }, controller.signal)) {
        applyEvent(event)
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      toast.error(caught instanceof Error ? caught.message : 'Stream failed.')
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
      setSending(false)
    }
  }

  function applyEvent(event: ChatEvent) {
    switch (event.type) {
      case 'text':
        setMessages((current) => {
          const next = [...current]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + event.text }
          }
          return next
        })
        break
      case 'tool_start':
        setTools((current) => [...current, { toolCallId: event.toolCallId, toolName: event.toolName, status: 'requested', args: event.args }])
        break
      case 'tool_result':
        setTools((current) =>
          current.map((item) =>
            item.toolCallId === event.toolCallId ? { ...item, status: 'success', result: event.result } : item,
          ),
        )
        break
      case 'tool_approval_required':
        setApproval({ toolCallId: event.toolCallId, toolName: event.toolName, args: event.args })
        break
      case 'error':
        toast.error(event.message)
        break
      default:
        break
    }
  }

  async function decide(decision: 'approve' | 'deny') {
    if (!approval) return
    setApproving(true)
    try {
      for await (const event of submitApproval(publicConfig.agentServerUrl, conversationId, approval.toolCallId, decision)) {
        applyEvent(event)
      }
      setApproval(null)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Approval failed.')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="flex flex-col gap-4">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            {conversation?.agentId ?? '—'}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[var(--color-primary)]">
            {conversation?.title ?? 'Chat'}
          </h1>
        </header>
        <MessageList messages={messages} />
        {approval ? (
          <ApprovalBar toolName={approval.toolName} args={approval.args} pending={approving} onApprove={() => void decide('approve')} onDeny={() => void decide('deny')} />
        ) : null}
        <Composer value={draft} onChange={setDraft} onSubmit={() => void send()} disabled={sending || Boolean(approval)} />
      </section>
      <ToolTimeline items={tools} />
    </div>
  )
}
