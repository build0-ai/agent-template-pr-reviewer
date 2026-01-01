# PR Reviewer Agent

AI-powered code reviewer that automatically reviews pull requests using Claude.

## Features

- **Comprehensive Code Review**: Analyzes PRs for bugs, security issues, performance problems, and code quality
- **Line-Specific Comments**: Posts review comments on specific lines of code, just like a human reviewer
- **Continuous Monitoring**: Polls for new commits and comments, responding to author feedback
- **Context-Aware**: Clones the full repository to understand codebase patterns and conventions
- **Structured Output**: Uses Claude Agent SDK with Zod schemas for type-safe, reliable reviews

## How It Works

1. **Trigger**: Webhook fires when a PR is opened or new commits are pushed
2. **Clone**: Agent clones the repository and checks out the PR branch
3. **Review**: Claude analyzes the changes with full codebase context
4. **Post**: Review is posted to GitHub with line-specific comments
5. **Monitor**: Agent polls every 5 minutes for new activity
6. **Respond**: Replies to author comments and acknowledges new commits
7. **Re-review**: Performs full re-review when significant changes are detected

## Required Integrations

### GitHub
- **Scope**: `repo` (read/write access to repositories)
- **Purpose**: Clone repos, read PR data, post reviews and comments

### Anthropic
- **API Key**: Required for Claude Agent SDK
- **Purpose**: AI-powered code analysis and review generation

## Webhook Configuration

Configure your GitHub repository webhook:

| Setting | Value |
|---------|-------|
| **Payload URL** | Your agent webhook URL |
| **Content type** | `application/json` |
| **Events** | `Pull requests` |
| **Actions** | `opened`, `synchronize` |

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    INITIAL REVIEW                       │
├─────────────────────────────────────────────────────────┤
│  clone-repo → install-deps → initial-review → post      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    POLLING LOOP                         │
├─────────────────────────────────────────────────────────┤
│  poll-wait (5 min)                                      │
│      ↓                                                  │
│  check-pr-status → if closed, end                       │
│      ↓                                                  │
│  check-new-commits                                      │
│      ↓                                                  │
│  check-new-comments                                     │
│      ↓                                                  │
│  respond-to-activity → re-review if needed              │
│      ↓                                                  │
│  loop-back → goto poll-wait                             │
└─────────────────────────────────────────────────────────┘
```

## Review Output

The agent produces structured reviews with:

```typescript
{
  summary: "Overall review summary",
  decision: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  comments: [
    {
      path: "src/auth.ts",
      line: 42,
      body: "Consider adding input validation here...",
      severity: "warning"
    }
  ]
}
```

## Credentials

| Name | Field | Description |
|------|-------|-------------|
| `github` | `access_token` | GitHub personal access token or OAuth token |
| `anthropic` | `api_key` | Anthropic API key for Claude |

## Limitations

- **Diff size**: Large diffs are truncated to 100KB for context window limits
- **Bot detection**: Automatically skips PRs from bots (dependabot, renovate, etc.)
- **Polling duration**: Runs up to 7 days (workflow timeout limit)
- **Rate limits**: Subject to GitHub and Anthropic API rate limits

## Development

```bash
# Install dependencies
npm install

# Run review manually (requires env vars)
npm run review

# Run respond manually (requires env vars)
npm run respond
```

## File Structure

```
├── workflow.json          # Workflow orchestration
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── src/
│   ├── schemas.ts         # Zod schemas for structured outputs
│   ├── github.ts          # GitHub API helpers
│   ├── review.ts          # Initial review script
│   └── respond.ts         # Response to activity script
└── README.md
```

## License

MIT
