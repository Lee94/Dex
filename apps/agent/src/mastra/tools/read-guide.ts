import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getGuide, listGuides } from '../db/guides';

/**
 * `read_guide` (Hex `ReadGuide`) — consult the org knowledge base. Called with no
 * argument it lists the available guides (titles, slugs, tags, excerpt) so the
 * agent can see what knowledge exists; called with a `guide` (slug or id) it
 * returns that guide's full markdown. The agent treats a guide's definitions as
 * the standard rather than re-deriving them.
 */
export const readGuideTool = createTool({
  id: 'ReadGuide',
  description:
    'Read the full contents of organization guides — curated knowledge about metric definitions, ' +
    'terminology, approved query/filtering patterns, chart standards, and business context. Consult ' +
    'guides EARLY in your analysis to guide your approach, and whenever their purpose matches your ' +
    'task (writing queries, defining a metric, an unfamiliar concept). Call with NO argument to list ' +
    "the available guides, then call again with a `guide` (its slug) to read one in full. A guide's " +
    'definition is authoritative — do not re-derive a metric a guide already defines, and follow ' +
    'cross-references to other guides when relevant.',
  inputSchema: z.object({
    guide: z
      .string()
      .optional()
      .describe('A guide slug or id to read in full. Omit to list the available guides.'),
  }),
  outputSchema: z.object({
    guides: z
      .array(
        z.object({
          slug: z.string(),
          title: z.string(),
          tags: z.array(z.string()),
          excerpt: z.string(),
        }),
      )
      .optional(),
    guide: z
      .object({
        slug: z.string(),
        title: z.string(),
        tags: z.array(z.string()),
        content: z.string(),
      })
      .optional(),
    found: z.boolean().optional(),
  }),
  execute: async (input) => {
    if (!input?.guide) {
      const guides = await listGuides();
      return {
        guides: guides.map((g) => ({
          slug: g.slug,
          title: g.title,
          tags: g.tags,
          excerpt: g.excerpt,
        })),
      };
    }
    const guide = await getGuide(input.guide);
    if (!guide) return { found: false };
    return {
      found: true,
      guide: { slug: guide.slug, title: guide.title, tags: guide.tags, content: guide.content },
    };
  },
});
