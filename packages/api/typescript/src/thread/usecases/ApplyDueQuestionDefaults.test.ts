import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository } from '@codm/core-typescript'
import {
	AskAnswerKind,
	GroupOutputMode,
	IssueSignalLevel,
	IssueStatus,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	OutputRouting,
	PermissionPosture,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity, MockChannelConnectivity } from '../services/ChannelConnectivity'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
import { ResumeIssueOnStopResolved } from '../handlers/ResumeIssueOnStopResolved'
import { QUESTION_DEFAULT_MS } from '../objects/StopAsk'
import { AnswerStop } from './AnswerStop'
import { ApplyDueQuestionDefaults, DEFAULT_GRACE_AFTER_CONNECT_MS } from './ApplyDueQuestionDefaults'

/**
 * THE 15-MINUTE DEFAULT (fase 3, item 1b) — with the clock HANDED IN: the deadline is set by the delivery
 * (`markAskDelivered(entry, at)`) and the sweep judges against the `now` it is given, so nothing sleeps.
 *
 * Falsifier: drop the `isHeld` check and the held test applies; drop the grace and the reconnect test does.
 */
describe('ApplyDueQuestionDefaults — a delivered question goes on with its default 15 min later', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let connectivity: MockChannelConnectivity

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		connectivity = new MockChannelConnectivity()
		testBed.override(ChannelConnectivity, connectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const DELIVERED = new Date('2026-11-18T14:00:00.000Z')
	const at = (ms: number) => new Date(DELIVERED.getTime() + ms)
	const MINUTE = 60 * 1000

	const scene = async (opts: { paused?: boolean; mode?: GroupOutputMode; delivered?: boolean } = {}) => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		if (opts.mode) {
			thread.configureOutputMode(opts.mode)
			await testBed.resolve(ThreadRepository).save(thread)
		}
		const issue = await givenIssue(testBed, {
			threadId: thread.id.value,
			key: 'APP-12',
			status: IssueStatus.NEEDS_INPUT,
			paused: opts.paused,
		})
		const stop = await givenStop(testBed, {
			threadId: thread.id.value,
			issueId: issue.id.value,
			notice: 'APP-12 · D1 — Qual cor?',
			ask: {
				question: 'Qual cor?',
				options: [
					{ id: 'blue', label: 'Azul' },
					{ id: 'green', label: 'Verde' },
				],
				default: { kind: AskAnswerKind.OPTION, optionId: 'blue' },
				effects: [],
				requested: StopKind.QUESTION_ASKED,
			},
		})
		if (opts.delivered !== false) await testBed.resolve(ThreadRepository).markAskDelivered(stop.askEntryId ?? '', DELIVERED)
		return { thread, issue, stop }
	}
	const sweep = (now: Date) => testBed.resolve(ApplyDueQuestionDefaults).execute({ now })
	const stopOf = (stopId: string) => testBed.resolve(ThreadRepository).findStop(stopId)
	const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })
	const progressLines = async (threadId: string) =>
		(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(entry => entry.level === IssueSignalLevel.PROGRESS)

	it('falls due 15 min after the DELIVERY — not a minute before — and records the default', async () => {
		const { stop } = await scene()

		expect((await sweep(at(QUESTION_DEFAULT_MS - MINUTE))).appliedStopIds).toEqual([])
		expect((await sweep(at(QUESTION_DEFAULT_MS))).appliedStopIds).toEqual([stop.stopId])

		const applied = await stopOf(stop.stopId)
		expect(applied?.resolution).toBe(StopResolution.DEFAULT_APPLIED)
		expect(applied?.answer).toEqual({ kind: AskAnswerKind.DEFAULT, default: { kind: AskAnswerKind.OPTION, optionId: 'blue' } })
		expect(applied?.answeredBy).toBeUndefined()
	})

	it('a question never delivered never falls due', async () => {
		const { stop } = await scene({ delivered: false })

		expect((await sweep(at(10 * QUESTION_DEFAULT_MS))).appliedStopIds).toEqual([])
		expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()
	})

	it('a redelivery does not push the deadline', async () => {
		const { stop } = await scene()

		await testBed.resolve(ThreadRepository).markAskDelivered(stop.askEntryId ?? '', at(10 * MINUTE))

		expect((await stopOf(stop.stopId))?.dueAt).toEqual(at(QUESTION_DEFAULT_MS))
	})

	it('a HELD issue waits — and the default applies on the first tick after it resumes', async () => {
		const { issue, stop } = await scene({ paused: true })

		expect((await sweep(at(QUESTION_DEFAULT_MS))).waitingStopIds).toEqual([stop.stopId])
		expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()

		const issues = testBed.resolve(IssueRepository)
		const held = await issues.findById(issue.id.value)
		held?.resume()
		if (held) await issues.save(held)

		expect((await sweep(at(QUESTION_DEFAULT_MS + MINUTE))).appliedStopIds).toEqual([stop.stopId])
	})

	it('waits a grace after the channel (re)connects — the backlog may carry the answer', async () => {
		const { stop } = await scene()
		const now = at(QUESTION_DEFAULT_MS + 30 * MINUTE)

		connectivity.since = new Date(now.getTime() - DEFAULT_GRACE_AFTER_CONNECT_MS + 1000)
		expect((await sweep(now)).appliedStopIds).toEqual([])
		connectivity.since = undefined
		expect((await sweep(now)).appliedStopIds).toEqual([])

		connectivity.since = new Date(now.getTime() - DEFAULT_GRACE_AFTER_CONNECT_MS)
		expect((await sweep(now)).appliedStopIds).toEqual([stop.stopId])
	})

	it('an answer and the deadline on the same tick — the answer that landed first stands', async () => {
		const { stop } = await scene()
		await testBed.resolve(AnswerStop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			stopId: stop.stopId,
			answer: { kind: AskAnswerKind.OPTION, optionId: 'green' },
			answeredBy: 'operator',
		})

		expect((await sweep(at(QUESTION_DEFAULT_MS))).appliedStopIds).toEqual([])
		expect((await stopOf(stop.stopId))?.answer).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'green' })
	})

	it('leaves ONE progress line — panel only in the default mode; late when the daemon was off', async () => {
		const { thread } = await scene()

		await sweep(at(QUESTION_DEFAULT_MS + 20 * MINUTE))

		const [line] = await progressLines(thread.id.value)
		expect(line?.routing).toBe(OutputRouting.PANEL)
		expect(line?.text).toContain('Azul')
		expect(line?.text).toContain('desligado')
		expect(await deliveries()).toBe(0)
	})

	it('in EVERYTHING mode that line goes to the group', async () => {
		const { thread } = await scene({ mode: GroupOutputMode.EVERYTHING })

		await sweep(at(QUESTION_DEFAULT_MS))

		const [line] = await progressLines(thread.id.value)
		expect(line?.routing).toBe(OutputRouting.GROUP)
		expect(line?.text).not.toContain('desligado')
		expect(await deliveries()).toBe(1)
	})

	it('the session is told the default even with other work pending', async () => {
		const { thread, issue } = await scene()
		const mailbox = testBed.resolve(MailboxRepository)
		await mailbox.enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issue.id.value,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { issueId: issue.id.value, threadId: thread.id.value, key: 'APP-12', title: 'Test issue', text: 'someone: a note' },
			dedupKey: 'steer:pending',
		})

		await sweep(at(QUESTION_DEFAULT_MS))
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(ThreadStopResolvedEvent)
		if (fact) await testBed.resolve(ResumeIssueOnStopResolved).handle(fact)

		const texts: string[] = []
		for (let item = await mailbox.claimNext('test', 60_000); item; item = await mailbox.claimNext('test', 60_000)) {
			texts.push((item.payload as { text: string }).text)
			await mailbox.complete([item.id])
		}
		expect(texts).toHaveLength(2)
		expect(texts[1]).toContain('Nobody answered your APP-12 · D1')
		expect(texts[1]).toContain('Azul')
	})
})
