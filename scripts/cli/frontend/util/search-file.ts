// `--search-file` reader: extracts imports + body from a TS file whose default
// export is `z.object({...})`.
//
// The route artifact uses this when the inline `--search` DSL can't handle a
// schema (e.g. defaults with curly-brace function args). Parsing is line/brace
// based, not AST — inputs are expected to be hand-written and reasonably
// formatted. If parsing fails, ask the user to simplify the file.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface SearchFileResult {
	// Each line is a full import statement, e.g. `import { CalendarView } from '...'`.
	// `import { z } from 'zod'` is stripped — the route template emits its own.
	imports: string[]
	// The literal source between the outermost `z.object({` and the matching `})`.
	zodBody: string
}

export async function readSearchFile(path: string): Promise<SearchFileResult> {
	const absPath = resolve(process.cwd(), path)
	const raw = await readFile(absPath, 'utf8')

	const lines = raw.split('\n')
	const imports: string[] = []
	let bodyStart = -1
	let bodyEnd = -1
	let depth = 0
	let started = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		if (line.trim().startsWith('import ')) {
			// Skip the zod import; the route template emits its own.
			if (!/from\s+['"]zod['"]/.test(line)) imports.push(line)
			continue
		}
		if (!started) {
			if (/z\.object\(\{/.test(line)) {
				bodyStart = i
				started = true
				depth = 1
			}
		} else {
			for (const ch of line) {
				if (ch === '{') depth++
				else if (ch === '}') {
					depth--
					if (depth === 0) {
						bodyEnd = i
						break
					}
				}
			}
			if (bodyEnd !== -1) break
		}
	}

	if (bodyStart === -1 || bodyEnd === -1) {
		throw new Error(`[--search-file] could not find \`z.object({...})\` default export in ${path}`)
	}

	const zodBody = lines.slice(bodyStart + 1, bodyEnd).join('\n')
	return { imports, zodBody }
}
