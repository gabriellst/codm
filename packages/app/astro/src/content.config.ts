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
			// D3 (design/codm.pen `ji2y3` → `VQNHl`, blog index filters/chips): one of a
			// closed set — label text lives in `blog/_content/categories.ts`, never inline.
			category: z.enum(['product', 'engineering', 'use-cases']),
		}),
})

/** UI copy for the blog index/post chrome that isn't per-post content — index
 * heading/subtitle, empty state, and the post page's back-link/reading-time/next-post
 * microcopy (design/codm.pen `ji2y3` → `VQNHl`/`oB3An`). */
const blogUi = defineCollection({
	loader: glob({
		pattern: 'ui.*.json',
		base: './src/pages/[locale]/blog/_content',
		generateId: ({ entry }) => entry.replace(/\.json$/, ''),
	}),
	schema: z.object({
		index: z.object({
			title: z.string(),
			subtitle: z.string(),
			empty: z.string(),
			filterAll: z.string(),
			readPost: z.string(),
		}),
		post: z.object({
			back: z.string(),
			minReadSuffix: z.string(), // composed as `${n} ${minReadSuffix}`
			nextPost: z.string(),
		}),
	}),
})

export const collections = { blog, landing, plans, blogUi }
