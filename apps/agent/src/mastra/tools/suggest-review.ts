import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createReviewRequest } from '../db/reviews';

/**
 * `suggest_review` (Hex `SuggestReview`) — flag an answer for data-team review.
 *
 * When interpretation is genuinely ambiguous or confidence is low (a metric the
 * semantic model doesn't define, two plausible readings of a field, a number
 * that drives a high-stakes decision), the agent records a review request and
 * surfaces it *alongside* a complete answer — never as a substitute for one.
 */
export const suggestReviewTool = createTool({
  id: 'SuggestReview',
  description:
    'Suggest that the user request a review from their data team. This shows the user a banner asking ' +
    "'Is this correct? You can request a review from your data team'; it does NOT send anything unless " +
    'the user accepts. Call this when: the user expresses doubt about the result; the data available ' +
    'is incomplete or ambiguous and your answer relies on assumptions they may not share; you had to ' +
    'choose between multiple plausible interpretations; or you investigated thoroughly but could not ' +
    'give a clear answer. Do NOT call it merely because there were SQL/tool errors but you still ' +
    'reached an answer, when you need clarification (ask instead), or when the user is satisfied. ' +
    'CRITICAL: this banner adds no visible text — it must be the second-to-last thing in your turn, ' +
    'and you MUST still write a complete, standalone answer AFTER it.',
  inputSchema: z.object({
    question: z.string().optional().describe('The question being answered (optional).'),
    reason: z
      .string()
      .optional()
      .describe('Why a human review is warranted — the specific ambiguity or risk (optional).'),
  }),
  outputSchema: z.object({
    requested: z.boolean(),
    reviewId: z.string(),
    message: z.string(),
  }),
  execute: async (input) => {
    const review = await createReviewRequest({
      question: input?.question ?? 'Answer flagged for review',
      reason: input?.reason ?? 'The analyst flagged this answer as ambiguous or low-confidence.',
    });
    return {
      requested: true,
      reviewId: review.id,
      message: 'Flagged for data-team review.',
    };
  },
});
