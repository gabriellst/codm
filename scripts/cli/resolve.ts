// Verb → generator routing, shared by the cli entry (scripts/cli.ts) and the plan
// reconstructor (scripts/review-plan.ts). One source so the two can't drift.
import { backendGeneratorsFor, type BackendLang } from './backend'
import { frontendGenerators } from './frontend'
import type { Generator } from './types'

export type Platform = 'react' | 'astro'

// Cross-platform verbs route to react / astro. Single-platform verbs
// (dialog, mask, i18n, onboarding-step, store on react) stay in
// their owner registry and bypass the dispatch.
export const CROSS_PLATFORM_VERBS = new Set(['route', 'component', 'primitive', 'form'])

export function resolvePlatform(flag: string | undefined): Platform {
	if (flag === 'react' || flag === 'astro') return flag
	const cwd = process.cwd()
	if (cwd.includes('packages/app/astro')) return 'astro'
	if (cwd.includes('packages/app/react')) return 'react'
	return 'react'
}

export function getGenerators(lang: BackendLang, platform: Platform, verb: string | undefined): Record<string, Generator> {
	if (verb && CROSS_PLATFORM_VERBS.has(verb)) {
		if (platform === 'astro') {
			return {
				...backendGeneratorsFor(lang),
				[verb]: async () => {
					console.error(`bun cli ${verb} --platform=astro is not yet implemented.`)
					console.error(`Author the astro page/component manually and follow .claude/skills/${verb}/astro/SKILL.md.`)
					process.exit(2)
				},
			}
		}
		return { ...backendGeneratorsFor(lang), ...frontendGenerators }
	}
	return {
		...backendGeneratorsFor(lang),
		...frontendGenerators,
	}
}
