import { repoRelative } from '../core/paths'
import type { NodeKind } from '../core/graph'
import {
	BACKEND_BOUNDARY as CFG_BACKEND_BOUNDARY,
	DRIZZLE_SCHEMA_DIR,
	FRONTEND_BOUNDARY as CFG_FRONTEND_BOUNDARY,
	workspaceForFile,
} from '../core/config'

// ── Anchor-based classification ──
//
// Instead of brittle glob enumeration ("flat", "nested", "Drizzle*", ...), this
// classifier walks the path of every file and looks for known "anchor folders"
// (entities, usecases, controllers, etc.). The anchor decides the kind family;
// the file basename and (optionally) the AST refine to the exact kind.
//
// This handles ANY nesting depth automatically:
//   packages/api/src/<context>/usecases/CreateFoo.ts                    ✓
//   packages/api/src/<context>/usecases/foo/CreateFoo.ts                ✓
//   packages/api/src/<context>/usecases/foo/bar/CreateFoo.ts            ✓
//   packages/api/src/<context>/repositories/FooRepository.ts            ✓
//   packages/api/src/<context>/repositories/FooRepository/Drizzle.ts    ✓
//   packages/api/src/<context>/services/Foo/Sub/Foo.ts                  ✓

export interface ClassificationResult {
	kind: NodeKind
	context?: string
	hints?: ClassificationHints
	/** Workspace matrix id (e.g. `api-typescript`, `app-react`). Set in Phase 2+. */
	workspace?: string
}

export interface ClassificationHints {
	// File basename without extension, for refinement
	basename: string
	// True if filename starts with Drizzle / Mock / Default (impl prefix conventions)
	isImplByName: boolean
	// True for handler barrel files we want to skip (internal.ts, external.ts)
	isHandlerBarrel: boolean
}

// Anchor folder → default kind. The extractor refines using AST when needed
// (e.g. service-interface vs service-impl, repository-interface vs impl).
const ANCHOR_TO_KIND: Record<string, NodeKind> = {
	// Backend domain
	entities: 'entity',
	objects: 'value-object',
	enums: 'enum',
	errors: 'error-code',
	// Backend application
	usecases: 'usecase',
	events: 'event',
	handlers: 'handler',
	agents: 'agent',
	tools: 'agent-tool', // agents/tools/*.ts (the LLM-callable tools)
	jobs: 'job',
	// Backend interface
	controllers: 'controller',
	middlewares: 'middleware',
	schemas: 'schema',
	// Backend infrastructure
	repositories: 'repository-interface', // refined to repository-impl by AST/name
	services: 'service-interface', // refined to service-impl by AST
	drivers: 'service-interface', // shared/db/drizzle/drivers
}

// Files inside an `agents/<AgentName>/` subfolder that are NOT the agent's main file
// (e.g. prompt.ts, types.ts, utils.ts) — skip them. We only want the agent itself.
const AGENT_HELPER_BASENAMES = new Set(['prompt', 'types', 'utils', 'config'])

// Base classes from `shared/entities/` and `shared/objects/` aren't real entities/VOs.
// They're abstract bases that domain entities extend — filter them out.
const BACKEND_BASE_CLASSES = new Set([
	'AggregateRoot',
	'BaseEntity',
	'BaseValueObject',
	'BasePrimitiveValueObject',
	'ValueObject',
	'Entity',
])

// Helper file basenames that get incorrectly classified as components/sections.
const FRONTEND_HELPER_BASENAMES = new Set(['utils', 'helpers', 'types', 'constants', 'fields', 'config', 'zod-config'])

// Frontend anchors — distinct enough to handle separately.
const FRONTEND_BACKEND_BOUNDARY = CFG_FRONTEND_BOUNDARY
const BACKEND_BOUNDARY = CFG_BACKEND_BOUNDARY
const DRIZZLE_SCHEMA_PREFIX = DRIZZLE_SCHEMA_DIR

function isTestFile(rel: string): boolean {
	return /\.(test|spec)\.tsx?$/.test(rel)
}

function basename(rel: string): string {
	const last = rel.split('/').pop() ?? rel
	return last.replace(/\.tsx?$/, '')
}

// Walk path segments looking for an anchor folder name. The kind comes from
// the FIRST anchor encountered (the outermost layer folder). Nested folders
// that happen to share an anchor name (e.g. `ui/usecases/services/...`) must
// not override the outer anchor — `services` here is just a namespace.
function findAnchor(parts: string[]): { anchor: string; index: number } | null {
	for (let i = 0; i < parts.length; i++) {
		const seg = parts[i]
		if (seg && seg in ANCHOR_TO_KIND) return { anchor: seg, index: i }
	}
	return null
}

function extractContextBackend(rel: string, boundary = BACKEND_BOUNDARY): string | undefined {
	// <boundary>/<context>/... — strip boundary, take first segment.
	if (!rel.startsWith(`${boundary}/`)) return undefined
	const local = rel.slice(boundary.length + 1)
	const ctx = local.split('/')[0]
	return ctx || undefined
}

// ── Frontend special-case patterns ──

function classifyFrontend(rel: string, boundary = FRONTEND_BACKEND_BOUNDARY): ClassificationResult | null {
	// Strip the workspace prefix so the rest of the function works against a
	// boundary-relative path. Renaming `packages/app/src` only touches the config.
	if (!rel.startsWith(`${boundary}/`)) return null
	const local = rel.slice(boundary.length + 1) // strip "<boundary>/"

	if (local === 'lib/consts.ts' || local === 'lib/labels.ts') {
		return { kind: 'frontend-label-map' }
	}
	if (local === 'lib/errors.ts') {
		return { kind: 'frontend-error-handler' }
	}

	// Skip helper files (utils.ts, types.ts, fields.tsx) inside any `-components/` folder.
	const last = local.split('/').pop() ?? local
	const baseNoExt = last.replace(/\.tsx?$/, '')
	if (FRONTEND_HELPER_BASENAMES.has(baseNoExt) && /-(components|hooks|stores|sections)\//.test(local)) {
		return null
	}
	// Top-level barrel files that are pure re-exports — don't classify.
	if (last === 'index.ts' || last === 'index.tsx') {
		if (local.endsWith('/-stores/index.ts')) return null // store barrel
		if (local === 'components/Dialogs/index.tsx') return null // dialog barrel
		if (local === 'components/Dialogs/index.ts') return null
	}
	// lib/zod-config and similar config files
	if (local === 'lib/zod-config.ts') return null
	if (/^components\/ui\/[^/]+\.tsx?$/.test(local)) {
		return { kind: 'frontend-ui-primitive' }
	}
	// Top-level Dialogs folder: any *.tsx file inside is part of a dialog
	if (/^components\/Dialogs\/[^/]+\/index\.tsx?$/.test(local)) {
		return { kind: 'frontend-dialog' }
	}
	if (/^components\/Dialogs\/[^/]+\/[^/]+\.tsx?$/.test(local)) {
		// Sub-files of a dialog (fields.tsx, footer.tsx, etc) — classify as component, named after the file
		return { kind: 'frontend-component' }
	}
	// Stores & hooks
	if (/^stores\/[^/]+\.tsx?$/.test(local)) {
		if (local === 'stores/index.ts' || local === 'stores/index.tsx') return null
		return { kind: 'frontend-store' }
	}
	if (/^hooks\/[^/]+\.tsx?$/.test(local)) {
		return { kind: 'frontend-hook' }
	}
	// Shared components: <boundary>/components/<Name>/index.tsx
	// or grouped: <boundary>/components/<Group>/<Name>/index.tsx
	if (/^components\/[^/]+\/index\.tsx?$/.test(local)) {
		return { kind: 'frontend-component' }
	}
	if (/^components\/[^/]+\/[^/]+\/index\.tsx?$/.test(local)) {
		return { kind: 'frontend-component' }
	}
	// Sibling files of a shared component (e.g. CalendarWidget/MonthGrid/utils.tsx)
	if (/^components\/[^/]+\/[^/]+\.tsx?$/.test(local) && !local.endsWith('index.tsx') && !local.endsWith('index.ts')) {
		return { kind: 'frontend-component' }
	}

	// Routes & route-scoped pieces — match at ANY nesting depth under the anchor folder.
	if (local.startsWith('routes/')) {
		// section: -components/<X>Section/index.tsx OR -sections/<X>/index.tsx (also nested)
		if (/-sections\/[A-Za-z0-9_]+\/index\.tsx?$/.test(local)) return { kind: 'frontend-section' }
		if (/-components\/(?:[A-Za-z0-9_]+\/)*?[A-Za-z0-9_]+Section\/index\.tsx?$/.test(local)) return { kind: 'frontend-section' }
		// dialog
		if (/-components\/(?:[A-Za-z0-9_]+\/)*?[A-Za-z0-9_]+Dialog\/index\.tsx?$/.test(local)) return { kind: 'frontend-dialog' }
		// form
		if (/-components\/(?:[A-Za-z0-9_]+\/)*?[A-Za-z0-9_]+Form\/index\.tsx?$/.test(local)) return { kind: 'frontend-form' }
		// regular nested component (any depth)
		if (/-components\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+\/index\.tsx?$/.test(local)) return { kind: 'frontend-component' }
		// route-scoped store
		if (/-stores\/[^/]+\.tsx?$/.test(local)) return { kind: 'frontend-store' }
		// route-scoped hook (single file or folder w/ index.ts)
		if (/-hooks\/[^/]+\.tsx?$/.test(local)) return { kind: 'frontend-hook' }
		if (/-hooks\/[^/]+\/index\.tsx?$/.test(local)) return { kind: 'frontend-hook' }
		// route file: top-level index.tsx OR route.tsx outside any -<x>/ folder
		if (/\/index\.tsx?$/.test(local) && !/-(components|sections|hooks|stores)\//.test(local)) {
			return { kind: 'frontend-route' }
		}
		if (/\/route\.tsx?$/.test(local) && !/-(components|sections|hooks|stores)\//.test(local)) {
			return { kind: 'frontend-route' }
		}
	}

	return null
}

// ── Backend classification ──

function classifyBackend(rel: string, parts: string[], boundary = BACKEND_BOUNDARY): ClassificationResult | null {
	const ctx = extractContextBackend(rel, boundary)
	if (!ctx) return null

	const file = basename(rel)
	const hints: ClassificationHints = {
		basename: file,
		isImplByName: /^(Drizzle|Mock|Default|Console|Redis|EventEmitter|Spy)/.test(file),
		isHandlerBarrel: file === 'internal' || file === 'external',
	}

	// Drizzle schema lives outside the per-context layout
	if (rel.startsWith(DRIZZLE_SCHEMA_PREFIX)) {
		if (file === 'index') return null
		return { kind: 'db-table', context: file, hints }
	}

	const ctxRoot = `${boundary}/${ctx}`

	// Errors live in `<ctx>/errors/index.ts` — the index file IS the source.
	if (rel === `${ctxRoot}/errors/index.ts`) {
		return { kind: 'error-code', context: ctx, hints }
	}

	// Filter shared base classes (AggregateRoot, BaseEntity, BaseValueObject, etc.)
	if (ctx === 'shared' && BACKEND_BASE_CLASSES.has(file)) return null

	// Skip context barrels and the per-context registry helper files
	if (file === 'index') return null
	if (rel === `${ctxRoot}/index.ts`) return null
	if (rel === `${ctxRoot}/registry.ts`) {
		return { kind: 'di-registry', context: ctx, hints }
	}

	// Find which anchor folder owns this file
	const anchor = findAnchor(parts)
	if (!anchor) return null

	const kind = ANCHOR_TO_KIND[anchor.anchor]
	if (!kind) return null

	// ── Per-anchor refinements ──

	// Repositories: implementations are recognized by name prefix; everything else is interface.
	if (anchor.anchor === 'repositories') {
		const isImpl = hints.isImplByName
		return { kind: isImpl ? 'repository-impl' : 'repository-interface', context: ctx, hints }
	}

	// Services & DB drivers: refined to impl by AST (in extractor) when class isn't abstract.
	// We default to service-interface here; the extractor handles both.
	if (anchor.anchor === 'services' || anchor.anchor === 'drivers') {
		return { kind: 'service-interface', context: ctx, hints }
	}

	// Handlers: skip the internal/external barrel files
	if (anchor.anchor === 'handlers' && hints.isHandlerBarrel) return null

	// Agents: refine — `tools/<X>Tool.ts` is an agent-tool;
	// `<AgentName>/<AgentName>.ts` is the agent itself; helper files are skipped.
	if (anchor.anchor === 'agents') {
		// Inside agents, are we under a tools/ subfolder?
		const inTools = parts.slice(anchor.index).includes('tools')
		if (inTools) return { kind: 'agent-tool', context: ctx, hints }

		// Skip helper files (prompt/types/utils/config)
		if (AGENT_HELPER_BASENAMES.has(file)) return null

		// agents/<AgentName>/<AgentName>.ts → agent
		// also accept agents/<AgentName>.ts (flat) → agent
		const enclosingDir = parts[parts.length - 2]
		const isAgentMain = file === enclosingDir || enclosingDir === 'agents'
		if (!isAgentMain) return null
		return { kind: 'agent', context: ctx, hints }
	}
	if (anchor.anchor === 'tools') {
		return { kind: 'agent-tool', context: ctx, hints }
	}

	// UI is a special context: usecases here are queries, controllers stay as controllers.
	if (ctx === 'ui') {
		if (anchor.anchor === 'usecases') return { kind: 'ui-query', context: 'ui', hints }
		// fall through for other anchors
	}

	// Shared events folder = integration events; per-context events folders = domain events.
	if (anchor.anchor === 'events') {
		if (ctx === 'shared') return { kind: 'integration-event', context: 'shared', hints }
		return { kind: 'event', context: ctx, hints }
	}

	return { kind, context: ctx, hints }
}

// ── app-ui — the shared design-system package (flat components/, no routes) ──

function classifyAppUi(rel: string, boundary: string): ClassificationResult | null {
	if (!rel.startsWith(`${boundary}/`)) return null
	const local = rel.slice(boundary.length + 1)
	if (isTestFile(rel)) return null
	// packages/app/ui/src/components/<name>.tsx — one level, no icons/ or stories/ (those are
	// subdirs and don't match this regex, mirroring the old components/ui/ scope in app-react).
	if (/^components\/[^/]+\.tsx?$/.test(local)) return { kind: 'frontend-ui-primitive' }
	return null
}

// ── Astro — pages and shared components only ──

function classifyAstro(rel: string, boundary: string): ClassificationResult | null {
	if (!rel.startsWith(`${boundary}/`)) return null
	const local = rel.slice(boundary.length + 1)

	if (isTestFile(rel)) return null

	// Astro pages: src/pages/*.astro (or nested) → routes
	if (/^pages\/.+\.astro$/.test(local)) return { kind: 'frontend-route' }
	// Layout / shared .astro files outside pages/
	if (/^layouts\/.+\.astro$/.test(local)) return { kind: 'frontend-component' }
	if (/^components\/.+\.astro$/.test(local)) return { kind: 'frontend-component' }

	// React/TS components used inside .astro frontmatter
	if (/^components\/.+\.tsx?$/.test(local)) return { kind: 'frontend-component' }

	return null
}

// ── Public API ──

export function classify(absOrRepoPath: string): ClassificationResult | null {
	const rel = absOrRepoPath.startsWith('/') ? repoRelative(absOrRepoPath) : absOrRepoPath
	if (isTestFile(rel)) return null

	const ws = workspaceForFile(rel)
	if (!ws) return null

	let result: ClassificationResult | null = null

	switch (ws.id) {
		case 'api-typescript': {
			const parts = rel.split('/')
			result = classifyBackend(rel, parts, ws.src)
			break
		}
		case 'app-react':
			result = classifyFrontend(rel, ws.src)
			break
		case 'app-astro':
			result = classifyAstro(rel, ws.src)
			break
		case 'app-ui':
			result = classifyAppUi(rel, ws.src)
			break
		default:
			// Other workspaces (go/contracts/client/e2e) are not handled by
			// this TS classifier — their adapters classify them directly.
			return null
	}

	if (result) result.workspace = ws.id
	return result
}
