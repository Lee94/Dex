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
  id: 'suggest_review',
  description:
    'Flag the current answer for a data-team review when your interpretation is genuinely ambiguous ' +
    'or your confidence is low (an off-model metric, two plausible readings of a field, a high-stakes ' +
    'number). This does NOT replace answering — still give your best complete answer, then call this ' +
    'and tell the user you have flagged it for review and why.',
  inputSchema: z.object({
    question: z.string().describe('The question being answered.'),
    reason: z
      .string()
      .describe('Why a human review is warranted — the specific ambiguity or risk.'),
  }),
  outputSchema: z.object({
    requested: z.boolean(),
    reviewId: z.string(),
    message: z.string(),
  }),
  execute: async (input) => {
    const review = await createReviewRequest({ question: input.question, reason: input.reason });
    return {
      requested: true,
      reviewId: review.id,
      message: 'Flagged for data-team review.',
    };
  },
});
