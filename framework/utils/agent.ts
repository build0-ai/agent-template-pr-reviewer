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
  const stream = query({
    prompt: params.prompt,
    options: {
      continue: params.shouldContinuePreviousSession ?? false,
      cwd: params.workingDirectory,
      // We can use the default executable (node)
      mcpServers: params.mcpServers,
      // Enable all tools by default
      permissionMode: "bypassPermissions",
    },
  });

  let finalResult: SDKResultMessage | null = null;

  try {
    for await (const message of stream) {
      console.log(`[Claude Agent]: ${JSON.stringify(message)}`);
      if (message.type === "result") {
        finalResult = message;
      }
    }
  } catch (error) {
    console.error("[Claude Agent] Error:", error);
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
