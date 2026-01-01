import { query } from "@anthropic-ai/claude-code";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ResponseSchema, type Response } from "./schemas.js";
import { postReplies, postComment, getPRDiff } from "./github.js";

// Environment variables passed from workflow
const PR_NUMBER = process.env.PR_NUMBER!;
const REPO = process.env.REPO!;
const NEW_COMMENTS_JSON = process.env.NEW_COMMENTS || "[]";
const HAS_NEW_COMMITS = process.env.HAS_NEW_COMMITS === "true";

interface PRComment {
  id: number;
  user: { login: string };
  body: string;
  path?: string;
  line?: number;
  created_at: string;
}

async function main() {
  let newComments: PRComment[] = [];
  try {
    newComments = JSON.parse(NEW_COMMENTS_JSON);
  } catch {
    console.log("No valid comments JSON, checking file...");
    // Try reading from file if env var didn't work
    const fs = await import("fs/promises");
    try {
      const data = await fs.readFile("/tmp/new_comments.json", "utf-8");
      newComments = JSON.parse(data);
    } catch {
      newComments = [];
    }
  }

  // Filter out our own bot comments to avoid self-replies
  const externalComments = newComments.filter(
    (c) => !c.user.login.includes("[bot]") && !c.body.includes("🤖 AI Code Review")
  );

  if (externalComments.length === 0 && !HAS_NEW_COMMITS) {
    console.log("No new activity to respond to");
    return;
  }

  console.log(`Responding to PR #${PR_NUMBER} in ${REPO}`);
  console.log(`New comments: ${externalComments.length}`);
  console.log(`Has new commits: ${HAS_NEW_COMMITS}`);

  // Format comments for the prompt
  const commentsContext = externalComments
    .map(
      (c) =>
        `[Comment ID: ${c.id}] @${c.user.login} ${c.path ? `on ${c.path}:${c.line}` : ""}:
${c.body}`
    )
    .join("\n\n");

  // Get diff if there are new commits
  let diffContext = "";
  if (HAS_NEW_COMMITS) {
    try {
      const diff = await getPRDiff(REPO, PR_NUMBER);
      diffContext = diff.length > 50000 ? diff.slice(0, 50000) + "\n... (truncated)" : diff;
    } catch (error) {
      console.log("Could not fetch diff:", error);
    }
  }

  // Convert Zod schema to JSON Schema
  const schema = zodToJsonSchema(ResponseSchema, { $refStrategy: "root" });

  let response: Response | null = null;

  // Run Claude Agent SDK query
  for await (const message of query({
    prompt: `You are monitoring PR #${PR_NUMBER} for activity and need to respond appropriately.

## New Activity

${
  externalComments.length > 0
    ? `### New Comments
${commentsContext}`
    : "No new comments."
}

${
  HAS_NEW_COMMITS
    ? `### New Commits Pushed
The author has pushed new commits. Here's the current diff:
\`\`\`diff
${diffContext}
\`\`\`
`
    : "No new commits."
}

## Your Task

1. **If there are new comments**: Read each comment carefully and formulate helpful replies.
   - Answer questions about your previous review
   - Clarify any feedback that was misunderstood
   - Acknowledge when the author makes valid points
   - Be polite and constructive

2. **If there are new commits**:
   - Examine what changed using the Read tool if needed
   - Determine if the changes address your previous feedback
   - If significant changes were made that need full review, set should_re_review to true
   - You can add a general comment acknowledging the updates

3. **For replies**: Use the exact comment_id from the comments above

Be concise, helpful, and professional. Don't repeat yourself.`,
    options: {
      outputFormat: {
        type: "json_schema",
        schema: schema,
      },
    },
  })) {
    if (message.type === "assistant") {
      console.log("Agent is formulating response...");
    }

    if (message.type === "result" && message.structured_output) {
      const parsed = ResponseSchema.safeParse(message.structured_output);
      if (parsed.success) {
        response = parsed.data;
        console.log(`Response generated:`);
        console.log(`  Replies: ${response.replies.length}`);
        console.log(`  General comment: ${response.general_comment ? "yes" : "no"}`);
        console.log(`  Should re-review: ${response.should_re_review}`);
      } else {
        console.error("Failed to parse response:", parsed.error);
      }
    }

    if (message.type === "result" && message.subtype === "error_max_structured_output_retries") {
      console.error("Failed to generate valid structured output");
      process.exit(1);
    }
  }

  if (!response) {
    console.log("No response generated");
    return;
  }

  // Post replies to comments
  if (response.replies.length > 0) {
    console.log(`Posting ${response.replies.length} replies...`);
    try {
      await postReplies(REPO, PR_NUMBER, response.replies);
      console.log("Replies posted successfully");
    } catch (error) {
      console.error("Failed to post replies:", error);
    }
  }

  // Post general comment if provided
  if (response.general_comment) {
    console.log("Posting general comment...");
    try {
      await postComment(REPO, PR_NUMBER, `🤖 **Update**\n\n${response.general_comment}`);
      console.log("Comment posted successfully");
    } catch (error) {
      console.error("Failed to post comment:", error);
    }
  }

  // Signal if re-review is needed
  if (response.should_re_review) {
    console.log("RE-REVIEW RECOMMENDED: Significant changes detected");
    // Write flag file for workflow to detect
    const fs = await import("fs/promises");
    await fs.writeFile("/tmp/should_re_review.txt", "true");
  }

  console.log("Response handling complete");
}

main().catch((error) => {
  console.error("Response failed:", error);
  process.exit(1);
});
