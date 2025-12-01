/**
 * REUSABLE TOOL: GitHub Plugin
 *
 * This tool can be shared across multiple agents that need GitHub integration.
 * It provides PR creation and authenticated cloning functionality.
 * Can easily be extracted to a separate package.
 */

import { McpPlugin, BasePluginConfig } from "../../framework/core/types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";
import { simpleGit } from "simple-git";
import fs from "fs/promises";
import { logger } from "../../framework/utils/logger.js";

/**
 * GitHub plugin config.
 * GITHUB_TOKEN is required for authenticated operations.
 */
interface GitHubPluginConfig extends BasePluginConfig {
  GITHUB_TOKEN: string;
}

export const githubPlugin: McpPlugin<GitHubPluginConfig> = {
  name: "github",
  config: {} as GitHubPluginConfig,

  async init(config: GitHubPluginConfig): Promise<void> {
    if (!config.GITHUB_TOKEN) {
      throw new Error("GitHub plugin requires GITHUB_TOKEN credential");
    }
    this.config = config;
  },

  registerTools(): Tool[] {
    return [
      {
        name: "github_clone",
        description: "Clone a GitHub repository with authentication",
        inputSchema: {
          type: "object",
          properties: {
            repo_url: {
              type: "string",
              description:
                "The GitHub repository URL (e.g. https://github.com/owner/repo or https://github.com/owner/repo.git)",
            },
            target_dir: {
              type: "string",
              description: "The target directory to clone into",
            },
          },
          required: ["repo_url", "target_dir"],
        },
      },
      {
        name: "github_create_pr",
        description: "Create a GitHub Pull Request",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "PR Title" },
            body: { type: "string", description: "PR Description" },
            head: {
              type: "string",
              description:
                "The name of the branch where your changes are implemented",
            },
            base: {
              type: "string",
              description:
                "The name of the branch you want the changes pulled into",
            },
            repo_url: {
              type: "string",
              description:
                "The full URL of the repository (e.g. https://github.com/owner/repo)",
            },
          },
          required: ["title", "head", "base", "repo_url"],
        },
      },
    ];
  },

  async handleToolCall(name, args) {
    if (name === "github_clone") {
      const { repo_url, target_dir } = args as {
        repo_url: string;
        target_dir: string;
      };

      logger.info(`Cloning repository ${repo_url} into ${target_dir}`);

      // Inject GitHub token into URL
      // Format: https://<token>@github.com/owner/repo.git
      // Token is guaranteed to exist due to init() validation
      const token = this.config!.GITHUB_TOKEN!;
      const authenticatedUrl = repo_url.replace(
        /https:\/\/(github\.com\/)/,
        `https://${token}@$1`
      );

      // Ensure directory exists (or clean it)
      try {
        await fs.rm(target_dir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(target_dir, { recursive: true });

      const git = simpleGit();
      await git.clone(authenticatedUrl, target_dir);

      logger.info(`Successfully cloned ${repo_url} into ${target_dir}`);

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

    if (name === "github_create_pr") {
      // Token is guaranteed to exist due to init() validation
      const token = this.config!.GITHUB_TOKEN!;
      const octokit = new Octokit({ auth: token });
      const { title, body, head, base, repo_url } = args as {
        title: string;
        body?: string;
        head: string;
        base: string;
        repo_url: string;
      };

      // Parse owner and repo from URL
      // Supports: https://github.com/owner/repo.git or https://github.com/owner/repo
      const match = repo_url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (!match) throw new Error(`Invalid GitHub URL: ${repo_url}`);

      const owner = match[1];
      const repo = match[2];

      const response = await octokit.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pr_url: response.data.html_url,
                number: response.data.number,
                state: response.data.state,
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
