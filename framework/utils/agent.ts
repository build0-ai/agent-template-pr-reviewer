import {
  McpSdkServerConfigWithInstance,
  query,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

export interface AgentResult {
  output: string;
}

export async function runAgent(params: {
  prompt: string;
  workingDirectory: string;
  mcpServers: Record<string, McpSdkServerConfigWithInstance>;
  shouldContinuePreviousSession?: boolean;
}): Promise<AgentResult> {
  // Capture stderr to see actual errors from Claude Code process
  const stderrMessages: string[] = [];
  const stderrCallback = (message: string) => {
    stderrMessages.push(message);
    console.error(`[Claude Code stderr]: ${message}`);
  };

  const stream = query({
    prompt: params.prompt,
    options: {
      continue: params.shouldContinuePreviousSession ?? false,
      cwd: params.workingDirectory,
      // We can use the default executable (node)
      mcpServers: params.mcpServers,
      // Enable all tools by default
      permissionMode: "bypassPermissions",
      stderr: stderrCallback,
    },
  });

  let finalResult: SDKResultMessage | null = null;

  try {
    for await (const message of stream) {
      if (message.type !== "user") {
        console.log(`[Claude Agent]: ${JSON.stringify(message)}`);
      }
      if (message.type === "result") {
        finalResult = message;
      }
    }
  } catch (error) {
    console.error("[Claude Agent] Error:", error);
    if (stderrMessages.length > 0) {
      console.error("[Claude Agent] stderr output:", stderrMessages.join("\n"));
    }
    throw error;
  }

  if (finalResult) {
    if (finalResult.subtype === "success") {
      return {
        output: finalResult.result,
      };
    } else {
      throw new Error(
        `Error: ${finalResult.subtype}. Message: ${JSON.stringify(
          finalResult.errors,
          null,
          2
        )}`
      );
    }
  }

  throw new Error("No final result received");
}
