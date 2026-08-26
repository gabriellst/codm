import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'
import { plansLoader } from './loaders/plans'

// D3 (design/codm.pen, group `ji2y3`) reshaped every section below — schema mirrors the
// design's own node names/copy so `home.*.json` reads as a transcription, not a guess.
const howItWorksCard = z.object({
	number: z.string(),
	title: z.string(),
	body: z.string(),
})
const capabilityCard = z.object({
	icon: z.enum(['sparkles', 'ear', 'repeat', 'shield-check', 'hard-drive', 'bot']),
	tag: z.string(),
	title: z.string(),
	body: z.string(),
})
const useCase = z.object({ number: z.string(), title: z.string(), body: z.string() })
const chip = z.object({ icon: z.enum(['sparkles', 'ear', 'dot']), text: z.string() })
const footerLink = z.object({ label: z.string(), href: z.string() })

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
				howItWorks: z.string(),
				useCases: z.string(),
				pricing: z.string(),
				blog: z.string(),
				github: z.string(), // includes the trailing "↗" glyph, same copy source as the footer label
			}),
			download: z.string(),
		}),
		hero: z.object({
			tagline: z.string(), // "Código aberto · roda na sua máquina"
			freeChip: z.string(), // "grátis"
			titleBold: z.string(),
			titleLight: z.string(),
			subtitle: z.string(), // may contain \n — rendered with whitespace-pre-line
			// "Download para {platform}" — `{platform}` vira macOS / Windows / Linux (config/download.ts,
			// detecção no cliente). Reusado pelo card de preço + CTA do footer. Nomes de SO só aqui.
			ctaDownload: z.string().includes('{platform}'),
			// O aviso do Windows (DownloadWindowsNote.astro): o instalador de lá não tem assinatura
			// Authenticode, então o SmartScreen bloqueia o download. Quatro campos porque o aviso tem
			// quatro trabalhos distintos — dizer O QUE é, POR QUE acontece, QUAIS cliques seguir, e
			// oferecer a verificação a quem prefere conferir a confiar.
			windowsNoteTitle: z.string(),
			windowsNoteBody: z.string(),
			windowsNoteSteps: z.string(),
			windowsNoteChecksum: z.string(),
			otherPlatforms: z.string(), // "Outras plataformas" — título da lista completa sob o CTA
			ctaGithub: z.string(),
			cards: z.object({
				message: z.object({ sender: z.string(), text: z.string() }),
				task: z.object({ key: z.string(), status: z.string(), sub: z.string() }),
				skill: z.object({ text: z.string() }),
				reply: z.object({ label: z.string(), text: z.string() }),
				terminal: z.object({ path: z.string(), lines: z.array(z.string()).length(3) }),
			}),
		}),
		howItWorks: z.object({
			title: z.string(),
			subtitle: z.string(),
			cards: z.tuple([
				howItWorksCard.extend({ bubble: z.string(), status: z.string() }),
				howItWorksCard.extend({ terminalLabel: z.string(), terminalLines: z.array(z.string()).length(3) }),
				howItWorksCard.extend({ tag: z.string(), bubble: z.string() }),
			]),
			chips: z.array(chip).length(3),
		}),
		capabilities: z.object({
			titleBold: z.string(),
			titleLight: z.string(),
			cards: z.array(capabilityCard).length(6),
		}),
		useCases: z.object({
			title: z.string(),
			cases: z.array(useCase).length(4),
		}),
		pricing: z.object({
			badgeLine1: z.string(), // "Grátis. Open Source"
			badgeLine2: z.string(), // "Roda localmente na sua máquina"
			explanation: z.string(),
			includedTitle: z.string(),
			included: z.array(z.string()).length(8),
			perMonth: z.string(), // "/mês" — used if a future plan has monthly > 0
			forever: z.string(), // "/para sempre" — used for the free/local plan
			futureNote: z.string(), // b1GR9 — "term — future plans" disclosure
			chipMit: z.string(),
			chipNoAccount: z.string(),
		}),
		footer: z.object({
			headline: z.string(), // may contain \n
			explore: z.object({ title: z.string(), links: z.array(footerLink).length(4) }),
			project: z.object({ title: z.string(), links: z.array(footerLink).length(3) }),
			copyright: z.string(),
			privacy: z.string(),
			terms: z.string(),
			// SP4 — transparency disclosure (Emenda 2026-08-07: the "zero telemetria" promise is
			// gone; this is its honest replacement). Not in the design's footer node, but a
			// compliance requirement the design doesn't reject — kept as a quiet caption line.
			telemetryNotice: z.string(),
		}),
	}),
})

/** Plans content is landing-only (PricingSection). */
export const plans = defineCollection({
	loader: plansLoader(),
	schema: z.object({
		id: z.string(),
		order: z.number().int(),
		price: z.object({ monthly: z.number() }), // 0 = free/local tier. Currency is a locale presentation choice (R$ pt / $ en), not per-plan data — see PricingSection.
		copy: z.record(
			z.enum(['pt', 'en']),
			z.object({
				name: z.string(),
				blurb: z.string(),
			}),
		),
	}),
})
