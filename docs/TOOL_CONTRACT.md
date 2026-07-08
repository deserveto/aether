# Aether Tool Contract

## 1. Purpose

Aether tools are reusable, schema-validated capabilities attached explicitly to agents.

## 2. Tool Manifest

```ts
type ToolRiskLevel = 'read' | 'interactive' | 'consequential' | 'system';

interface ToolManifest<Input, Output> {
  id: string;
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  inputSchema: unknown;
  outputSchema: unknown;
  requiresApproval: boolean;
  timeoutMs: number;
  capabilities: string[];
  execute(input: Input, context: ToolExecutionContext): Promise<Output>;
}
```

## 3. Tool Execution Context

```ts
interface ToolExecutionContext {
  requestId: string;
  userId: string;
  conversationId: string;
  agentId: string;
  signal: AbortSignal;
}
```

## 4. General Rules

Every tool must have a unique ID, validate input and output, enforce timeout, support cancellation where possible, return structured errors, avoid logging secrets, avoid arbitrary command execution, declare risk, and remain testable outside the LLM.

## 5. Error Contract

```ts
interface ToolErrorShape {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

Stable codes include `INVALID_INPUT`, `NOT_CONFIGURED`, `TIMEOUT`, `NETWORK_ERROR`, `AUTH_REQUIRED`, `PERMISSION_DENIED`, `UNSUPPORTED_CONTENT`, `DEVICE_NOT_FOUND`, and `COMMAND_FAILED`.

## 6. Web Search Tool

### ID

```text
web_search
```

### Input

```ts
interface WebSearchInput {
  query: string;
  limit?: number;
  language?: string;
  categories?: string[];
  timeRange?: 'day' | 'month' | 'year';
}
```

### Output

```ts
interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
  rank: number;
}

interface WebSearchOutput {
  query: string;
  results: WebSearchResult[];
  searchedAt: string;
}
```

Requirements: query SearXNG server-side, limit results, normalize and deduplicate, remove unsupported URL schemes, and use bounded retries.

## 7. Web Fetch Tool

### ID

```text
web_fetch
```

### Input

```ts
interface WebFetchInput {
  url: string;
  maxCharacters?: number;
}
```

### Output

```ts
interface WebFetchOutput {
  url: string;
  finalUrl: string;
  title?: string;
  contentType: string;
  content: string;
  extractedAs: 'markdown' | 'text';
  retrievedAt: string;
  truncated: boolean;
}
```

Security requirements: HTTP/HTTPS only, reject credentials in URLs, reject loopback/private/link-local targets, revalidate DNS and redirects, limit response bytes, enforce timeout, validate content type, and sanitize extracted content.

## 8. Browser Tool Family

Suggested IDs:

```text
browser.navigate
browser.snapshot
browser.click
browser.type
browser.select
browser.press
browser.screenshot
browser.extract
```

Mutating actions may require approval. Sessions are scoped. Authentication state must not leak across users. Browser automation is for interaction and testing, not general web research.

## 9. Mobile Tool Family

Suggested IDs:

```text
mobile.check_environment
mobile.list_devices
mobile.inspect_apk
mobile.install_apk
mobile.launch_app
mobile.get_hierarchy
mobile.run_maestro_flow
mobile.take_screenshot
mobile.collect_logs
mobile.cleanup_session
```

No general shell tool is exposed. Commands use allowlisted executable and argument builders. APK paths remain in approved temporary directories. Device IDs come from detected devices. Runs use session IDs and defined artifact retention.

## 10. Approval Model

| Risk | Default |
|---|---|
| `read` | No approval |
| `interactive` | Configurable |
| `consequential` | Approval required |
| `system` | Approval required unless trusted local test mode |

## 11. Tool Registration

```ts
interface ToolRegistry {
  register(tool: ToolManifest<unknown, unknown>): void;
  get(id: string): ToolManifest<unknown, unknown>;
  list(): ToolManifest<unknown, unknown>[];
  listForAgent(agentId: string): ToolManifest<unknown, unknown>[];
}
```

The runtime never trusts tool IDs from the browser without authorization checks.

## 12. External Team Tool Integration

A contributed tool package includes manifest, schemas, implementation, environment requirements, health check where relevant, tests, README, security limitations, and example agent assignment.
