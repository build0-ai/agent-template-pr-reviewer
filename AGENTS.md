# PR Reviewer Agent

Automatically reviews pull requests for code quality, bugs, security issues, and performance.

## Trigger

**Webhook**: `pull_request.opened`

## Workflow

```
get_pr → review (AI) → comment
```

1. **get_pr** - Fetches PR details, diff, and file changes
2. **review** - AI analyzes code for quality, bugs, security, and performance
3. **comment** - Posts structured review as PR comment

## Required Integration

- **GitHub** - Repository access for PR details and commenting

## Input Payload

```json
{
  "pull_request": { "number": 123 },
  "repository": {
    "name": "repo-name",
    "owner": { "login": "org-name" }
  }
}
```

## Output

Posts a comment with sections for:
- Code Quality
- Potential Bugs
- Security Issues
- Performance
- Suggestions
