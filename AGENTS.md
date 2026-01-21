# PR Reviewer Agent Template

A Build0 workflow template for AI-powered GitHub PR review. Fork this template to create your own automated code review agent.

## Project Structure

```
.
├── workflow.json          # Main workflow orchestration (start here)
├── package.json           # Node.js dependencies (pnpm)
├── tsconfig.json          # TypeScript configuration
├── src/
│   ├── schemas.ts         # Zod schemas for structured AI outputs
│   ├── github.ts          # GitHub API helper functions
│   ├── review.ts          # Review script (generates + posts review)
│   └── respond.ts         # Response script (handles comments)
└── AGENTS.md              # This file
```

## How It Works

### Workflow Steps (10 total)

1. **clone-repo** - Clone repository and checkout PR branch
2. **fetch-pr-data** - Fetch PR files and diff as JSON
3. **generate-review** - Run AI review and post to GitHub
4. **save-checkpoint** - Save timestamp and commit SHA (loop target)
5. **poll-wait** - Wait 30 seconds
6. **check-pr-status** - Check if PR is still open (exits loop if closed)
7. **check-activity** - Check for new commits and comments
8. **respond-to-activity** - Respond to comments, acknowledge commits (conditional)
9. **do-re-review** - Full re-review if needed (conditional)
10. **is-review-completed** - Loop back to save-checkpoint if PR still open

### Flow Diagram

```
clone-repo → fetch-pr-data → generate-review → save-checkpoint
                                                     ↓
                    ┌────────────────────────── poll-wait
                    ↓                                ↓
            is-review-completed ← do-re-review ← respond-to-activity ← check-activity ← check-pr-status
                    │                                                                          │
                    │ (if PR closed)                                            (if PR closed) │
                    ↓                                                                          ↓
                  [end]                                                                      [end]
```

## Key Files

### `workflow.json`

The workflow orchestration file. Each step has:

- `id`: Unique identifier for referencing step outputs
- `type`: `command` (shell) or `sleep`
- `command`: Shell command to execute
- `params`: User-configurable values (editable in UI), available via `{{ params.key }}`
- `env`: Environment variables passed to shell (can reference `credentials`)
- `if`: Conditional execution (JavaScript expression)
- `onError`/`onErrorGoto`: Error handling and flow control

Template syntax inside `{{ }}` is JavaScript-based:

```javascript
{{ input.pull_request.number }}                    // Webhook input
{{ steps['step-id'].output }}                      // Previous step output
{{ JSON.parse(steps['step-id'].output).key }}      // Parse JSON output
{{ steps['a']?.output || steps['b'].output }}      // Fallback syntax
{{ credentials['name'].field }}                    // Credentials (env only)
{{ params.prompt }}                                // Step params
{{ input.title.toUpperCase() }}                    // Method calls
{{ input.count + 1 }}                              // Arithmetic
{{ input.ready ? 'yes' : 'no' }}                   // Ternary
```

### `src/schemas.ts`

Zod schemas for structured AI outputs:

- `ReviewSchema`: PR review (summary, decision, line comments)
- `ResponseSchema`: Activity response (replies, general comment, re-review flag)

### `src/review.ts`

Runs AI review and posts to GitHub:

1. Receives prompt via `PROMPT` env var
2. Calls Claude Agent SDK with structured output
3. Posts review to GitHub via `postReview()`

### `src/respond.ts`

Handles PR activity (comments, commits):

1. Receives activity data via env vars
2. Calls Claude Agent SDK to formulate responses
3. Posts replies to comments
4. Outputs `re-review` if full re-review needed

### `src/github.ts`

GitHub API helpers:

- `postReview()`: Post a PR review with line-specific comments
- `replyToComment()`: Reply to an existing review comment
- `postComment()`: Post a general PR comment

## Review Behavior

### Concise Reviews

Reviews are designed to be short and actionable:

- **Summary**: 2-3 sentences max - what the PR does and if it's ready to merge
- **Comments**: Only flag issues that matter (bugs, security, broken logic)
- **No nitpicks**: Style preferences and trivial observations are excluded

### Comment Severity Levels

| Severity | Use for |
|----------|---------|
| `critical` | Bugs, security vulnerabilities, broken logic |
| `warning` | Issues that should be addressed |
| `suggestion` | Meaningful improvements (not required) |

### Inline Comment Posting

Comments are posted inline at the specific line of code when possible:

1. **Batch attempt**: Try posting all comments at once (efficient happy path)
2. **Individual fallback**: If batch fails, post review summary then each comment individually
3. **Graceful degradation**: Comments on invalid lines (outside diff range) are collected into an "Additional comments" section

This ensures valid comments appear inline even when some target invalid line numbers (GitHub only allows comments on lines within the diff).

## Customization Guide

### Modifying Prompts

Prompts are in `params.prompt` for each AI step. Edit directly in workflow.json or via the step editor UI:

```json
{
  "id": "generate-review",
  "params": {
    "prompt": "Your custom review instructions here..."
  }
}
```

The `respond-to-activity` and `do-re-review` prompts are intentionally brief since they resume the existing Claude session with full context from the initial review.

### Changing the AI Output Schema

Edit `src/schemas.ts`:

```typescript
export const ReviewSchema = z.object({
  summary: z.string(),
  decision: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
  comments: z.array(ReviewCommentSchema),
  // Add new fields here
});
```

Then update `src/review.ts` and `src/github.ts` to handle new fields.

### Adding Workflow Steps

```json
{
  "id": "my-step",
  "type": "command",
  "name": "My Step",
  "command": "echo 'Hello'",
  "params": {
    "message": "User-editable value"
  },
  "env": {
    "MY_VAR": "{{ params.message }}"
  }
}
```

### Conditional Steps

```json
{
  "id": "conditional-step",
  "if": "{{ JSON.parse(steps['check'].output).shouldRun }}",
  "command": "echo 'Condition met'"
}
```

### Flow Control

```json
{
  "id": "check-something",
  "command": "test -f file.txt || exit 1",
  "onError": "goto",
  "onErrorGoto": "handle-missing"
}
```

## Credentials

| Name | Fields | Purpose |
|------|--------|---------|
| `github-app-oauth` | `access_token` | GitHub API access |
| `anthropic-api-9761` | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` | Claude API access |

## Polling Loop

The workflow monitors the PR until closed using a checkpoint-based loop:

```json
{"timestamp": "2024-01-08T12:00:00Z", "commit_sha": "abc123"}
```

Key design decisions:

- **Single checkpoint step**: `save-checkpoint` handles both initial save and loop updates
- **Timestamp before polling**: Checkpoint saved BEFORE `poll-wait` to avoid gaps
- **Bot comment filtering**: `check-activity` filters out `[bot]` users and `🤖` emoji
- **Session continuity**: `respond-to-activity` and `do-re-review` resume the Claude session, so prompts are brief

## Common Modifications

### Change polling interval

```json
{
  "id": "poll-wait",
  "type": "sleep",
  "duration": 60000
}
```

### Add security scanning

Add a step before `generate-review` that runs security tools and includes findings in the prompt.

### Integrate with CI

Add steps to check CI status before reviewing, or trigger CI after review.

## Debugging

- Step outputs are logged to workflow execution logs
- Use `echo "debug: $VAR" >&2` to log to stderr (not captured as output)
- Validate JSON with `| jq -c .`
- Template syntax errors appear as literal `{{ }}` in output
