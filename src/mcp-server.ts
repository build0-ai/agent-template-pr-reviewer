import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { sentryPlugin } from "./tools/sentry.js";
import { slackPlugin } from "./tools/slack.js";
import { diagnosticsPlugin } from "./tools/diagnostics.js";
import { githubPlugin } from "./tools/github.js";
import { fetchAndDecryptCredentials } from "./utils/credentials.js";

async function runServer() {
  const server = new Server(
    {
      name: "agent-tools",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const plugins = [sentryPlugin, slackPlugin, diagnosticsPlugin, githubPlugin];

  // Fetch credentials
  // Note: mcp-server runs as a subprocess spawned by src/utils/agent.ts
  // which receives env vars passed from src/index.ts.
  // However, to be safe and independent, we can try to fetch credentials here too
  // OR rely on them being passed in process.env by the parent.

  // Strategy: Try to use process.env (which should be populated by parent),
  // but if missing key vars, try fetching.
  let config: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };

  // If crucial vars are missing in env (e.g. running standalone), fetch them
  if (!config.SENTRY_AUTH_TOKEN || !config.SLACK_BOT_TOKEN) {
    try {
      const remoteCredentials = await fetchAndDecryptCredentials();
      config = { ...config, ...remoteCredentials };
    } catch (e) {
      // ignore error in subprocess, rely on what we have
    }
  }

  // Initialize plugins
  for (const plugin of plugins) {
    await plugin.init(config);
  }

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = plugins.flatMap((p) => p.registerTools());
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    for (const plugin of plugins) {
      const tools = plugin.registerTools();
      if (tools.find((t) => t.name === toolName)) {
        try {
          return await plugin.handleToolCall(toolName, args);
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            isError: true,
          };
        }
      }
    }

    throw new Error(`Tool not found: ${toolName}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running on stdio");
}

runServer().catch(console.error);
