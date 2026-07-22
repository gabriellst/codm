/**
 * Shared API discovery — walks `packages/api/<language>/` looking for
 * `openapi.json` files and reports each as a `(language, service, specPath)`
 * tuple. Consumed by every client SDK generator (client-typescript,
 * client-rust, client-go) so renaming an api package automatically flows
 * through to its generated client subdirectory.
 *
 * Layout convention:
 *   - Top level: language    → `packages/api/<language>/`
 *   - Bottom level: service  → either the language folder itself
 *     (implicit / single-service case, e.g. today's `packages/api/typescript/`)
 *     OR a nested folder (`packages/api/typescript/<service>/`).
 *
 * The spec is found at either of two paths (utoipa emits `/public/docs/`,
 * Go's emit-openapi writes directly under `/public/`):
 *   <service-root>/public/docs/openapi.json
 *   <service-root>/public/openapi.json
 */

import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export interface ApiSource {
	/** Language folder under packages/api/. Used as the client crate/package target. */
	lang: string
	/** Service folder name. Equals `lang` for the implicit (single-service) case. */
	service: string
	/** Absolute path to the openapi.json file. */
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

	const langs = (await readdir(apiRoot, { withFileTypes: true }))
		.filter(d => d.isDirectory())
		.map(d => d.name)
		.sort()

	const sources: ApiSource[] = []

	for (const lang of langs) {
		const langDir = join(apiRoot, lang)

		// Case 1: implicit service — openapi.json directly under <lang>/public/
		const implicitSpec = await findSpec(langDir)
		if (implicitSpec) {
			sources.push({ lang, service: lang, specPath: implicitSpec })
			continue
		}

		// Case 2: nested services — openapi.json under <lang>/<service>/public/
		const subdirs = (await readdir(langDir, { withFileTypes: true }))
			.filter(d => d.isDirectory())
			.map(d => d.name)
			.sort()

		for (const service of subdirs) {
			const spec = await findSpec(join(langDir, service))
			if (spec) sources.push({ lang, service, specPath: spec })
		}
	}

	return sources
}

/** Convenience: discover only the apis emitted by a single language. */
export async function discoverApisByLang(repoRoot: string, lang: string): Promise<ApiSource[]> {
	const all = await discoverApis(repoRoot)
	return all.filter(s => s.lang === lang)
}

/** Convenience: format a relative spec path for log lines. */
export function formatSpecPath(source: ApiSource, repoRoot: string): string {
	return relative(repoRoot, source.specPath)
}
