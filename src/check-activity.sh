#!/bin/bash
# Check PR status and activity (new commits, new comments)
# Outputs JSON: {has_new_commits, current_sha, new_comments}

set -e

REPO="$1"
PR_NUMBER="$2"
CHECKPOINT_JSON="$3"

# Get PR state and current SHA
PR_DATA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json state,headRefOid)
STATE=$(echo "$PR_DATA" | jq -r '.state')

# Exit if PR is not open
if [ "$STATE" != 'OPEN' ]; then
  echo "$STATE"
  exit 1
fi

CURRENT_SHA=$(echo "$PR_DATA" | jq -r '.headRefOid')
LAST_SHA=$(echo "$CHECKPOINT_JSON" | jq -r '.commit_sha')
SINCE=$(echo "$CHECKPOINT_JSON" | jq -r '.timestamp')

# Check for new commits
HAS_NEW_COMMITS=false
if [ "$LAST_SHA" != "$CURRENT_SHA" ]; then
  cd /workspace/repo
  gh pr checkout "$PR_NUMBER" --detach --force >&2
  HAS_NEW_COMMITS=true
fi

# Filter function for comments
filter_comments() {
  jq --arg since "$SINCE" '[.[] | select(
    .created_at > $since and
    (.user.login | contains("[bot]") | not) and
    (.body | contains("🤖") | not)
  )]'
}

# Fetch review comments (on specific lines of code)
REVIEW_COMMENTS=$(gh api "repos/$REPO/pulls/$PR_NUMBER/comments" | filter_comments)

# Fetch PR-level comments (general discussion)
PR_COMMENTS=$(gh api "repos/$REPO/issues/$PR_NUMBER/comments" | filter_comments)

# Merge both comment types
NEW_COMMENTS=$(echo "$REVIEW_COMMENTS $PR_COMMENTS" | jq -s 'add')

# Output result
jq -n \
  --argjson has_new_commits "$HAS_NEW_COMMITS" \
  --arg current_sha "$CURRENT_SHA" \
  --argjson new_comments "$NEW_COMMENTS" \
  '{has_new_commits: $has_new_commits, current_sha: $current_sha, new_comments: $new_comments}'
