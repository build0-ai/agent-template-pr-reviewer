#!/bin/bash
# Check PR status and activity (new commits, new comments)
# Outputs JSON: {has_new_commits, current_sha, new_comments, timestamp}

set -e

REPO="$1"
PR_NUMBER="$2"
PREV_STATE="$3"  # JSON with previous timestamp and commit_sha

# Get PR state and current SHA
PR_DATA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json state,headRefOid)
STATE=$(echo "$PR_DATA" | jq -r '.state')

# Exit if PR is not open
if [ "$STATE" != 'OPEN' ]; then
  echo "$STATE"
  exit 1
fi

CURRENT_SHA=$(echo "$PR_DATA" | jq -r '.headRefOid')

# Parse previous state
if [ -n "$PREV_STATE" ] && [ "$PREV_STATE" != "null" ] && [ "$PREV_STATE" != "undefined" ]; then
  LAST_SHA=$(echo "$PREV_STATE" | jq -r '.commit_sha // empty')
  SINCE=$(echo "$PREV_STATE" | jq -r '.timestamp // empty')
else
  LAST_SHA=""
  SINCE=""
fi

# Check for new commits
HAS_NEW_COMMITS=false
if [ -n "$LAST_SHA" ] && [ "$LAST_SHA" != "$CURRENT_SHA" ]; then
  cd /workspace/repo
  gh pr checkout "$PR_NUMBER" --detach --force >&2
  HAS_NEW_COMMITS=true
fi

# Filter function for comments (only if we have a SINCE timestamp)
filter_comments() {
  if [ -n "$SINCE" ]; then
    jq --arg since "$SINCE" '[.[] | select(
      .created_at > $since and
      (.user.login | contains("[bot]") | not) and
      (.body | contains("🤖") | not)
    )]'
  else
    # No previous timestamp, return empty array (first run uses generate-review timestamp)
    echo "[]"
  fi
}

# Fetch review comments (on specific lines of code)
REVIEW_COMMENTS=$(gh api "repos/$REPO/pulls/$PR_NUMBER/comments" | filter_comments)

# Fetch PR-level comments (general discussion)
PR_COMMENTS=$(gh api "repos/$REPO/issues/$PR_NUMBER/comments" | filter_comments)

# Merge both comment types
NEW_COMMENTS=$(echo "$REVIEW_COMMENTS $PR_COMMENTS" | jq -s 'add // []')

# Output result with current timestamp for next iteration
jq -n \
  --argjson has_new_commits "$HAS_NEW_COMMITS" \
  --arg current_sha "$CURRENT_SHA" \
  --argjson new_comments "$NEW_COMMENTS" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{has_new_commits: $has_new_commits, commit_sha: $current_sha, new_comments: $new_comments, timestamp: $timestamp}'
