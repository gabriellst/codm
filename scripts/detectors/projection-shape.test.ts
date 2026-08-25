import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { ROOT } from '../../.claude/hooks/classify-edit-core'
import type { Finding } from './projection-shape'

/**
 * projection-shape.ts's own docblock admits it: "zero projections exist at HEAD in either
 * backend... the gate ships clean by construction." Its function-level API is also private —
 * only `Finding` is exported, `walk()` is not — so there is no unit-level seam to drive it with
 * fixtures the way registry-scan.test.ts / import-direction.test.ts do. Combine those two facts
 * and you get a detector that has run in CI since it was written and has NEVER once produced a
 * finding, on real code or fixture code. A gate that has never been observed to fail measures
 * nothing: it could be silently broken (a regex that no longer matches, a glob that no longer
 * walks anything) and `0 finding(s), 0 gating` would look identical to "the repo is clean".
 *
 * This file is that missing witness. It does NOT unit-test private functions — it drives the
 * real CLI entrypoint end-to-end via `ROOT_OVERRIDE` (which retargets the walked tree; see the
 * detector's own docblock) + `--json`, against synthetic fixture trees built under a temp dir.
 * A compliant-only corpus is exactly the blind spot this witness closes: the positive-control
 * case below proves a fully-conformant projection/projector pair yields zero findings, and each
 * PS-0x case proves that a single, targeted deviation from that same compliant shape flips
 * exactly the rule it violates. Without the positive control, a detector that fired on
 * EVERYTHING (e.g. a regex bug) would pass every "does PS-0x fire" case for the wrong reason.
 */

const PROJECTION_PATH = 'packages/api/typescript/src/messaging/projections/MessageProjection.ts'
const PROJECTOR_PATH = 'packages/api/typescript/src/messaging/projections/projectors/MessageProjector.ts'

// Fully compliant projection: satisfies PS-01 (props type derives from schema via z.infer),
// PS-02 (free-record constructor), PS-03 (overloaded static create), and PS-04 (applyEvent
// dispatches via switch(event.name) with a never-exhaustiveness default). The detector only
// regex-matches source text — it never type-checks the fixture — so the referenced event types
// don't need to resolve; only the textual shape the five rules pattern-match on matters.
const COMPLIANT_PROJECTION = `import { z } from 'zod'

export const MessageProjectionSchema = z.object({
	id: z.string(),
})

export type MessageProjectionProps = z.infer<typeof MessageProjectionSchema>

export type MessageReceivedEvent = { name: 'MessageReceived'; id: string }
export type MessageEditedEvent = { name: 'MessageEdited'; id: string }
export type MessageProjectionEvent = MessageReceivedEvent | MessageEditedEvent

export class MessageProjection {
	constructor(public props: MessageProjectionProps) {}

	static create(event: MessageReceivedEvent): MessageProjection
	static create(event: MessageProjectionEvent): MessageProjection {
		switch (event.name) {
			case 'MessageReceived':
				return new MessageProjection({ id: event.id })
			default: {
				const _: never = event
				throw new Error('unreachable')
			}
		}
	}

	applyEvent(event: MessageEditedEvent): void
	applyEvent(event: MessageProjectionEvent): void {
		switch (event.name) {
			case 'MessageEdited':
				this.props.id = event.id
				break
			default: {
				const _: never = event
			}
		}
	}
}
`

// Compliant projector: calls `<Name>Projection.create(` — satisfies PS-05.
const COMPLIANT_PROJECTOR = `import { MessageProjection } from '../MessageProjection'

export class MessageProjector {
	async handle(event: import('../MessageProjection').MessageProjectionEvent): Promise<void> {
		await this.repo.insertIfNew(MessageProjection.create(event))
	}
}
`

function buildTree(root: string, files: Record<string, string>): void {
	for (const [relPath, content] of Object.entries(files)) {
		const full = join(root, relPath)
		mkdirSync(dirname(full), { recursive: true })
		writeFileSync(full, content)
	}
}

/** Spawns the real CLI entrypoint against a synthetic tree via ROOT_OVERRIDE + --json. */
function runDetector(root: string): Finding[] {
	const proc = Bun.spawnSync(['bun', 'scripts/detectors/projection-shape.ts', '--json'], {
		cwd: ROOT,
		env: { ...process.env, ROOT_OVERRIDE: root },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	// Exit code is 0 (clean) or 1 (findings) by design (`process.exit(findings.length > 0 ? 1 : 0)`)
	// — anything else means the process crashed instead of producing findings.
	if (proc.exitCode !== 0 && proc.exitCode !== 1) {
		throw new Error(`projection-shape --json exited ${proc.exitCode}: ${proc.stderr.toString()}`)
	}
	return JSON.parse(proc.stdout.toString()) as Finding[]
}

describe('projection-shape (integration witness via ROOT_OVERRIDE)', () => {
	function withTempTree(files: Record<string, string>): Finding[] {
		const tempRoot = mkdtempSync(join(tmpdir(), 'projection-shape-test-'))
		try {
			buildTree(tempRoot, files)
			return runDetector(tempRoot)
		} finally {
			rmSync(tempRoot, { recursive: true, force: true })
		}
	}

	it('positive control: a fully compliant projection + projector yields zero findings', () => {
		const findings = withTempTree({
			[PROJECTION_PATH]: COMPLIANT_PROJECTION,
			[PROJECTOR_PATH]: COMPLIANT_PROJECTOR,
		})
		expect(findings).toEqual([])
	})

	it('PS-01: fires alone when the props type declaration is missing', () => {
		const broken = COMPLIANT_PROJECTION.replace('export type MessageProjectionProps = z.infer<typeof MessageProjectionSchema>\n\n', '')
		expect(broken).not.toContain('ProjectionProps = z.infer')
		const findings = withTempTree({ [PROJECTION_PATH]: broken })
		expect(findings.map(f => f.ruleId)).toEqual(['PS-01'])
		expect(findings[0]?.detector).toBe('projection-shape')
		expect(findings[0]?.severity).toBe('error')
	})

	it('PS-02: fires alone when the constructor is not the free-record `public props` form', () => {
		const broken = COMPLIANT_PROJECTION.replace(
			'constructor(public props: MessageProjectionProps) {}',
			'constructor(props: MessageProjectionProps) {\n\t\tthis.props = props\n\t}',
		)
		expect(broken).not.toContain('constructor(public props: MessageProjectionProps)')
		const findings = withTempTree({ [PROJECTION_PATH]: broken })
		expect(findings.map(f => f.ruleId)).toEqual(['PS-02'])
	})

	it('PS-03: fires alone when there is no `static create(`', () => {
		const broken = COMPLIANT_PROJECTION.replaceAll('static create(', 'static of(')
		expect(broken).not.toContain('static create(')
		const findings = withTempTree({ [PROJECTION_PATH]: broken })
		expect(findings.map(f => f.ruleId)).toEqual(['PS-03'])
	})

	it('PS-04: fires alone when applyEvent mutates without switch(event.name)', () => {
		// PS-04's `switch (event.name)` check is file-wide, not scoped to applyEvent — so merely
		// stripping the switch out of applyEvent while leaving `static create`'s own
		// `switch (event.name)` in place would NOT isolate PS-04 (the file-wide regex would still
		// find a match and the rule would stay silent). To isolate PS-04 for real, `create()` is
		// rewritten to an equivalent if/else that never spells `switch (event.name)` anywhere in
		// the file, while `applyEvent` does a bare property assignment — the #1 measured lapse the
		// rule's own message calls out.
		const broken = `import { z } from 'zod'

export const MessageProjectionSchema = z.object({
	id: z.string(),
})

export type MessageProjectionProps = z.infer<typeof MessageProjectionSchema>

export type MessageReceivedEvent = { name: 'MessageReceived'; id: string }
export type MessageEditedEvent = { name: 'MessageEdited'; id: string }
export type MessageProjectionEvent = MessageReceivedEvent | MessageEditedEvent

export class MessageProjection {
	constructor(public props: MessageProjectionProps) {}

	static create(event: MessageReceivedEvent): MessageProjection
	static create(event: MessageProjectionEvent): MessageProjection {
		if (event.name === 'MessageReceived') {
			return new MessageProjection({ id: event.id })
		}
		throw new Error('unreachable')
	}

	applyEvent(event: MessageEditedEvent): void {
		this.props.id = event.id
	}
}
`
		expect(broken).toContain('static create(')
		expect(broken).toContain('applyEvent(')
		expect(broken).not.toMatch(/switch\s*\(\s*event\.name\s*\)/)
		const findings = withTempTree({ [PROJECTION_PATH]: broken })
		expect(findings.map(f => f.ruleId)).toEqual(['PS-04'])
	})

	it('PS-05: fires alone when a projector calls neither `.create(` nor `.applyEvent(`', () => {
		// Pair with the COMPLIANT projection so the only finding possible is from the projector scan.
		const brokenProjector = `import { messageProjectionRepo } from '../../repositories/MessageProjectionRepository'

export class MessageProjector {
	async handle(event: unknown): Promise<void> {
		await messageProjectionRepo.upsertMany([event])
	}
}
`
		expect(brokenProjector).not.toMatch(/\w+Projection\.create\(/)
		expect(brokenProjector).not.toContain('.applyEvent(')
		const findings = withTempTree({
			[PROJECTION_PATH]: COMPLIANT_PROJECTION,
			[PROJECTOR_PATH]: brokenProjector,
		})
		expect(findings.map(f => f.ruleId)).toEqual(['PS-05'])
	})
})
