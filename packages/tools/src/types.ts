export type ToolRiskLevel = 'read' | 'interactive' | 'consequential' | 'system'

export interface BrowserPage {
  goto(url: string): Promise<unknown>
  locator(selector: string): {
    click(): Promise<unknown>
    fill(text: string): Promise<unknown>
    ariaSnapshot(): Promise<string>
  }
  screenshot(): Promise<Buffer>
  close(): Promise<unknown>
}

export interface BrowserContext {
  newPage(): Promise<BrowserPage>
  close(): Promise<unknown>
}
