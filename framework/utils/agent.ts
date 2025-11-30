import { query } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "url";
import path from "path";

// ESM dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AgentResult {
  output: string;
  has_issues: boolean;
}

export async function runAgent(params: {
  prompt: string;
  workingDirectory: string;
  mcpServerScript: string;
  env?: Record<string, string>;
  shouldContinuePreviousSession?: boolean;
}): Promise<AgentResult> {
  // Filter undefined values from process.env
  const cleanEnv = Object.entries(process.env).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);

  const stream = query({
    prompt: params.prompt,
    options: {
      continue: params.shouldContinuePreviousSession ?? false,
      cwd: params.workingDirectory,
      // We can use the default executable (node)
      mcpServers: {
        "internal-tools": {
          command: "npx", // Use npx to run tsx
          args: ["-y", "tsx", params.mcpServerScript],
          env: { ...cleanEnv, ...params.env },
        },
      },
      env: {
        ...cleanEnv,
        ...params.env,
      },
      // Enable all tools by default
      permissionMode: "bypassPermissions",
    },
  });

  let fullResponse = "";

  try {
    for await (const message of stream) {
      // Log messages to console to show progress
      if (message.type === "user") {
        // console.log(`[User]: ${(message.message as any).content}`);
      } else if (message.type === "assistant") {
        const content = message.message.content;
        if (Array.isArray(content)) {
          const text = content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
          console.log(`[Assistant]: ${text}`);
          fullResponse += text + "\n";
        }
      } else if (message.type === "tool_progress") {
        // console.log(`[Progress]: ...`);
      }
    }
  } catch (error) {
    console.error("[Agent] Error:", error);
    throw error;
  }

  return {
    output: fullResponse,
    // Simple heuristic: if the agent mentions "issue found" or similar, set flag.
    // In a real agent, we might want structured output.
    has_issues:
      fullResponse.toLowerCase().includes("issue found") ||
      fullResponse.toLowerCase().includes("critical"),
  };
}
