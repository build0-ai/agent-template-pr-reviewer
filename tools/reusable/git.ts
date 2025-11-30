/**
 * REUSABLE TOOL: Git Plugin
 *
 * This tool can be shared across multiple agents for generic Git operations.
 * Provides repository cloning functionality.
 *
 * Note: Authentication should be handled by the caller by injecting credentials
 * into the URL (e.g., https://token@github.com/owner/repo.git) or using git
 * credentials/SSH keys configured in the environment.
 */

import { McpPlugin, BasePluginConfig } from "../../framework/core/types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { simpleGit } from "simple-git";
import fs from "fs/promises";

/**
 * Git plugin config.
 * Git operations don't require credentials - authentication is handled by the caller
 * by injecting credentials into the URL or using SSH keys.
 */
interface GitPluginConfig extends BasePluginConfig {}

export const gitPlugin: McpPlugin<GitPluginConfig> = {
  name: "git",
  config: {} as GitPluginConfig,

  async init(config: GitPluginConfig): Promise<void> {
    this.config = config;
  },

  registerTools(): Tool[] {
    return [
      {
        name: "git_clone",
        description: "Clone a Git repository",
        inputSchema: {
          type: "object",
          properties: {
            repo_url: {
              type: "string",
              description: "The repository URL to clone (can include credentials)",
            },
            target_dir: {
              type: "string",
              description: "The target directory to clone into",
            },
          },
          required: ["repo_url", "target_dir"],
        },
      },
    ];
  },

  async handleToolCall(name, args) {
    if (name === "git_clone") {
      const { repo_url, target_dir } = args as {
        repo_url: string;
        target_dir: string;
      };

      console.log(`[Git] Cloning ${repo_url} to ${target_dir}...`);

      // Ensure directory exists (or clean it)
      try {
        await fs.rm(target_dir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(target_dir, { recursive: true });

      const git = simpleGit();
      await git.clone(repo_url, target_dir);
      console.log(`[Git] Clone complete.`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              repo_url,
              target_dir,
              status: "success",
            }),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  },
};
