import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Supervisor-reach guard (fase 5, item 3 — "travas de segurança") — the supervisor can only reach what it is allowed to.
 *
 * The owner chose (20/11) a supervisor that acts from the installation on, so its reach is part of the design, not a
 * convention: it may RETRY a stop by `AUTO_RETRY`, RESTART a task with its handoff notes and ESCALATE by badge and
 * timeline — and never merge, publish, change a priority, answer a decision / question / approval for a person, or
 * write to anyone (group, person, owner). A live turn gone silent is only flagged: the inactivity watchdog stays the one
 * that kills. Those limits hold because the supervisor's files cannot import the doors that would break them.
 *
 * How it checks: every import specifier of the supervisor's files (`SUPERVISED_FILES` that exist — the job now, the
 * verdict executor from slice S5) must be listed in `SUPERVISOR_ALLOWED_PORTS`, each with why. A new import fails here
 * until someone names it and says why the supervisor may have it in reach.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')

/** The supervisor's own files. The verdict executor (S5) is governed from the moment it exists. */
const SUPERVISED_FILES = ['agent/usecases/SuperviseSuspectIssues.ts', 'agent/usecases/ActOnSupervisorVerdict.ts'] as const

/** Every module the supervisor may import, and why it is safe to have in reach. */
const SUPERVISOR_ALLOWED_PORTS: readonly { module: string; why: string; names?: readonly string[] }[] = [
	{ module: 'tsyringe-neo', why: 'DI decorators' },
	{
		module: '@codm/core-typescript',
		why: 'the Handler base, the logger and zod — NAMED, because the barrel also exports the command queue a channel delivery rides',
		names: ['Handler', 'LoggingService', 'z', 'Transaction'],
	},
	{ module: '@codm/contracts-typescript/wire/enums', why: 'the closed vocabularies (reasons, verdicts)' },
	{ module: '@shared/config/ProductConfig', why: 'its mode (`CODM_AGENT_SUPERVISOR_MODE`)' },
	{ module: '@issue/services/IssueBoardReader', why: 'READ: the life state of a suspect task' },
	{ module: '@issue/services/IssueTimelineReader', why: 'READ: the last moments of a suspect task' },
	{ module: '../services/SuspectIssueReader', why: 'READ: which tasks are suspect, by declared rule' },
	{ module: '../services/IssueSupervisor', why: 'the tool-less small-model review — decides, never acts' },
	{ module: '../services/QuotaStatusReader', why: 'READ: skip the pass while the provider pauses or the budget holds' },
	{ module: '../events/AgentSupervisorReviewedEvent', why: 'its own audit fact' },
	{ module: '../enums/SupervisorMode', why: 'vocabulary' },
	{ module: '../enums/SupervisorPassSkip', why: 'vocabulary' },
	{ module: '../enums/SupervisorFallback', why: 'vocabulary' },
	{ module: '../utils/SupervisorCaps', why: 'the per-task daily ceilings (pure)' },
	// Slice S5 — the verdict is carried out, through these doors only.
	{ module: './ActOnSupervisorVerdict', why: 'the job hands each verdict to its executor — governed by this same rail' },
	{
		module: '@thread/usecases/ApplySupervisorRetry',
		why: 'RETRY: resolves the open stall / provider error with AUTO_RETRY — refuses a person`s stop, writes to nobody',
	},
	{ module: '@thread/enums/SupervisorRetryOutcome', why: 'vocabulary' },
	{ module: '@issue/services/IssueHold', why: 'READ: a paused issue or conversation is never touched' },
	{ module: '../services/DeclaredWaitReader', why: 'READ: a task waiting for feedback is never touched' },
	{
		module: '../services/LiveTurnReader',
		why: 'READ: a live turn is never stopped nor run beside — the read-only face of the turn registry, no abort in reach',
	},
	{
		module: '../services/NudgeQueue',
		why: 'RESTART with no stop: queues the LAST nudge (REMINDER, AUTO) — the narrow door, not the whole mailbox',
	},
	{
		module: '../repositories/AgentSessionRepository',
		why: 'RESTART: the task`s own session row gets the restart request (`requestHandoff`) — the agent`s own aggregate',
	},
	{ module: '../objects/NudgePayload', why: 'the nudge count (`NUDGES_BEFORE_STALL`)' },
]

/** One import of a source text: the module, and the names it brings in (absent for a namespace / default / dynamic). */
interface ImportSite {
	module: string
	names?: string[]
}

/** The imports of a source text (static `import … from`, side-effect `import '…'`, dynamic `import()`, re-exports). */
function importsOf(source: string): ImportSite[] {
	const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
	// The names inside `{ … }` — or `undefined` when a default or namespace import rides along (the whole module).
	const named = (clause: string): string[] | undefined => {
		const braces = /\{([^}]*)\}/.exec(clause)
		const rest = clause
			.replace(/\{[^}]*\}/, '')
			.replace(/\btype\b/, '')
			.replace(/,/g, '')
			.trim()
		if (!braces || rest.length > 0) return undefined
		return (braces[1] as string)
			.split(',')
			.map(
				part =>
					part
						.replace(/^\s*type\s+/, '')
						.split(/\s+as\s+/)[0]
						?.trim() ?? '',
			)
			.filter(Boolean)
	}
	return [
		...[...code.matchAll(/\bimport\s([^'"]*?)\bfrom\s*['"]([^'"]+)['"]/g)].map(m => ({
			module: m[2] as string,
			names: named(m[1] as string),
		})),
		...[...code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].map(m => ({ module: m[1] as string })),
		...[...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => ({ module: m[1] as string })),
		...[...code.matchAll(/\bexport\s([^'"]*?)\bfrom\s*['"]([^'"]+)['"]/g)].map(m => ({
			module: m[2] as string,
			names: named(m[1] as string),
		})),
	]
}

/** What a source text brings into reach that the rails do not allow — a module, or a name of a narrowed module. */
function outOfReach(source: string): string[] {
	return importsOf(source).flatMap(site => {
		const port = SUPERVISOR_ALLOWED_PORTS.find(allowed => allowed.module === site.module)
		if (!port) return [site.module]
		if (!port.names) return []
		// A narrowed barrel: only the listed names, and never the whole namespace.
		if (!site.names) return [`${site.module} (whole module)`]
		return site.names.filter(name => !port.names?.includes(name)).map(name => `${site.module} → ${name}`)
	})
}

describe('supervisor reach — only the ports its safety rails allow', () => {
	const governed = SUPERVISED_FILES.filter(file => existsSync(join(API_SRC, file)))

	test('the scan sees the supervisor at all (a vacuous scan is a broken gate)', () => {
		expect(governed).toContain('agent/usecases/SuperviseSuspectIssues.ts')
		const imports = governed.flatMap(file => importsOf(readFileSync(join(API_SRC, file), 'utf8')))
		expect(imports.length).toBeGreaterThanOrEqual(5)
	})

	test('every import of the supervisor is an allowed port', () => {
		const leaks = governed.flatMap(file => outOfReach(readFileSync(join(API_SRC, file), 'utf8')).map(module => `${file} → ${module}`))
		expect(leaks).toEqual([])
	})

	test('NEGATIVE FIXTURE — a publish or a send in reach is caught', () => {
		const publish = "import { PublishCommandRunner } from '../services/PublishCommandRunner'"
		const send = "import { SendDirectMessage } from '@thread/usecases/SendDirectMessage'"
		const lazy = "const { RunPublishCommand } = await import('./RunPublishCommand')"
		expect(outOfReach([publish, send, lazy].join('\n'))).toEqual([
			'../services/PublishCommandRunner',
			'@thread/usecases/SendDirectMessage',
			'./RunPublishCommand',
		])
		expect(outOfReach("import { SuspectIssueReader } from '../services/SuspectIssueReader'")).toEqual([])
		// The running-turn registry holds the abort and the interrupt: a live turn is only ever read (`LiveTurnReader`).
		expect(outOfReach("import { IssueTurnAborter } from '../services/IssueTurnAborter'")).toEqual(['../services/IssueTurnAborter'])
		// The whole queue is out of reach (an ISSUE_RESULT is a message to the group by another road): only the nudge door.
		expect(outOfReach("import { MailboxRepository } from '../repositories/MailboxRepository'")).toEqual([
			'../repositories/MailboxRepository',
		])
		// The core barrel is narrowed: the command queue a channel delivery rides is out of reach, the Handler base is not.
		expect(outOfReach("import { CommandQueue, Handler } from '@codm/core-typescript'")).toEqual(['@codm/core-typescript → CommandQueue'])
		expect(outOfReach("import * as core from '@codm/core-typescript'")).toEqual(['@codm/core-typescript (whole module)'])
		expect(outOfReach("import type { Transaction } from '@codm/core-typescript'")).toEqual([])
	})
})
