import { query } from "@anthropic-ai/claude-code";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ReviewSchema, type Review } from "./schemas.js";
import { postReview, getPRFiles, getPRDiff } from "./github.js";

// Environment variables passed from workflow
const PR_NUMBER = process.env.PR_NUMBER!;
const REPO = process.env.REPO!;
const COMMIT_SHA = process.env.COMMIT_SHA!;
const PR_TITLE = process.env.PR_TITLE || "";
const PR_BODY = process.env.PR_BODY || "";

async function main() {
  console.log(`Starting review for PR #${PR_NUMBER} in ${REPO}`);
  console.log(`Commit: ${COMMIT_SHA}`);

  // Fetch PR context
  const [files, diff] = await Promise.all([
    getPRFiles(REPO, PR_NUMBER),
    getPRDiff(REPO, PR_NUMBER),
  ]);

  console.log(`Changed files: ${files.length}`);
  console.log(`Diff size: ${diff.length} chars`);

  // Prepare context for Claude
  const fileList = files
    .map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join("\n");

  // Truncate diff if too large (keep under 100KB for context)
  const truncatedDiff = diff.length > 100000 ? diff.slice(0, 100000) + "\n... (truncated)" : diff;

  // Convert Zod schema to JSON Schema for structured output
  const schema = zodToJsonSchema(ReviewSchema, { $refStrategy: "root" });

  let review: Review | null = null;

  // Run Claude Agent SDK query with structured output
  for await (const message of query({
    prompt: `You are an expert code reviewer analyzing PR #${PR_NUMBER} in this repository.

## PR Information
**Title:** ${PR_TITLE}
**Description:** ${PR_BODY || "No description provided"}

## Changed Files
${fileList}

## Diff
\`\`\`diff
${truncatedDiff}
\`\`\`

## Your Task
Perform a thorough code review of this pull request. You have access to the full codebase - use the Read and Grep tools to:
1. Examine the changed files in detail
2. Understand the context by reading related files
3. Check for consistency with existing patterns in the codebase

## Review Focus Areas
- **Bugs & Edge Cases**: Logic errors, null checks, boundary conditions
- **Security**: Input validation, authentication, authorization, injection vulnerabilities
- **Performance**: Inefficient algorithms, unnecessary allocations, N+1 queries
- **Code Quality**: Readability, maintainability, proper error handling
- **Consistency**: Following existing patterns and conventions in the codebase

## Output Requirements
Provide specific, actionable feedback with exact file paths and line numbers.
- Use APPROVE only if the code is ready to merge
- Use REQUEST_CHANGES if there are issues that must be fixed
- Use COMMENT for general feedback without blocking

Be constructive, specific, and reference actual code you've examined.`,
    options: {
      outputFormat: {
        type: "json_schema",
        schema: schema,
      },
    },
  })) {
    // Log progress messages
    if (message.type === "assistant") {
      console.log("Agent is analyzing...");
    }

    // Capture the final structured output
    if (message.type === "result" && message.structured_output) {
      const parsed = ReviewSchema.safeParse(message.structured_output);
      if (parsed.success) {
        review = parsed.data;
        console.log(`Review generated: ${review.decision}`);
        console.log(`Comments: ${review.comments.length}`);
      } else {
        console.error("Failed to parse review output:", parsed.error);
      }
    }

    // Handle errors
    if (message.type === "result" && message.subtype === "error_max_structured_output_retries") {
      console.error("Failed to generate valid structured output after retries");
      process.exit(1);
    }
  }

  if (!review) {
    console.error("No review generated");
    process.exit(1);
  }

  // Post the review to GitHub
  console.log("Posting review to GitHub...");
  try {
    await postReview(REPO, PR_NUMBER, COMMIT_SHA, review);
    console.log("Review posted successfully");
  } catch (error) {
    console.error("Failed to post review:", error);
    process.exit(1);
  }

  // Output the review for logging
  console.log("\n=== Review Summary ===");
  console.log(`Decision: ${review.decision}`);
  console.log(`Summary: ${review.summary}`);
  console.log(`\nComments (${review.comments.length}):`);
  for (const comment of review.comments) {
    console.log(`  - ${comment.path}:${comment.line} [${comment.severity || "info"}]`);
    console.log(`    ${comment.body.slice(0, 100)}...`);
  }
}

main().catch((error) => {
  console.error("Review failed:", error);
  process.exit(1);
});
