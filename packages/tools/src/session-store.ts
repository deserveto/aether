import { chromium } from 'playwright'
import type { BrowserContext } from './types.js'

export interface BrowserSession {
  readonly context: BrowserContext
  close(): Promise<void>
}

export class BrowserSessionStore {
  private readonly sessions = new Map<string, BrowserSession>()

  async get(conversationId: string): Promise<BrowserSession> {
    const existing = this.sessions.get(conversationId)
    if (existing) return existing
    const context = (await chromium.launchPersistentContext(
      `./.browser-sessions/${conversationId}`,
      { headless: true },
    )) as unknown as BrowserContext
    const session: BrowserSession = {
      context,
      close: async () => {
        await context.close().catch(() => undefined)
        this.sessions.delete(conversationId)
      },
    }
    this.sessions.set(conversationId, session)
    return session
  }

  async close(conversationId: string): Promise<void> {
    const session = this.sessions.get(conversationId)
    if (session) await session.close()
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)))
  }
}
