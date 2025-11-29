import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { fileURLToPath } from "url";
import { loadWorkflow } from "./utils/workflow.js";
import { cloneRepo } from "./utils/git.js";
import { runAgent } from "./utils/agent.js";
import { sentryPlugin } from "./tools/sentry.js";
import { slackPlugin } from "./tools/slack.js";
import { diagnosticsPlugin } from "./tools/diagnostics.js";
import { githubPlugin } from "./tools/github.js";
import { fetchAndDecryptCredentials } from "./utils/credentials.js";

dotenv.config();

// ESM dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const plugins = [sentryPlugin, slackPlugin, diagnosticsPlugin, githubPlugin];

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

async function main() {
  console.log("🚀 Starting Autonomous Agent Runner...");

  // 0. Fetch Credentials
  let config: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };
  try {
    const remoteCredentials = await fetchAndDecryptCredentials();
    config = { ...config, ...remoteCredentials };
    // Hardcoded configuration
    config["SENTRY_ORG"] = "build0";
    config["SENTRY_PROJECT"] = "platfom";
    console.log("✅ Loaded remote credentials");
  } catch (error) {
    console.warn(
      "⚠️ Failed to load remote credentials, falling back to local env:",
      error
    );
  }

  // Initialize plugins
  for (const plugin of plugins) {
    await plugin.init(config);
  }

  // 1. Load Workflow
  const workflowPath = path.join(process.cwd(), "workflow.json");
  const workflow = await loadWorkflow(workflowPath);
  console.log(`📋 Loaded workflow: ${workflow.name}`);

  // 2. Run Steps
  const context: Record<string, any> = {};

  let isFirstAiAgentStep = true;

  for (const step of workflow.steps) {
    console.log(`\n--- Step: ${step.id} (${step.type}) ---`);

    // Check 'if' condition
    if (step.if) {
      // Very simple eval: check if the interpolated string is "true" or non-empty
      const condition = interpolate(step.if, context);
      if (!condition || condition === "false") {
        console.log(`Skipping step ${step.id} (condition false)`);
        continue;
      }
    }

    try {
      switch (step.type) {
        case "system":
          if (step.action === "clone") {
            // Hardcoded target repo URL as per instructions
            const repoUrl = "https://github.com/build0-ai/platform.git";

            const targetPath = path.resolve(
              process.cwd(),
              step.path || "./workspace"
            );
            await cloneRepo(repoUrl, targetPath);
          }
          break;

        case "ai_agent":
          const fullPrompt = interpolate(step.prompt || "", context);
          const workingDir = path.resolve(
            process.cwd(),
            step.working_dir || "."
          );

          // 1. Write full prompt to a temp file
          const tempPromptFile = path.join(workingDir, `prompt_${step.id}.txt`);
          await fs.writeFile(tempPromptFile, fullPrompt, "utf-8");
          console.log(`[AI Agent] Full prompt written to ${tempPromptFile}`);

          // 2. Truncate prompt to ~2000 tokens (1 token ≈ 4 chars -> 8000 chars)
          const MAX_CHARS = 2000 * 4;
          let truncatedPrompt = fullPrompt.substring(0, MAX_CHARS);
          if (fullPrompt.length > MAX_CHARS) {
            truncatedPrompt += `\n\n[Note: The full prompt was truncated. I have saved the complete details to the file '${path.basename(
              tempPromptFile
            )}' in the current directory. Please read it to get the full context.]`;
          }

          // Use runAgent wrapper for Claude Agent SDK
          const result = await runAgent({
            prompt: truncatedPrompt,
            workingDirectory: workingDir,
            mcpServerScript: path.join(__dirname, "mcp-server.ts"),
            env: config, // Pass the merged config including remote credentials
            shouldContinuePreviousSession: !isFirstAiAgentStep,
          });
          isFirstAiAgentStep = false;

          console.log(
            `[AI Agent] Prompt (truncated): ${truncatedPrompt.substring(
              0,
              200
            )}...`
          );
          console.log(
            `[AI Agent] Output: ${result.output.substring(0, 100)}...`
          );
          context[step.id] = {
            output: result.output,
            has_issues: result.has_issues,
          };
          break;

        case "tool":
          const toolName = step.tool;
          if (!toolName) throw new Error("Tool name missing");
          const plugin = plugins.find((p) =>
            p.registerTools().some((t) => t.name === toolName)
          );
          if (!plugin) throw new Error(`Plugin for tool ${toolName} not found`);

          // Interpolate args
          const args: Record<string, any> = {};
          if (step.args) {
            for (const [k, v] of Object.entries(step.args)) {
              args[k] =
                typeof v === "string" ? interpolate(v as string, context) : v;
            }
          }

          console.log(`[Tool] Executing ${toolName}...`);
          const toolResult = await plugin.handleToolCall(toolName, args);

          // Extract text content
          const outputText = toolResult.content.map((c) => c.text).join("\n");
          console.log(`[Tool] Result: ${outputText.substring(0, 100)}...`);

          // Try to parse JSON if possible for easier access
          let outputData = outputText;
          try {
            outputData = JSON.parse(outputText);
          } catch (e) {
            // ignore
          }

          context[step.id] = { output: outputData };
          console.log(
            `[Tool] Output data: ${JSON.stringify(
              outputData,
              null,
              2
            ).substring(0, 500)}...`
          );
          break;
      }
    } catch (error) {
      console.error(`❌ Step ${step.id} failed:`, error);
      process.exit(1);
    }
  }

  console.log("\n✅ Workflow completed successfully.");
}

main().catch(console.error);
