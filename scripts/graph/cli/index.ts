#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, writeOutputs } from '../core/builder'
import { deserializeGraph, type Graph, type SerializedGraph } from '../core/graph'
import { GRAPH_JSON, GRAPH_OUT, repoRelative } from '../core/paths'
import { buildAdjacency, downstream, orphans, renderTree, shortestPath, upstream } from '../core/query'
import { renderGraphHtml } from '../outputs/html'
import {
	changedFilesFromDiff,
	changedFilesUnstaged,
	formatMeasurement,
	formatReviewBatch,
	loadQueryContext,
	measureReviewBatch,
	reviewBatch,
	reviewFile,
} from '../core/review-query'
import { buildPlanPayload } from './plan-cmd'
import { parsePlan } from './plan-parser'
import { validatePlan } from './validate-plan-cmd'

const args = process.argv.slice(2)
const command = args[0]

async function loadOrBuild(): Promise<Graph> {
	if (!existsSync(GRAPH_JSON)) {
		console.error('Graph file not found, building from scratch...')
		const result = await build()
		writeOutputs(result)
		return result.graph
	}
	const raw = readFileSync(GRAPH_JSON, 'utf8')
	return deserializeGraph(JSON.parse(raw) as SerializedGraph)
}

function jsonOut(value: unknown): void {
	process.stdout.write(JSON.stringify(value, null, 2))
	process.stdout.write('\n')
}

function parseDepthFlag(args: string[], fallback: number): number {
	return parseIntFlag(args, '--depth', fallback)
}

function parseIntFlag(args: string[], flag: string, fallback: number): number {
	const eq = args.find(a => a.startsWith(`${flag}=`))
	if (eq) {
		const n = parseInt(eq.slice(flag.length + 1), 10)
		if (!Number.isNaN(n)) return n
	}
	const idx = args.indexOf(flag)
	if (idx >= 0 && args[idx + 1]) {
		const n = parseInt(args[idx + 1]!, 10)
		if (!Number.isNaN(n)) return n
	}
	return fallback
}

async function main() {
	switch (command) {
		case 'build': {
			console.log('Building code graph...')
			const start = Date.now()
			const result = await build()
			writeOutputs(result)
			const elapsed = Date.now() - start
			console.log()
			console.log(`Graph built in ${elapsed}ms`)
			console.log(`  Nodes: ${result.stats.nodes}`)
			console.log(`  Edges: ${result.stats.edges}`)
			console.log(`  Backend (TS) files: ${result.stats.extractor.backend}`)
			console.log(`  Backend (Go) files: ${result.stats.extractor.go}`)
			console.log(`  Frontend files: ${result.stats.extractor.frontend}`)
			console.log(`  Astro files: ${result.stats.extractor.astro}`)
			console.log(`  DB tables: ${result.stats.extractor.drizzle}`)
			console.log(
				`  Contracts: ${result.stats.extractor.contracts.enums} enums, ${result.stats.extractor.contracts.events} events, ${result.stats.extractor.contracts.unions} unions, ${result.stats.extractor.contracts.generatedLinked} generated edges`,
			)
			console.log(`  Locale keys: ${result.stats.extractor.locale}`)
			console.log(`  SDK operations: ${result.stats.extractor.openapi}`)
			console.log(
				`  Resolver: ${result.stats.resolve.upgraded} upgraded, ${result.stats.resolve.derived} derived, ${result.stats.resolve.pruned} pruned, ${result.stats.resolve.rewired} rewired`,
			)
			console.log()
			console.log(`Output: ${GRAPH_JSON}`)
			return
		}
		case 'why': {
			const id = args[1]
			if (!id) {
				console.error('Usage: bun cli graph why <node-id> [depth=4] [--json]')
				process.exit(1)
			}
			const json = args.includes('--json')
			const depth = parseDepthFlag(args, parseInt(args[2] ?? '4', 10))
			const graph = await loadOrBuild()
			const adj = buildAdjacency(graph)
			const result = upstream(graph, adj, id, depth)
			if (!result) {
				console.error(`Node not found: ${id}`)
				process.exit(1)
			}
			if (json) {
				jsonOut(result)
				return
			}
			console.log(`Why ${result.root.id} exists (upstream depth ${depth}):`)
			console.log(renderTree(result.tree))
			return
		}
		case 'impact': {
			const id = args[1]
			if (!id) {
				console.error('Usage: bun cli graph impact <node-id> [depth=4] [--json]')
				process.exit(1)
			}
			const json = args.includes('--json')
			const depth = parseDepthFlag(args, parseInt(args[2] ?? '4', 10))
			const graph = await loadOrBuild()
			const adj = buildAdjacency(graph)
			const result = downstream(graph, adj, id, depth)
			if (!result) {
				console.error(`Node not found: ${id}`)
				process.exit(1)
			}
			if (json) {
				jsonOut(result)
				return
			}
			console.log(`Impact of changing ${result.root.id} (downstream depth ${depth}):`)
			console.log(renderTree(result.tree))
			return
		}
		case 'path': {
			const a = args[1]
			const b = args[2]
			if (!a || !b) {
				console.error('Usage: bun cli graph path <from-id> <to-id> [--directed]')
				process.exit(1)
			}
			const directed = args.includes('--directed')
			const graph = await loadOrBuild()
			const adj = buildAdjacency(graph)
			const path = shortestPath(graph, adj, a, b, { directed })
			if (!path) {
				console.log(`No path from ${a} to ${b}`)
				return
			}
			console.log(`Path from ${a} to ${b}${directed ? ' (directed)' : ' (undirected)'}:`)
			let cursor = a
			for (const step of path) {
				const arrow = step.reversed ? '←' : '→'
				const next = step.reversed ? step.edge.from : step.edge.to
				const audit = step.edge.audit === 'INFERRED' ? '*' : ''
				console.log(`  ${cursor}\n    ─[${step.edge.kind}${audit}]${arrow}\n  ${next}`)
				cursor = next
			}
			return
		}
		case 'orphans': {
			const json = args.includes('--json')
			const includeByDesign = args.includes('--all')
			const graph = await loadOrBuild()
			const adj = buildAdjacency(graph)
			const result = orphans(graph, adj, { includeByDesign })
			if (json) {
				jsonOut(result)
				return
			}
			console.log(`Orphan nodes (${result.length}${includeByDesign ? ', incl. by-design' : ', excl. generated/dead'}):`)
			for (const node of result) {
				console.log(`  ${node.id}  (${node.kind}, ${node.location?.file ?? 'no location'})`)
			}
			return
		}
		case 'file': {
			const fileArg = args[1]
			if (!fileArg) {
				console.error('Usage: bun cli graph file <path> [--json] [--depth=3] [--max-downstream=50]')
				process.exit(1)
			}
			const json = args.includes('--json')
			const depth = parseDepthFlag(args, 3)
			const maxDownstream = parseIntFlag(args, '--max-downstream', 50)
			const ctx = loadQueryContext()
			const repoPath = fileArg.startsWith('/') ? repoRelative(fileArg) : fileArg
			const result = reviewFile(ctx, repoPath, { depth, maxDownstream })
			if (json) {
				jsonOut(result)
				return
			}
			if (result.nodes.length === 0) {
				console.log(`(no graph nodes for ${result.file})`)
				return
			}
			console.log(`# ${result.file}`)
			for (const n of result.nodes) {
				console.log(`\n${n.node.id}`)
				console.log(`  kind: ${n.node.kind}`)
				if (n.skill) console.log(`  skill: ${n.skill}`)
				console.log(`  ↑ ${n.incoming.length} upstream · ↓ ${n.outgoing.length} downstream`)
				const td = n.transitiveDownstream
				const note = td.truncated ? ` (sample of ${td.nodes.length} shown)` : ''
				console.log(`  blast radius: ${td.count} nodes${note} (depth ${depth})`)
			}
			return
		}
		case 'review': {
			// `graph review` — produce a review payload for changed files
			//   --diff <ref>      compare HEAD against <ref> (default behaviour: unstaged)
			//   --files <a> <b>   explicit file list
			//   --json            emit machine-readable JSON
			//   --measure         emit a payload-size breakdown (bytes/tokens by section)
			//   --depth=N         BFS depth for transitive impact (default 3)
			const json = args.includes('--json')
			const measure = args.includes('--measure')
			const depth = parseDepthFlag(args, 3)
			const maxDownstream = parseIntFlag(args, '--max-downstream', 50)
			const filesIdx = args.indexOf('--files')
			const diffIdx = args.indexOf('--diff')

			let files: string[] = []
			if (filesIdx >= 0) {
				files = args.slice(filesIdx + 1).filter(a => !a.startsWith('--'))
			} else if (diffIdx >= 0) {
				const ref = args[diffIdx + 1]
				if (!ref || ref.startsWith('--')) {
					console.error('Usage: bun cli graph review --diff <git-ref> [--json] [--depth=N]')
					process.exit(1)
				}
				files = changedFilesFromDiff(ref)
			} else {
				files = changedFilesUnstaged()
			}

			if (files.length === 0) {
				console.error('No changed files detected. Use --files or --diff <ref>.')
				process.exit(1)
			}

			const ctx = loadQueryContext()
			const batch = reviewBatch(ctx, files, { depth, maxDownstream })
			if (measure) {
				process.stdout.write(formatMeasurement(measureReviewBatch(batch)))
				return
			}
			if (json) {
				jsonOut(batch)
				return
			}
			process.stdout.write(formatReviewBatch(batch))
			return
		}
		case 'render': {
			const graph = await loadOrBuild()
			const html = renderGraphHtml(graph)
			mkdirSync(GRAPH_OUT, { recursive: true })
			const outPath = join(GRAPH_OUT, 'index.html')
			writeFileSync(outPath, html)
			console.log(`HTML viewer written to ${outPath}`)
			console.log(`Open with: open ${outPath}`)
			return
		}
		case 'stats': {
			const graph = await loadOrBuild()
			console.log('Graph stats')
			console.log(`  Nodes: ${graph.nodes.size}`)
			console.log(`  Edges: ${graph.edges.length}`)
			console.log()
			console.log('  Nodes by kind:')
			const byKind = Object.entries(graph.stats.nodesByKind).sort((a, b) => b[1] - a[1])
			for (const [kind, count] of byKind) {
				console.log(`    ${kind.padEnd(28)} ${count}`)
			}
			console.log()
			console.log('  Edges by kind:')
			const byEdge = Object.entries(graph.stats.edgesByKind).sort((a, b) => b[1] - a[1])
			for (const [kind, count] of byEdge) {
				console.log(`    ${kind.padEnd(28)} ${count}`)
			}
			return
		}
		case 'plan': {
			const specPath = args[1]
			if (!specPath) {
				console.error('usage: graph plan <spec-path> [--json]')
				process.exit(2)
			}
			const payload = await buildPlanPayload(specPath)
			if (args.includes('--json')) {
				jsonOut(payload)
			} else {
				console.log(`Graph snapshot for ${specPath}`)
				console.log(`  Nodes: ${payload.graphStats.nodeCount}, edges: ${payload.graphStats.edgeCount}`)
				console.log(`  Contexts: ${payload.graphStats.contexts.join(', ')}`)
				console.log(`  Skill registries loaded: ${Object.keys(payload.registries).length}`)
				console.log(`  Existing artifacts: ${payload.existingArtifacts.length}`)
				if (payload.inconsistencies.length > 0) {
					console.log(`  Inconsistencies: ${payload.inconsistencies.length}`)
					for (const i of payload.inconsistencies.slice(0, 10)) console.log(`    - ${i.kind}: ${i.message}`)
				}
			}
			return
		}
		case 'validate-plan': {
			const planPath = args[1]
			if (!planPath) {
				console.error('usage: graph validate-plan <plan-path>')
				process.exit(2)
			}
			const result = await validatePlan(planPath)
			if (result.findings.length > 0) {
				console.error(JSON.stringify(result.findings, null, 2))
			}
			// Never `OK` while a rule went unevaluated: the command used to print exactly that on any
			// tree without .graph/graph.json, which is every fresh clone.
			for (const note of result.skipped) console.error(`NOT EVALUATED: ${note}`)
			if (result.findings.length === 0 && result.skipped.length === 0) {
				console.log(`OK: ${planPath} passes PR-18..27`)
			}
			process.exit(result.exitCode)
			return
		}
		case 'parse-plan': {
			const planPath = args[1]
			if (!planPath) {
				console.error('usage: graph parse-plan <plan-path> [--json]')
				process.exit(2)
			}
			const raw = readFileSync(planPath, 'utf8')
			const ast = parsePlan(raw)
			if (args.includes('--json')) {
				jsonOut(ast)
			} else {
				console.log(`Plan: ${ast.title}`)
				console.log(`  Spec: ${ast.specPath}`)
				console.log(`  Tasks: ${ast.tasks.length}`)
				for (const t of ast.tasks) {
					console.log(`    ${t.id} — ${t.name} [${t.agent}] (${t.steps.length} steps, deps: ${t.dependsOn.join(',') || 'none'})`)
				}
				console.log(`  Final validation steps: ${ast.finalValidation.length}`)
			}
			return
		}
		case 'help':
		case '--help':
		case '-h':
		case undefined:
			showHelp()
			return
		default:
			console.error(`Unknown command: ${command}`)
			showHelp()
			process.exit(1)
	}
}

function showHelp() {
	console.log(`
Graph CLI — Codebase code-graph extractor & query

USAGE:
  bun cli graph <command> [args]

COMMANDS:
  build                                Extract the full code graph (writes .graph/graph.json + index.json)
  why <node-id> [depth=4] [--json]     Show upstream tree (what depends on this)
  impact <node-id> [depth=4] [--json]  Show downstream tree (what breaks if this changes)
  path <from-id> <to-id>               Shortest connecting path
  orphans [--json]                     List nodes with no edges
  stats                                Graph stats (nodes/edges by kind)
  file <path> [--json] [--depth=N]     Per-file review payload (nodes, deps, skill registry)
  review [--diff <ref>] [--files ...]  Batch review for changed files (use --json for piping)
        [--json] [--measure] [--depth=N] [--max-downstream=N]
                                         (--measure prints a payload size breakdown;
                                          --max-downstream caps transitiveDownstream sampling, default 50)
  render                               Generate interactive HTML viewer at .graph/index.html

NODE ID FORMAT (polyglot):
  <workspace>:<ctx>:<kind>:<name>      e.g. api-go:sales:entity:Order
  <workspace>:<kind>:<name>            e.g. app-react:frontend-section:OrderList
  <workspace>:frontend-route:<path>    e.g. app-react:frontend-route:packages/app/react/src/routes/index
  sdk:<sdkLang>:<backendLang>:...      e.g. sdk:go:typescript:sdk-operation:listOrders
  sdk:app:<kind>:<name>                e.g. sdk:app:sdk-hook:useListVideos  (TS→TS legacy alias)
  contracts:<kind>:<name>              e.g. contracts:contract-enum:VideoStatus
  db:<schema>:db-table:<symbol>        e.g. db:video:db-table:videos
  docs:locale:<lang>:<dotted.key>      e.g. docs:locale:pt:errors.VIDEO_NOT_FOUND

WORKSPACES (matrix):
  api-typescript | api-go                         backends
  app-react | app-astro                           frontends
  contracts                                       wire + db source of truth
  client-typescript | client-go                   generated SDKs
  contracts-generated-{ts,go}                     generated wire bindings
`)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
