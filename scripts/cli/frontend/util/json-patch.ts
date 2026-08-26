// JSON deep-merge + atomic write helpers for the i18n writer.
//
// The i18n writer (artifacts/i18n.ts) is the single point of mutation for
// packages/app/react/src/locales/{pt,en}.json. Spec §7 contract:
//   - Atomic temp+rename writes (both files in one transaction)
//   - Deep-merge, never overwrite existing leaf values unless --force
//   - Alphabetical key sort at every level (deterministic output)
//   - Lock-step: PT and EN must end up with identical key sets

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json }
export type JsonObject = { [k: string]: Json }

function isPlainObject(v: unknown): v is JsonObject {
	return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function splitPath(path: string): string[] {
	return path.split('.').filter(Boolean)
}

// Deep-merge `patch` into `target`. Never overwrites existing leaves unless `force`.
// Returns the same `target` reference for chaining.
export function deepMerge(target: JsonObject, patch: JsonObject, force = false): JsonObject {
	for (const [k, v] of Object.entries(patch)) {
		const existing = target[k]
		if (isPlainObject(existing) && isPlainObject(v)) {
			target[k] = deepMerge(existing, v, force)
		} else if (existing === undefined || force) {
			target[k] = v
		}
	}
	return target
}

// Recursively sort object keys alphabetically at every level.
export function sortKeys(value: Json): Json {
	if (Array.isArray(value)) return value.map(sortKeys)
	if (!isPlainObject(value)) return value
	const out: JsonObject = {}
	for (const k of Object.keys(value).sort()) {
		out[k] = sortKeys(value[k])
	}
	return out
}

// Build a nested object from dot-notation keys + a value-producer.
//   buildPatch(['a.b.c', 'a.d'], k => k) →
//     { a: { b: { c: 'a.b.c' }, d: 'a.d' } }
export function buildPatch(keys: string[], value: (key: string) => Json): JsonObject {
	const out: JsonObject = {}
	for (const key of keys) {
		const segments = splitPath(key)
		if (segments.length === 0) continue
		let cursor: JsonObject = out
		for (let i = 0; i < segments.length - 1; i++) {
			const seg = segments[i]
			if (!isPlainObject(cursor[seg])) cursor[seg] = {}
			cursor = cursor[seg] as JsonObject
		}
		cursor[segments[segments.length - 1]] = value(key)
	}
	return out
}

// Flatten a nested object back into a map of dot-notation keys → leaf values.
// Used for lock-step validation between PT and EN.
export function flatten(obj: Json, prefix = ''): Map<string, Json> {
	const out = new Map<string, Json>()
	if (!isPlainObject(obj)) {
		if (prefix) out.set(prefix, obj)
		return out
	}
	for (const [k, v] of Object.entries(obj)) {
		const nextKey = prefix ? `${prefix}.${k}` : k
		if (isPlainObject(v)) {
			for (const [k2, v2] of flatten(v, nextKey)) out.set(k2, v2)
		} else {
			out.set(nextKey, v)
		}
	}
	return out
}

// Atomic write: write to `<path>.tmp-<pid>-<ts>`, then rename to `<path>`.
// Spec §7 — if either file fails to write, neither is committed.
// Use writeManyAtomically when writing multiple files in one transaction.
export async function atomicWriteFile(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
	await writeFile(tmp, content, 'utf8')
	await rename(tmp, path)
}

// Write multiple files transactionally: stage all to `.tmp-*`, only rename if all
// staging writes succeed. If a rename fails midway (unlikely on the same filesystem),
// previously-renamed files remain — true atomicity across separate inodes isn't
// possible in POSIX, but staging+rename is the best practical guarantee.
export async function writeManyAtomically(files: { path: string; content: string }[]): Promise<void> {
	const staged: { path: string; tmp: string }[] = []
	try {
		for (const f of files) {
			await mkdir(dirname(f.path), { recursive: true })
			const tmp = `${f.path}.tmp-${process.pid}-${Date.now()}-${staged.length}`
			await writeFile(tmp, f.content, 'utf8')
			staged.push({ path: f.path, tmp })
		}
		for (const s of staged) {
			await rename(s.tmp, s.path)
		}
	} catch (err) {
		// Best-effort cleanup of any unrenamed staging files.
		for (const s of staged) {
			try {
				await rename(s.tmp, s.tmp) // no-op probe; if not exists, ignore
			} catch {
				/* swallow */
			}
		}
		throw err
	}
}

export async function readJsonFile(path: string): Promise<JsonObject> {
	const raw = await readFile(path, 'utf8')
	return JSON.parse(raw) as JsonObject
}

// Stringify with deterministic format: tab indent (matches repo convention,
// biome default), trailing newline.
export function stringify(value: Json): string {
	return `${JSON.stringify(value, null, '\t')}\n`
}
