'use client'

import { use } from 'react'
import { Chat } from '../../../features/chat'

export default function ChatPage({
  params,
}: {
  readonly params: Promise<{ readonly conversationId: string }>
}) {
  const { conversationId } = use(params)
  return <Chat conversationId={conversationId} />
}
