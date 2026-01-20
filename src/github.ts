import type { Review, CommentReply } from "./schemas.js";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_API = "https://api.github.com";

/**
 * Common headers for GitHub API requests
 */
function getHeaders(): Record<string, string> {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "PR-Reviewer-Agent",
  };
}

/**
 * Post a review with line-specific comments to a PR
 */
export async function postReview(
  repo: string,
  prNumber: string,
  commitSha: string,
  review: Review
): Promise<unknown> {
  const url = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}/reviews`;

  // Try posting with line-specific comments first
  const bodyWithComments = {
    commit_id: commitSha,
    body: `## 🤖 AI Code Review\n\n${review.summary}`,
    event: review.decision,
    comments: review.comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.severity ? `**[${c.severity.toUpperCase()}]** ${c.body}` : c.body,
    })),
  };

  let response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(bodyWithComments),
  });

  // If line comments fail (422), fallback to posting review with comments in body
  if (response.status === 422 && review.comments.length > 0) {
    console.error("Line-specific comments failed, posting comments in review body instead");

    const commentsAsText = review.comments
      .map((c) => {
        const severity = c.severity ? `**[${c.severity.toUpperCase()}]** ` : "";
        return `### \`${c.path}:${c.line}\`\n${severity}${c.body}`;
      })
      .join("\n\n---\n\n");

    const bodyWithoutComments = {
      commit_id: commitSha,
      body: `## 🤖 AI Code Review\n\n${review.summary}\n\n---\n\n## Comments\n\n${commentsAsText}`,
      event: review.decision,
      comments: [],
    };

    response = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(bodyWithoutComments),
    });
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to post review: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Reply to an existing review comment
 */
export async function replyToComment(
  repo: string,
  prNumber: string,
  commentId: number,
  body: string
): Promise<unknown> {
  const url = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}/comments/${commentId}/replies`;

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to reply to comment: ${response.status} - ${error}`
    );
  }

  return response.json();
}

/**
 * Post a general comment on a PR (not a review comment)
 */
export async function postComment(
  repo: string,
  prNumber: string,
  body: string
): Promise<unknown> {
  const url = `${GITHUB_API}/repos/${repo}/issues/${prNumber}/comments`;

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to post comment: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get review comments on a PR, optionally filtered by time
 */
export async function getReviewComments(
  repo: string,
  prNumber: string,
  since?: string
): Promise<unknown[]> {
  let url = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}/comments`;
  if (since) {
    url += `?since=${encodeURIComponent(since)}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get comments: ${response.status} - ${error}`);
  }

  return response.json() as Promise<unknown[]>;
}

/**
 * Get PR details including current state and head SHA
 */
export async function getPRDetails(
  repo: string,
  prNumber: string
): Promise<{ state: string; head_sha: string }> {
  const url = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get PR details: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { state: string; head: { sha: string } };
  return {
    state: data.state,
    head_sha: data.head.sha,
  };
}

/**
 * Get the diff for a PR
 */
export async function getPRDiff(repo: string, prNumber: string): Promise<string> {
  const url = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...getHeaders(),
      Accept: "application/vnd.github.v3.diff",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get PR diff: ${response.status} - ${error}`);
  }

  return response.text();
}

/**
 * Get the list of files changed in a PR
 */
export async function getPRFiles(
  repo: string,
  prNumber: string
): Promise<Array<{ filename: string; status: string; additions: number; deletions: number }>> {
  const url = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}/files`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get PR files: ${response.status} - ${error}`);
  }

  return response.json() as Promise<
    Array<{ filename: string; status: string; additions: number; deletions: number }>
  >;
}

/**
 * Post multiple replies to comments
 */
export async function postReplies(
  repo: string,
  prNumber: string,
  replies: CommentReply[]
): Promise<void> {
  for (const reply of replies) {
    await replyToComment(repo, prNumber, reply.comment_id, reply.body);
  }
}
