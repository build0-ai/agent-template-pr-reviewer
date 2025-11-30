# Creating a New Autonomous Agent

This directory contains guides for creating agents. The framework/ directory contains all the foundational code that doesn't change between agents.

## Quick Start

### 1. Update `workflow.json` (in root)

The `workflow.json` file (in the root directory) defines your agent's workflow:

```json
{
  "name": "Your Agent Name",
  "steps": [
    {
      "id": "step_id",
      "type": "system|ai_agent|tool",
      "...": "step-specific fields"
    }
  ]
}
```

**Step Structure:**
- Each step has an `id`, `type`, and type-specific properties
- Types: `ai_agent` (run Claude), `tool` (call a plugin tool)
- Variables can reference previous step outputs: `{{ step_id.output }}`
- Configuration is passed via `args` field in each step

### 2. Plugins

Plugins are automatically loaded based on which tools your steps use. You don't need to declare them - they're discovered automatically when the framework scans your steps.

**Available Plugins:**

**Reusable Plugins** (in `tools/reusable/`):
- `git` - Clone any Git repository (generic, no built-in auth)
- `github` - GitHub-specific operations: clone with auth, create PRs
- `slack` - Post messages and wait for approval

**Agent-Specific Plugins** (in `tools/agent-specific/`):
- `sentry` - Fetch and analyze Sentry issues

### 3. Run Your Agent

```bash
pnpm dev
```

This runs the framework with your workflow.

## Directory Structure

```
autonomous-agent-template/
├── framework/              # Don't modify - foundational code
│   ├── core/              # Main orchestrator, MCP server, types
│   ├── services/          # Credential manager, etc
│   └── utils/             # Workflow loading, git, agent SDK wrapper
│
├── tools/                 # Plugins
│   ├── reusable/          # Shared across agents (GitHub, Slack)
│   └── agent-specific/    # This agent only (Sentry)
│
├── agent/                 # Guide for creating agents
│   └── README.md          # This file
│
├── workflow.json          # Your workflow definition (modify this)
└── package.json
```

## Creating a New Tool (Plugin)

If you need custom functionality for your agent:

1. Create a new file in `tools/agent-specific/`:
   ```typescript
   // tools/agent-specific/my-tool.ts
   import { McpPlugin } from "../../framework/core/types.js";
   import { Tool } from "@modelcontextprotocol/sdk/types.js";

   export const myPlugin: McpPlugin = {
     name: "my_plugin",
     config: {},

     async init(config) {
       this.config = config;
     },

     registerTools(): Tool[] {
       return [
         {
           name: "my_tool",
           description: "What does it do",
           inputSchema: {
             type: "object",
             properties: {
               param1: { type: "string" }
             }
           }
         }
       ];
     },

     async handleToolCall(name, args) {
       if (name === "my_tool") {
         // Implement tool logic here
         return {
           content: [{ type: "text", text: "Result" }]
         };
       }
     }
   };
   ```

2. Register in `framework/core/index.ts`:
   ```typescript
   import { myPlugin } from "../../tools/agent-specific/my-tool.js";

   const pluginRegistry = {
     // ... existing plugins
     my_plugin: myPlugin,
   };
   ```

3. Use your tool in a step in `workflow.json`:
   ```json
   {
     "id": "my_step",
     "type": "tool",
     "tool": "my_tool",
     "args": {
       "param1": "value"
     }
   }
   ```

   The plugin will be automatically discovered and loaded when the framework scans the workflow steps.

## Workflow Step Types

### Tool Steps (the primary way to execute operations)

**Clone a Repository:**

For **public repositories or with SSH keys**:
```json
{
  "id": "clone_repo",
  "type": "tool",
  "tool": "git_clone",
  "args": {
    "repo_url": "https://github.com/owner/repo.git",
    "target_dir": "./workspace"
  }
}
```

For **private GitHub repositories** (uses GITHUB_TOKEN):
```json
{
  "id": "clone_repo",
  "type": "tool",
  "tool": "github_clone",
  "args": {
    "repo_url": "https://github.com/owner/repo.git",
    "target_dir": "./workspace"
  }
}
```

**Other Tool Steps:**
```json
{
  "id": "fetch_data",
  "type": "tool",
  "tool": "tool_name",
  "args": {
    "param1": "value",
    "param2": "{{ previous_step.output.field }}"
  }
}
```

### AI Agent Steps
```json
{
  "id": "investigate",
  "type": "ai_agent",
  "args": {
    "prompt": "Analyze this: {{ data_step.output }}",
    "working_dir": "./workspace"
  }
}
```

## Environment Setup

Only `ANTHROPIC_API_KEY` should be in your `.env`:
```
ANTHROPIC_API_KEY=sk-...
```

All other credentials (GitHub token, Slack token, API keys, etc.) are fetched from a remote API endpoint managed by the framework (`framework/services/credential-manager.ts`).

## Testing Your Workflow

1. Create a minimal workflow with one step to test
2. Run `pnpm dev`
3. Check console output for errors
4. Add steps incrementally

## Common Patterns

### Waiting for Approval
```json
{
  "id": "post_message",
  "type": "tool",
  "tool": "slack_post_message",
  "args": {
    "channel": "C123456",
    "text": "React with ✅ to approve"
  }
},
{
  "id": "wait_approval",
  "type": "tool",
  "tool": "slack_wait_approval",
  "args": {
    "channel": "C123456",
    "message_ts": "{{ post_message.output.ts }}",
    "timeout_mins": 30
  }
}
```

### Conditional Steps
```json
{
  "id": "create_pr",
  "type": "tool",
  "tool": "github_create_pr",
  "if": "{{ investigation.output.has_issues }}",
  "args": {
    "title": "Fix found",
    "repo_url": "..."
  }
}
```

Use `if` to conditionally execute steps based on previous outputs.

## Extracting Reusable Tools

When your agent-specific tool becomes useful for other agents:

1. Move it from `tools/agent-specific/` to `tools/reusable/`
2. Extract any hardcoded values to configuration
3. Add JSDoc marking it as reusable
4. Update other agents to use it

In the future, reusable tools will be extracted to npm packages for easy sharing.

## Need Help?

- Check the example workflow in `workflow.json`
- Look at existing plugins for patterns
- Review `framework/utils/workflow.ts` for workflow structure
