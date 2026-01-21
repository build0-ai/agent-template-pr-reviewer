import { query } from "@anthropic-ai/claude-agent-sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ResponseSchema, type Response } from "./schemas.js";
import { postReplies, postComment, postReview } from "./github.js";

// Environment variables passed from workflow
const PR_NUMBER = process.env.PR_NUMBER!;
const REPO = process.env.REPO!;
const COMMIT_SHA = process.env.COMMIT_SHA!;
const NEW_COMMENTS_JSON = process.env.NEW_COMMENTS || "[]";
const HAS_NEW_COMMITS = process.env.HAS_NEW_COMMITS === "true";
const PROMPT = process.env.PROMPT_TEMPLATE!;

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
    console.error("No valid comments JSON");
    newComments = [];
  }

  // Filter out our own bot comments to avoid self-replies
  const externalComments = newComments.filter(
    (c) =>
      !c.user.login.includes("[bot]") && !c.body.includes("🤖 AI Code Review")
  );

  if (externalComments.length === 0 && !HAS_NEW_COMMITS) {
    console.error("No new activity to respond to");
    console.log(JSON.stringify({ replies_count: 0 }));
    return;
  }

  console.error(`Responding to PR #${PR_NUMBER} in ${REPO}`);
  console.error(`New comments: ${externalComments.length}`);
  console.error(`Has new commits: ${HAS_NEW_COMMITS}`);

  // Prompt is already populated by workflow step
  console.error(`Prompt length: ${PROMPT?.length ?? "undefined"} chars`);

  // Convert Zod schema to JSON Schema
  const schema = zodToJsonSchema(ResponseSchema, { $refStrategy: "none" });

  let response: Response | null = null;

  console.error("Running Claude Agent SDK to formulate response...");

  // Run Claude Agent SDK query
  for await (const message of query({
    prompt: PROMPT,
    options: {
      allowDangerouslySkipPermissions: true,
      continue: true,
      permissionMode: "bypassPermissions",
      outputFormat: {
        type: "json_schema",
        schema: schema as Record<string, unknown>,
      },
    },
  })) {
    console.error(JSON.stringify(message));

    if (message.type === "result") {
      if (message.subtype === "success" && message.structured_output) {
        const parsed = ResponseSchema.safeParse(message.structured_output);
        if (parsed.success) {
          response = parsed.data;
          console.error(`Response generated:`);
          console.error(`  Replies: ${response.replies.length}`);
          console.error(`  General comment: ${response.general_comment ? "yes" : "no"}`);
          console.error(`  Decision: ${response.decision || "none"}`);
        } else {
          console.error("Failed to parse response:", parsed.error.errors);
        }
      } else if (message.subtype === "error_max_structured_output_retries") {
        console.error("Failed to generate valid structured output");
        process.exit(1);
      } else if (message.subtype === "error_during_execution") {
        console.error("Error during execution:", message.errors);
        process.exit(1);
      }
    }
  }

  if (!response) {
    console.error("No response generated");
    console.log(JSON.stringify({ replies_count: 0 }));
    return;
  }

  // Post replies to comments
  if (response.replies.length > 0) {
    console.error(`Posting ${response.replies.length} replies...`);
    try {
      await postReplies(REPO, PR_NUMBER, response.replies);
      console.error("Replies posted successfully");
    } catch (error) {
      console.error("Failed to post replies:", error);
    }
  }

  // Post review if decision is set (to update PR status)
  if (response.decision) {
    console.error(`Posting review with decision: ${response.decision}`);
    try {
      await postReview(REPO, PR_NUMBER, COMMIT_SHA, {
        summary: response.general_comment || `Review status updated to ${response.decision}.`,
        decision: response.decision,
        comments: [],
      });
      console.error("Review posted successfully");
    } catch (error) {
      console.error("Failed to post review:", error);
    }
  } else if (response.general_comment) {
    // Only post as general comment if no decision (status update)
    console.error("Posting general comment...");
    try {
      await postComment(
        REPO,
        PR_NUMBER,
        `🤖 **Update**\n\n${response.general_comment}`
      );
      console.error("Comment posted successfully");
    } catch (error) {
      console.error("Failed to post comment:", error);
    }
  }

  // Output JSON with metrics for workflow
  console.error("Response handling complete");
  console.log(JSON.stringify({
    replies_count: response.replies.length,
    decision: response.decision || null
  }));
}

main().catch((error) => {
  console.error("Response failed:", error);
  process.exit(1);
});
