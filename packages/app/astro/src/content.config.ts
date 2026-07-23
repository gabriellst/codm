import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'
// Content is colocated with its pages under the dynamic-route folder. `[locale]`
// is a LITERAL directory name on disk (Astro's dynamic segment), and the glob
// `base` below is a filesystem path — the brackets are literal, never globbed.
// The `_content` prefix keeps these files out of the file router.
import { landing, plans } from './pages/[locale]/_content/config'

const blog = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/pages/[locale]/blog/_content' }),
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
			// Links a post to its sibling in the other locale (same key on both).
			// Absent = this post has no translation; that is normal, not an error.
			translationKey: z.string().optional(),
		}),
})

export const collections = { blog, landing, plans }
