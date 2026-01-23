import { postReview } from "./github.js";
import { ReviewSchema } from "./schemas.js";

// Environment variables passed from workflow
const PR_NUMBER = process.env.PR_NUMBER!;
const REPO = process.env.REPO!;
const COMMIT_SHA = process.env.COMMIT_SHA!;
const REVIEW_JSON = process.env.REVIEW_JSON!;

async function main() {
  console.error(`Posting review for PR #${PR_NUMBER} in ${REPO}`);
  console.error(`Commit: ${COMMIT_SHA}`);
  console.error(`REVIEW_JSON length: ${REVIEW_JSON?.length ?? 'undefined'}`);
  console.error(`REVIEW_JSON first 500 chars: ${REVIEW_JSON?.slice(0, 500)}`);
  console.error(`REVIEW_JSON last 100 chars: ${REVIEW_JSON?.slice(-100)}`);

  // Parse the review JSON from the previous step
  let reviewData: unknown;
  try {
    reviewData = JSON.parse(REVIEW_JSON);
  } catch (error) {
    console.error("Failed to parse REVIEW_JSON:", error);
    process.exit(1);
  }

  // Validate with schema
  const parsed = ReviewSchema.safeParse(reviewData);
  if (!parsed.success) {
    console.error("Invalid review format:", parsed.error.issues);
    process.exit(1);
  }

  const review = parsed.data;
  console.error(`Decision: ${review.decision}`);
  console.error(`Comments: ${review.comments.length}`);

  // Post the review to GitHub
  try {
    await postReview(REPO, PR_NUMBER, COMMIT_SHA, review);
    console.error("Review posted successfully");
  } catch (error) {
    console.error("Failed to post review:", error);
    process.exit(1);
  }

  // Output success message to stdout
  console.log("Review posted");
}

main().catch((error) => {
  console.error("Post review failed:", error);
  process.exit(1);
});
