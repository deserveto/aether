import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { searchSearXNG, fetchUrl } from '@aether/tools'

export function buildWebResearchTools(searxngUrl: string) {
  return {
    web_search: createTool({
      id: 'web_search',
      description:
        'Search the web using SearXNG and return normalized results. Use for discovery; use web_fetch to read page content.',
      inputSchema: z.object({
        query: z.string().min(1).describe('The search query'),
        limit: z.number().int().min(1).max(20).optional().describe('Max results (default 10)'),
        language: z.string().optional().describe('BCP-47 language code, e.g. "en"'),
        categories: z.array(z.string()).optional().describe('SearXNG categories'),
        timeRange: z.enum(['day', 'month', 'year']).optional().describe('Time range filter'),
      }),
      outputSchema: z.object({
        query: z.string(),
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
            engine: z.string().optional(),
            rank: z.number(),
          }),
        ),
        searchedAt: z.string(),
      }),
      execute: async (data) => {
        return searchSearXNG(searxngUrl, data)
      },
    }),

    web_fetch: createTool({
      id: 'web_fetch',
      description:
        'Fetch a URL and extract its readable text content. Use after web_search to read a specific page.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to fetch'),
        maxCharacters: z
          .number()
          .int()
          .min(100)
          .max(50_000)
          .optional()
          .describe('Max characters (default 20000)'),
      }),
      outputSchema: z.object({
        url: z.string(),
        finalUrl: z.string(),
        title: z.string().optional(),
        contentType: z.string(),
        content: z.string(),
        extractedAs: z.enum(['markdown', 'text']),
        retrievedAt: z.string(),
        truncated: z.boolean(),
      }),
      execute: async (data) => {
        return fetchUrl(data)
      },
    }),
  }
}
