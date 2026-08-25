// `bun cli i18n <namespace>` — the lock-step PT/EN writer.
//
// Spec §7 contract:
//   - Atomic: write both files via temp+rename; staged together
//   - Lock-step: PT and EN must end with identical key sets
//   - Deterministic: alphabetical key sort, 2-space indent, trailing newline
//   - Deep-merge: never overwrite existing leaves unless --force
//   - Reserved namespace: `errors.*` is refused (backend owns API error codes)
//   - `enums.*` is the canonical home for frontend enum labels — t(`enums.<EnumName>.<VALUE>`).
//     See .claude/skills/enum/registry.yaml ENUM-P08, ENUM-P11.
//   - Stub defaults: TODO[PT] / TODO[EN]
//
// Also exposes `writeI18n()` for programmatic auto-trigger from other artifacts.

import type { Generator } from '../../types'
import { type JsonObject, buildPatch, deepMerge, flatten, readJsonFile, sortKeys, stringify, writeManyAtomically } from '../util/json-patch'
import { parseCsv, parseKvSpec } from '../util/flags'

const PT_PATH = 'packages/app/react/src/locales/pt.json'
const EN_PATH = 'packages/app/react/src/locales/en.json'
// Only `errors.*` is reserved — those are API error codes mapped 1:1 from the
// backend's GlobalErrorMapper. `enums.*` is allowed because it's the canonical
// home for frontend enum labels (see ENUM-P08).
const RESERVED_NAMESPACES = new Set(['errors'])

export interface I18nWriteOptions {
	namespace: string
	keys: string[]
	withPt?: Map<string, string>
	withEn?: Map<string, string>
	force?: boolean
	print?: boolean
}

// Programmatic entry point used by other artifacts (route, component, dialog, etc.)
// when their `--i18n=<prefix>` flag auto-triggers the writer.
export async function writeI18n(opts: I18nWriteOptions): Promise<void> {
	const { namespace, keys } = opts
	const topLevel = namespace.split('.')[0]
	if (RESERVED_NAMESPACES.has(topLevel)) {
		throw new Error(`[i18n] namespace "${namespace}" starts with a reserved prefix (errors.*). Backend GlobalErrorMapper owns that.`)
	}
	if (keys.length === 0) {
		// Nothing to write — harmless no-op so auto-triggers don't have to guard.
		return
	}

	const prefixed = keys.map(k => `${namespace}.${k}`)
	const ptPatch = buildPatch(prefixed, k => {
		const tail = k.slice(namespace.length + 1)
		return opts.withPt?.get(tail) ?? 'TODO[PT]'
	})
	const enPatch = buildPatch(prefixed, k => {
		const tail = k.slice(namespace.length + 1)
		return opts.withEn?.get(tail) ?? 'TODO[EN]'
	})

	if (opts.print) {
		console.log(`// ===== ${PT_PATH} patch =====`)
		console.log(stringify(ptPatch))
		console.log(`// ===== ${EN_PATH} patch =====`)
		console.log(stringify(enPatch))
		return
	}

	const pt = await readJsonFile(PT_PATH)
	const en = await readJsonFile(EN_PATH)
	deepMerge(pt, ptPatch, opts.force ?? false)
	deepMerge(en, enPatch, opts.force ?? false)
	const ptSorted = sortKeys(pt) as JsonObject
	const enSorted = sortKeys(en) as JsonObject

	// Lock-step validation: identical key sets between PT and EN.
	const ptKeys = new Set(flatten(ptSorted).keys())
	const enKeys = new Set(flatten(enSorted).keys())
	const onlyPt = [...ptKeys].filter(k => !enKeys.has(k))
	const onlyEn = [...enKeys].filter(k => !ptKeys.has(k))
	if (onlyPt.length || onlyEn.length) {
		const lines = ['[i18n] lock-step violation: PT and EN have different key sets.']
		if (onlyPt.length) lines.push(`  Only in PT: ${onlyPt.join(', ')}`)
		if (onlyEn.length) lines.push(`  Only in EN: ${onlyEn.join(', ')}`)
		throw new Error(lines.join('\n'))
	}

	await writeManyAtomically([
		{ path: PT_PATH, content: stringify(ptSorted) },
		{ path: EN_PATH, content: stringify(enSorted) },
	])
	console.log(`i18n: wrote ${prefixed.length} key(s) to pt.json + en.json under "${namespace}"`)
}

// CLI entry point — registered as `bun cli i18n <namespace>`.
export const i18nGenerator: Generator = async (positional, flags) => {
	const [namespace] = positional

	// --validate mode: read both files, compare key sets, exit non-zero on drift.
	if (flags.validate === 'true') {
		const pt = await readJsonFile(PT_PATH)
		const en = await readJsonFile(EN_PATH)
		const ptKeys = new Set(flatten(pt).keys())
		const enKeys = new Set(flatten(en).keys())
		const onlyPt = [...ptKeys].filter(k => !enKeys.has(k))
		const onlyEn = [...enKeys].filter(k => !ptKeys.has(k))
		if (onlyPt.length || onlyEn.length) {
			console.error('[i18n --validate] drift detected:')
			if (onlyPt.length) console.error(`  Only in PT: ${onlyPt.join(', ')}`)
			if (onlyEn.length) console.error(`  Only in EN: ${onlyEn.join(', ')}`)
			process.exit(1)
		}
		console.log('[i18n --validate] PT and EN are in sync.')
		return []
	}

	if (!namespace) {
		console.error('i18n <namespace> --keys=<csv> [--with-pt=<spec>] [--with-en=<spec>] [--force] [--validate] [--print]')
		process.exit(1)
	}

	await writeI18n({
		namespace,
		keys: parseCsv(flags.keys),
		withPt: parseKvSpec(flags['with-pt']),
		withEn: parseKvSpec(flags['with-en']),
		force: flags.force === 'true',
		print: flags.print === 'true',
	})
	// Return empty list — this verb mutates JSON files directly, not through `output()`.
	return []
}
