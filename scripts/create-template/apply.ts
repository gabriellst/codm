// scripts/create-template/apply.ts — the ONE interpreter of a StampPlan (see plan.ts).
//
// applyStamp executes plain plan DATA against a destination directory. It knows nothing about
// backends, frontends, languages, or env keys — every decision was taken by planStamp; this file
// only implements the closed primitive vocabulary: copy-with-rules, prune, JSON edits, line
// strips, manifest re-render, rendered files.
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CopyRule, JsonEdit, StampPlan } from './plan'
import { MANIFEST_FILE, renderStampedManifest } from './render-manifest'

export interface ApplyTarget {
	/** The template checkout to copy from. */
	srcDir: string
	/** The stamp destination (created if missing). */
	destDir: string
}

/** First matching rule wins; no match = copy. The single evaluator of CopyRule data. */
export function evalCopyRules(rules: readonly CopyRule[], path: string): boolean {
	for (const rule of rules) {
		const containsOk = rule.contains === undefined || path.includes(rule.contains)
		const endsWithOk = rule.endsWith === undefined || path.endsWith(rule.endsWith)
		if (containsOk && endsWithOk) return rule.action === 'keep'
	}
	return true
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** Apply one JsonEdit to a parsed document. Missing containers are a no-op for delete/dropUnder;
 *  `set` creates intermediate objects (a plan never sets into a pruned selection's file). */
export function applyJsonEdit(doc: Record<string, JsonValue>, edit: JsonEdit): void {
	const containerPath = edit.path.slice(0, -1)
	const leaf = edit.path[edit.path.length - 1]
	if (leaf === undefined) throw new Error('JsonEdit with an empty path')

	let container: Record<string, JsonValue> | undefined = doc
	for (const segment of containerPath) {
		const next: JsonValue | undefined = container[segment]
		if (next === undefined) {
			if (edit.op !== 'set') return
			const created: Record<string, JsonValue> = {}
			container[segment] = created
			container = created
			continue
		}
		if (typeof next !== 'object' || next === null || Array.isArray(next))
			throw new Error(`JsonEdit path '${edit.path.join('.')}' crosses a non-object`)
		container = next
	}

	switch (edit.op) {
		case 'set':
			container[leaf] = edit.value as JsonValue
			break
		case 'delete':
			delete container[leaf]
			break
		case 'dropUnder': {
			const current = container[leaf]
			if (current === undefined) return
			if (!Array.isArray(current)) throw new Error(`JsonEdit dropUnder at '${edit.path.join('.')}' expects an array`)
			container[leaf] = current.filter(v => typeof v !== 'string' || !edit.roots.some(root => v === root || v.startsWith(`${root}/`)))
			break
		}
	}
}

async function patchJsonFile(file: string, edits: readonly JsonEdit[]): Promise<void> {
	if (!existsSync(file)) return
	const doc = JSON.parse(await readFile(file, 'utf-8')) as Record<string, JsonValue>
	for (const edit of edits) applyJsonEdit(doc, edit)
	await writeFile(file, `${JSON.stringify(doc, null, '\t')}\n`)
}

async function stripLines(file: string, patterns: readonly string[]): Promise<void> {
	if (!existsSync(file)) return
	let content = await readFile(file, 'utf-8')
	for (const pattern of patterns) content = content.replace(new RegExp(pattern, 'm'), '')
	await writeFile(file, content)
}

/** Execute a StampPlan: copy → prune → JSON edits → line strips → manifest closure → rendered files. */
export async function applyStamp(plan: StampPlan, { srcDir, destDir }: ApplyTarget): Promise<void> {
	await mkdir(destDir, { recursive: true })
	await cp(srcDir, destDir, {
		recursive: true,
		filter: path => evalCopyRules(plan.copyRules, path),
	})

	for (const dir of plan.prune) await rm(join(destDir, dir), { recursive: true, force: true })

	for (const patch of plan.jsonPatches) await patchJsonFile(join(destDir, patch.file), patch.edits)

	for (const strip of plan.lineStrips) await stripLines(join(destDir, strip.file), strip.patterns)

	// MANIFEST CLOSURE — the stamped template.config.ts declares only what shipped.
	const manifestPath = join(destDir, MANIFEST_FILE)
	await writeFile(manifestPath, renderStampedManifest(await readFile(manifestPath, 'utf-8'), plan.manifest))

	for (const rendered of plan.files) {
		const target = join(destDir, rendered.path)
		await mkdir(dirname(target), { recursive: true })
		await writeFile(target, rendered.content)
	}
}
