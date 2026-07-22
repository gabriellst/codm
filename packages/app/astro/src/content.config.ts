import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'
import { plansLoader } from '~/content/loaders/plans'

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

const chatMessage = z.object({
	kind: z.enum(['in', 'out', 'system']),
	label: z.string().optional(), // mono label above outbound bubble ("✳ coupon-focus · Claude Code")
	text: z.string(),
})
/** body = plain leading fragment; title = mono-emphasized trailing token ('' when none). */
const step = z.object({ title: z.string(), body: z.string() })
const featureCard = z.object({ kicker: z.string(), title: z.string(), body: z.string() })
const termLine = z.object({ key: z.string(), tone: z.enum(['dim', 'mid', 'faint']), text: z.string() })
const routerRow = z.object({ key: z.string(), text: z.string() })

const landing = defineCollection({
	loader: glob({ pattern: '**/landing.json', base: './src/content/i18n' }),
	schema: z.object({
		nav: z.object({
			links: z.object({
				demo: z.string(),
				router: z.string(),
				features: z.string(),
				github: z.string(),
				blog: z.string(),
			}),
			download: z.string(),
		}),
		hero: z.object({
			badge: z.string(),
			titleBold: z.string(),
			titleLight: z.string(),
			subtitle: z.string(),
			primaryCta: z.string(),
			secondaryCta: z.string(),
		}),
		marquee: z.object({ items: z.array(z.string()).min(4) }),
		demo: z.object({
			eyebrow: z.string(),
			title: z.string(),
			body: z.string(),
			steps: z.array(step).length(3),
			chat: z.object({
				initials: z.string(),
				name: z.string(),
				meta: z.string(),
				status: z.string(),
				messages: z.array(chatMessage).min(4),
			}),
		}),
		router: z.object({
			eyebrow: z.string(),
			titleBold: z.string(),
			titleLight: z.string(),
			body: z.string(),
			rows: z.array(routerRow).length(4),
			terminal: z.object({ header: z.string(), lines: z.array(termLine).min(6) }),
		}),
		features: z.object({
			title: z.string(),
			intro: z.string(),
			cards: z.array(featureCard).length(6), // ISSUES/LABELS/WHISPERS/STOPS/ARTIFACTS/LOCAL
			controls: z.array(z.string()).length(6), // outlined mono chips
		}),
		closingCta: z.object({
			titleBold: z.string(),
			titleLight: z.string(),
			note: z.string(),
			primary: z.string(),
			secondary: z.string(),
		}),
		footer: z.object({
			copyright: z.string(),
			links: z.object({ github: z.string().url(), docs: z.string(), changelog: z.string() }),
		}),
	}),
})

const plans = defineCollection({
	loader: plansLoader(),
	schema: z.object({
		id: z.string(),
		order: z.number().int(),
		price: z.object({ monthly: z.number(), currency: z.string() }), // 0 = free/OSS tier
		highlighted: z.boolean().default(false),
		copy: z.record(
			z.enum(['pt', 'en']),
			z.object({
				name: z.string(),
				blurb: z.string(),
				cta: z.string(),
				features: z.array(z.string()),
			}),
		),
	}),
})

export const collections = { blog, landing, plans }
