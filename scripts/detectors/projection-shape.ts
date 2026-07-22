#!/usr/bin/env bun
/**
 * projection-shape.ts — structural walker for the Projection free-record canon (TS backend).
 *
 * The projection/projector canon (root CLAUDE.md First-Class Citizens + projection skill)
 * prescribes an exact structural shape that NO live exemplar currently demonstrates (zero
 * projections exist at HEAD in either backend) — measured consequence: builders produce
 * working-but-misshapen projections (eval: be-projection-iter1 missed all four shape rules
 * while passing the behavioral graders). Until the CLI scaffold carrier lands, this walker
 * enforces the shape mechanically. Rung: detect.
 *
 * For every `class <Name>Projection` under packages/api/typescript/src/** (excluding
 * tests/projectors):
 *   PS-01  file lacks `export type <Name>ProjectionProps = z.infer<typeof ...Schema>`  error
 *   PS-02  file lacks `constructor(public props: <Name>ProjectionProps)`               error
 *   PS-03  file lacks an overloaded `static create(`                                   error
 *   PS-04  a mutating projection (declares applyEvent) must `switch (event.name)`      error
 *
 * Companion projector checks (files under projections/projectors/):
 *   PS-05  projector file never calls `<Name>Projection.create(` NOR `.applyEvent(`    error
 *
 * Usage: bun scripts/detectors/projection-shape.ts [--json]
 * ROOT_OVERRIDE retargets the walked tree (eval worktrees). No baseline file — zero
 * projections exist at HEAD, so the gate ships clean by construction.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export interface Finding {
	detector: string
	ruleId: string
	source: string
	file: string
	line: number
	severity: 'error'
	message: string
}

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const PROJECT_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(SCRIPT_DIR, '../..')
const BACKEND_SRC = join(PROJECT_ROOT, 'packages/api/typescript/src')

function rel(path: string): string {
	return relative(PROJECT_ROOT, path).replaceAll('\\', '/')
}

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split('\n').length
}

async function collect(glob: string): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Bun.Glob(glob).scan({ cwd: BACKEND_SRC, onlyFiles: true })) {
		if (!/\.test\.ts$/.test(entry)) out.push(join(BACKEND_SRC, entry))
	}
	return out.sort()
}

export async function walk(): Promise<Finding[]> {
	const findings: Finding[] = []
	const push = (ruleId: string, file: string, line: number, message: string) =>
		findings.push({
			detector: 'projection-shape',
			ruleId,
			source: 'projection#free-record-shape',
			file: rel(file),
			line,
			severity: 'error',
			message,
		})

	for (const file of await collect('*/projections/*.ts')) {
		const source = readFileSync(file, 'utf-8')
		const cls = source.match(/export class (\w+)Projection\b/)
		if (!cls) continue
		const name = cls[1]
		const at = lineOf(source, cls.index ?? 0)
		if (!new RegExp(`export type ${name}ProjectionProps = [Zz]\\.infer<typeof \\w+Schema>`).test(source)) {
			push(
				'PS-01',
				file,
				at,
				`${name}Projection lacks \`export type ${name}ProjectionProps = z.infer<typeof ${name}ProjectionSchema>\` — the props type derives from the schema, never hand-typed.`,
			)
		}
		if (!new RegExp(`constructor\\(public props: ${name}ProjectionProps\\)`).test(source)) {
			push(
				'PS-02',
				file,
				at,
				`${name}Projection lacks the free-record \`constructor(public props: ${name}ProjectionProps)\` — projections are plain records, no base class, no field-by-field assignment.`,
			)
		}
		if (!/static create\(/.test(source)) {
			push(
				'PS-03',
				file,
				at,
				`${name}Projection lacks \`static create(event)\` — creation is an overloaded static (one signature per creating event) so the type system enforces which events may create the row.`,
			)
		}
		if (/applyEvent\(/.test(source) && !/switch\s*\(\s*event\.name\s*\)/.test(source)) {
			push(
				'PS-04',
				file,
				at,
				`${name}Projection declares applyEvent without \`switch (event.name)\` — EVERY applyEvent dispatches via \`switch (event.name)\` + \`default: { const _: never = event }\`, EVEN for a SINGLE event (write the switch from the first event; a bare \`this.props.x = …\` assignment is the #1 measured projection lapse).`,
			)
		}
	}

	// ── Go side (k=2 cross-language: go-projector-iter1 missed the same shapes) ──
	const GO_SRC = join(PROJECT_ROOT, 'packages/api/go/internal')
	// No Go bounded contexts (clean/stripped or non-Go tree) → skip the Go scan.
	// Bun.Glob.scan on a missing cwd throws ENOENT with a null-byte path that then
	// poisons any downstream `claude -p` prompt embedding the detect output.
	if (existsSync(GO_SRC)) {
		for await (const entry of new Bun.Glob('*/projections/*.go').scan({ cwd: GO_SRC, onlyFiles: true })) {
			if (entry.endsWith('_test.go')) continue
			const file = join(GO_SRC, entry)
			const source = readFileSync(file, 'utf-8')
			const cls = source.match(/type (\w+)Projection struct/)
			if (!cls) continue
			const at = lineOf(source, cls.index ?? 0)
			if (!new RegExp(`func \\(\\w+ \\*?${cls[1]}Projection\\) ApplyEvent\\(`).test(source)) {
				push(
					'GPS-01',
					file,
					at,
					`${cls[1]}Projection (Go) lacks an ApplyEvent method — the projection owns its transitions; projectors call find → ApplyEvent → save, never field-level writes.`,
				)
			}
		}
		for await (const entry of new Bun.Glob('*/projections/projectors/*_projector.go').scan({ cwd: GO_SRC, onlyFiles: true })) {
			if (entry.endsWith('_test.go')) continue
			const file = join(GO_SRC, entry)
			const source = readFileSync(file, 'utf-8')
			const projectorStructs = [...source.matchAll(/type (\w+Projector) struct/g)].map(m => m[1])
			if (projectorStructs.length > 1) {
				push(
					'GPS-03',
					file,
					1,
					`${projectorStructs.length} projector structs in one file (${projectorStructs.join(', ')}) — ONE projector per projection, subscribing to every mutating event; per-event splits are the handler pattern, not the projector pattern.`,
				)
			}
			const moduleFile = join(GO_SRC, entry.split('/')[0], 'module.go')
			const projectorName = source.match(/type (\w+Projector) struct/)?.[1]
			if (projectorName && existsSync(moduleFile) && !readFileSync(moduleFile, 'utf-8').includes(projectorName)) {
				push(
					'GPS-02',
					file,
					1,
					`${projectorName} is not referenced in its context module.go — projectors register in the fx module next to the sibling handlers.`,
				)
			}
		}
	}

	for (const file of await collect('*/projections/projectors/*Projector.ts')) {
		const source = readFileSync(file, 'utf-8')
		if (!/\w+Projection\.create\(/.test(source) && !/\.applyEvent\(/.test(source)) {
			push(
				'PS-05',
				file,
				1,
				'Projector neither calls `<Name>Projection.create(` nor `.applyEvent(` — the canonical flows are insertIfNew(Projection.create(event)) and find → applyEvent → save; raw row writes from the projector are atomic-op edge cases that need a written trigger justification.',
			)
		}
	}
	return findings
}

if (import.meta.main) {
	const findings = await walk()
	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(findings, null, 2))
	} else {
		for (const f of findings) console.log(`${f.file}:${f.line} [${f.severity}] ${f.ruleId} (${f.source}) — ${f.message}`)
		console.log(`${findings.length} finding(s), ${findings.length} gating`)
	}
	process.exit(findings.length > 0 ? 1 : 0)
}
