'use client'

export interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export function MessageList({ messages }: { readonly messages: readonly ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message, index) => (
        <div
          key={index}
          className={
            message.role === 'user'
              ? 'self-end max-w-[80%] border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-text-inverted)]'
              : 'self-start max-w-[80%] border border-[var(--color-muted)]/40 bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)]'
          }
        >
          {message.content}
        </div>
      ))}
    </div>
  )
}
