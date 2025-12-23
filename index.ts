import dotenv from "dotenv";
import path from "path";
import { Runner } from "./framework/core/runner.js";
import { logger } from "./framework/utils/logger.js";
import { credentialManager } from "./framework/services/credential-manager.js";
import { githubPlugin } from "./tools/reusable/github.js";

dotenv.config();

async function main() {
  // Fetch credentials from remote API
  const rawCredentials = await credentialManager.fetchCredentials();

  // Extract GitHub token from credentials
  const credentials: Record<string, string> = {};
  for (const [key, cred] of Object.entries(rawCredentials)) {
    if (key.startsWith("github-vsw4y")) {
      credentials["GITHUB_TOKEN"] = cred.access_token!;
    }
  }

  // Create runner instance
  const runner = new Runner();

  // Register GitHub plugin (the only plugin needed for PR summary)
  await runner.registerPlugin(githubPlugin, {
    GITHUB_TOKEN: credentials.GITHUB_TOKEN!,
  });

  // Parse webhook payload from environment variable
  const webhookPayload = process.env.WEBHOOK_PAYLOAD
    ? JSON.parse(process.env.WEBHOOK_PAYLOAD)
    : {};

  // Run workflow with webhook data as initial context
  const workflowPath = path.join(process.cwd(), "workflow.json");
  await runner.runWorkflow(workflowPath, { input: webhookPayload });
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
