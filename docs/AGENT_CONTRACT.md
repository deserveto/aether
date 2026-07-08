# Aether Agent Contract

## 1. Purpose

This contract allows built-in agents, database-stored agents, and future team agents to appear consistently in Aether.

## 2. Agent Manifest

```ts
type AgentSource = 'code' | 'stored';
type AgentStatus = 'draft' | 'published' | 'archived';
type AgentCategory = 'qa' | 'research' | 'productivity' | 'social' | 'custom';

interface AgentManifest {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  source: AgentSource;
  status: AgentStatus;
  protected: boolean;
  capabilities: string[];
  toolIds: string[];
  modelBinding: {
    primaryModelProfileId: string;
    fallbackModelProfileIds: string[];
  };
  memory: {
    enabled: boolean;
    mode: 'thread' | 'resource-and-thread';
  };
  visibility: 'private' | 'internal' | 'public';
  createdAt: string;
  updatedAt: string;
}
```

## 3. ID Rules

Agent IDs must use lowercase letters, digits, and hyphens; match `^[a-z0-9]+(?:-[a-z0-9]+)*$`; be unique; avoid reserved identifiers; and remain immutable.

Reserved initial IDs:

- `qa-web-agent`
- `qa-mobile-agent`

## 4. Built-In Agents

Built-in agents are code-defined, protected, not deletable through Agent Builder, assigned explicit tools, and bound to tested model profiles.

### QA Web Agent

```text
ID: qa-web-agent
Category: qa
Capabilities:
- browser-testing
- form-testing
- evidence-collection
- qa-reporting
```

### QA Mobile Agent

```text
ID: qa-mobile-agent
Category: qa
Capabilities:
- apk-inspection
- android-device-control
- maestro-testing
- screenshot-collection
- qa-reporting
```

## 5. Stored Agents

Stored agents:

- Are created through Agent Builder
- Begin as draft
- Are hidden until published
- Use approved model profiles and tools
- Can be archived
- Can be deleted only with confirmation
- Retain historical version metadata

## 6. Lifecycle

```text
Draft
  ├── Edit
  ├── Test
  └── Publish
        ├── Create a new draft version
        ├── Archive
        └── Remain available in Agent Catalog
```

Published configuration is immutable. Editing a published agent creates a new draft version.

## 7. Runtime Resolution

```ts
interface AgentResolver {
  get(agentId: string, version?: 'published' | string): Promise<ResolvedAgent>;
  listPublished(): Promise<AgentManifest[]>;
  listAllForAdmin(): Promise<AgentManifest[]>;
}
```

Normal chat uses published versions. Draft testing explicitly requests a draft version. Archived agents cannot start new normal conversations.

## 8. Conversation Binding

Every conversation has one immutable `agentId` after its first message. Selecting another agent creates another conversation. History does not automatically transfer across agents.

## 9. Tool Assignment

An agent can use only declared `toolIds`. The runtime validates existence, enablement, category approval, infrastructure health, and user permission where applicable.

## 10. Model Assignment

Agents store model-profile references, not raw provider credentials.

Built-in agents use developer-approved profiles and do not expose per-message model switching. Stored agents allow selection from approved profiles only.

## 11. Memory

Initial modes:

- `thread`: isolated by conversation
- `resource-and-thread`: optionally shared for the same user and agent with thread isolation

Cross-agent memory is outside the initial scope.

## 12. External Team Agent Integration

A contributed agent must provide:

1. Agent manifest
2. Runtime factory or stored definition
3. Tool requirements
4. Required environment variables
5. Validation instructions
6. Test instructions
7. Known limitations

It must not hardcode secrets, import web-app internals, read other agents' history directly, register undeclared global tools, or use undeclared provider connections.

## 13. Minimum Evaluation

Before publication:

- Basic response succeeds
- Instructions are followed
- Required tools work
- Output format is valid
- Errors are clear
- Model supports required capabilities
- No secret is exposed
