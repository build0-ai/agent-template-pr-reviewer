/**
 * REUSABLE TOOL: Slack Plugin
 *
 * This tool can be shared across multiple agents for Slack integration.
 * Provides messaging and approval-waiting functionality, easily extractable to a separate package.
 */

import { McpPlugin, BasePluginConfig } from "../../framework/core/types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const SLACK_API_BASE = "https://slack.com/api";

/**
 * Slack plugin config.
 * SLACK_BOT_TOKEN is required for Slack operations.
 */
interface SlackPluginConfig extends BasePluginConfig {
  SLACK_BOT_TOKEN: string;
}

export const slackPlugin: McpPlugin<SlackPluginConfig> = {
  name: "slack",
  config: {} as SlackPluginConfig,

  async init(config: SlackPluginConfig): Promise<void> {
    if (!config.SLACK_BOT_TOKEN) {
      throw new Error("Slack plugin requires SLACK_BOT_TOKEN credential");
    }
    this.config = config;
  },

  registerTools(): Tool[] {
    const tools: Tool[] = [
      {
        name: "slack_post_message",
        description: "Post a message to a Slack channel",
        inputSchema: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Channel ID" },
            text: { type: "string", description: "Message text" },
          },
          required: ["channel", "text"],
        },
      },
      {
        name: "slack_wait_approval",
        description: "Wait for approval (✅ reaction) on a message",
        inputSchema: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Channel ID" },
            message_ts: {
              type: "string",
              description: "Timestamp of the message to monitor",
            },
            timeout_mins: { type: "number", description: "Timeout in minutes" },
          },
          required: ["channel", "message_ts"],
        },
      },
    ];
    return tools;
  },

  async handleToolCall(name, args) {
    // Token is guaranteed to exist due to init() validation
    const token = this.config!.SLACK_BOT_TOKEN!;

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    if (name === "slack_post_message") {
      const { channel, text } = args as { channel: string; text: string };
      const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
        method: "POST",
        headers,
        body: JSON.stringify({ channel, text }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(`Slack API error: ${result.error}`);

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    if (name === "slack_wait_approval") {
      const {
        channel,
        message_ts,
        timeout_mins = 10,
      } = args as {
        channel: string;
        message_ts: string;
        timeout_mins?: number;
      };
      const startTime = Date.now();
      const timeout = timeout_mins * 60 * 1000;

      console.log(
        `Waiting for approval on message ${message_ts} in channel ${channel}...`
      );

      while (Date.now() - startTime < timeout) {
        console.log(`[Slack] Polling reactions for message ${message_ts}...`);
        // Check reactions
        const response = await fetch(
          `${SLACK_API_BASE}/reactions.get?channel=${channel}&timestamp=${message_ts}`,
          {
            headers,
          }
        );
        const result = await response.json();

        if (result.ok && result.message && result.message.reactions) {
          console.log(
            `[Slack] Reactions found: ${JSON.stringify(
              result.message.reactions.map((r: any) => r.name)
            )}`
          );
          const approved = result.message.reactions.some(
            (r: any) => r.name === "white_check_mark" || r.name === "check"
          );
          if (approved) {
            console.log("[Slack] Approval received!");
            return {
              content: [{ type: "text", text: "Approved" }],
            };
          }
        } else if (!result.ok) {
          console.warn(`[Slack] Failed to get reactions: ${result.error}`);
        } else {
          console.log("[Slack] No reactions found yet.");
        }

        // Wait 5 seconds
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      throw new Error("Timed out waiting for approval");
    }

    throw new Error(`Unknown tool: ${name}`);
  },
};
