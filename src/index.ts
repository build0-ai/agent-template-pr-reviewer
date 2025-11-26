import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadWorkflow } from './utils/workflow.js';
import { cloneRepo } from './utils/git.js';
import { ClaudeCodeRunner } from './utils/claude-code.js';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// Import your plugins here (copy them from the previous project or publish them)
// import { sentryPlugin } from './tools/sentry.js';

dotenv.config();

// ESM dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🚀 Starting Autonomous Agent Runner...");

  // 1. Load Workflow
  const workflowPath = path.join(process.cwd(), 'workflow.json');
  const workflow = await loadWorkflow(workflowPath);
  console.log(`📋 Loaded workflow: ${workflow.name}`);

  // 2. Run Steps
  const context: Record<string, any> = {};

  for (const step of workflow.steps) {
    console.log(`\n--- Step: ${step.id} (${step.type}) ---`);

    // Check 'if' condition (very simple eval for now)
    if (step.if) {
      // TODO: Implement proper variable interpolation and eval
      // For now, simple check if property exists in context
      // const shouldRun = evalCondition(step.if, context);
      // if (!shouldRun) { console.log("Skipping..."); continue; }
    }

    try {
      switch (step.type) {
        case 'system':
          if (step.action === 'clone') {
            const repoUrlEnv = workflow.target_repo.url_env;
            const repoUrl = process.env[repoUrlEnv];
            if (!repoUrl) throw new Error(`Env var ${repoUrlEnv} not set`);
            
            const targetPath = path.resolve(process.cwd(), step.path || './workspace');
            await cloneRepo(repoUrl, targetPath);
          }
          break;

        case 'claude_code':
          const runner = new ClaudeCodeRunner({
            workingDirectory: path.resolve(process.cwd(), step.working_dir || '.'),
            headless: true,
            mcpServerScript: path.join(__dirname, 'mcp-server.ts') // Point to internal MCP server
          });
          
          const result = await runner.run({
            prompt: step.prompt || "",
            context: context
          });
          
          context[step.id] = { output: result };
          break;

        case 'tool':
          console.log(`[Tool] Executing ${step.tool}...`);
          // Here you would invoke the MCP tool directly or via the server
          break;
      }
    } catch (error) {
      console.error(`❌ Step ${step.id} failed:`, error);
      process.exit(1);
    }
  }

  console.log("\n✅ Workflow completed successfully.");
}

main().catch(console.error);

