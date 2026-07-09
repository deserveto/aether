import type { ToolRiskLevel } from './types.js'

export { BrowserSessionStore } from './session-store.js'
export type { BrowserSession } from './session-store.js'
export type { BrowserContext, BrowserPage, ToolRiskLevel } from './types.js'
export {
  navigatePage,
  snapshotPage,
  clickElement,
  typeIntoElement,
  screenshotPage,
} from './actions.js'

export * from './web-research/index.js'

export const BROWSER_TOOL_RISK: Record<string, ToolRiskLevel> = {
  'browser.navigate': 'interactive',
  'browser.snapshot': 'read',
  'browser.screenshot': 'read',
  'browser.click': 'interactive',
  'browser.type': 'interactive',
}

export const WEB_RESEARCH_TOOL_RISK: Record<string, ToolRiskLevel> = {
  web_search: 'read',
  web_fetch: 'read',
}
