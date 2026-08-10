import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePlan, type PlanTask } from './plan-parser'
import { loadQueryContext } from '../core/review-query'
import { buildAdjacency } from '../core/query'
import { ROOT } from '../core/paths'
import { hasGenerator } from '../../cli/backend/helpers'
import { detectLang } from '../../lib/repo-model'

export type ValidationFinding = {
	rule: 'PR-18' | 'PR-19' | 'PR-20' | 'PR-21' | 'PR-26' | 'PR-27' | 'PR-28'
	taskId: string
	detail: string
	path?: string
}

/** `bun cli` verbs whose presence in a Task satisfies the scaffold requirement for a given verb.
 *  `/usecases/` is shared by the `usecase` (context) and `query` (ui BFF) generators — accept either. */
const VERB_ALIASES: Record<string, string[]> = {
	usecase: ['usecase', 'query'],
}

/**
 * Map a file path to the `bun cli` verb that scaffolds it, or null when the path is not a
 * scaffoldable artifact. Covers BOTH backend (`packages/api/**`) and frontend (`packages/app/**`).
 * Barrels (`index.ts(x)`), wiring (`registry.ts`, `module.go`, `codes.ts`), tests, stories, locale
 * JSON, generated files, core utils, and test-support all return null — only artifact ENTRY files
 * under a recognized directory map to a verb.
 */
function scaffoldableArtifactVerb(filePath: string): string | null {
	if (!/^packages\/(api|app)\//.test(filePath)) return null
	// Universal exemptions: tests, stories, barrels, wiring, locales, generated, test-support.
	if (/\.(test|spec)\.[jt]sx?$|\.stories\.[jt]sx?$|\/locales\/|\.gen\.[jt]s/.test(filePath)) return null
	if (/(^|\/)(tests?|testing|support|__fixtures__|core)\//.test(filePath)) return null
	const base = filePath.split('/').pop() ?? ''
	// `index.ts` is a barrel; `index.tsx` is NOT exempted — it's the component/route ENTRY filename.
	if (['index.ts', 'registry.ts', 'module.go', 'codes.ts'].includes(base)) return null

	// ── Frontend (packages/app/**) ──
	if (filePath.startsWith('packages/app/')) {
		if (/\/-components\//.test(filePath) && base === 'index.tsx') return 'component'
		if (/\/-forms\//.test(filePath) && base === 'index.tsx') return 'form'
		if (/(\/stores\/|\/-stores\/)/.test(filePath) && /\.tsx?$/.test(base)) return 'store'
		if (/\/components\/ui\//.test(filePath) && /\.tsx$/.test(base)) return 'primitive'
		if (/\/routes\//.test(filePath) && (base === 'index.tsx' || base === 'route.tsx')) return 'route'
		return null
	}

	// ── Backend (packages/api/**) — match by artifact directory segment ──
	if (/\/entities\//.test(filePath)) return 'entity'
	if (/\/objects\//.test(filePath)) return 'value-object'
	if (/\/controllers\//.test(filePath)) return 'controller'
	if (/\/projections\/projectors\//.test(filePath)) return 'projector'
	if (/\/projections\//.test(filePath)) return 'projection'
	if (/\/usecases\//.test(filePath)) return 'usecase' // alias accepts `query` too (ui BFF)
	if (/\/handlers\//.test(filePath)) return 'handler'
	if (/\/services\//.test(filePath)) return 'service'
	if (/\/events\//.test(filePath)) return 'event'
	if (/\/middlewares\//.test(filePath)) return 'middleware'
	if (/\/enums\//.test(filePath)) return 'enum'
	if (/\/repositories\//.test(filePath)) return 'repository'
	if (/\/schemas\//.test(filePath)) return 'schema'
	return null
}

export type ValidationResult = {
	exitCode: number
	findings: ValidationFinding[]
}

// ── Domain Mapping parser ──

type DomainMappingEntry = {
	/** Row index (1-based) */
	index: number
	action: 'create' | 'modify' | 'read-only'
	skill: string
	name: string
	context: string
	path?: string
}

/**
 * Parse the Domain Mapping table from the plan markdown.
 * Returns an empty array if the section is absent (bootstrap plans omit it).
 *
 * Expected format (from plan.md Plan Format):
 *   | # | Action | Skill | Name | Context | Story / Decision / AC |
 *   |---|--------|-------|------|---------|------------------------|
 *   | 1 | create | /entity | Foo | bar | Story 1 |
 */
function parseDomainMapping(raw: string): DomainMappingEntry[] {
	const domainSection = /^## Domain Mapping/m.exec(raw)
	if (!domainSection) return []

	const sectionStart = domainSection.index
	// Find the next ## heading after the Domain Mapping section
	const nextHeading = /^## /m.exec(raw.slice(sectionStart + 1))
	const sectionEnd = nextHeading ? sectionStart + 1 + nextHeading.index : raw.length

	const section = raw.slice(sectionStart, sectionEnd)

	const entries: DomainMappingEntry[] = []
	// Each column accepts any non-pipe content (so prose like "(PATCH ...)"
	// after the identifier doesn't silently drop the row). Tokens are
	// trimmed and identifiers extracted by the matcher downstream.
	const tableRowRe = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm
	for (const match of section.matchAll(tableRowRe)) {
		const action = match[2]!.toLowerCase() as DomainMappingEntry['action']
		if (action !== 'create' && action !== 'modify' && action !== 'read-only') continue
		entries.push({
			index: parseInt(match[1]!, 10),
			action,
			skill: match[3]!.replace(/^\//, ''),
			name: match[4]!,
			context: match[5]!,
		})
	}
	return entries
}

/**
 * Extract the leading identifier from a Domain Mapping name.
 * "UpdateAppointmentNotesController (PATCH ...)" → "updateappointmentnotescontroller"
 * "Money" → "money"
 */
function identifierFromName(name: string): string {
	const head = name.split(/[\s(]/)[0] ?? name
	return head.toLowerCase()
}

/**
 * File stem = basename without extensions. Strips everything from the
 * first dot, so "Appointment.test.ts" → "appointment",
 * "AppointmentNotesUpdated.ts" → "appointmentnotesupdated".
 */
function stemOf(filePath: string): string {
	const base = filePath.split('/').pop() ?? ''
	return base.replace(/\..*$/, '').toLowerCase()
}

/**
 * Path-segment hints per skill: when a Domain Mapping entry's skill
 * implies a specific directory pattern (e.g., /controller → /controllers/),
 * require the file path to match the pattern. This disambiguates entries
 * whose `name` produces the same stem in different layers (notably the
 * /ui context convention where controller and query share the basename,
 * e.g., ui/controllers/appointments/ListAppointments.ts and
 * ui/usecases/appointments/ListAppointments.ts).
 */
const SKILL_PATH_HINTS: Record<string, RegExp> = {
	controller: /\/controllers\//,
	usecase: /\/usecases\//,
	query: /\/usecases\//, // queries live under ui/usecases in this monorepo
	entity: /\/entities\//,
	'value-object': /\/objects\//,
	enum: /\/enums\//,
	repository: /\/repositories\//,
	schema: /\/schemas\//,
	errors: /\/errors\//,
	event: /\/events\//,
	handler: /\/handlers\//,
	service: /\/services\//,
	route: /\/routes\//,
	component: /-components\//,
	form: /-forms\//,
	store: /-stores\//,
	primitive: /\/primitives\//,
	job: /\/jobs\//,
}

/**
 * Build a mapping of proposed paths → Domain Mapping action.
 * We match paths to Domain Mapping entries by correlating each Task's
 * filesWrites with Domain Mapping entries using name/context matching
 * or fall back to inspecting the path segments.
 *
 * Since the plan format doesn't embed proposedPath in the Domain Mapping
 * table, we need a heuristic: a filesWrites path is "new" if Domain Mapping
 * marks the corresponding artifact as `create`, "modify" if marked `modify`.
 *
 * Heuristic: match by artifact name appearing in the file path and context.
 */
function buildPathActionMap(tasks: PlanTask[], domainEntries: DomainMappingEntry[]): Map<string, DomainMappingEntry['action']> {
	const map = new Map<string, DomainMappingEntry['action']>()

	if (domainEntries.length === 0) {
		// No Domain Mapping table — assume all writes are new artifacts
		for (const task of tasks) {
			for (const p of task.filesWrites) {
				map.set(p, 'create')
			}
		}
		return map
	}

	// Index entries by lowercase name and context for matching
	const byNameCtx = new Map<string, DomainMappingEntry>()
	for (const entry of domainEntries) {
		byNameCtx.set(`${entry.name.toLowerCase()}:${entry.context.toLowerCase()}`, entry)
	}

	for (const task of tasks) {
		for (const filePath of task.filesWrites) {
			// Try to find a matching Domain Mapping entry
			const matched = findMatchingEntry(filePath, domainEntries, byNameCtx)
			map.set(filePath, matched ? matched.action : 'create')
		}
	}
	return map
}

/**
 * Heuristic path → Domain Mapping entry matcher.
 * Checks if any entry's name appears in the file path AND context appears in the path.
 */
function findMatchingEntry(
	filePath: string,
	entries: DomainMappingEntry[],
	_byNameCtx: Map<string, DomainMappingEntry>,
): DomainMappingEntry | null {
	// Strict stem-exact match + path-segment hint per skill. The file's
	// basename (without extensions) must equal the Domain Mapping name's
	// leading identifier AND the path must contain the directory segment
	// expected for the entry's skill (e.g., a /controller entry only
	// matches paths under /controllers/). Disambiguates same-name entries
	// across layers — common in the /ui BFF context where controller and
	// query share the basename.
	const fileStem = stemOf(filePath)
	const lowerPath = filePath.toLowerCase()
	for (const entry of entries) {
		const id = identifierFromName(entry.name)
		if (fileStem !== id) continue
		const hint = SKILL_PATH_HINTS[entry.skill]
		if (hint && !hint.test(lowerPath)) continue
		return entry
	}
	return null
}

/**
 * Resolve whether a file path exists either in the graph or on disk.
 * For PR-18: a path is "resolvable" if:
 *   - It has one or more graph nodes (tracked artifact), OR
 *   - The file exists on disk (new file already written or pre-existing)
 */
function pathResolvable(filePath: string, ctx: ReturnType<typeof loadQueryContext>): boolean {
	// Check graph index
	const ids = ctx.index.byFile[filePath] ?? []
	if (ids.length > 0) return true
	// Check disk
	const abs = join(ROOT, filePath)
	return existsSync(abs)
}

// ── Skill matching for PR-20 ──

/**
 * Returns the expected skill name for a graph node kind.
 * Must match the COMPONENT_TO_SKILL mapping in review-query.ts.
 */
const KIND_TO_SKILL: Record<string, string> = {
	entity: 'entity',
	'value-object': 'value-object',
	enum: 'enum',
	'error-code': 'errors',
	usecase: 'usecase',
	'ui-query': 'query',
	event: 'event',
	'integration-event': 'event',
	handler: 'handler',
	controller: 'controller',
	middleware: 'controller',
	schema: 'schema',
	'zod-schema': 'schema',
	'repository-interface': 'repository',
	'repository-impl': 'repository',
	'service-interface': 'service',
	'service-impl': 'service',
	'db-table': 'db-modelling',
	'frontend-route': 'route',
	'frontend-section': 'component',
	'frontend-component': 'component',
	'frontend-dialog': 'component',
	'frontend-form': 'form',
	'frontend-ui-primitive': 'primitive',
	'frontend-store': 'store',
	'frontend-hook': 'component',
}

// ── Main validation entry point ──

export async function validatePlan(planPath: string): Promise<ValidationResult> {
	const findings: ValidationFinding[] = []

	// Load plan
	const absPath = planPath.startsWith('/') ? planPath : join(ROOT, planPath)
	if (!existsSync(absPath)) {
		return {
			exitCode: 1,
			findings: [
				{
					rule: 'PR-18',
					taskId: '(plan)',
					detail: `Plan file not found: ${planPath}`,
				},
			],
		}
	}

	const raw = readFileSync(absPath, 'utf8')
	const ast = parsePlan(raw)
	const domainEntries = parseDomainMapping(raw)

	// Load graph (non-fatal if unavailable — we'll skip graph-dependent checks)
	let ctx: ReturnType<typeof loadQueryContext> | null = null
	try {
		ctx = loadQueryContext()
	} catch {
		// Graph unavailable — PR-18 and PR-19 are graph-dependent, skip them
	}

	const pathActionMap = buildPathActionMap(ast.tasks, domainEntries)

	// ── PR-18: Non-new paths must resolve to an existing graph node ──
	if (ctx) {
		for (const task of ast.tasks) {
			if (task.status === 'done') continue
			for (const filePath of task.filesWrites) {
				const action = pathActionMap.get(filePath) ?? 'create'
				if (action === 'create') continue // new artifact — skip check
				// modify or read-only: path must be resolvable
				if (!pathResolvable(filePath, ctx)) {
					findings.push({
						rule: 'PR-18',
						taskId: task.id,
						detail: `Path in filesWrites is marked '${action}' in Domain Mapping but resolves to no graph node and does not exist on disk.`,
						path: filePath,
					})
				}
			}
		}
	}

	// ── PR-19: depends_on consistency with graph upstream edges ──
	if (ctx) {
		const adj = buildAdjacency(ctx.graph)

		// Build map: taskId → set of node ids written by that task. Also track which tasks
		// write files the graph has NEVER seen (no byFile entry) — those are net-new artifacts,
		// and a depends_on edge that flows THROUGH a new file is invisible to the graph (the
		// importing file doesn't exist yet, so it has no node and no edges). Flagging those
		// pairs was PR-19's documented false positive; they are skipped below.
		const taskNodes = new Map<string, Set<string>>()
		const taskWritesNewFiles = new Map<string, boolean>()
		for (const task of ast.tasks) {
			const nodeIds = new Set<string>()
			let writesNew = false
			for (const filePath of task.filesWrites) {
				const ids = ctx.index.byFile[filePath] ?? []
				if (ids.length === 0) writesNew = true
				for (const id of ids) nodeIds.add(id)
			}
			taskNodes.set(task.id, nodeIds)
			taskWritesNewFiles.set(task.id, writesNew)
		}

		for (const task of ast.tasks) {
			if (task.status === 'done') continue
			if (task.dependsOn.length === 0) continue
			const taskWrittenNodes = taskNodes.get(task.id) ?? new Set()
			if (taskWrittenNodes.size === 0) continue // No graph nodes for this task — skip

			for (const depTaskId of task.dependsOn) {
				const depNodes = taskNodes.get(depTaskId) ?? new Set()
				if (depNodes.size === 0) continue // Dependency not in graph — skip
				// Either side writes net-new files → the dependency edge likely flows through a
				// file the graph can't see yet (e.g. a new repository importing a new table).
				// PR-19 can only judge pure-modify chains, where every node exists.
				if (taskWritesNewFiles.get(task.id) || taskWritesNewFiles.get(depTaskId)) continue

				// PR-19: For each node written by this task, check that at least one of
				// its upstream nodes is written by the dependency task.
				// We do a best-effort check: if ANY upstream overlap exists, the edge is valid.
				// We only flag if zero overlap AND both tasks have graph nodes.
				let anyOverlap = false
				for (const nodeId of taskWrittenNodes) {
					const inEdges = adj.in.get(nodeId) ?? []
					for (const edge of inEdges) {
						if (depNodes.has(edge.from)) {
							anyOverlap = true
							break
						}
					}
					if (anyOverlap) break
					// Also check transitive (shallow — 1 hop for now)
					const inEdges2 = adj.in.get(nodeId) ?? []
					for (const e of inEdges2) {
						const grandIn = adj.in.get(e.from) ?? []
						for (const ge of grandIn) {
							if (depNodes.has(ge.from)) {
								anyOverlap = true
								break
							}
						}
						if (anyOverlap) break
					}
					if (anyOverlap) break
				}

				// Only flag when both task and dependency have substantial graph nodes
				// and the overlap is clearly wrong. Skip if task writes scripts/* (not in graph).
				if (!anyOverlap && taskWrittenNodes.size > 0 && depNodes.size > 0) {
					findings.push({
						rule: 'PR-19',
						taskId: task.id,
						detail: `Task ${task.id} declares depends_on: ${depTaskId}, but no graph upstream edge was found between their written nodes.`,
					})
				}
			}
		}
	}

	// ── PR-20: skills list matches Domain Mapping skill column ──
	if (domainEntries.length > 0 && ctx) {
		// For each task, find which domain entries correspond to its filesWrites
		for (const task of ast.tasks) {
			if (task.status === 'done') continue
			for (const filePath of task.filesWrites) {
				// Test files are not first-class Domain Mapping artifacts —
				// they're co-created by the Task that owns the behavior. Skip
				// PR-20 for them; the fuzzy matcher can't distinguish a test
				// file from the artifact it tests when names overlap.
				if (/\.(test|spec)\.[jt]sx?$/.test(filePath)) continue
				const action = pathActionMap.get(filePath) ?? 'create'
				if (action === 'read-only') continue // read-only entries don't require a skill

				// Find the matching domain entry for this path
				const entry = findMatchingEntry(filePath, domainEntries, new Map())
				if (!entry) continue // no entry → skip (new artifact without Domain Mapping entry)

				// The skill from Domain Mapping (strip leading slash if any)
				const expectedSkill = entry.skill.replace(/^\//, '')

				// Check if the task's skills list includes the expected skill
				const taskSkills = task.skills.map(s => s.replace(/^\//, '').toLowerCase())
				if (!taskSkills.includes(expectedSkill.toLowerCase())) {
					// Also try matching via graph node kind
					const ids = ctx.index.byFile[filePath] ?? []
					let graphSkill: string | null = null
					for (const id of ids) {
						const node = ctx.graph.nodes.get(id)
						if (node) {
							graphSkill = KIND_TO_SKILL[node.kind] ?? null
							break
						}
					}

					const effectiveExpectedSkill = graphSkill ?? expectedSkill
					if (!taskSkills.includes(effectiveExpectedSkill.toLowerCase())) {
						findings.push({
							rule: 'PR-20',
							taskId: task.id,
							detail: `Task skills [${task.skills.join(', ')}] do not include '${effectiveExpectedSkill}' expected by Domain Mapping for path ${filePath}.`,
							path: filePath,
						})
					}
				}
			}
		}
	}

	// ── PR-21: modify tasks must cover transitiveDownstream ──
	// For bootstrap simplification: a modify artifact must have at least one Task touching it.
	// We flag when a 'modify' entry in Domain Mapping has zero tasks whose filesWrites
	// include the file, OR when no "ignore: downstream is unaffected" note is present.
	const modifyEntries = domainEntries.filter(e => e.action === 'modify')
	for (const entry of modifyEntries) {
		// Find tasks that write a file matching this entry (skipping done tasks)
		const covered = ast.tasks.some(
			task =>
				task.status !== 'done' &&
				task.filesWrites.some(fp => {
					const lp = fp.toLowerCase()
					return lp.includes(entry.name.toLowerCase()) && lp.includes(entry.context.toLowerCase())
				}),
		)
		if (!covered) {
			findings.push({
				rule: 'PR-21',
				taskId: '(plan)',
				detail: `Domain Mapping entry #${entry.index} (modify, ${entry.skill} ${entry.name} in ${entry.context}) has no Task covering it.`,
			})
		}
	}

	// ── PR-27: new scaffoldable artifacts must be scaffolded via `bun cli` (backend + frontend) ──
	// A brand-new artifact under packages/api/** or packages/app/** (entity, value-object, usecase,
	// controller, repository, schema, event, handler, service, middleware, enum, projection,
	// projector, query · route, component, store, form, primitive) must have a matching
	// `bun cli <verb>` scaffold step in its Task (scaffold-then-write — the CLI owns the canonical
	// shape/folder/story). Modifying a file that already exists (graph or disk) is exempt.
	// Paths the plan deletes or regenerates are never scaffolded — exempt them. (filesWrites
	// carries no Create/Modify/Delete verb, so scan the raw "Files to write" bullets.)
	const deletedPaths = new Set<string>()
	for (const m of raw.matchAll(/[-*]\s*(?:Delete|Remove|Regen|Regenerate)\s*:\s*`([^`]+)`/gi)) deletedPaths.add(m[1]!)

	for (const task of ast.tasks) {
		if (task.status === 'done') continue
		const taskBody = task.steps.map(s => s.body).join('\n')
		for (const filePath of task.filesWrites) {
			if (deletedPaths.has(filePath)) continue // Delete/Regen — not scaffolded
			const verb = scaffoldableArtifactVerb(filePath)
			if (!verb) continue
			// Language without a wired-up `bun cli` generator (declared in GENERATOR_SUPPORT) is
			// exempt from the scaffold-step requirement — consulted, never `if (lang === 'go')`.
			if (!hasGenerator(detectLang(filePath))) continue
			const inGraph = ctx ? (ctx.index.byFile[filePath]?.length ?? 0) > 0 : false
			if (inGraph || existsSync(join(ROOT, filePath))) continue // existing file → Modify, exempt
			const accepted = VERB_ALIASES[verb] ?? [verb]
			if (!new RegExp(`bun cli\\s+(${accepted.join('|')})\\b`).test(taskBody)) {
				findings.push({
					rule: 'PR-27',
					taskId: task.id,
					detail: `New ${verb} '${filePath}' must be scaffolded with \`bun cli ${verb} …\` in the same Task (scaffold-then-write), not hand-authored.`,
					path: filePath,
				})
			}
		}
	}

	// ── PR-26: non-done Tasks with steps must declare filesWrites ──
	// /build cannot dispatch a Task whose files it doesn't know. If a Task is
	// pending and has TDD steps, it must enumerate the paths it will write.
	for (const task of ast.tasks) {
		if (task.status === 'done') continue
		if (task.steps.length === 0) continue
		if (task.filesWrites.length === 0) {
			findings.push({
				rule: 'PR-26',
				taskId: task.id,
				detail: `Task ${task.id} has ${task.steps.length} step(s) but no **Files to write:** declared. /build cannot dispatch without knowing the file scope.`,
			})
		}
	}

	// ── PR-28: dispatched Tasks that build on upstream output must carry a load-bearing handoff ──
	// /build dispatches each Task to a FRESH-CONTEXT worker that sees only the Task body — so the
	// Task body IS the handoff. A Task that `Depends on` another wave consumes that wave's frozen
	// output; without the exact identifiers + a close-out gate, the worker re-derives shapes and
	// drops the tail (the measured single-context failure the fan-out exists to avoid). Tasks with
	// no deps (Phase-0 contract Tasks / independent leaves) are exempt — they freeze, not consume.
	for (const task of ast.tasks) {
		if (task.status === 'done') continue
		if (task.steps.length === 0) continue
		if (task.dependsOn.length === 0) continue
		if (task.consumes.trim() === '') {
			findings.push({
				rule: 'PR-28',
				taskId: task.id,
				detail: `Task ${task.id} depends on ${task.dependsOn.join(', ')} but declares no **Consumes (frozen):** — the fresh-context worker won't know which exact identifiers to import from upstream and will re-derive. Name them (e.g. \`useListX\`, \`createXMutationRequestSchema\`, \`XEventName\`).`,
			})
		}
		if (task.gate.trim() === '') {
			findings.push({
				rule: 'PR-28',
				taskId: task.id,
				detail: `Task ${task.id} has no **Gate:** — the worker has no close-out command and will stop at "looks done". Give the exact verification (tsc target / detector / test path).`,
			})
		}
	}

	return {
		exitCode: findings.length === 0 ? 0 : 1,
		findings,
	}
}
