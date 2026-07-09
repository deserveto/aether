import { AsyncLocalStorage } from 'node:async_hooks'

const conversationIdStorage = new AsyncLocalStorage<string>()

export function runWithConversationId<T>(id: string, fn: () => T): T {
  return conversationIdStorage.run(id, fn)
}

export function bindConversationStream<T>(id: string, stream: AsyncIterable<T>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      const iterator = stream[Symbol.asyncIterator]()
      for (;;) {
        const result = await runWithConversationId(id, () => iterator.next())
        if (result.done) return
        yield result.value
      }
    },
  }
}

export function getCurrentConversationId(): string {
  const currentId = conversationIdStorage.getStore()
  if (!currentId) throw new Error('No active conversation id set')
  return currentId
}
