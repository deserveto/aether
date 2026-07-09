let currentId: string | null = null

export function setConversationId(id: string | null): void {
  currentId = id
}

export function getCurrentConversationId(): string {
  if (currentId === null) throw new Error('No active conversation id set')
  return currentId
}
