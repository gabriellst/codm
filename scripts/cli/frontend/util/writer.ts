// File-write helpers — skip-and-warn on existing files (spec §5 conflict policy).
//
// The existing scripts/cli.ts has its own writeFiles that blindly overwrites.
// Frontend artifacts use this helper instead.

import { writeFile, mkdir, access } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface FileWrite {
	path: string
	content: string
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

// Write or print files. Skip-and-warn on existing files (spec §5 conflict policy).
// Returns the list of paths actually written (omitting skipped ones).
export async function writeFiles(files: FileWrite[], opts: { print?: boolean } = {}): Promise<string[]> {
	if (opts.print) {
		for (const f of files) {
			console.log(`// ===== ${f.path} =====`)
			console.log(f.content)
			console.log()
		}
		return []
	}

	const written: string[] = []
	for (const f of files) {
		if (await exists(f.path)) {
			console.warn(`skipped: ${f.path} already exists`)
			continue
		}
		await mkdir(dirname(f.path), { recursive: true })
		await writeFile(f.path, f.content, 'utf8')
		console.log(`created: ${f.path}`)
		written.push(f.path)
	}
	return written
}
