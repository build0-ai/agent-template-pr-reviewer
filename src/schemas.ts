import { z } from "zod";

/**
 * Schema for a single review comment on a specific line of code
 */
export const ReviewCommentSchema = z.object({
  path: z.string().describe("File path relative to repo root"),
  line: z.number().int().positive().describe("Line number in the file"),
  body: z.string().describe("Review comment text in markdown"),
  severity: z
    .enum(["critical", "warning", "suggestion", "nitpick"])
    .optional()
    .describe("Severity level of the issue"),
});

/**
 * Schema for the initial PR review output
 */
export const ReviewSchema = z.object({
  summary: z
    .string()
    .describe("Overall review summary covering the key findings"),
  decision: z
    .enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"])
    .describe(
      "Review decision: APPROVE if code is good, REQUEST_CHANGES if issues must be fixed, COMMENT for general feedback"
    ),
  comments: z
    .array(ReviewCommentSchema)
    .describe("Array of line-specific comments"),
});

/**
 * Schema for a reply to an existing comment
 */
export const CommentReplySchema = z.object({
  comment_id: z.number().int().positive().describe("ID of comment to reply to"),
  body: z.string().describe("Reply text in markdown"),
});

/**
 * Schema for responding to PR activity (new comments or commits)
 */
export const ResponseSchema = z.object({
  replies: z
    .array(CommentReplySchema)
    .describe("Replies to existing comments"),
  general_comment: z
    .string()
    .optional()
    .describe("Optional general comment on the PR"),
  should_re_review: z
    .boolean()
    .describe(
      "Whether the new commits contain significant changes that warrant a full re-review"
    ),
});

// Export types inferred from schemas
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type CommentReply = z.infer<typeof CommentReplySchema>;
export type Response = z.infer<typeof ResponseSchema>;
