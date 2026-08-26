import { glob } from 'glob'
import { join } from 'node:path'
import { ROOT } from '../core/paths'
import { BACKEND_GLOBS, DRIZZLE_SCHEMA_DIR, FRONTEND_GLOBS, IGNORE_TS } from '../core/config'

// All globs are resolved against ROOT (not cwd) so the package works regardless of where it's invoked.
const DRIZZLE_GLOBS: string[] = [`${DRIZZLE_SCHEMA_DIR}/*.ts`]

export interface DiscoveredFiles {
	backend: string[]
	frontend: string[]
	drizzle: string[]
}

export async function discoverFiles(): Promise<DiscoveredFiles> {
	const ignore = IGNORE_TS

	const [backend, frontend, drizzle] = await Promise.all([
		glob(BACKEND_GLOBS, { cwd: ROOT, ignore, absolute: true }),
		glob(FRONTEND_GLOBS, { cwd: ROOT, ignore: ignore.filter(p => !p.includes('locales')), absolute: true }),
		glob(DRIZZLE_GLOBS, { cwd: ROOT, ignore, absolute: true }),
	])

	return {
		backend: backend.map(String),
		frontend: frontend.map(String),
		drizzle: drizzle.map(String),
	}
}

// Sometimes you want everything in one bag (e.g. for classifier-driven walking)
export async function discoverAll(): Promise<string[]> {
	const d = await discoverFiles()
	const set = new Set<string>([...d.backend, ...d.frontend, ...d.drizzle])
	return Array.from(set)
}

export function joinFromRoot(repoPath: string): string {
	return join(ROOT, repoPath)
}
