import { AppError, ErrorCode } from '@aether/shared'
import { validateUrl, isPrivateIp } from './ssrf-guard.js'

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024 // 2 MB
const DEFAULT_MAX_CHARS = 20_000
const ALLOWED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml']
const FETCH_TIMEOUT_MS = 10_000

export interface FetchInput {
  url: string
  maxCharacters?: number
}

export interface FetchOutput {
  url: string
  finalUrl: string
  title?: string
  contentType: string
  content: string
  extractedAs: 'markdown' | 'text'
  retrievedAt: string
  truncated: boolean
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  if (!match || match[1] == null) return undefined
  return match[1].trim() || undefined
}

function extractText(html: string): string {
  // Remove scripts and styles entirely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  // Replace block-level tags with newlines for readable output
  text = text.replace(/<\/?(p|div|h[1-6]|li|br|tr)[^>]*>/gi, '\n')
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '')
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  // Collapse runs of whitespace and blank lines
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export async function fetchUrl(input: FetchInput, signal?: AbortSignal): Promise<FetchOutput> {
  const requestUrl = input.url
  const maxChars = input.maxCharacters ?? DEFAULT_MAX_CHARS

  // Validate URL before fetching — throws AppError on bad scheme/IP
  validateUrl(requestUrl)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal

  let response: Response
  try {
    response = await fetch(requestUrl, { signal: combinedSignal, redirect: 'follow' })
  } catch (cause) {
    clearTimeout(timeout)
    if ((cause as Error).name === 'AbortError') {
      throw new AppError({ code: ErrorCode.TIMEOUT, message: 'Request timed out', retryable: true })
    }
    throw new AppError({ code: ErrorCode.NETWORK_ERROR, message: 'Network error', retryable: true, cause })
  } finally {
    clearTimeout(timeout)
  }

  // Revalidate the final URL after any redirects
  const finalUrl = response.url || requestUrl
  try {
    const finalParsed = new URL(finalUrl)
    if (isPrivateIp(finalParsed.hostname)) {
      throw new AppError({
        code: ErrorCode.PERMISSION_DENIED,
        message: `Redirect resolved to private address: ${finalParsed.hostname}`,
      })
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    // Non-AppError from URL parse — ignore (unusual redirect target)
  }

  if (!response.ok) {
    throw new AppError({
      code: ErrorCode.NETWORK_ERROR,
      message: `HTTP ${response.status}`,
      retryable: response.status >= 500,
    })
  }

  const rawContentType = response.headers.get('content-type') ?? 'application/octet-stream'
  const contentTypeLower = rawContentType.toLowerCase()
  const isAllowed = ALLOWED_CONTENT_TYPES.some((t) => contentTypeLower.includes(t))
  if (!isAllowed) {
    throw new AppError({
      code: ErrorCode.UNSUPPORTED_CONTENT,
      message: `Unsupported content type: ${rawContentType}`,
    })
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new AppError({
      code: ErrorCode.INVALID_INPUT,
      message: `Response too large: ${buffer.byteLength} bytes (max ${MAX_RESPONSE_BYTES})`,
    })
  }

  const raw = Buffer.from(buffer).toString('utf-8')
  const isHtml = contentTypeLower.includes('html')

  let content: string
  let title: string | undefined
  if (isHtml) {
    title = extractTitle(raw)
    content = extractText(raw)
  } else {
    content = raw
  }

  const truncated = content.length > maxChars
  if (truncated) content = content.slice(0, maxChars)

  return {
    url: requestUrl,
    finalUrl,
    ...(title != null ? { title } : {}),
    contentType: rawContentType,
    content,
    extractedAs: 'text' as const,
    retrievedAt: new Date().toISOString(),
    truncated,
  }
}
