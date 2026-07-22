import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AuditCollector } from '../../core/audit'
import type { Graph } from '../../core/graph'
import { ROOT } from '../../core/paths'
import { workspacesByRole } from '../../core/config'
import { extractFromSpec } from './extract'
import type { BackendLanguage, FlavorPaths, SdkLanguage } from './types'

/**
 * Per-(sdk-lang × backend-lang) source root inside the client workspace.
 *
 * Convention emitted by `packages/client/generators/*`:
 *   - TS SDK: `packages/client/dist/typescript/src/<backend>/...`
 *   - Go SDK: `packages/client/dist/go/pkg/<backend>/...`
 */
function srcRootFor(clientWorkspaceRoot: string, sdkLang: SdkLanguage, backendLang: BackendLanguage): string {
	const segment = backendLang
	switch (sdkLang) {
		case 'typescript':
			return join(clientWorkspaceRoot, 'src', segment)
		case 'go':
			return join(clientWorkspaceRoot, 'pkg', segment)
	}
}

function flavorKey(sdkLang: SdkLanguage, backendLang: BackendLanguage): `${SdkLanguage}:${BackendLanguage}` | 'app' {
	// Preserve the legacy `app` flavor identifier for the (TS SDK × TS backend)
	// pair so existing `sdk:app:...` IDs continue to match what the frontend
	// extractor produces via `parseSdkFlavor()`. Phase 9 unifies these.
	if (sdkLang === 'typescript' && backendLang === 'typescript') return 'app'
	return `${sdkLang}:${backendLang}` as const
}

/** Derive the full flavor matrix from the workspace registry. */
export function buildFlavors(): FlavorPaths[] {
	const apiWorkspaces = workspacesByRole('api').filter(w => w.openapi)
	const clientWorkspaces = workspacesByRole('client')

	const flavors: FlavorPaths[] = []
	for (const sdkWs of clientWorkspaces) {
		for (const apiWs of apiWorkspaces) {
			if (!apiWs.openapi) continue
			const sdkLang = sdkWs.lang as SdkLanguage
			const backendLang = apiWs.lang as BackendLanguage
			flavors.push({
				flavor: flavorKey(sdkLang, backendLang),
				sdkLang,
				backendLang,
				clientWorkspace: sdkWs.id,
				apiWorkspace: apiWs.id,
				specPath: join(ROOT, apiWs.openapi),
				srcRoot: srcRootFor(join(ROOT, sdkWs.root), sdkLang, backendLang),
				distRoot: srcRootFor(join(ROOT, sdkWs.root), sdkLang, backendLang),
			})
		}
	}
	return flavors
}

export const FLAVORS: FlavorPaths[] = buildFlavors()

export interface OpenApiExtractionResult {
	totalOperations: number
	totalMissing: number
	perFlavor: Record<string, { operations: number; missing: number }>
}

export function runOpenApiExtraction(graph: Graph, audit: AuditCollector): OpenApiExtractionResult {
	const perFlavor: OpenApiExtractionResult['perFlavor'] = {}
	let totalOperations = 0
	let totalMissing = 0

	for (const flavor of FLAVORS) {
		if (!existsSync(flavor.specPath)) {
			perFlavor[flavor.flavor] = { operations: 0, missing: 0 }
			continue
		}
		const result = extractFromSpec(graph, audit, flavor)
		perFlavor[flavor.flavor] = { operations: result.operationsExtracted, missing: result.missingArtifacts }
		totalOperations += result.operationsExtracted
		totalMissing += result.missingArtifacts
	}

	return { totalOperations, totalMissing, perFlavor }
}

// Re-exports preserved for plan/spec consumers that import flavor types.
export * from './extract'
export * from './naming'
export * from './types'
