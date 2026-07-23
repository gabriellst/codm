import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'
// Landing is a vertical slice: its collection definitions + content live inside the
// page's own folder (src/pages/_landing/content/). This file only aggregates.
import { landing, plans } from '~/pages/_landing/content/config'

const blog = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
	schema: ({ image }) =>
		z.object({
			title: z.string().min(1),
			description: z.string().min(1).max(200),
			publishedAt: z.coerce.date(),
			updatedAt: z.coerce.date().optional(),
			author: z.string().min(1),
			coverImage: image().optional(),
			tags: z.array(z.string()).default([]),
			draft: z.boolean().default(false),
			translationKey: z.string().optional(),
		}),
})

export const collections = { blog, landing, plans }
