import type { BrowserSession } from './session-store.js'
import type { BrowserPage } from './types.js'

async function pageOf(session: BrowserSession): Promise<BrowserPage> {
  return session.context.newPage()
}

export async function navigatePage(session: BrowserSession, url: string): Promise<{ url: string }> {
  const page = await pageOf(session)
  await page.goto(url)
  return { url }
}

export async function snapshotPage(session: BrowserSession): Promise<{ tree: string }> {
  const page = await pageOf(session)
  return { tree: await page.locator('body').ariaSnapshot() }
}

export async function clickElement(session: BrowserSession, selector: string): Promise<{ selector: string }> {
  const page = await pageOf(session)
  await page.locator(selector).click()
  return { selector }
}

export async function typeIntoElement(
  session: BrowserSession,
  selector: string,
  text: string,
): Promise<{ selector: string; text: string }> {
  const page = await pageOf(session)
  await page.locator(selector).fill(text)
  return { selector, text }
}

export async function screenshotPage(session: BrowserSession): Promise<{ imageBase64: string }> {
  const page = await pageOf(session)
  const buffer = await page.screenshot()
  return { imageBase64: buffer.toString('base64') }
}
