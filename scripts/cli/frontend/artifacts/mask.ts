// `bun cli mask <name>` (spec §5.7).
//
// Appends a Maskito options export to packages/app/react/src/lib/masks.ts.
// `<name>` is camelCase; the export is named `<name>MaskOptions`.
//
// Conflict policy: if `export const <name>MaskOptions` already exists, skips
// and warns. Mutually exclusive: --pattern XOR --ref.

import type { Generator } from '../../types'
import { readFile, writeFile } from 'node:fs/promises'
import { readValue } from '../util/flags'

const MASKS_PATH = 'packages/app/react/src/lib/masks.ts'

export const maskGenerator: Generator = async (pos, flags) => {
	const [name] = pos
	if (!name) {
		console.error(
			[
				'mask <name> (--pattern=<spec> | --ref=<existingMask>) [--mode=numeric|text]',
				'',
				'  --pattern=auto emits a placeholder skeleton for hand-editing.',
			].join('\n'),
		)
		process.exit(1)
	}

	const pattern = readValue(flags, 'pattern')
	const ref = readValue(flags, 'ref')
	const mode = readValue(flags, 'mode')

	if (!pattern && !ref) {
		console.error('[mask] exactly one of --pattern / --ref is required (use --pattern=auto for placeholder)')
		process.exit(1)
	}
	if (pattern && ref) {
		console.error('[mask] --pattern and --ref are mutually exclusive')
		process.exit(1)
	}

	const exportName = `${name}MaskOptions`
	const existing = await readFile(MASKS_PATH, 'utf8').catch(() => '')
	if (existing.includes(`export const ${exportName}`)) {
		console.warn(`skipped: ${exportName} already exists in ${MASKS_PATH}`)
		return []
	}

	let valueExpr: string
	if (ref) {
		valueExpr = `${ref}MaskOptions`
	} else if (pattern === 'auto') {
		valueExpr = `{\n\t// TODO: define mask\n\tmask: [/* fill */],\n}`
	} else {
		// Heuristic: leading '/' or 'new RegExp' → regex source verbatim; else string
		const isRegexLike = pattern!.startsWith('/') || pattern!.startsWith('[') || pattern!.startsWith('new RegExp')
		valueExpr = `{\n\tmask: ${isRegexLike ? pattern : JSON.stringify(pattern)},${mode ? `\n\tmode: '${mode}',` : ''}\n}`
	}

	const appended = `${existing.replace(/\s+$/, '')}\n\nexport const ${exportName}: MaskitoOptions = ${valueExpr}\n`

	if (flags.print === 'true') {
		console.log(`// ===== ${MASKS_PATH} (appended) =====`)
		console.log(appended)
		return []
	}

	await writeFile(MASKS_PATH, appended, 'utf8')
	console.log(`appended: ${exportName} to ${MASKS_PATH}`)
	return []
}
