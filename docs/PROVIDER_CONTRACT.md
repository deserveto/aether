# Aether Provider Contract

## 1. Purpose

The provider layer allows Aether agents to use models from different vendors without embedding provider-specific credentials and routing logic inside each agent.

Initial support:

- OpenAI
- Anthropic
- Google Gemini
- OpenRouter
- Custom OpenAI-compatible endpoints

## 2. Core Entities

### Provider Connection

```ts
type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'openai-compatible';

interface ProviderConnection {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  secretRef: string;
  enabled: boolean;
  status: 'untested' | 'healthy' | 'degraded' | 'unavailable';
  createdAt: string;
  updatedAt: string;
}
```

Rules:

- `secretRef` points to secure server-side storage.
- Raw secrets are never returned through API responses.
- `baseUrl` is required only for custom OpenAI-compatible providers.
- Disabled connections cannot serve new requests.

### Model Profile

```ts
interface ModelCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  fileInput: boolean;
  reasoning: boolean;
}

interface ModelProfile {
  id: string;
  providerConnectionId: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapabilities;
  approved: boolean;
  enabled: boolean;
  defaultSettings?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

An approved model must have verified capability metadata. Agent Builder lists only approved and enabled profiles.

### Agent Model Binding

```ts
interface AgentModelBinding {
  agentId: string;
  primaryModelProfileId: string;
  fallbackModelProfileIds: string[];
}
```

Fallback models are ordered and should pass the same evaluation suite as the primary model.

## 3. Provider Adapter Interface

```ts
interface ProviderAdapter {
  readonly type: ProviderType;

  validateConnection(
    input: ProviderConnectionInput
  ): Promise<ConnectionValidationResult>;

  listModels?(
    connection: ProviderConnectionRuntime
  ): Promise<DiscoveredModel[]>;

  resolveModel(
    connection: ProviderConnectionRuntime,
    profile: ModelProfile
  ): Promise<ResolvedLanguageModel>;

  healthCheck(
    connection: ProviderConnectionRuntime
  ): Promise<ProviderHealthResult>;
}
```

## 4. Provider Strategy

### OpenAI

Use a native OpenAI adapter.

```env
OPENAI_API_KEY=
```

### Anthropic

Use a native Anthropic adapter rather than forcing all Claude traffic through an OpenAI compatibility layer.

```env
ANTHROPIC_API_KEY=
```

### Google Gemini

Use a native Google adapter.

```env
GOOGLE_GENERATIVE_AI_API_KEY=
```

### OpenRouter

Use OpenRouter as a distinct gateway.

```env
OPENROUTER_API_KEY=
```

OpenRouter model profiles must explicitly record tested capabilities.

### Custom OpenAI-Compatible

Use for internal or approved third-party endpoints such as Rafiq.

```env
RAFIQ_LLM_BASE_URL=
RAFIQ_LLM_API_KEY=
```

A custom connection requires display name, base URL, API key, optional headers, model configuration, health check, and capability tests.

## 5. Secret Handling

Development may use ignored `.env` files.

Production should use deployment secrets, a cloud secret manager, or encrypted storage with an external encryption key.

Prohibited:

- localStorage
- sessionStorage
- browser-readable secrets
- logging raw credentials
- returning stored secrets to clients
- normal application tables with plaintext credentials

## 6. Custom Endpoint Validation

Production requirements:

- HTTPS required
- URL parsed server-side
- Credentials in URL rejected
- Localhost and loopback rejected
- Private, link-local, and metadata-service IPs rejected
- DNS and redirect targets revalidated
- Timeout and response-size limits enforced

Local development may enable explicit local endpoints through a separate configuration flag.

## 7. Connection Test

```ts
interface ConnectionValidationResult {
  ok: boolean;
  latencyMs?: number;
  providerName?: string;
  discoveredModels?: string[];
  errorCode?: string;
  message?: string;
}
```

Provider errors must be sanitized before returning to the client.

## 8. Capability Verification

Before approval, verify as applicable:

- Basic generation
- Streaming
- Tool calling
- Structured output
- Required context capacity
- Vision input
- File input
- Reasoning mode
- Timeout behavior
- Rate-limit behavior

## 9. Fallback Policy

Fallback may occur for provider timeout, rate limit, temporary server error, or connection failure.

Do not automatically fallback for invalid prompts, tool validation failures, authentication failures, user cancellation, or deterministic application errors.

## 10. Observability

Log provider connection ID, model profile ID, agent ID, request ID, latency, retry count, fallback transition, and sanitized error category.

Never log API keys, authorization headers, or full prompts and responses by default.
