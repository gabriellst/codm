// scripts/env/generate.ts — renders .env.example FROM the env registry (template.config.ts REPO.env).
// The registry is the single structural truth for env keys; this file is its .env.example compiler.
// Usage: `bun env:generate` (writes .env.example) · `bun env:generate --check` (exit 1 on drift —
// the shape the env-model architecture rail shells out to).
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO, type EnvDecl } from '../../template.config'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TARGET = resolve(ROOT, '.env.example')

// Rendering sections — declarative predicates over the EnvDecl CONTRACT (first match wins).
const SECTIONS: { title: string; match: (d: EnvDecl) => boolean; note?: string }[] = [
	{ title: 'Project', match: d => d.consumers.includes('compose') },
	{
		title: 'Billing gateway credentials',
		match: d => d.group === 'billing-gateway',
		note: 'Adapters for ALL gateways ship with the template; which are ACTIVE + these secrets are the product plug.',
	},
	{ title: 'Backend — kernel (api-typescript core Config)', match: d => d.schema === 'kernel' },
	{ title: 'Backend — product (ProductConfig: brand + billing policy)', match: d => d.schema === 'product' },
	{
		title: 'Backend — boot flags (raw process.env, outside the Zod schemas)',
		match: d => d.schema === 'raw',
		note: "schema: 'raw' — read before/without Config.env by design (profile/test seams); see each entry doc.",
	},
	{ title: 'Go worker (api-go)', match: d => d.consumers.includes('apiGo') },
	{
		title: 'Frontend (only VITE_* reach the browser)',
		match: d => d.consumers.some(c => c !== 'compose' && REPO.workspaces[c].kind === 'frontend'),
	},
	{
		title: 'Parked (documented, no active consumer)',
		match: d => d.group === 'parked',
		note: 'Declared with consumers: [] on purpose — no workspace reads these yet; see each entry doc for why it is kept.',
	},
]

/** Render .env.example from an env registry — defaults to the full REPO.env; create-template
 *  passes the PRUNED registry of a stamp so the stamped file and manifest stay in lockstep. */
export function renderEnvExample(env: Record<string, EnvDecl> = REPO.env, opts: { strict?: boolean } = {}): string {
	const lines: string[] = [
		'# ===========================================',
		`# ${REPO.brand} — root environment variables`,
		'# ===========================================',
		'# GENERATED from template.config.ts REPO.env — do NOT hand-edit.',
		'# Change the registry, then run: bun env:generate',
		'# Single source for all workspaces; copy to .env and fill in secrets.',
		'',
	]
	const entries = Object.entries(env)
	const claimed = new Set<string>()
	for (const section of SECTIONS) {
		const keys = entries.filter(([k, d]) => !claimed.has(k) && section.match(d))
		for (const [k] of keys) claimed.add(k)
		if (keys.length === 0) continue
		lines.push(`# ---- ${section.title} ----`)
		if (section.note) lines.push(`# ${section.note}`)
		const regular = keys.filter(([, d]) => !d.advanced)
		const advanced = keys.filter(([, d]) => d.advanced)
		for (const [key, d] of regular) {
			const comment = d.doc ? `  # ${d.doc}` : ''
			lines.push(`${key}=${d.example}${comment}`)
		}
		if (advanced.length > 0) {
			lines.push('# advanced knobs (schema defaults are sane — uncomment to override):')
			for (const [key, d] of advanced) lines.push(`# ${key}=${d.example}`)
		}
		lines.push('')
	}
	// strict: a key claimed by no section would silently vanish from .env.example — fail instead.
	// CLI-only: fixture universes (create-template tests) render synthetic keys outside SECTIONS.
	const unclaimed = entries.filter(([k]) => !claimed.has(k)).map(([k]) => k)
	if (opts.strict && unclaimed.length > 0)
		throw new Error(`env keys match no rendering section (extend a SECTIONS predicate): ${unclaimed.join(', ')}`)
	return `${lines.join('\n').trimEnd()}\n`
}

if (import.meta.main) {
	const rendered = renderEnvExample(REPO.env, { strict: true })
	if (process.argv.includes('--check')) {
		const current = readFileSync(TARGET, 'utf8')
		if (current !== rendered) {
			console.error('✗ .env.example is out of sync with template.config.ts REPO.env — run: bun env:generate')
			process.exit(1)
		}
		console.log('✓ .env.example in sync with the env registry')
	} else {
		writeFileSync(TARGET, rendered)
		console.log(`✓ wrote .env.example (${Object.keys(REPO.env).length} keys)`)
	}
}
