import path from "path";
import fs from "fs/promises";
import os from "os";
import { loadWorkflow } from "../utils/workflow.js";
import { runAgent } from "../utils/agent.js";
import { logger } from "../utils/logger.js";
import { McpPlugin } from "./types.js";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

function interpolate(text: string, context: any): string {
  if (typeof text !== "string") return text;
  return text.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_, path) => {
    const keys = path.split(".");
    let value = context;
    for (const key of keys) {
      value = value?.[key];
    }
    // If value is an object, stringify it. If string, return as is.
    return value !== undefined
      ? typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value)
      : "";
  });
}

/**
 * Framework runner for autonomous agents.
 * Handles workflow execution and plugin management.
 */
export class Runner {
  private plugins: McpPlugin[] = [];
  private pluginRegistry: Map<string, McpPlugin> = new Map();

  /**
   * Register a plugin with its configuration.
   * TypeScript will enforce the config type matches the plugin's requirements.
   */
  async registerPlugin<TConfig extends Record<string, any>>(
    plugin: McpPlugin<TConfig>,
    config: TConfig
  ): Promise<void> {
    await plugin.init(config);
    this.plugins.push(plugin);
    this.pluginRegistry.set(plugin.name, plugin);
    logger.info(
      `Plugin ${plugin.name} registered with ${
        plugin.registerTools().length
      } tools: ${plugin
        .registerTools()
        .map((t) => t.name)
        .join(", ")}`
    );
  }

  /**
   * Validate that all required tools are available and there are no conflicts.
   */
  private validateTools(workflow: any): void {
    // Build a map of all available tools from registered plugins
    const availableTools = new Map<string, string>(); // toolName -> pluginName

    for (const plugin of this.plugins) {
      const tools = plugin.registerTools();
      for (const tool of tools) {
        if (availableTools.has(tool.name)) {
          const existingPlugin = availableTools.get(tool.name);
          throw new Error(
            `Duplicate tool name detected: "${tool.name}" is provided by both "${existingPlugin}" and "${plugin.name}" plugins`
          );
        }
        availableTools.set(tool.name, plugin.name);
      }
    }

    // Check that all tools referenced in workflow steps are available
    const missingTools: string[] = [];
    for (const step of workflow.steps) {
      if (step.type === "tool" && step.tool) {
        if (!availableTools.has(step.tool)) {
          missingTools.push(step.tool);
        }
      }
    }

    if (missingTools.length > 0) {
      throw new Error(
        `Workflow references tools that are not available: ${missingTools.join(
          ", "
        )}\n` +
          `Available tools: ${Array.from(availableTools.keys()).join(", ")}\n` +
          `Make sure the required plugins are registered in index.ts`
      );
    }

    logger.info(
      `✅ All required workflow tools are available:\n${Array.from(
        availableTools.keys()
      )
        .map((t) => `- ${t}`)
        .join("\n")}`
    );
  }

  private createMcpServer() {
    const tools: ReturnType<typeof tool>[] = [];
    for (const plugin of this.plugins) {
      const pluginTools = plugin.registerTools();
      for (const pluginTool of pluginTools) {
        tools.push(
          tool(
            pluginTool.name,
            pluginTool.description,
            pluginTool.zodSchema.shape,
            async (args) => {
              // The MCP SDK validates args against the Zod schema and passes them directly
              logger.info(
                `MCP tool ${pluginTool.name} called with args: ${JSON.stringify(
                  args
                )}`
              );
              return await plugin.handleToolCall(pluginTool.name, args);
            }
          )
        );
      }
    }
    const server = createSdkMcpServer({
      name: "agent-tools",
      version: "1.0.0",
      tools,
    });
    logger.info(
      `✅ MCP server created with ${tools.length} tools:\n${tools
        .map((t) => `- ${t.name}`)
        .join("\n")}`
    );
    return server;
  }

  /**
   * Run a workflow from a file.
   */
  async runWorkflow(workflowPath: string): Promise<void> {
    const workflow = await loadWorkflow(workflowPath);
    logger.info(`Workflow loaded (${workflow.steps.length} steps)`);

    // Validate tools before running
    this.validateTools(workflow);

    const mcpServer = this.createMcpServer();

    // Run workflow steps
    const context: Record<string, any> = {};
    let isFirstAiAgentStep = true;

    for (const step of workflow.steps) {
      logger.stepStart(step.id, step.type, step.tool);

      // Check 'if' condition
      if (step.if) {
        const condition = interpolate(step.if, context);
        if (!condition || condition === "false") {
          logger.stepSkip(step.id, "condition false");
          continue;
        }
      }

      try {
        switch (step.type) {
          case "ai_agent":
            // Extract and interpolate args for ai_agent
            const agentArgs: Record<string, any> = {};
            if (step.args) {
              for (const [k, v] of Object.entries(step.args)) {
                agentArgs[k] =
                  typeof v === "string" ? interpolate(v as string, context) : v;
              }
            }

            const fullPrompt = agentArgs.prompt || "";
            const workingDir = path.resolve(
              process.cwd(),
              agentArgs.working_dir || "."
            );

            // Write full prompt to a temp file OUTSIDE the working directory
            // to avoid Claude Code scanning it automatically
            const tempPromptFile = path.join(
              os.tmpdir(),
              `prompt_${step.id}_${Date.now()}.txt`
            );
            // Truncate prompt to ~2000 tokens (1 token ≈ 4 chars -> 8000 chars)
            const MAX_CHARS = 2000 * 4;

            await fs.writeFile(tempPromptFile, fullPrompt, "utf-8");
            logger.aiAgentPrompt(
              step.id,
              fullPrompt.length,
              fullPrompt.length > MAX_CHARS,
              tempPromptFile
            );
            let truncatedPrompt = fullPrompt.substring(0, MAX_CHARS);
            if (fullPrompt.length > MAX_CHARS) {
              truncatedPrompt += `\n\n[Note: The full prompt was truncated. I have saved the complete details to the file '${tempPromptFile}' (outside the workspace). You can read it if needed, but it is large.]`;
            }

            const result = await runAgent({
              prompt: truncatedPrompt,
              workingDirectory: workingDir,
              mcpServers: {
                "agent-tools": mcpServer,
              },
              shouldContinuePreviousSession: !isFirstAiAgentStep,
            });
            isFirstAiAgentStep = false;

            logger.aiAgentResponse(
              step.id,
              result.output.length,
              result.output.substring(0, 100)
            );
            context[step.id] = { output: result.output };
            break;

          case "tool":
            const toolName = step.tool;
            if (!toolName) throw new Error("Tool name missing");

            // Find plugin that provides this tool
            const plugin = this.plugins.find((p) =>
              p.registerTools().some((t: any) => t.name === toolName)
            );
            if (!plugin)
              throw new Error(`Plugin for tool ${toolName} not found`);

            // Interpolate args
            const args: Record<string, any> = {};
            if (step.args) {
              for (const [k, v] of Object.entries(step.args)) {
                args[k] =
                  typeof v === "string" ? interpolate(v as string, context) : v;
              }
            }

            const toolCallId = `${step.id}_${toolName}_${Date.now()}`;
            logger.toolCall(toolName, toolCallId, args);
            const toolResult = await plugin.handleToolCall(toolName, args);

            // Extract text content
            const outputText = toolResult.content
              .map((c: any) => c.text)
              .join("\n");
            logger.toolResult(
              toolName,
              toolCallId,
              outputText.length,
              outputText.substring(0, 100),
              true
            );

            // Try to parse JSON if possible for easier access
            let outputData = outputText;
            try {
              outputData = JSON.parse(outputText);
            } catch (e) {
              // ignore
            }

            context[step.id] = { output: outputData };
            // Tool result already logged above
            break;
        }

        logger.stepComplete(step.id);
      } catch (error) {
        logger.stepError(
          step.id,
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    }
  }
}
