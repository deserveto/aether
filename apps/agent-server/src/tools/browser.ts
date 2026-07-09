import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  BrowserSessionStore,
  clickElement,
  navigatePage,
  screenshotPage,
  snapshotPage,
  typeIntoElement,
} from '@aether/tools'
import { getCurrentConversationId } from '../agents/conversation-context.js'

export function buildBrowserTools(sessionStore: BrowserSessionStore) {
  return {
    'browser.navigate': createTool({
      id: 'browser.navigate',
      description: 'Navigate the browser to a URL.',
      inputSchema: z.object({ url: z.string().url() }),
      outputSchema: z.object({ url: z.string() }),
      execute: async (data) => {
        const session = await sessionStore.get(getCurrentConversationId())
        return navigatePage(session, data.url)
      },
    }),
    'browser.snapshot': createTool({
      id: 'browser.snapshot',
      description: 'Return the ARIA snapshot of the current page.',
      inputSchema: z.object({}),
      outputSchema: z.object({ tree: z.string() }),
      execute: async () => {
        const session = await sessionStore.get(getCurrentConversationId())
        return snapshotPage(session)
      },
    }),
    'browser.screenshot': createTool({
      id: 'browser.screenshot',
      description: 'Capture a screenshot of the current page.',
      inputSchema: z.object({}),
      outputSchema: z.object({ imageBase64: z.string() }),
      execute: async () => {
        const session = await sessionStore.get(getCurrentConversationId())
        return screenshotPage(session)
      },
    }),
    'browser.click': createTool({
      id: 'browser.click',
      description: 'Click an element by CSS selector.',
      inputSchema: z.object({ selector: z.string().min(1) }),
      outputSchema: z.object({ selector: z.string() }),
      requireApproval: true,
      execute: async (data) => {
        const session = await sessionStore.get(getCurrentConversationId())
        return clickElement(session, data.selector)
      },
    }),
    'browser.type': createTool({
      id: 'browser.type',
      description: 'Type text into an element identified by CSS selector.',
      inputSchema: z.object({ selector: z.string().min(1), text: z.string() }),
      outputSchema: z.object({ selector: z.string(), text: z.string() }),
      requireApproval: true,
      execute: async (data) => {
        const session = await sessionStore.get(getCurrentConversationId())
        return typeIntoElement(session, data.selector, data.text)
      },
    }),
  }
}
