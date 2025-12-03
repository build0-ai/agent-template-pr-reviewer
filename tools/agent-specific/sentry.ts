/**
 * AGENT-SPECIFIC TOOL: Sentry Plugin
 *
 * This tool is specific to the Sentry fix agent use case.
 * It provides Sentry issue tracking and fetching functionality.
 *
 * To reuse this in a different agent, modify the SENTRY_API_BASE or make it configurable.
 */

import {
  McpPlugin,
  BasePluginConfig,
  ToolDefinition,
} from "../../framework/core/types.js";
import { logger } from "../../framework/utils/logger.js";
import { z } from "zod";

const SENTRY_API_BASE = "https://sentry.io/api/0";

/**
 * Sentry plugin config.
 * Only SENTRY_AUTH_TOKEN is needed for authentication.
 * SENTRY_ORG and SENTRY_PROJECT are passed as tool arguments.
 */
interface SentryPluginConfig extends BasePluginConfig {
  SENTRY_AUTH_TOKEN: string;
}

export const sentryPlugin: McpPlugin<SentryPluginConfig> = {
  name: "sentry",
  config: {} as SentryPluginConfig,

  async init(config: SentryPluginConfig): Promise<void> {
    if (!config.SENTRY_AUTH_TOKEN) {
      throw new Error("Sentry plugin requires SENTRY_AUTH_TOKEN credential");
    }
    this.config = config;
  },

  registerTools(): ToolDefinition[] {
    return [
      {
        name: "sentry_get_issues",
        description: "Get unresolved issues from Sentry",
        zodSchema: z.object({
          org: z.string().describe("Sentry organization slug"),
          project: z.string().describe("Sentry project slug"),
          limit: z.number().optional().describe("Number of issues to fetch"),
        }),
      },
      {
        name: "sentry_get_issue_details",
        description: "Get comprehensive details for a specific issue",
        zodSchema: z.object({
          issue_id: z.string().describe("The issue ID"),
        }),
      },
    ];
  },

  async handleToolCall(name, args) {
    // Token is guaranteed to exist due to init() validation
    const token = this.config?.SENTRY_AUTH_TOKEN;
    if (!token) {
      throw new Error("Sentry plugin not initialized");
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    if (name === "sentry_get_issues") {
      const {
        org,
        project,
        limit = 1,
      } = args as {
        org: string;
        project: string;
        limit?: number;
      };

      const url = `${SENTRY_API_BASE}/projects/${org}/${project}/issues/?query=is:unresolved&sort=freq&limit=${limit}`;

      logger.info(`Fetching issues from from url ${url}`);
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
