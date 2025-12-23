/**
 * REUSABLE TOOL: GitHub Plugin
 *
 * This tool can be shared across multiple agents that need GitHub integration.
 * It provides PR creation and authenticated cloning functionality.
 * Can easily be extracted to a separate package.
 */

import {
  McpPlugin,
  BasePluginConfig,
  ToolDefinition,
} from "../../framework/core/types.js";
import { Octokit } from "@octokit/rest";
import { simpleGit } from "simple-git";
import fs from "fs/promises";
import { logger } from "../../framework/utils/logger.js";
import { z } from "zod";

/**
 * GitHub plugin config.
 * GITHUB_TOKEN is required for authenticated operations.
 */
interface GitHubPluginConfig extends BasePluginConfig {
  GITHUB_TOKEN: string;
}

const githubCloneSchema = z.object({
  repo_url: z
    .string()
    .describe(
      "REQUIRED: The full URL of the repository (e.g. https://github.com/owner/repo or https://github.com/owner/repo.git)"
    ),
  target_dir: z.string().describe("The target directory to clone into"),
});

const githubCreatePrSchema = z.object({
  title: z.string().describe("PR Title (REQUIRED)"),
  body: z.string().optional().describe("PR Description (optional)"),
  head: z
    .string()
    .describe(
      "REQUIRED: The name of the branch where your changes are implemented (e.g. 'feature-branch')"
    ),
  base: z
    .string()
    .describe(
      "REQUIRED: The name of the branch you want the changes pulled into (e.g. 'main' or 'master')"
    ),
  repo_url: z
    .string()
    .describe(
      "REQUIRED: The full URL of the repository (e.g. https://github.com/owner/repo or https://github.com/owner/repo.git)"
    ),
});

const githubGetPrSchema = z.object({
  owner: z.string().describe("Repository owner (e.g., 'facebook')"),
  repo: z.string().describe("Repository name (e.g., 'react')"),
  pr_number: z.number().describe("Pull request number"),
});

const githubCommentPrSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  pr_number: z.number().describe("Pull request number"),
  body: z.string().describe("Comment body (supports markdown)"),
});

export const githubPlugin: McpPlugin<GitHubPluginConfig> = {
  name: "github",
  config: {} as GitHubPluginConfig,

  async init(config: GitHubPluginConfig): Promise<void> {
    if (!config.GITHUB_TOKEN) {
      throw new Error("GitHub plugin requires GITHUB_TOKEN credential");
    }
    this.config = config;
  },

  registerTools(): ToolDefinition[] {
    return [
      {
        name: "github_clone",
        description: "Clone a GitHub repository with authentication",
        zodSchema: githubCloneSchema,
      },
      {
        name: "github_create_pr",
        description:
          "Create a GitHub Pull Request. REQUIRED parameters: title (string), head (string - branch name), base (string - target branch), repo_url (string - full GitHub URL). Optional: body (string - PR description).",
        zodSchema: githubCreatePrSchema,
      },
      {
        name: "github_get_pr",
        description:
          "Get comprehensive details about a pull request including title, body, diff, and files changed.",
        zodSchema: githubGetPrSchema,
      },
      {
        name: "github_comment_pr",
        description: "Post a comment on a pull request (supports markdown).",
        zodSchema: githubCommentPrSchema,
      },
    ];
  },

  async handleToolCall(name, args) {
    if (name === "github_clone") {
      const { repo_url, target_dir } = githubCloneSchema.parse(args);

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
      const { title, body, head, base, repo_url } =
        githubCreatePrSchema.parse(args);

      // Parse owner and repo from URL
      // Supports: https://github.com/owner/repo.git or https://github.com/owner/repo
      const match = repo_url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (!match) {
        throw new Error(
          `Invalid GitHub URL: ${repo_url}. Expected format: https://github.com/owner/repo or https://github.com/owner/repo.git`
        );
      }

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

    if (name === "github_get_pr") {
      const token = this.config!.GITHUB_TOKEN!;
      const octokit = new Octokit({ auth: token });
      const { owner, repo, pr_number } = githubGetPrSchema.parse(args);

      logger.info(`Fetching PR #${pr_number} from ${owner}/${repo}`);

      // Get PR details
      const pr = await octokit.pulls.get({
        owner,
        repo,
        pull_number: pr_number,
      });

      // Get files changed
      const files = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: pr_number,
        per_page: 100,
      });

      // Get the diff
      const diffResponse = await octokit.pulls.get({
        owner,
        repo,
        pull_number: pr_number,
        mediaType: { format: "diff" },
      });
      const diff = (diffResponse.data as unknown as string).substring(0, 50000);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                number: pr.data.number,
                title: pr.data.title,
                body: pr.data.body,
                state: pr.data.state,
                user: pr.data.user?.login,
                additions: pr.data.additions,
                deletions: pr.data.deletions,
                changed_files: pr.data.changed_files,
                files: files.data.map((f) => ({
                  filename: f.filename,
                  status: f.status,
                  additions: f.additions,
                  deletions: f.deletions,
                  patch: f.patch?.substring(0, 2000),
                })),
                diff,
                html_url: pr.data.html_url,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "github_comment_pr") {
      const token = this.config!.GITHUB_TOKEN!;
      const octokit = new Octokit({ auth: token });
      const { owner, repo, pr_number, body } = githubCommentPrSchema.parse(args);

      logger.info(`Posting comment on PR #${pr_number} in ${owner}/${repo}`);

      const response = await octokit.issues.createComment({
        owner,
        repo,
        issue_number: pr_number,
        body,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                comment_id: response.data.id,
                comment_url: response.data.html_url,
                created_at: response.data.created_at,
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
