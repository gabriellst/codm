import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { like } from 'drizzle-orm'
import { DomainEventRepository, LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import {
	AskAnswerKind,
	AskEffect,
	IssueSignalLevel,
	IssueTimelineItemKind,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	PublishFollowUpKind,
	PublishRunOutcome,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import type { PublishFollowUp } from '@shared/objects'
import type { StopAskProps } from '@thread/objects'
import { IssueHold } from '@issue/services/IssueHold'
import { GetIssueDetail } from '@issue/usecases/GetIssueDetail'
import { GetPublishRunOutput } from '@ui/usecases/GetPublishRunOutput'
import { assembleIssueTimeline } from '@issue/utils/issueTimeline'
import { AnswerStop } from '@thread/usecases/AnswerStop'
import { SetWorkspacePublishCommand } from '@workspace/usecases/SetWorkspacePublishCommand'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../entities/IssueAttributes'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { IssueSpokeEvent } from '../events/IssueSpokeEvent'
import { PublishRanEvent } from '../events/PublishRanEvent'
import { PublishStartedEvent } from '../events/PublishStartedEvent'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { GitWorktreeProbe, MockGitWorktreeProbe } from '../services/GitWorktreeProbe'
import { PUBLISH_COMMAND_TIMEOUT_MS, PublishCommandRunner, ScriptedPublishCommandRunner } from '../services/PublishCommandRunner'
import { RegretWindowClock } from '../services/RegretWindowClock'
import { RunPublishCommand } from './RunPublishCommand'

/** A credential-shaped argument and a credential-shaped output line: anywhere but the console's doors, they leaked. */
const ARG_SECRET = 'argv-secret-91c2'
const OUT_SECRET = 'output-secret-5d7e'

/** The wait of the window, scripted: whatever has to happen "during the 20 s" happens here, at once. */
class ScriptedClock extends RegretWindowClock {
	during: () => Promise<void> = async () => {}
	async wait(): Promise<void> {
		await this.during()
	}
}

/** The hold, scripted — "pausado" during the window without driving the pause use case. */
class ScriptedHold extends IssueHold {
	held = false
	async isHeld(): Promise<boolean> {
		return this.held
	}
}

/**
 * "PODE PUBLICAR" WITHOUT WAKING THE SESSION (fase 4, item 6c — spec "Testes → Publicação").
 *
 * Falsifier: drop `PUBLISH_AUTHORIZED_BY` and a DENY publishes; put `argv` in the fact and the timeline shows the
 * secret; write the output without `timeline_item_id` and the MCP-exposed issue detail shows it; skip the window and
 * the steer case runs the command.
 */
describe('RunPublishCommand', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let runner: ScriptedPublishCommandRunner
	let probe: MockGitWorktreeProbe
	let clock: ScriptedClock
	let hold: ScriptedHold

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		runner = new ScriptedPublishCommandRunner()
		probe = new MockGitWorktreeProbe()
		clock = new ScriptedClock()
		hold = new ScriptedHold()
		testBed.override(PublishCommandRunner, runner)
		testBed.override(GitWorktreeProbe, probe)
		testBed.override(RegretWindowClock, clock)
		testBed.override(IssueHold, hold)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const ARGV = ['deploy', '--note', 'a; rm -rf $(pwd)', `--token=${ARG_SECRET}`]

	const publishAsk = (onPublished?: PublishFollowUp): StopAskProps => ({
		question: 'Publico a versão nova?',
		options: [
			{ id: 'go', label: 'Pode publicar', authorizes: [AskEffect.PUBLISH] },
			{ id: 'wait', label: 'Ainda não' },
		],
		effects: [AskEffect.PUBLISH],
		requested: StopKind.DECISION_REQUESTED,
		onPublished,
	})

	/** A task in a workspace with a command, a registered worktree git lists, and a stop that asks to publish. */
	const scene = async ({
		command = ARGV,
		worktree = 'registered' as 'registered' | 'none' | 'unlisted',
		onPublished,
	}: {
		command?: string[] | null
		worktree?: 'registered' | 'none' | 'unlisted'
		onPublished?: PublishFollowUp
	} = {}) => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		if (command) {
			await testBed
				.resolve(SetWorkspacePublishCommand)
				.execute({ ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, command: { argv: command } })
		}
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12', title: 'Página nova' })
		const attributes = IssueAttributes.born({
			issueId: issue.id.value,
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			...ISSUE_ATTRIBUTE_DEFAULTS,
		})
		const worktreePath = `${workspace.path}/.worktrees/app-12`
		if (worktree !== 'none') attributes.registerWorktree(worktreePath, new Date())
		await testBed.resolve(IssueAttributesRepository).insertIfNew(attributes)
		probe.scriptWorktrees(workspace.path, [
			{ path: workspace.path, main: true, locked: false },
			...(worktree === 'registered' ? [{ path: worktreePath, main: false, locked: false }] : []),
		])
		const stop = await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, ask: publishAsk(onPublished) })
		/** Each call resolves a FRESH handler — what a restarted daemon would build. */
		const runFor = (stopId: string, resolution = StopResolution.APPROVE) =>
			testBed.resolve(RunPublishCommand).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				issueId: issue.id.value,
				threadId: thread.id.value,
				key: 'APP-12',
				title: 'Página nova',
				stopId,
				resolution,
			})
		const run = (resolution = StopResolution.APPROVE) => runFor(stop.stopId, resolution)
		/** Another "pode publicar" of the same task, later — a new authorization. */
		const anotherStop = () => givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, ask: publishAsk(onPublished) })
		/** What a daemon that died between the spawn and the record leaves behind: a start, no outcome. */
		const crashedAfterStart = (stopId: string) =>
			testBed.resolve(DomainEventRepository).save(
				new PublishStartedEvent({
					entityId: stopId,
					ownerId: MOCK_CLOUD_OWNER_ID,
					payload: { issueId: issue.id.value, threadId: thread.id.value, stopId },
				}),
			)
		return { workspace, thread, issue, stop, worktreePath, run, runFor, anotherStop, crashedAfterStart }
	}

	const facts = () => testBed.resolve(DomainEventRepository).findByType(PublishRanEvent)
	const recados = () => testBed.resolve(LibSqlDatabaseDriver).db.select().from(agentMailbox).where(like(agentMailbox.dedupKey, 'publish:%'))

	it('authorized, declared, in a registered worktree: runs the argv literally there — no session turn', async () => {
		const { worktreePath, run } = await scene()
		expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.SUCCEEDED })
		expect(runner.runs).toEqual([{ argv: ARGV, cwd: worktreePath, timeoutMs: PUBLISH_COMMAND_TIMEOUT_MS }])
	})

	it('SUCCEEDED: PUBLISH_RAN on the timeline, a FEEDBACK line, and COMPLETE concludes the task without a turn', async () => {
		const { issue, run } = await scene({ onPublished: { kind: PublishFollowUpKind.COMPLETE, summary: 'No ar.' } })
		runner.next = {
			outcome: PublishRunOutcome.SUCCEEDED,
			exitCode: 0,
			output: `deployed\n${OUT_SECRET}\n`,
			truncated: false,
			durationMs: 1200,
		}

		await run()

		const [fact] = await facts()
		expect(fact?.payload).toMatchObject({ outcome: PublishRunOutcome.SUCCEEDED, exitCode: 0, durationMs: 1200 })
		const [spoke] = await testBed.resolve(DomainEventRepository).findByType(IssueSpokeEvent)
		expect(spoke?.payload).toMatchObject({ level: IssueSignalLevel.FEEDBACK, issueId: issue.id.value })
		expect(spoke?.payload.text).toContain('APP-12')
		const [completed] = await testBed.resolve(DomainEventRepository).findByType(AgentRunCompletedEvent)
		expect(completed?.entityId).toBe(issue.id.value)
		expect(await recados()).toHaveLength(0)

		const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), issue.id.value, 'Página nova')
		// (Its id is the stored fact's — `findByType` rehydrates events under fresh ids, so it is not compared here.)
		expect(timeline.find(item => item.kind === IssueTimelineItemKind.PUBLISH_RAN)).toMatchObject({
			outcome: PublishRunOutcome.SUCCEEDED,
			exitCode: 0,
		})
	})

	it('the argv and the output never reach the fact, the timeline, the group line or the MCP issue detail — only the console door', async () => {
		const { issue, run } = await scene()
		runner.next = { outcome: PublishRunOutcome.SUCCEEDED, exitCode: 0, output: `line one\n${OUT_SECRET}\n`, truncated: false }
		await run()

		const [fact] = await facts()
		const [spoke] = await testBed.resolve(DomainEventRepository).findByType(IssueSpokeEvent)
		const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), issue.id.value, 'Página nova')
		const detail = await testBed.resolve(GetIssueDetail).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: issue.id.value })
		for (const shown of [fact?.payload, spoke?.payload, timeline, detail]) {
			expect(JSON.stringify(shown)).not.toContain(ARG_SECRET)
			expect(JSON.stringify(shown)).not.toContain(OUT_SECRET)
		}

		// The console opens the output by the timeline item's id — the stored fact's.
		const item = timeline.find(candidate => candidate.kind === IssueTimelineItemKind.PUBLISH_RAN)
		const output = await testBed
			.resolve(GetPublishRunOutput)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: issue.id.value, timelineItemId: item?.id ?? '' })
		expect(output.lines.map(line => line.line)).toEqual(['line one', OUT_SECRET])
	})

	it('CONTINUE (or nothing declared): the session is told the outcome by a recado — no completion', async () => {
		const { run } = await scene()
		await run()
		const [recado] = await recados()
		expect(recado).toMatchObject({
			targetKind: MailboxTargetKind.ISSUE,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.REMINDER,
		})
		expect(recado?.posture).toBe(PermissionPosture.AUTO)
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentRunCompletedEvent)).toHaveLength(0)
	})

	it('FAILED: the recado carries the output tail apart from the text the timeline renders', async () => {
		const { issue, run } = await scene({ onPublished: { kind: PublishFollowUpKind.COMPLETE, summary: 'No ar.' } })
		runner.next = { outcome: PublishRunOutcome.FAILED, exitCode: 2, output: `building\nerror: ${OUT_SECRET}\n`, truncated: false }

		expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.FAILED })

		const [recado] = await recados()
		const payload = recado?.payload as { text: string; sessionOnly?: string }
		expect(payload.text).toContain('FAILED')
		expect(payload.text).not.toContain(OUT_SECRET)
		expect(payload.sessionOnly).toContain(`error: ${OUT_SECRET}`)
		// A failure never completes, whatever the ask declared.
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentRunCompletedEvent)).toHaveLength(0)
		const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), issue.id.value, 'Página nova')
		expect(JSON.stringify(timeline)).not.toContain(OUT_SECRET)
	})

	it('TIMED_OUT is recorded as such and goes back to the session', async () => {
		const { run } = await scene()
		runner.next = { outcome: PublishRunOutcome.TIMED_OUT, output: '', truncated: false }
		expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.TIMED_OUT })
		const [fact] = await facts()
		expect(fact?.payload.outcome).toBe(PublishRunOutcome.TIMED_OUT)
		expect(fact?.payload.exitCode).toBeUndefined()
		expect(await recados()).toHaveLength(1)
	})

	it('a steer that arrives during the window cancels it: CANCELLED_BY_STEER, nothing runs, the session wakes', async () => {
		const { issue, thread, run } = await scene()
		clock.during = async () => {
			await testBed.resolve(MailboxRepository).enqueue({
				ownerId: MOCK_CLOUD_OWNER_ID,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: issue.id.value,
				kind: MailboxItemKind.STEER,
				claimClass: MailboxClaimClass.STEER,
				posture: PermissionPosture.AUTO,
				payload: { issueId: issue.id.value, threadId: thread.id.value, key: 'APP-12', title: 'Página nova', text: 'Pessoa: espera!' },
				dedupKey: 'steer:during-window',
			})
		}
		expect(await run()).toEqual({ ran: false, outcome: PublishRunOutcome.CANCELLED_BY_STEER })
		expect(runner.runs).toHaveLength(0)
		expect((await facts())[0]?.payload.outcome).toBe(PublishRunOutcome.CANCELLED_BY_STEER)
		expect(await testBed.resolve(DomainEventRepository).findByType(IssueSpokeEvent)).toHaveLength(0)
	})

	it('a pause cancels it: CANCELLED_BY_PAUSE', async () => {
		const { run } = await scene()
		hold.held = true
		expect(await run()).toEqual({ ran: false, outcome: PublishRunOutcome.CANCELLED_BY_PAUSE })
		expect(runner.runs).toHaveLength(0)
	})

	it('one run per authorization — claimed again, it answers from the recorded fact', async () => {
		const { run } = await scene()
		await run()
		expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.SUCCEEDED })
		expect(runner.runs).toHaveLength(1)
		expect(await facts()).toHaveLength(1)
	})

	it('the session wakes as before: not authorized, no command, no worktree, or one git no longer lists', async () => {
		expect(await (await scene()).run(StopResolution.DENY)).toEqual({ ran: false })
		expect(await (await scene({ command: null })).run()).toEqual({ ran: false })
		expect(await (await scene({ worktree: 'none' })).run()).toEqual({ ran: false })
		expect(await (await scene({ worktree: 'unlisted' })).run()).toEqual({ ran: false })
		expect(runner.runs).toHaveLength(0)
		expect(await facts()).toHaveLength(0)
	})

	it('an ANSWER authorizes only through the chosen option that declares PUBLISH', async () => {
		const authorizing = await scene()
		await testBed.resolve(AnswerStop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			stopId: authorizing.stop.stopId,
			answer: { kind: AskAnswerKind.OPTION, optionId: 'go' },
			answeredBy: 'operator',
		})
		expect((await authorizing.run(StopResolution.ANSWER)).ran).toBe(true)

		const holding = await scene()
		await testBed.resolve(AnswerStop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			stopId: holding.stop.stopId,
			answer: { kind: AskAnswerKind.OPTION, optionId: 'wait' },
			answeredBy: 'operator',
		})
		expect(await holding.run(StopResolution.ANSWER)).toEqual({ ran: false })
		expect(runner.runs).toHaveLength(1)
	})

	describe('at most once across a crash', () => {
		const started = () => testBed.resolve(DomainEventRepository).findByType(PublishStartedEvent)

		it('the authorization is consumed (a start keyed by the stop) and committed BEFORE the spawn', async () => {
			const { stop, run } = await scene()
			const seenAtSpawn: number[] = []
			const spawn = runner.run.bind(runner)
			runner.run = async request => {
				seenAtSpawn.push((await started()).filter(fact => fact.entityId === stop.stopId).length)
				return spawn(request)
			}
			expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.SUCCEEDED })
			expect(seenAtSpawn).toEqual([1])
		})

		it('started, never recorded (a restart): no second spawn — UNKNOWN, a FEEDBACK line in the group, a recado to check', async () => {
			const { issue, stop, run, crashedAfterStart } = await scene({
				onPublished: { kind: PublishFollowUpKind.COMPLETE, summary: 'No ar.' },
			})
			await crashedAfterStart(stop.stopId)

			expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.UNKNOWN })

			expect(runner.runs).toHaveLength(0)
			const [fact] = await facts()
			expect(fact?.payload).toMatchObject({ stopId: stop.stopId, outcome: PublishRunOutcome.UNKNOWN })
			expect(fact?.payload.exitCode).toBeUndefined()
			expect(fact?.payload.durationMs).toBeUndefined()
			const [spoke] = await testBed.resolve(DomainEventRepository).findByType(IssueSpokeEvent)
			expect(spoke?.payload).toMatchObject({ level: IssueSignalLevel.FEEDBACK, issueId: issue.id.value })
			expect(spoke?.payload.text).toContain('APP-12')
			expect(spoke?.payload.text).not.toBe('')
			const [recado] = await recados()
			const payload = recado?.payload as { text: string; sessionOnly?: string }
			expect(recado).toMatchObject({ kind: MailboxItemKind.STEER, claimClass: MailboxClaimClass.REMINDER })
			expect(payload.text).toContain('UNKNOWN')
			expect(payload.text).toContain('NOT run again')
			expect(payload.sessionOnly).toBeUndefined()
			// Maybe it went live — never concluded on a guess, whatever the ask declared.
			expect(await testBed.resolve(DomainEventRepository).findByType(AgentRunCompletedEvent)).toHaveLength(0)
			const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), issue.id.value, 'Página nova')
			expect(timeline.find(item => item.kind === IssueTimelineItemKind.PUBLISH_RAN)).toMatchObject({ outcome: PublishRunOutcome.UNKNOWN })

			// Claimed once more: answered from the recorded fact — still nothing spawned, nothing said twice.
			expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.UNKNOWN })
			expect(runner.runs).toHaveLength(0)
			expect(await facts()).toHaveLength(1)
			expect(await recados()).toHaveLength(1)
		})

		it('a runner that throws mid-run is UNKNOWN — never an error that would wake the session — and never spawns again', async () => {
			const { run } = await scene()
			const spawn = runner.run.bind(runner)
			runner.run = async request => {
				await spawn(request)
				throw new Error('runner died')
			}
			expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.UNKNOWN })
			runner.run = spawn
			expect(await run()).toEqual({ ran: true, outcome: PublishRunOutcome.UNKNOWN })
			expect(runner.runs).toHaveLength(1)
			expect(await facts()).toHaveLength(1)
		})

		it('the interruption is checked first: a pause or a removed command since never turn it into a session turn', async () => {
			const paused = await scene()
			await paused.crashedAfterStart(paused.stop.stopId)
			hold.held = true
			expect(await paused.run()).toEqual({ ran: true, outcome: PublishRunOutcome.UNKNOWN })

			const unset = await scene({ command: null })
			await unset.crashedAfterStart(unset.stop.stopId)
			expect(await unset.run()).toEqual({ ran: true, outcome: PublishRunOutcome.UNKNOWN })
			expect(runner.runs).toHaveLength(0)
		})

		it('a later authorization runs normally — and never hides the earlier interrupted one', async () => {
			const { stop, runFor, anotherStop, crashedAfterStart } = await scene()
			await crashedAfterStart(stop.stopId)
			const later = await anotherStop()

			expect(await runFor(later.stopId)).toEqual({ ran: true, outcome: PublishRunOutcome.SUCCEEDED })
			expect(runner.runs).toHaveLength(1)
			// The earlier answer's item, claimed after the later one ran: still UNKNOWN, still not spawned.
			expect(await runFor(stop.stopId)).toEqual({ ran: true, outcome: PublishRunOutcome.UNKNOWN })
			expect(runner.runs).toHaveLength(1)

			// After the interruption was settled (and the session read its recados — an unread one would cancel the window),
			// a third authorization runs normally too.
			await testBed.resolve(LibSqlDatabaseDriver).db.delete(agentMailbox).where(like(agentMailbox.dedupKey, 'publish:%'))
			const third = await anotherStop()
			expect(await runFor(third.stopId)).toEqual({ ran: true, outcome: PublishRunOutcome.SUCCEEDED })
			expect(runner.runs).toHaveLength(2)
		})
	})
})
