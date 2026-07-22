import { repoRelative } from '../../core/paths'
import type { NodeKind } from '../../core/graph'
import { workspaceForFile, workspacesByLang } from '../../core/config'

// Anchor-based classifier for Go files. Mirrors the TS classifier structure
// but adapts to Go conventions.
//
// Layout (post-polyglot): packages/api/go/internal/<context>/<anchor>/<files>.go
// Generated layout:       packages/client/dist/go/...                   → skipped
// Contexts: shared, analytics, search, transcoding, ...
// Anchors: entities, objects, enums, errors, events, handlers, usecases,
//          controllers, middlewares, repositories, services, projections, jobs

export interface GoClassificationResult {
	kind: NodeKind
	context: string
	hints: { basename: string; isHandlerBarrel: boolean; isImplFile: boolean }
	workspace: string
}

const ANCHOR_TO_KIND: Record<string, NodeKind> = {
	entities: 'entity',
	objects: 'value-object',
	enums: 'enum',
	errors: 'error-code',
	usecases: 'usecase',
	events: 'event',
	handlers: 'handler',
	controllers: 'controller',
	middlewares: 'middleware',
	middleware: 'middleware', // Go often uses singular folder
	repositories: 'repository-interface',
	storage: 'repository-interface', // sync/storage/<entity>/<entity>_pg.go convention
	services: 'service-interface',
	projections: 'service-impl', // projections are write-side workers in this codebase
	jobs: 'job',
}

function isTestFile(rel: string): boolean {
	return rel.endsWith('_test.go')
}

function isGoSource(rel: string): boolean {
	return rel.endsWith('.go') && !isTestFile(rel)
}

function basename(rel: string): string {
	const last = rel.split('/').pop() ?? rel
	return last.replace(/\.go$/, '')
}

// Find first anchor folder in the path
function findAnchor(parts: string[]): { anchor: string; index: number } | null {
	for (let i = 0; i < parts.length; i++) {
		const seg = parts[i]
		if (seg && seg in ANCHOR_TO_KIND) return { anchor: seg, index: i }
	}
	return null
}

export function classifyGo(absOrRepoPath: string): GoClassificationResult | null {
	const rel = absOrRepoPath.startsWith('/') ? repoRelative(absOrRepoPath) : absOrRepoPath
	if (!isGoSource(rel)) return null

	// Resolve workspace from the path. We only classify Go files owned by a
	// non-generated Go workspace (today: api-go); generated client/contracts Go
	// output is intentionally skipped.
	const ws = workspaceForFile(rel)
	if (!ws || ws.lang !== 'go' || ws.generated) return null

	// Context is the first segment under the workspace `src`.
	const local = rel.slice(ws.src.length + 1)
	const ctx = local.split('/')[0]
	if (!ctx) return null

	const parts = rel.split('/')

	const file = basename(rel)
	const hints = {
		basename: file,
		isHandlerBarrel: false,
		// Go files often live as `<noun>_<verb>.go` (e.g. `connect_channel.go`).
		// Implementation prefixes used by this codebase: pg, pgx, mock, default, console, kafka
		isImplFile: /^(pg|pgx|mock|default|console|kafka|memory|redis|noop)_/i.test(file),
	}

	const anchor = findAnchor(parts)
	if (!anchor) return null

	const kind = ANCHOR_TO_KIND[anchor.anchor]
	if (!kind) return null

	const workspace = ws.id

	// Refinements
	if (anchor.anchor === 'events' && ctx === 'shared') {
		return { kind: 'integration-event', context: 'shared', hints, workspace }
	}
	if (anchor.anchor === 'repositories' || anchor.anchor === 'storage') {
		const isImpl =
			hints.isImplFile ||
			/^(pg|pgx|mock|default|console|kafka|memory|redis|noop)_/i.test(file) ||
			/^(pg|pgx|mock|default)[A-Z]/.test(file) ||
			/_(pg|pgx|mock|default)$/i.test(file)
		return { kind: isImpl ? 'repository-impl' : 'repository-interface', context: ctx, hints, workspace }
	}
	if (anchor.anchor === 'projections') {
		// Files under projections/projectors/ are projectors — handler-shaped read-side
		// consumers. Project shape elsewhere is data record (service-impl).
		const isProjector = parts.slice(anchor.index + 1).includes('projectors')
		return { kind: isProjector ? 'handler' : 'service-impl', context: ctx, hints, workspace }
	}
	if (anchor.anchor === 'services') {
		return { kind: 'service-interface', context: ctx, hints, workspace }
	}
	if (anchor.anchor === 'errors') {
		return { kind: 'error-code', context: ctx, hints, workspace }
	}

	return { kind, context: ctx, hints, workspace }
}

/** Repo-relative source roots for every non-generated Go workspace. */
export function goWorkspaceRoots(): string[] {
	return workspacesByLang('go')
		.filter(w => !w.generated)
		.map(w => w.src)
}
