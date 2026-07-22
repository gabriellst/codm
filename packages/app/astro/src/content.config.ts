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

const feature = z.object({ title: z.string(), description: z.string() })

const landing = defineCollection({
	loader: glob({ pattern: '**/landing.json', base: './src/content/i18n' }),
	schema: z.object({
		nav: z.object({ docs: z.string(), download: z.string() }),
		hero: z.object({
			eyebrow: z.string(),
			title: z.string(),
			subtitle: z.string(),
			primaryCta: z.string(),
			secondaryCta: z.string(),
			flow: z.object({
				channels: z.array(z.string()),
				target: z.string(),
			}),
		}),
		featuresHeading: z.string(),
		features: z.object({
			channels: feature,
			issues: feature,
			human: feature,
			local: feature,
		}),
		cta: z.object({
			title: z.string(),
			subtitle: z.string(),
			primary: z.string(),
			secondary: z.string(),
			note: z.string(),
		}),
		footer: z.object({ copyright: z.string() }),
	}),
})

export const collections = { blog, landing }
