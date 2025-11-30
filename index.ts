import dotenv from "dotenv";
import path from "path";
import { Runner } from "./framework/core/runner.js";
import { credentialManager } from "./framework/services/credential-manager.js";
import { gitPlugin } from "./tools/reusable/git.js";
import { githubPlugin } from "./tools/reusable/github.js";
import { slackPlugin } from "./tools/reusable/slack.js";
import { sentryPlugin } from "./tools/agent-specific/sentry.js";

dotenv.config();

async function main() {
  console.log("🚀 Starting Autonomous Agent Runner...");

  // Fetch credentials from remote API
  await credentialManager.fetchCredentials();
  const credentials = credentialManager.getCredentials();
  console.log("✅ Credentials loaded");

  // Create runner instance
  const runner = new Runner();

  // Pass credentials to runner (for MCP server subprocess)
  runner.setCredentials(credentials);

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

main().catch(console.error);
