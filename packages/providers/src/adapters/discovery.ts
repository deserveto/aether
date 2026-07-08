import type { DiscoveredModel, ModelCapabilities } from '../types.js'
import { safeFetch } from '../security/ssrf.js'

const NON_TEXT_MODEL_PATTERNS =
  /embedding|tts|whisper|dall-e|audio|moderation|sora|transcribe|image-| images?$/i
const VISION_PATTERNS =
  /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4-vision|vision|gemini|claude-3|claude-sonnet|claude-opus|claude-3\.5|llava|qwen-vl|glm-4v|internvl|pixtral|vision/
const REASONING_PATTERNS = /\bo1\b|o1-|o3-|o4-|reason|thinking|deepseek-r|qwq|grok-3|cerebras/
const STRUCTURED_PATTERNS =
  /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4-0|claude-3|claude-sonnet|claude-opus|claude-haiku|gemini|command-r|llama-3\.1|llama-3\.3|mistral-large|deepseek/

export function prettifyModelId(id: string): string {
  const trimmed = id.split('/').pop() ?? id
  return trimmed
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Gpt|Sft|Tts|Api|Ai|Gcv|Vlm)\b/g, (c) => c.toUpperCase())
}

export function inferCapabilities(
  modelId: string,
  displayName?: string,
  hints?: { vision?: boolean; toolCalling?: boolean; structuredOutput?: boolean; streaming?: boolean },
): ModelCapabilities {
  const haystack = `${modelId} ${displayName ?? ''}`.toLowerCase()
  const isNonText = NON_TEXT_MODEL_PATTERNS.test(haystack)
  return {
    streaming: hints?.streaming ?? !isNonText,
    toolCalling:
      hints?.toolCalling ?? (!isNonText && !/instruct.*tiny|base\b/.test(haystack)),
    structuredOutput: hints?.structuredOutput ?? STRUCTURED_PATTERNS.test(haystack),
    vision: hints?.vision ?? VISION_PATTERNS.test(haystack),
    fileInput: false,
    reasoning: REASONING_PATTERNS.test(haystack),
  }
}

interface OpenAIModelListItem {
  readonly id: string
  readonly name?: string
  readonly architecture?: {
    readonly input_modalities?: readonly string[]
    readonly output_modalities?: readonly string[]
  }
  readonly supported_parameters?: readonly string[]
}

interface OpenAIModelsResponse {
  readonly data?: readonly OpenAIModelListItem[]
}

export interface ListOpenAIModelsOptions {
  readonly baseUrl: string | undefined
  readonly apiKey: string
  readonly defaultBaseUrl: string
  readonly headers?: Record<string, string>
  readonly useOpenRouterShape?: boolean
}

export async function listOpenAICompatibleModels(
  opts: ListOpenAIModelsOptions,
): Promise<DiscoveredModel[]> {
  const base = (opts.baseUrl ?? opts.defaultBaseUrl).replace(/\/$/, '')
  const response = await safeFetch(`${base}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: 'application/json',
      ...(opts.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error(`Model discovery failed with status ${response.status}`)
  }
  const body = (await response.json()) as OpenAIModelsResponse
  const items = body.data ?? []
  return items
    .filter((item): item is OpenAIModelListItem => Boolean(item?.id))
    .map((item) => {
      const inputModalities = item.architecture?.input_modalities ?? []
      const supported = item.supported_parameters ?? []
      const hints = opts.useOpenRouterShape
        ? {
            vision: inputModalities.some((m) => m.toLowerCase().includes('image')),
            streaming: supported.some((p) => p.toLowerCase().includes('stream')),
            toolCalling:
              supported.some((p) => p.toLowerCase().includes('tool')) ||
              supported.some((p) => p.toLowerCase().includes('function')),
            structuredOutput:
              supported.some((p) => p.toLowerCase().includes('json_schema')) ||
              supported.some((p) => p.toLowerCase().includes('response_format')),
          }
        : undefined
      return {
        modelId: item.id,
        displayName: item.name ?? prettifyModelId(item.id),
        capabilities: inferCapabilities(item.id, item.name, hints),
      }
    })
}
