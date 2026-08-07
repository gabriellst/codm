import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'
import { plansLoader } from './loaders/plans'

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

/**
 * Home (landing) content — definition, content, and consumers are colocated under
 * `src/pages/[locale]/_content/` (the `_content` prefix keeps it out of the file
 * router; `[locale]` is a literal on-disk folder). One JSON per locale:
 * `home.pt.json` / `home.en.json`, yielding collection ids `home.pt` / `home.en`.
 * Shared components outside the slice (Nav, Footer) consume this collection via
 * getEntry('landing', `home.${locale}`) — they depend on the collection NAME +
 * schema, never on slice file paths.
 */
export const landing = defineCollection({
	loader: glob({
		pattern: 'home.*.json',
		base: './src/pages/[locale]/_content',
		// Astro's default slug generator strips dots (`home.pt.json` → `homept`).
		// Pin the id to the dotted filename stem so consumers read `home.${locale}`.
		generateId: ({ entry }) => entry.replace(/\.json$/, ''),
	}),
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
			downloadMac: z.string(), // honest primary CTA label — macOS (Apple Silicon) only, no OS detection
			gatekeeperNote: z.string(), // unsigned build disclaimer shown under the download button
			otherOs: z.string(), // "Windows/Linux coming soon" microcopy
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
		pricing: z.object({ free: z.string(), perMonth: z.string() }), // consumed by PricingSection (built, not mounted — D8)
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

/** Plans content is landing-only (PricingSection — built, not mounted — D8). */
export const plans = defineCollection({
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
