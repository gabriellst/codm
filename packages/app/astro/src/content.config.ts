import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

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

const landing = defineCollection({
	loader: glob({ pattern: '**/landing.json', base: './src/content/i18n' }),
	schema: z.object({
		brand: z.string(),
		signIn: z.string(),
		getStarted: z.string(),
		openApp: z.string(),
		hero: z.object({
			title: z.string(),
			subtitle: z.string(),
			primaryCta: z.string(),
			secondaryCta: z.string(),
		}),
		features: z.object({
			fast: z.object({ title: z.string(), description: z.string() }),
			typesafe: z.object({ title: z.string(), description: z.string() }),
			domain: z.object({ title: z.string(), description: z.string() }),
		}),
		footer: z.object({ copyright: z.string() }),
	}),
})

export const collections = { blog, landing }
