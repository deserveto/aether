import { chromium } from 'playwright'
import type { BrowserContext, BrowserPage } from './types.js'

export interface BrowserSession {
  readonly context: BrowserContext
  getPage(): Promise<BrowserPage>
  close(): Promise<void>
}

export class BrowserSessionStore {
  private readonly sessions = new Map<string, BrowserSession>()

  async get(conversationId: string): Promise<BrowserSession> {
    const existing = this.sessions.get(conversationId)
    if (existing) return existing
    const context = await chromium.launchPersistentContext(
      `./.browser-sessions/${conversationId}`,
      { headless: true },
    )
    let page: BrowserPage | null = null
    const session: BrowserSession = {
      context,
      getPage: async () => {
        if (page) return page
        page = await context.newPage()
        return page
      },
      close: async () => {
        if (page) await page.close().catch(() => undefined)
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
