import { query } from "@anthropic-ai/claude-agent-sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ReviewSchema, type Review } from "./schemas.js";
import { postReview } from "./github.js";

// Environment variables passed from workflow
const PROMPT = process.env.PROMPT!;
const PR_NUMBER = process.env.PR_NUMBER!;
const REPO = process.env.REPO!;
const COMMIT_SHA = process.env.COMMIT_SHA!;

async function main() {
  console.error(
    `Starting review, prompt length: ${PROMPT?.length ?? "undefined"} chars`
  );

  // Convert Zod schema to JSON Schema for structured output
  const schema = zodToJsonSchema(ReviewSchema, { $refStrategy: "none" });

  let review: Review | null = null;

  console.error("Running Claude Agent SDK for code review...");

  // Run Claude Agent SDK query with structured output
  for await (const message of query({
    prompt: PROMPT,
    options: {
      continue: true,
      allowDangerouslySkipPermissions: true,
      permissionMode: "bypassPermissions",
      outputFormat: {
        type: "json_schema",
        schema: schema as Record<string, unknown>,
      },
    },
  })) {
    console.error(JSON.stringify(message));

    // Capture the final structured output
    if (message.type === "result") {
      if (message.subtype === "success" && message.structured_output) {
        const parsed = ReviewSchema.safeParse(message.structured_output);
        if (parsed.success) {
          review = parsed.data;
          console.error(`Review generated: ${review.decision}`);
          console.error(`Comments: ${review.comments.length}`);
        } else {
          console.error("Failed to parse review output:", parsed.error.errors);
        }
      } else if (message.subtype === "error_max_structured_output_retries") {
        console.error(
          "Failed to generate valid structured output after retries"
        );
        process.exit(1);
      } else if (message.subtype === "error_during_execution") {
        console.error("Error during execution:", message.errors);
        process.exit(1);
      }
    }
  }

  if (!review) {
    console.error("No review generated");
    process.exit(1);
  }

  // Post the review to GitHub
  console.error(`Posting review for PR #${PR_NUMBER} in ${REPO}`);
  try {
    await postReview(REPO, PR_NUMBER, COMMIT_SHA, review);
    console.error("Review posted successfully");
  } catch (error) {
    console.error("Failed to post review:", error);
    process.exit(1);
  }

  // Output JSON with review metrics for workflow
  console.log(JSON.stringify({
    decision: review.decision,
    comments_count: review.comments.length
  }));
}

main().catch((error) => {
  console.error("Review failed:", error);
  process.exit(1);
});
