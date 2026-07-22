#!/usr/bin/env bun
/**
 * route-closure.ts — expo-router registration closure walker (packages/app/expo).
 *
 * Expo modals-are-routes (NAV-MODAL) and tab screens require TWO coordinated changes:
 * the route folder AND its registration in a layout. Both drift directions shipped as
 * live bugs (a `(sheets)/game-form` Stack.Screen with no folder; a `games` tab trigger
 * with no folder) and eval iterations showed builders reliably land the folder and skip
 * the registration — the doc canon ("folder and registration land in the SAME change",
 * packages/app/expo/CLAUDE.md) did not close it, so this walker does. Rung: detect.
 *
 * Checks:
 *   RC-01  (sheets)/<name>/ route folder with no Stack.Screen registration      error
 *          in app/_layout.tsx
 *   RC-02  Stack.Screen name="(sheets)/<name>" with no matching route folder    error
 *   RC-03  (tabs)/<name>/ screen folder with no trigger in (tabs)/_layout.tsx   error
 *   RC-04  tab trigger naming a folder that does not exist                      error
 *   RC-05  sheet registration without an explicit `presentation:` option        error
 *          (sheet skill SHT-03 — the modal contract must be explicit)
 *   RC-06  route file imports useLocalSearchParams directly from expo-router    error
 *          (route RTE-03 — params go through useTypedSearchParams(schema) from
 *          @/lib/typed-route; the raw hook is sanctioned only inside that lib)
 *   RC-07  (sheets)/<name>/ route with no explicit dismissal call               error
 *          (sheet SHT-P02 — router.back()/router.dismiss(); the iOS grabber
 *          is not cross-platform)
 *
 * Usage:
 *   bun scripts/detectors/route-closure.ts [--json]
 *
 * ROOT_OVERRIDE (env) retargets the walked tree (eval worktrees — scripts/skill-evals/).
 * Exit 1 iff any error-severity finding exists. No baseline: HEAD is clean.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export interface Finding {
	detector: string
	ruleId: string
	source: string
	file: string
	line: number
	severity: 'error' | 'warning' | 'info'
	message: string
}

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const PROJECT_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(SCRIPT_DIR, '../..')
const EXPO_APP = join(PROJECT_ROOT, 'packages/app/expo/app')

const ROUTE_FILE = /\.(tsx|ts|js|jsx)$/

function rel(path: string): string {
	return relative(PROJECT_ROOT, path).replaceAll('\\', '/')
}

/** Route-bearing dirs directly under `group` (a dir counts when it holds any route file, at any depth). */
function routeFolders(group: string): string[] {
	if (!existsSync(group)) return []
	return readdirSync(group)
		.filter(entry => {
			const full = join(group, entry)
			if (!statSync(full).isDirectory() || entry.startsWith('-')) return false
			return hasRouteFile(full)
		})
		.sort()
}

function hasRouteFile(dir: string): boolean {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			if (!entry.startsWith('-') && hasRouteFile(full)) return true
		} else if (ROUTE_FILE.test(entry) && !entry.startsWith('_layout')) {
			return true
		}
	}
	return false
}

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split('\n').length
}

/** All route files under `dir` recursively (colocated -dirs included — they ship route code). */
function routeFilesIn(dir: string): string[] {
	if (!existsSync(dir)) return []
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) out.push(...routeFilesIn(full))
		else if (ROUTE_FILE.test(entry)) out.push(full)
	}
	return out
}

export function walk(): Finding[] {
	const findings: Finding[] = []
	if (!existsSync(EXPO_APP)) return findings

	// ── Sheets: folders ↔ root Stack.Screen registrations ──────────────
	const rootLayoutPath = join(EXPO_APP, '_layout.tsx')
	const rootLayout = existsSync(rootLayoutPath) ? readFileSync(rootLayoutPath, 'utf-8') : ''
	const sheetFolders = routeFolders(join(EXPO_APP, '(sheets)'))

	// Each registration block: from `<Stack.Screen` up to its closing `/>` — coarse but
	// the layout is JSX-formatted by biome, so the block always terminates with `/>`.
	const registrations: { name: string; index: number; block: string }[] = []
	for (const m of rootLayout.matchAll(/<Stack\.Screen[\s\S]*?\/>/g)) {
		const name = m[0].match(/name="([^"]+)"/)?.[1]
		if (name) registrations.push({ name, index: m.index ?? 0, block: m[0] })
	}
	const sheetRegistrations = registrations.filter(r => r.name.startsWith('(sheets)/'))

	for (const folder of sheetFolders) {
		if (!sheetRegistrations.some(r => r.name === `(sheets)/${folder}`)) {
			findings.push({
				detector: 'route-closure',
				ruleId: 'RC-01',
				source: 'sheet#SHT-01',
				file: rel(join(EXPO_APP, '(sheets)', folder)),
				line: 1,
				severity: 'error',
				message: `(sheets)/${folder} route folder has NO Stack.Screen registration in app/_layout.tsx — the modal is unreachable. Folder and registration land in the SAME change.`,
			})
		}
	}
	for (const reg of sheetRegistrations) {
		const folder = reg.name.slice('(sheets)/'.length)
		if (!sheetFolders.includes(folder)) {
			findings.push({
				detector: 'route-closure',
				ruleId: 'RC-02',
				source: 'sheet#SHT-01',
				file: rel(rootLayoutPath),
				line: lineOf(rootLayout, reg.index),
				severity: 'error',
				message: `Stack.Screen name="${reg.name}" registers a route folder that does not exist — dead registration.`,
			})
		}
		if (!/presentation\s*:/.test(reg.block)) {
			findings.push({
				detector: 'route-closure',
				ruleId: 'RC-05',
				source: 'sheet#SHT-03',
				file: rel(rootLayoutPath),
				line: lineOf(rootLayout, reg.index),
				severity: 'error',
				message: `Stack.Screen name="${reg.name}" has no explicit presentation option — the modal contract (pageSheet/formSheet/fullScreenModal) must be explicit (SHT-03).`,
			})
		}
	}

	// ── Sheet param + dismissal idioms (RC-06 walks ALL route files) ────
	for (const folder of sheetFolders) {
		const dir = join(EXPO_APP, '(sheets)', folder)
		let hasDismissal = false
		for (const file of routeFilesIn(dir)) {
			if (/router\.(back|dismiss)\(\)/.test(readFileSync(file, 'utf-8'))) {
				hasDismissal = true
				break
			}
		}
		if (!hasDismissal) {
			findings.push({
				detector: 'route-closure',
				ruleId: 'RC-07',
				source: 'sheet#SHT-P02',
				file: rel(dir),
				line: 1,
				severity: 'error',
				message: `(sheets)/${folder} has no explicit dismissal (router.back()/router.dismiss()) — the iOS grabber is not cross-platform; every sheet ships its own close affordance.`,
			})
		}
		// RC-08: sheets live OUTSIDE the (tabs) layout, so (tabs)/_layout's <Protected>
		// does NOT cover them — every sheet wraps its own body (route/expo auth-gating
		// canon; both house sheets shipped this gap until 2026-06-11).
		const indexFile = join(dir, 'index.tsx')
		if (existsSync(indexFile) && !readFileSync(indexFile, 'utf-8').includes('<Protected')) {
			findings.push({
				detector: 'route-closure',
				ruleId: 'RC-08',
				source: 'route#expo-auth-gating',
				file: rel(indexFile),
				line: 1,
				severity: 'error',
				message: `(sheets)/${folder}/index.tsx is not wrapped in <Protected> — sheets are outside the (tabs) layout gate; mid-session expiry leaves them accessible.`,
			})
		}
	}
	for (const file of routeFilesIn(EXPO_APP)) {
		const source = readFileSync(file, 'utf-8')
		const m = source.match(/import\s*\{[^}]*\buseLocalSearchParams\b[^}]*\}\s*from\s*['"]expo-router['"]/)
		if (m) {
			findings.push({
				detector: 'route-closure',
				ruleId: 'RC-06',
				source: 'route#RTE-03',
				file: rel(file),
				line: lineOf(source, m.index ?? 0),
				severity: 'error',
				message:
					'raw useLocalSearchParams import in a route file — params go through useTypedSearchParams(schema) from @/lib/typed-route (every field .default()-ed).',
			})
		}
	}

	// ── Tabs: folders ↔ (tabs)/_layout.tsx triggers ─────────────────────
	const tabsLayoutPath = join(EXPO_APP, '(tabs)', '_layout.tsx')
	const tabsLayout = existsSync(tabsLayoutPath) ? readFileSync(tabsLayoutPath, 'utf-8') : ''
	const tabFolders = routeFolders(join(EXPO_APP, '(tabs)'))
	const triggers: { name: string; index: number }[] = []
	for (const m of tabsLayout.matchAll(/<(?:NativeTabs\.Trigger|Tabs\.Screen)\s[\s\S]*?name="([^"]+)"/g)) {
		triggers.push({ name: m[1], index: m.index ?? 0 })
	}

	for (const folder of tabFolders) {
		if (!triggers.some(t => t.name === folder)) {
			findings.push({
				detector: 'route-closure',
				ruleId: 'RC-03',
				source: 'route#expo-layout',
				file: rel(join(EXPO_APP, '(tabs)', folder)),
				line: 1,
				severity: 'error',
				message: `(tabs)/${folder} screen folder has NO trigger in app/(tabs)/_layout.tsx — the tab is unreachable. Folder and trigger land in the SAME change.`,
			})
		}
	}
	for (const trigger of triggers) {
		if (!tabFolders.includes(trigger.name)) {
			findings.push({
				detector: 'route-closure',
				ruleId: 'RC-04',
				source: 'route#expo-layout',
				file: rel(tabsLayoutPath),
				line: lineOf(tabsLayout, trigger.index),
				severity: 'error',
				message: `tab trigger name="${trigger.name}" points at a folder that does not exist — dead trigger.`,
			})
		}
	}

	return findings
}

if (import.meta.main) {
	const findings = walk()
	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(findings, null, 2))
	} else {
		for (const f of findings) console.log(`${f.file}:${f.line} [${f.severity}] ${f.ruleId} (${f.source}) — ${f.message}`)
		console.log(`\n${findings.length} finding(s)`)
	}
	process.exit(findings.some(f => f.severity === 'error') ? 1 : 0)
}
