// scripts/create-template/render-manifest.ts — MANIFEST CLOSURE engine for create-template.
//
// A stamped copy's template.config.ts must declare ONLY the kept workspaces and their env keys —
// otherwise the workspace-contract gate (scripts/lib/repo-model.test.ts) fails inside the stamp
// against pkgRoots that were pruned from disk. Rewriting arbitrary TS with regexes is the fragile
// path; instead the manifest DECLARES its stamp-managed regions with explicit marker comments:
//
//   // ── STAMP-MANAGED: <name> — <contract prose> ──
//   <object literal whose TOP-LEVEL ENTRIES are keyed by ids the stamping relation understands>
//   // ── STAMP-MANAGED-END: <name> ──
//
// This module is the ONE interpreter of that contract. It parses each marked block with a small
// string/template/comment-aware frame scanner (never a regex over arbitrary TS), splits the object
// literal into LOSSLESS per-entry text ranges (each entry carries its leading trivia — comments
// attach to the entry below them; every entry must end in a trailing comma so any subset stays
// valid TS), and re-renders the block keeping only the entries whose key is in the plan's keep-set.
// DATA decides WHAT survives (set algebra in plan.ts over REPO); TEXT is preserved byte-for-byte
// for what stays — so rendering with every key kept MUST reproduce the committed file exactly.
// That identity is the faithfulness gate (render-manifest.test.ts, same class as
// `bun env:generate --check`), and it makes the gate self-maintaining INSIDE a stamp: the stamped
// blocks are this renderer's own output.
import type { ManifestKeep } from './plan'

/** The manifest file — the repo-identity contract this engine rewrites (repo-relative). */
export const MANIFEST_FILE = 'template.config.ts'

/** The managed blocks, in file order. Keys of each block map 1:1 onto the same-named REPO field. */
export const MANAGED_BLOCKS = ['workspaces', 'workspaceRoots', 'packageRoots', 'env'] as const
export type ManagedBlockName = (typeof MANAGED_BLOCKS)[number]

const startMarker = (name: string) => `── STAMP-MANAGED: ${name} —`
const endMarker = (name: string) => `── STAMP-MANAGED-END: ${name} ──`

export interface ManagedBlockEntry {
	key: string
	/** Exact source slice: leading trivia (whitespace + attached comments) through the trailing comma. */
	text: string
}

export interface ParsedManagedBlock {
	/** Everything from the start of the block region through the literal's opening `{`. */
	prefix: string
	entries: ManagedBlockEntry[]
	/** Trailing trivia after the last entry plus the closing `}` and the rest of the region. */
	suffix: string
}

export class ManifestContractError extends Error {}

function findOnce(source: string, needle: string, what: string): number {
	const first = source.indexOf(needle)
	if (first === -1) throw new ManifestContractError(`manifest contract violated: missing ${what} (“${needle}”)`)
	if (source.indexOf(needle, first + needle.length) !== -1)
		throw new ManifestContractError(`manifest contract violated: duplicated ${what} (“${needle}”)`)
	return first
}

// ─── Frame scanner ──────────────────────────────────────────────────────────
// One walker for both consumers. It steps through source text tracking a stack of open contexts
// (grouping frames + string/template/comment modes) and yields every character that sits in CODE
// position together with the currently open grouping frames. `${…}` inside a template pushes an
// 'interp' frame so its closing `}` never masquerades as an object-literal close.

type Frame = 'brace' | 'bracket' | 'paren' | 'interp' | 'single' | 'double' | 'template' | 'line' | 'block'
const GROUPING: readonly Frame[] = ['brace', 'bracket', 'paren', 'interp']

interface CodePoint {
	i: number
	ch: string
	/** Open grouping frames BEFORE this char applies ('{' yields with its own frame not yet pushed). */
	groups: number
	/** For '}' — the frame it will close ('interp' closes back into a template literal). */
	closes?: Frame
}

function* walkCode(source: string, from: number, to: number): Generator<CodePoint> {
	const stack: Frame[] = []
	const top = () => stack[stack.length - 1]
	const groups = () => stack.filter(f => GROUPING.includes(f)).length
	for (let i = from; i < to; i++) {
		const ch = source[i] as string
		const next = source[i + 1]
		switch (top()) {
			case 'single':
			case 'double': {
				if (ch === '\\') i++
				else if ((top() === 'single' && ch === "'") || (top() === 'double' && ch === '"')) stack.pop()
				break
			}
			case 'template': {
				if (ch === '\\') i++
				else if (ch === '`') stack.pop()
				else if (ch === '$' && next === '{') {
					stack.push('interp')
					i++
				}
				break
			}
			case 'line': {
				if (ch === '\n') stack.pop()
				break
			}
			case 'block': {
				if (ch === '*' && next === '/') {
					stack.pop()
					i++
				}
				break
			}
			default: {
				// CODE position (root or inside a grouping frame).
				if (ch === '}') yield { i, ch, groups: groups(), closes: top() === 'interp' ? 'interp' : 'brace' }
				else yield { i, ch, groups: groups() }
				if (ch === "'") stack.push('single')
				else if (ch === '"') stack.push('double')
				else if (ch === '`') stack.push('template')
				else if (ch === '/' && next === '/') stack.push('line')
				else if (ch === '/' && next === '*') {
					stack.push('block')
					i++
				} else if (ch === '{') stack.push('brace')
				else if (ch === '[') stack.push('bracket')
				else if (ch === '(') stack.push('paren')
				else if (ch === '}' || ch === ']' || ch === ')') stack.pop()
			}
		}
	}
}

/** Index of the `}` matching the `{` at `openIdx` (scanner-aware). */
function matchBrace(source: string, openIdx: number): number {
	if (source[openIdx] !== '{') throw new ManifestContractError('manifest contract violated: matchBrace must start on `{`')
	let depth = 0
	for (const point of walkCode(source, openIdx, source.length)) {
		if (point.ch === '{') depth++
		else if (point.ch === '}' && point.closes === 'brace') {
			depth--
			if (depth === 0) return point.i
		}
	}
	throw new ManifestContractError('manifest contract violated: unbalanced braces (no matching })')
}

/** Depth-0 commas of an object-literal body — the split points between entries (scanner-aware). */
function topLevelCommas(body: string): number[] {
	const commas: number[] = []
	for (const point of walkCode(body, 0, body.length)) {
		if (point.ch === ',' && point.groups === 0) commas.push(point.i)
	}
	return commas
}

/** Strip comments from an entry slice, then read its leading `key:` identifier. */
function entryKey(text: string): string {
	const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
	const match = noComments.match(/([A-Za-z_$][\w$]*)\s*:/)
	if (!match?.[1])
		throw new ManifestContractError(`manifest contract violated: managed entry without a \`key:\` — “${text.trim().slice(0, 60)}”`)
	return match[1]
}

/** Parse one STAMP-MANAGED block out of the manifest source. Throws on any contract violation. */
export function parseManagedBlock(source: string, name: ManagedBlockName): ParsedManagedBlock {
	const startIdx = findOnce(source, startMarker(name), `start marker for block '${name}'`)
	const endIdx = findOnce(source, endMarker(name), `end marker for block '${name}'`)
	if (endIdx < startIdx) throw new ManifestContractError(`manifest contract violated: end marker for '${name}' precedes its start marker`)

	const regionStart = source.indexOf('\n', startIdx) + 1
	const region = source.slice(regionStart, endIdx)
	const openRel = region.indexOf('{')
	if (openRel === -1) throw new ManifestContractError(`manifest contract violated: block '${name}' has no object literal`)
	const closeRel = matchBrace(region, openRel)

	const body = region.slice(openRel + 1, closeRel)
	const commas = topLevelCommas(body)
	// Every entry must end with a trailing comma (biome style) so any kept subset stays valid TS.
	const tail = body.slice((commas[commas.length - 1] ?? -1) + 1)
	if (tail.trim() !== '')
		throw new ManifestContractError(`manifest contract violated: block '${name}' has an entry without a trailing comma`)

	const entries: ManagedBlockEntry[] = []
	let cursor = 0
	for (const comma of commas) {
		const text = body.slice(cursor, comma + 1)
		entries.push({ key: entryKey(text), text })
		cursor = comma + 1
	}
	return {
		prefix: region.slice(0, openRel + 1),
		entries,
		suffix: body.slice(cursor) + region.slice(closeRel),
	}
}

/** The entry keys a block declares, in source order — gated 1:1 against the same-named REPO field. */
export function managedBlockKeys(source: string, name: ManagedBlockName): string[] {
	return parseManagedBlock(source, name).entries.map(e => e.key)
}

const CONSUMERS_RE = /consumers:\s*\[([^\]]*)\]/

/**
 * Drop pruned workspace ids from a surviving env entry's `consumers: [...]` list. A stamped
 * manifest must not NAME workspaces it no longer declares — a shared key (DATABASE_URL) survives
 * because a kept consumer remains, but its list must shrink to the kept ids. When every id is
 * kept the entry text is returned UNCHANGED byte-for-byte (the faithfulness gate depends on it).
 */
export function filterEntryConsumers(text: string, kept: ReadonlySet<string>): string {
	return text.replace(CONSUMERS_RE, (whole, inner: string) => {
		const ids = inner
			.split(',')
			.map(s => s.trim())
			.filter(Boolean)
		const keptIds = ids.filter(raw => kept.has(raw.replace(/['"]/g, '')))
		if (keptIds.length === ids.length) return whole
		return `consumers: [${keptIds.join(', ')}]`
	})
}

/** Re-render ONE managed block, keeping exactly the entries whose key is in `keep`. Keeping every
 *  key is the identity function on the source, byte for byte. `transform` (env block: consumers
 *  filtering) maps each KEPT entry's text; identity when nothing changes. */
export function renderManagedBlock(
	source: string,
	name: ManagedBlockName,
	keep: ReadonlySet<string>,
	transform: (text: string) => string = t => t,
): string {
	const startIdx = findOnce(source, startMarker(name), `start marker for block '${name}'`)
	const endIdx = findOnce(source, endMarker(name), `end marker for block '${name}'`)
	const regionStart = source.indexOf('\n', startIdx) + 1
	const block = parseManagedBlock(source, name)
	const rendered =
		block.prefix +
		block.entries
			.filter(e => keep.has(e.key))
			.map(e => transform(e.text))
			.join('') +
		block.suffix
	return source.slice(0, regionStart) + rendered + source.slice(endIdx)
}

/**
 * Re-render the manifest for a stamp: every managed block keeps exactly the plan's keep-set.
 * With full keep-sets this reproduces the source byte-for-byte — the faithfulness gate depends
 * on it.
 */
export function renderStampedManifest(source: string, keep: ManifestKeep): string {
	// Surviving env entries may only NAME kept workspaces (plus 'compose', which always ships).
	const keptConsumers = new Set([...keep.workspaces, 'compose'])
	let out = source
	for (const name of MANAGED_BLOCKS) {
		const transform = name === 'env' ? (text: string) => filterEntryConsumers(text, keptConsumers) : undefined
		out = renderManagedBlock(out, name, new Set(keep[name]), transform)
	}
	return out
}
