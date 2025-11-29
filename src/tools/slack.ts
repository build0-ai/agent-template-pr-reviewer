import { McpPlugin } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const SLACK_API_BASE = "https://slack.com/api";

export const slackPlugin: McpPlugin = {
  name: "slack",
  config: {},

  async init(config: { [key: string]: string | undefined }) {
    this.config = config;
    if (!config.SLACK_BOT_TOKEN) {
      console.warn("SLACK_BOT_TOKEN not set, Slack plugin disabled");
    }
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
    const token = this.config?.SLACK_BOT_TOKEN;
    if (!token) throw new Error("SLACK_BOT_TOKEN not configured");

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
