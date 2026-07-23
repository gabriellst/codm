import { createHash } from 'node:crypto'

export type LogTier = 'quiet' | 'info' | 'verbose' | 'trace'

export const LOG_TIER_RANK: Record<LogTier, number> = {
	quiet: 0,
	info: 1,
	verbose: 2,
	trace: 3,
}

const VALID_TIERS: readonly LogTier[] = ['quiet', 'info', 'verbose', 'trace']

export interface ParseTierResult {
	tier: LogTier
	warning: string | null
}

export function parseTier(input: string | undefined): ParseTierResult {
	if (input === undefined) return { tier: 'info', warning: null }
	if ((VALID_TIERS as readonly string[]).includes(input)) {
		return { tier: input as LogTier, warning: null }
	}
	return {
		tier: 'info',
		warning: `CODEDM_LOG=${input} is not a valid tier (expected quiet|info|verbose|trace) — falling back to info.`,
	}
}

/** Short stable badge for a session, derived from its issueId (Fork B: session identity = issue). */
export function sessionBadge(issueId: string): string {
	const hash = createHash('sha1').update(issueId).digest('hex')
	return `#${hash.slice(0, 4)}`
}

export interface ColorEnv {
	isTTY: boolean
	noColor: boolean
}

export function supportsColor(env: ColorEnv): boolean {
	if (!env.isTTY) return false
	if (env.noColor) return false
	return true
}

export type Color = 'red' | 'yellow' | 'green' | 'cyan' | 'gray' | 'dim'

const ANSI: Record<Color, string> = {
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
	dim: '\x1b[2m',
}

const RESET = '\x1b[0m'

export function colorize(text: string, color: Color, enabled: boolean): string {
	if (!enabled) return text
	return `${ANSI[color]}${text}${RESET}`
}

export const GLYPH = {
	bullet: '·',
	diamond: '◆',
	success: '✔',
	warn: '⚠',
	error: '✖',
	arrowRight: '▶',
} as const
