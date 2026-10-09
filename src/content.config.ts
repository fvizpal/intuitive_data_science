import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const concepts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/concepts' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    track: z.enum(['optimization', 'models', 'evaluation', 'statistics', 'credit-risk']),
    level: z.enum(['beginner', 'intermediate', 'advanced']),
    minutes: z.number().int().positive(),
    prerequisites: z.array(z.string()).default([]),
    summary: z.string(),
    /** Optional one-liner for social cards; falls back to `summary`. */
    share: z.string().optional(),
  }),
});

export const collections = { concepts };
