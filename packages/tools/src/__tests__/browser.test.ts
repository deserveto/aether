import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPage = {
  goto: vi.fn(async () => undefined),
  locator: vi.fn(() => ({
    click: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    ariaSnapshot: vi.fn(async () => 'page:\n  -heading "Home"'),
  })),
  screenshot: vi.fn(async () => Buffer.from('png')),
  close: vi.fn(async () => undefined),
}
const mockContext = {
  newPage: vi.fn(async () => mockPage),
  close: vi.fn(async () => undefined),
}
vi.mock('playwright', () => ({
  chromium: { launchPersistentContext: vi.fn(async () => mockContext) },
}))

import { BROWSER_TOOL_RISK, BrowserSessionStore } from '../index.js'

describe('browser engine', () => {
  beforeEach(() => {
    mockContext.newPage.mockClear()
    mockContext.close.mockClear()
  })

  it('marks click and type as the only approval-requiring tools', () => {
    expect(BROWSER_TOOL_RISK['browser.click']).toBe('interactive')
    expect(BROWSER_TOOL_RISK['browser.type']).toBe('interactive')
    expect(BROWSER_TOOL_RISK['browser.navigate']).toBe('interactive')
    expect(BROWSER_TOOL_RISK['browser.snapshot']).toBe('read')
    expect(BROWSER_TOOL_RISK['browser.screenshot']).toBe('read')
  })

  it('reuses one isolated context per conversation and closes it', async () => {
    const store = new BrowserSessionStore()
    const a = await store.get('conv-1')
    const b = await store.get('conv-1')
    const c = await store.get('conv-2')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    await store.close('conv-1')
    expect(mockContext.close).toHaveBeenCalledTimes(1)
  })
})
