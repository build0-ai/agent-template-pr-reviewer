# Autonomous Agent Template

## Overview

This repository is a **template for creating Autonomous Coding Agents**. It is designed to be deployed into sandboxed environments (e.g., Blaxel, E2B, Fly.io) to perform complex, multi-step coding tasks on target repositories.

The core philosophy is **"Agent-as-Code"**:

1. **Declarative Workflow**: Agent behavior is defined in `workflow.json`
2. **Core Package**: Framework logic lives in `@build0.ai/agent-core` npm package
3. **Type-Safe Plugins**: Plugin registration with compile-time validation
4. **MCP Tools**: Plugins provide tools via Model Context Protocol
5. **Headless Claude**: Leverages Claude Agent SDK for intelligent coding tasks

## Architecture

```mermaid
graph TD
    Index[index.ts - Agent Setup] -->|Registers| Plugins[Plugins with Credentials]
    Index -->|Creates| Runner[@build0.ai/agent-core Runner]
    Runner -->|Loads| Workflow[workflow.json]
    Runner -->|Validates| Tools[Available Tools]

    subgraph "Execution"
        Runner -->|Spawns| MCP[MCP Server]
        MCP -->|Initializes| PluginInstances[Plugin Instances]
        Runner -->|Executes| Steps[Workflow Steps]
    end

    Steps -->|AI Agent| Claude[Claude Agent SDK]
    Claude -->|Calls| MCP
    Steps -->|Tool Call| PluginInstances

    Credentials[Remote Credentials API] -->|Fetched by| CredManager[credentialManager]
    CredManager -->|Passed to| Index
```

## Directory Structure

```
agent-repo/
├── index.ts                    # Agent setup & plugin registration
├── workflow.json               # Workflow definition
├── package.json                # Dependencies (includes @build0.ai/agent-core)
│
└── tools/                      # Plugins
    ├── reusable/               # Shared across agents
    │   ├── git.ts              # Generic git operations
    │   ├── github.ts           # GitHub operations
    │   └── slack.ts            # Slack integration
    └── agent-specific/         # Specific to this agent
        └── sentry.ts           # Sentry issue tracking
```

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Create `.env`

```bash
ANTHROPIC_API_KEY=sk-...
```

### 3. Modify `index.ts`

```typescript
import { Runner, credentialManager } from "@build0.ai/agent-core";
import { githubPlugin } from "./tools/reusable/github.js";

async function main() {
  // Fetch credentials from remote API
  const credentials = await credentialManager.fetchCredentials();

  // Create runner and register plugins
  const runner = new Runner();
  await runner.registerPlugin(githubPlugin, {
    GITHUB_TOKEN: credentials["github-xxx"]?.access_token!,
  });

  // Run workflow
  await runner.runWorkflow("./workflow.json");
}

main();
```

### 4. Define `workflow.json`

```json
{
  "steps": [
    {
      "id": "clone",
      "type": "tool",
      "tool": "github_clone",
      "args": {
        "repo_url": "https://github.com/owner/repo.git",
        "target_dir": "./workspace"
      }
    },
    {
      "id": "analyze",
      "type": "ai_agent",
      "args": {
        "prompt": "Review the codebase for issues",
        "working_dir": "./workspace"
      }
    }
  ]
}
```

### 5. Run

```bash
pnpm dev
```

## Core Features

### Variable Interpolation

Reference previous step outputs in any step argument:

```json
{
  "args": {
    "issue_id": "{{ fetch_issues.output.0.id }}",
    "analysis": "{{ investigate.output }}"
  }
}
```

Supports:
- Dot notation for nested access
- Automatic JSON stringification for objects
- Works in all `args` fields

### Trigger Payload (External Input)

Workflows can receive external data via the `BUILD0_TRIGGER_PAYLOAD` environment variable.

**How it works:**
1. External system sets `BUILD0_TRIGGER_PAYLOAD` env var with JSON payload
2. Framework automatically parses it on workflow start
3. Payload is available as `{{ input.xxx }}` in any workflow step

**Example:**
```bash
export BUILD0_TRIGGER_PAYLOAD='{"pull_request":{"number":123},"repository":{"name":"my-repo","owner":{"login":"my-org"}}}'
pnpm dev
```

**Accessing in workflow.json:**
```json
{
  "id": "get_pr",
  "type": "tool",
  "tool": "github_get_pr",
  "args": {
    "owner": "{{ input.repository.owner.login }}",
    "repo": "{{ input.repository.name }}",
    "pr_number": "{{ input.pull_request.number }}"
  }
}
```

### Session Continuity

AI agent steps maintain context across multiple steps:
- First `ai_agent` step: Fresh session
- Subsequent `ai_agent` steps: Continue previous session

The runner automatically tracks this based on step order.

### Remote Credential Management

Credentials are fetched from a remote API and decrypted using AES-256-GCM.

**Required environment variables:**
- `BUILD0_AGENT_CREDENTIALS_URL` - API endpoint
- `BUILD0_AGENT_AUTH_TOKEN` - Authentication token
- `BUILD0_AGENT_ENCRYPTION_KEY` - Decryption key (hex)

## Available Tools

### Reusable Tools (`tools/reusable/`)

**Git Plugin:**
- `git_clone` - Clone any repository

**GitHub Plugin:**
- `github_clone` - Clone private repo with token auth
- `github_create_pr` - Create pull request
- `github_get_pr` - Get PR details (title, body, diff, files)
- `github_comment_pr` - Post comment on a PR

**Slack Plugin:**
- `slack_post_message` - Post message to channel
- `slack_wait_approval` - Wait for reaction (human-in-the-loop)

### Agent-Specific Tools (`tools/agent-specific/`)

**Sentry Plugin:**
- `sentry_get_issues` - Fetch issues from org/project
- `sentry_get_issue_details` - Get detailed issue info with stack traces

## Adding New Tools

### 1. Create Plugin File

```typescript
import {
  McpPlugin,
  BasePluginConfig,
  ToolDefinition,
  logger,
} from "@build0.ai/agent-core";
import { z } from "zod";

interface MyPluginConfig extends BasePluginConfig {
  MY_API_KEY: string;
}

export const myPlugin: McpPlugin<MyPluginConfig> = {
  name: "my_plugin",
  config: {} as MyPluginConfig,

  async init(config: MyPluginConfig): Promise<void> {
    if (!config.MY_API_KEY) {
      throw new Error("MY_API_KEY is required");
    }
    this.config = config;
  },

  registerTools(): ToolDefinition[] {
    return [
      {
        name: "my_tool",
        description: "Does something useful",
        zodSchema: z.object({
          param: z.string().describe("A parameter"),
        }),
      },
    ];
  },

  async handleToolCall(name, args) {
    if (name === "my_tool") {
      const { param } = args as { param: string };
      // Implementation
      return {
        content: [{ type: "text", text: "Result" }],
      };
    }
    throw new Error(`Unknown tool: ${name}`);
  },
};
```

### 2. Register in `index.ts`

```typescript
import { myPlugin } from "./tools/my-plugin.js";

await runner.registerPlugin(myPlugin, {
  MY_API_KEY: credentials.MY_API_KEY!,
});
```

### 3. Use in `workflow.json`

```json
{
  "id": "do_something",
  "type": "tool",
  "tool": "my_tool",
  "args": { "param": "value" }
}
```

## @build0.ai/agent-core Exports

The core package provides:

```typescript
// Classes
import { Runner } from "@build0.ai/agent-core";

// Singletons
import { logger, credentialManager } from "@build0.ai/agent-core";

// Types
import type {
  McpPlugin,
  BasePluginConfig,
  ToolDefinition,
  Workflow,
  WorkflowStep,
  Credential,
  AgentResult,
  LogMessage,
  LogLevel,
} from "@build0.ai/agent-core";
```

## Development

```bash
# Run in development mode
pnpm dev

# Type check
pnpm typecheck

# Build
pnpm build

# Run built version
pnpm start
```

## Deployment

1. **Build**: `pnpm build`
2. **Deploy**: Upload to your environment
3. **Configure**: Set environment variables
4. **Run**: `node dist/index.js`

Required environment variables:
- `ANTHROPIC_API_KEY`
- `BUILD0_AGENT_CREDENTIALS_URL`
- `BUILD0_AGENT_AUTH_TOKEN`
- `BUILD0_AGENT_ENCRYPTION_KEY`
- `BUILD0_TRIGGER_PAYLOAD` (optional - for webhook triggers)

## Summary

Create new agents by:
1. Installing `@build0.ai/agent-core`
2. Writing `index.ts` to register plugins
3. Defining `workflow.json` with steps
4. Adding tools in `tools/` as needed

The framework handles orchestration, credential management, and AI agent execution.
