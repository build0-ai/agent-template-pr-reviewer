/**
 * Generic MCP Server
 *
 * This server is completely framework-level and contains no agent-specific logic.
 * It dynamically loads plugins based on the PLUGINS environment variable passed
 * by the parent process (framework/core/runner.ts).
 *
 * The parent process is responsible for:
 * 1. Determining which plugins to load
 * 2. Passing credentials via environment variables
 * 3. Passing the list of plugins to load via PLUGINS env var
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { McpPlugin } from "./types.js";

/**
 * Dynamically import all available plugins.
 * This allows the MCP server to load any plugin without hardcoding imports.
 */
async function loadAvailablePlugins(): Promise<Map<string, McpPlugin>> {
  const plugins = new Map<string, McpPlugin>();

  try {
    // Reusable plugins
    const { gitPlugin } = await import("../../tools/reusable/git.js");
    plugins.set("git", gitPlugin);

    const { githubPlugin } = await import("../../tools/reusable/github.js");
    plugins.set("github", githubPlugin);

    const { slackPlugin } = await import("../../tools/reusable/slack.js");
    plugins.set("slack", slackPlugin);

    // Agent-specific plugins (still imported but only used if requested)
    const { sentryPlugin } = await import("../../tools/agent-specific/sentry.js");
    plugins.set("sentry", sentryPlugin);
  } catch (error) {
    console.error("[MCP Server] Error loading plugins:", error);
  }

  return plugins;
}

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

  // Get credentials from environment (passed from parent process)
  const config: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };

  // Load all available plugins
  const availablePlugins = await loadAvailablePlugins();

  // Determine which plugins to actually use (from parent process)
  let requestedPluginNames: string[] = [];
  if (process.env.PLUGINS) {
    try {
      requestedPluginNames = JSON.parse(process.env.PLUGINS);
    } catch (error) {
      console.error("[MCP Server] Failed to parse PLUGINS env var:", error);
      requestedPluginNames = [];
    }
  }

  // Initialize only the requested plugins
  const activePlugins: McpPlugin[] = [];
  for (const pluginName of requestedPluginNames) {
    const plugin = availablePlugins.get(pluginName);
    if (!plugin) {
      console.error(`[MCP Server] Plugin not found: ${pluginName}`);
      continue;
    }

    try {
      await plugin.init(config);
      activePlugins.push(plugin);
      console.error(`[MCP Server] Initialized plugin: ${pluginName}`);
    } catch (error) {
      console.error(
        `[MCP Server] Failed to initialize plugin ${pluginName}:`,
        error
      );
    }
  }

  // Register tools from active plugins
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = activePlugins.flatMap((p) => p.registerTools());
    return { tools: allTools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    for (const plugin of activePlugins) {
      const tools = plugin.registerTools();
      if (tools.find((t: any) => t.name === toolName)) {
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
  console.error("[MCP Server] Running on stdio");
}

runServer().catch(console.error);
