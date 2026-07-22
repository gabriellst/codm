/**
 * API discovery — walks `packages/api/<service>/` for `openapi.json`.
 * Each match becomes `{ service, specPath }`. The service folder name is the
 * unique identifier; the implementation language of the service does not
 * matter to the SDK pipeline.
 *
 * Spec is located at either `<service>/public/docs/openapi.json` (utoipa
 * convention) or `<service>/public/openapi.json` (Go walker output).
 */
import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export interface ApiSource {
	service: string
	specPath: string
}

const SPEC_SUFFIXES = [
	['public', 'docs', 'openapi.json'],
	['public', 'openapi.json'],
] as const

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

async function findSpec(rootDir: string): Promise<string | null> {
	for (const suffix of SPEC_SUFFIXES) {
		const candidate = join(rootDir, ...suffix)
		if (await fileExists(candidate)) return candidate
	}
	return null
}

export async function discoverApis(repoRoot: string): Promise<ApiSource[]> {
	const apiRoot = join(repoRoot, 'packages', 'api')
	if (!(await fileExists(apiRoot))) return []

	const services = (await readdir(apiRoot, { withFileTypes: true }))
		.filter(d => d.isDirectory())
		.map(d => d.name)
		.sort()

	const sources: ApiSource[] = []
	for (const service of services) {
		const spec = await findSpec(join(apiRoot, service))
		if (spec) sources.push({ service, specPath: spec })
	}
	return sources
}

export function formatSpecPath(source: ApiSource, repoRoot: string): string {
	return relative(repoRoot, source.specPath)
}
