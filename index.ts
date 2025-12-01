import dotenv from "dotenv";
import path from "path";
import { Runner } from "./framework/core/runner.js";
import { logger } from "./framework/utils/logger.js";
import { credentialManager } from "./framework/services/credential-manager.js";
import { gitPlugin } from "./tools/reusable/git.js";
import { githubPlugin } from "./tools/reusable/github.js";
import { slackPlugin } from "./tools/reusable/slack.js";
import { sentryPlugin } from "./tools/agent-specific/sentry.js";

dotenv.config();

async function main() {
  // Fetch credentials from remote API
  const rawCredentials = await credentialManager.fetchCredentials();

  // Transform provider-specific credentials to env var format
  const credentials: Record<string, string> = {};
  for (const [key, cred] of Object.entries(rawCredentials)) {
    if (key === "sentry-3ehy1") {
      credentials["SENTRY_AUTH_TOKEN"] = cred.apiKey!;
    } else if (key === "slack-t09ne") {
      credentials["SLACK_BOT_TOKEN"] = cred.access_token!;
    } else if (key === "github-w0h2u") {
      credentials["GITHUB_TOKEN"] = cred.access_token!;
    }
  }

  // Create runner instance
  const runner = new Runner();

  // ============================================================================
  // AGENT-SPECIFIC PLUGIN INITIALIZATION
  // TypeScript will enforce that all required config keys are provided!
  // ============================================================================

  // Git plugin - no credentials needed (generic git operations)
  await runner.registerPlugin(gitPlugin, {});

  // GitHub plugin - requires GITHUB_TOKEN
  await runner.registerPlugin(githubPlugin, {
    GITHUB_TOKEN: credentials.GITHUB_TOKEN!,
  });

  // Slack plugin - requires SLACK_BOT_TOKEN
  await runner.registerPlugin(slackPlugin, {
    SLACK_BOT_TOKEN: credentials.SLACK_BOT_TOKEN!,
  });

  // Sentry plugin - requires SENTRY_AUTH_TOKEN
  // (org and project are passed as tool arguments in workflow.json)
  await runner.registerPlugin(sentryPlugin, {
    SENTRY_AUTH_TOKEN: credentials.SENTRY_AUTH_TOKEN!,
  });

  // ============================================================================
  // RUN WORKFLOW
  // ============================================================================

  const workflowPath = path.join(process.cwd(), "workflow.json");
  await runner.runWorkflow(workflowPath);
}

main().catch((error) => {
  process.exit(1);
});
