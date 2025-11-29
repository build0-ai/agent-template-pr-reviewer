import { McpPlugin } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

export const githubPlugin: McpPlugin = {
  name: "github",
  config: {},

  async init(config: { [key: string]: string | undefined }) {
    this.config = config;
    if (!config.GITHUB_TOKEN) {
      console.warn("GITHUB_TOKEN not set, GitHub plugin disabled");
    }
  },

  registerTools(): Tool[] {
    return [
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
    const token = this.config?.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN not configured");

    const octokit = new Octokit({ auth: token });

    if (name === "github_create_pr") {
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

      console.log(`[GitHub] Creating PR in ${owner}/${repo}: ${title}`);

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


