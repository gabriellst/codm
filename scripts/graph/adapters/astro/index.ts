// Astro adapter — walks `.astro` files and emits route / component / layout
// nodes via the shared classifier (`classifyAstro` in registry/classifier.ts).
//
// Astro files are template + frontmatter (HTML with a `---` script block) —
// we don't parse JSX here. The classifier decides the node kind from the path
// (`pages/*.astro` → route, `components/*.astro` → component, etc.), and we
// scan the file text for locale-key references (`t.foo.bar`, `t('foo.bar')`)
// to wire `references-locale-key` edges.
//
// React/TSX islands embedded inside `.astro` frontmatter are picked up by the
// existing frontend extractor's TS pass via the astro workspace's tsconfig.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { addEdge, addNode, edgeId, nodeId, type Graph } from '../../core/graph'
import type { AuditCollector } from '../../core/audit'
import { LOCALE_LANGS, workspaceById } from '../../core/config'
import { ROOT, repoRelative } from '../../core/paths'
import { classify } from '../../registry/classifier'

export interface AstroExtractionStats {
	filesProcessed: number
}

export function runAstroExtraction(graph: Graph, _audit: AuditCollector): AstroExtractionStats {
	const ws = workspaceById('app-astro')
	if (!ws) return { filesProcessed: 0 }
	const srcAbs = join(ROOT, ws.src)
	if (!existsSync(srcAbs)) return { filesProcessed: 0 }

	let filesProcessed = 0
	for (const abs of walkFiles(srcAbs)) {
		if (!abs.endsWith('.astro')) continue
		const repoPath = repoRelative(abs)
		const cls = classify(repoPath)
		if (!cls) continue

		const name = nameFor(repoPath, cls.kind)
		const id = nodeId({ workspace: 'app-astro', kind: cls.kind, name })
		addNode(graph, {
			id,
			kind: cls.kind,
			name,
			service: 'app',
			workspace: 'app-astro',
			location: { file: repoPath },
			metadata: { astro: true },
		})

		// Locale-key references: `t.<dotted.path>` or `t('dotted.path')`.
		// The astro landing uses `getEntry('landing', '<locale>/landing').data` as `t`,
		// so locale keys live inside the entry JSON rather than i18n bundles; we still
		// surface the references so downstream queries can navigate by key name.
		const text = readFileSync(abs, 'utf8')
		for (const m of text.matchAll(/\bt\.([a-zA-Z_][\w.]*)/g)) emitLocaleKeyEdge(graph, id, m[1]!)
		for (const m of text.matchAll(/\bt\(['"]([\w.]+)['"]\)/g)) emitLocaleKeyEdge(graph, id, m[1]!)

		filesProcessed++
	}
	return { filesProcessed }
}

function emitLocaleKeyEdge(graph: Graph, fromId: string, key: string): void {
	// Astro files reference `t.<dotted>` where `t = (await getEntry('landing', '<lang>/landing')).data`.
	// The same component renders for every locale — emit an edge to each lang's
	// `landing.<key>` node so both ends resolve regardless of which locale ran.
	for (const lang of LOCALE_LANGS) {
		const targetId = `docs:locale:${lang}:landing.${key}`
		addEdge(graph, {
			id: edgeId(fromId, 'references-locale-key', targetId),
			from: fromId,
			to: targetId,
			kind: 'references-locale-key',
			audit: 'INFERRED',
		})
	}
}

function nameFor(repoPath: string, kind: string): string {
	const last = repoPath.split('/').pop() ?? repoPath
	const baseNoExt = last.replace(/\.astro$/, '')
	if (kind === 'frontend-route') {
		// Use the path relative to `pages/` so routes are addressable: `index`, `blog/index`, `en/blog/[...slug]`.
		const idx = repoPath.indexOf('/pages/')
		if (idx >= 0) return repoPath.slice(idx + '/pages/'.length).replace(/\.astro$/, '')
	}
	return baseNoExt
}

function walkFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		const st = statSync(full)
		if (st.isDirectory()) out.push(...walkFiles(full))
		else if (st.isFile()) out.push(full)
	}
	return out
}
