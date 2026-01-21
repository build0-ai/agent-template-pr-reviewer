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
 * Post a review with line-specific comments to a PR.
 * Posts comments individually so one bad line number doesn't break all comments.
 */
export async function postReview(
  repo: string,
  prNumber: string,
  commitSha: string,
  review: Review
): Promise<{ posted: number; failed: number }> {
  const reviewUrl = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}/reviews`;

  // First, post the review summary without comments
  const reviewBody = {
    commit_id: commitSha,
    body: review.summary,
    event: review.decision,
    comments: [] as Array<{ path: string; line: number; body: string }>,
  };

  // Try to post all comments at once first (most efficient if they all work)
  if (review.comments.length > 0) {
    reviewBody.comments = review.comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.severity ? `**[${c.severity.toUpperCase()}]** ${c.body}` : c.body,
    }));

    const batchResponse = await fetch(reviewUrl, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(reviewBody),
    });

    if (batchResponse.ok) {
      return { posted: review.comments.length, failed: 0 };
    }

    // If batch failed, try posting comments individually
    console.error("Batch comment posting failed, trying individual comments...");
  }

  // Post review without comments first
  reviewBody.comments = [];
  const reviewResponse = await fetch(reviewUrl, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(reviewBody),
  });

  if (!reviewResponse.ok) {
    const error = await reviewResponse.text();
    throw new Error(`Failed to post review: ${reviewResponse.status} - ${error}`);
  }

  // Now post each comment individually as review comments
  let posted = 0;
  let failed = 0;
  const failedComments: Array<{ path: string; line: number; body: string }> = [];

  for (const comment of review.comments) {
    const commentUrl = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}/comments`;
    const commentBody = {
      commit_id: commitSha,
      path: comment.path,
      line: comment.line,
      body: comment.severity
        ? `**[${comment.severity.toUpperCase()}]** ${comment.body}`
        : comment.body,
    };

    const response = await fetch(commentUrl, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(commentBody),
    });

    if (response.ok) {
      posted++;
    } else {
      failed++;
      failedComments.push(commentBody);
      console.error(`Failed to post comment on ${comment.path}:${comment.line}`);
    }
  }

  // If any comments failed, add them to a follow-up comment
  if (failedComments.length > 0) {
    const fallbackText = failedComments
      .map((c) => `**${c.path}:${c.line}**\n${c.body}`)
      .join("\n\n---\n\n");

    await postComment(
      repo,
      prNumber,
      `### Additional comments\n\n_The following comments couldn't be added inline:_\n\n${fallbackText}`
    );
  }

  return { posted, failed };
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
