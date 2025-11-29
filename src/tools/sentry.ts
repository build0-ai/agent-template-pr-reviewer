import { McpPlugin } from "../types.js";
import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const SENTRY_API_BASE = "https://sentry.io/api/0";

export const sentryPlugin: McpPlugin = {
  name: "sentry",
  config: {},

  async init(config: { [key: string]: string | undefined }) {
    this.config = config;
    if (!config.SENTRY_AUTH_TOKEN) {
      console.warn("SENTRY_AUTH_TOKEN not set, Sentry plugin disabled");
    }
  },

  registerTools(): Tool[] {
    const tools: Tool[] = [
      {
        name: "sentry_get_issues",
        description: "Get unresolved issues from Sentry",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of issues to fetch" },
          },
        },
      },
      {
        name: "sentry_get_issue_details",
        description: "Get comprehensive details for a specific issue",
        inputSchema: {
          type: "object",
          properties: {
            issue_id: { type: "string", description: "The issue ID" },
          },
          required: ["issue_id"],
        },
      },
    ];
    return tools;
  },

  async handleToolCall(name, args) {
    const token = this.config?.SENTRY_AUTH_TOKEN;
    const org = this.config?.SENTRY_ORG;
    const project = this.config?.SENTRY_PROJECT;

    if (!token || !org || !project) {
      throw new Error(
        "Missing Sentry configuration (SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT)"
      );
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    if (name === "sentry_get_issues") {
      const limit = args.limit || 1;
      const url = `${SENTRY_API_BASE}/projects/${org}/${project}/issues/?query=is:unresolved&sort=freq&limit=${limit}`;

      console.log(`[Sentry] Fetching issues from: ${url}`);

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `Sentry API error: ${response.statusText} (URL: ${url})`
        );
      }

      const issues = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(issues, null, 2) }],
      };
    }

    if (name === "sentry_get_issue_details") {
      const issueId = args.issue_id as string;
      // Fetch issue details
      const response = await fetch(`${SENTRY_API_BASE}/issues/${issueId}/`, {
        headers,
      });
      if (!response.ok)
        throw new Error(
          `Failed to fetch issue details: ${response.statusText}`
        );
      const details = await response.json();

      // Fetch latest event for stacktrace
      const eventsResponse = await fetch(
        `${SENTRY_API_BASE}/issues/${issueId}/events/latest/`,
        { headers }
      );
      let latestEvent: any = {};
      if (eventsResponse.ok) {
        const fullEvent = await eventsResponse.json();

        // Construct a minimal event summary
        latestEvent = {
          event_id: fullEvent.event_id,
          message: fullEvent.message,
          // Extract only the first (most recent) exception value if available
          exception_values: fullEvent.exception?.values?.map((v: any) => ({
            type: v.type,
            value: v.value,
            stacktrace: v.stacktrace
              ? {
                  // Limit to top 5 frames
                  frames: v.stacktrace.frames?.slice(-5),
                }
              : undefined,
          })),
          breadcrumbs: fullEvent.entries
            ?.filter((e: any) => e.type === "breadcrumbs")
            ?.slice(-5), // Last 5 breadcrumbs
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                issue: {
                  id: details.id,
                  title: details.title,
                  shortId: details.shortId,
                  culprit: details.culprit,
                  metadata: details.metadata,
                  project: {
                    id: details.project.id,
                    slug: details.project.slug,
                  },
                  lastSeen: details.lastSeen,
                  firstSeen: details.firstSeen,
                },
                latest_event: latestEvent,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  },
};
