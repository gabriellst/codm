import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { addNode, localeKeyId, type Graph } from '../../../core/graph'
import type { AuditCollector } from '../../../core/audit'
import { repoRelative, ROOT } from '../../../core/paths'
import { join } from 'node:path'
import { LOCALE_LANGS, workspacesByRole } from '../../../core/config'

const LANGS = LOCALE_LANGS

export function runLocaleExtraction(graph: Graph, _audit: AuditCollector): { keysExtracted: number } {
	let keys = 0
	// Walk every frontend workspace that has a locales dir; each emits its own
	// per-lang JSON files (e.g. app-react: src/locales/pt.json).
	for (const ws of workspacesByRole('app')) {
		if (!ws.locales) continue
		const localesDir = join(ROOT, ws.locales)
		if (!existsSync(localesDir)) continue
		for (const lang of LANGS) {
			const path = join(localesDir, `${lang}.json`)
			if (!existsSync(path)) continue
			keys += emitFromJsonFile(graph, path, lang, ws.id)
		}
	}

	// Astro content collections — `<i18n root>/<lang>/<namespace>.json`. The
	// namespace (filename without extension) is prepended to every dotted key, so
	// `<namespace>.json` containing `hero.title` emits `<namespace>.hero.title` —
	// matches how Astro components reference the entry (`t.hero.title` inside a
	// component scoped to the `landing` collection).
	// Roots are discovered, not hardcoded: any `content/i18n/` directory under the
	// workspace src counts — the shared `src/content/i18n/` as well as vertical-slice
	// colocations like `src/pages/_landing/content/i18n/`.
	const astroWs = workspacesByRole('app').find(w => w.id === 'app-astro')
	if (astroWs) {
		for (const i18nRoot of findI18nRoots(join(ROOT, astroWs.src))) {
			for (const lang of LANGS) {
				const langDir = join(i18nRoot, lang)
				if (!existsSync(langDir)) continue
				for (const entry of readdirSync(langDir)) {
					if (!entry.endsWith('.json')) continue
					const namespace = entry.replace(/\.json$/, '')
					keys += emitFromJsonFile(graph, join(langDir, entry), lang, astroWs.id, namespace)
				}
			}
		}
	}

	return { keysExtracted: keys }
}

/** Every `content/i18n/` directory under `root` (shared or slice-colocated). */
function findI18nRoots(root: string): string[] {
	if (!existsSync(root)) return []
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(d => d.isDirectory() && d.name === 'i18n' && d.parentPath.endsWith('/content'))
		.map(d => join(d.parentPath, d.name))
		.sort()
}

function emitFromJsonFile(graph: Graph, path: string, lang: string, workspace: string, namespacePrefix?: string): number {
	let count = 0
	const repoPath = repoRelative(path)
	const raw = readFileSync(path, 'utf8')
	const json = JSON.parse(raw) as Record<string, unknown>
	walk(json, '', (dottedKey, value) => {
		const fullKey = namespacePrefix ? `${namespacePrefix}.${dottedKey}` : dottedKey
		const id = localeKeyId(lang, fullKey)
		addNode(graph, {
			id,
			kind: 'locale-key',
			name: fullKey,
			service: 'docs',
			context: lang,
			workspace,
			location: { file: repoPath },
			metadata: { lang, value: typeof value === 'string' ? value : undefined, workspace, namespace: namespacePrefix },
		})
		count++
	})
	return count
}

function walk(obj: unknown, prefix: string, visit: (key: string, value: unknown) => void): void {
	if (typeof obj !== 'object' || obj === null) {
		visit(prefix, obj)
		return
	}
	if (Array.isArray(obj)) {
		visit(prefix, obj)
		return
	}
	for (const [key, value] of Object.entries(obj)) {
		const next = prefix ? `${prefix}.${key}` : key
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			walk(value, next, visit)
		} else {
			visit(next, value)
		}
	}
}
