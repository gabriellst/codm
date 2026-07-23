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

	// Astro content collection — `src/content/i18n/<lang>/<namespace>.json`. The
	// namespace (filename without extension) is prepended to every dotted key, so
	// `<namespace>.json` containing `hero.title` emits `<namespace>.hero.title` —
	// matches how Astro components reference the entry (`t.hero.title` inside a
	// component scoped to the `landing` collection).
	const astroWs = workspacesByRole('app').find(w => w.id === 'app-astro')
	if (astroWs) {
		const i18nRoot = join(ROOT, astroWs.src, 'content/i18n')
		if (existsSync(i18nRoot)) {
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
