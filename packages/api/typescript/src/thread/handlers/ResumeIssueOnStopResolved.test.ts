import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository } from '@codm/core-typescript'
import {
	AskAnswerKind,
	AskEffect,
	IssueStatus,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
import { AnswerStop } from '../usecases/AnswerStop'
import { ResolveStop } from '../usecases/ResolveStop'
import { ResumeIssueOnStopResolved } from './ResumeIssueOnStopResolved'
import { ResumeIssuePayloadSchema, type StopAskProps } from '../objects'

/**
 * THE ANSWER REACHES THE SESSION (fase 3, item 3 — spec C5). An ANSWER is resumed with the question, its code
 * and the answer, and is queued EVEN when the issue already has work pending (a swallowed answer is the worst
 * outcome); the older resolutions keep riding a pending turn, unchanged.
 *
 * Falsifier: set `RESUMES_EVEN_WITH_PENDING[ANSWER]` to false and the pending-work test finds no resume.
 */
describe('ResumeIssueOnStopResolved — an answer always reaches the session', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const scene = async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12', status: IssueStatus.NEEDS_INPUT })
		return { thread, issue }
	}
	/** Every queued turn of the issue, in order — claimed and completed one by one (the per-target lease). */
	const issueTexts = async (issueId: string): Promise<string[]> => {
		const mailbox = testBed.resolve(MailboxRepository)
		const texts: string[] = []
		for (let item = await mailbox.claimNext('test', 60_000); item; item = await mailbox.claimNext('test', 60_000)) {
			if (item.targetId === issueId) texts.push((item.payload as { text: string }).text)
			await mailbox.complete([item.id])
		}
		return texts
	}
	const deliverFact = async () => {
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(ThreadStopResolvedEvent)
		if (!fact) throw new Error('no thread.stop_resolved fact')
		await testBed.resolve(ResumeIssueOnStopResolved).handle(fact)
	}
	const pendingSteer = (threadId: string, issueId: string) =>
		testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { issueId, threadId, key: 'APP-12', title: 'Test issue', text: 'someone: another note' },
			dedupKey: 'steer:other',
		})

	it('ANSWER carries the question, its code and the answer — and is queued even with work pending', async () => {
		const { thread, issue } = await scene()
		const stop = await givenStop(testBed, {
			threadId: thread.id.value,
			issueId: issue.id.value,
			ask: {
				question: 'Uso o tema escuro?',
				options: [
					{ id: 'yes', label: 'Sim' },
					{ id: 'no', label: 'Não' },
				],
				effects: [],
				requested: StopKind.DECISION_REQUESTED,
			},
		})
		await pendingSteer(thread.id.value, issue.id.value)

		await testBed.resolve(AnswerStop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			stopId: stop.stopId,
			answer: { kind: AskAnswerKind.OPTION, optionId: 'no' },
			answeredBy: 'operator',
		})
		await deliverFact()

		const texts = await issueTexts(issue.id.value)
		expect(texts).toHaveLength(2)
		const text = texts[1] ?? ''
		expect(text).toContain('APP-12 · D1')
		expect(text).toContain('Uso o tema escuro?')
		expect(text).toContain('Answer: Não')
		expect(text).toContain('operator answered')
	})

	it('the older resolutions are unchanged — an APPROVE rides the turn already pending', async () => {
		const { thread, issue } = await scene()
		const stop = await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, kind: StopKind.PERMISSION_DENIED })
		await pendingSteer(thread.id.value, issue.id.value)

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })
		await deliverFact()

		// Only the note that was already pending — the approval rode it.
		expect(await issueTexts(issue.id.value)).toEqual(['someone: another note'])
	})

	/** Every queued item of the issue, claimed and completed one by one — class and payload as claimed. */
	const issueItems = async (issueId: string) => {
		const mailbox = testBed.resolve(MailboxRepository)
		const items: { claimClass: MailboxClaimClass; payload: unknown }[] = []
		for (let item = await mailbox.claimNext('test', 60_000); item; item = await mailbox.claimNext('test', 60_000)) {
			if (item.targetId === issueId) items.push({ claimClass: item.claimClass, payload: item.payload })
			await mailbox.complete([item.id])
		}
		return items
	}
	const publishAsk: StopAskProps = {
		question: 'Publico a versão nova?',
		options: [
			{ id: 'go', label: 'Pode publicar', authorizes: [AskEffect.PUBLISH] },
			{ id: 'wait', label: 'Ainda não' },
		],
		effects: [AskEffect.PUBLISH],
		requested: StopKind.DECISION_REQUESTED,
	}

	/**
	 * FASE 4, S0c (revisão 2, crítico) — the resume DECLARES which stop it answers and how, and what it is in the
	 * queue. Before, the stop lived only inside the dedup key (`resume:<stopId>`) and the item was a plain STEER.
	 *
	 * Falsifier: drop `stopId`/`resolution` from the enqueued payload and the schema parse fails; enqueue it as
	 * `STEER` and the class assertion fails.
	 */
	it('the resume item is a DECISION_ANSWER whose payload declares the stop and the resolution', async () => {
		const { thread, issue } = await scene()
		const stop = await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, ask: publishAsk })

		await testBed.resolve(AnswerStop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			stopId: stop.stopId,
			answer: { kind: AskAnswerKind.OPTION, optionId: 'wait' },
			answeredBy: 'operator',
		})
		await deliverFact()

		const [item, ...rest] = await issueItems(issue.id.value)
		expect(rest).toHaveLength(0)
		expect(item?.claimClass).toBe(MailboxClaimClass.DECISION_ANSWER)
		const payload = ResumeIssuePayloadSchema.parse(item?.payload)
		expect(payload.stopId).toBe(stop.stopId)
		expect(payload.resolution).toBe(StopResolution.ANSWER)
		expect(payload.issueId).toBe(issue.id.value)
	})

	/**
	 * FASE 4 (item 6c, revisão 2, crítico) — an answer that AUTHORIZES PUBLISHING is never swallowed by pending work:
	 * it is the trigger of the publish command, so it is queued — once, with its stop — even behind another note.
	 */
	it('an answer that authorizes PUBLISH is queued with its stop even with work pending', async () => {
		const { thread, issue } = await scene()
		const stop = await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, ask: publishAsk })
		await pendingSteer(thread.id.value, issue.id.value)

		await testBed.resolve(AnswerStop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			stopId: stop.stopId,
			answer: { kind: AskAnswerKind.OPTION, optionId: 'go' },
			answeredBy: 'operator',
		})
		await deliverFact()

		const items = await issueItems(issue.id.value)
		expect(items).toHaveLength(2)
		expect(ResumeIssuePayloadSchema.parse(items[1]?.payload)).toEqual(
			expect.objectContaining({ stopId: stop.stopId, resolution: StopResolution.ANSWER }),
		)
	})

	/**
	 * FASE 4 (item 6c, revisão 2, crítico) — an `APPROVE` of a stop whose ask declares `PUBLISH` is queued EVEN with
	 * work pending (`PUBLISH_AUTHORIZED_BY[APPROVE]`), with its stop in the payload; an APPROVE that authorizes
	 * nothing keeps riding the pending turn (the test above). The domain resolves a stop that carries an ask by
	 * ANSWER today, so the fact is delivered directly: the rule under test is the handler's, by declared data.
	 *
	 * Falsifier: drop `PUBLISH_AUTHORIZED_BY` from the pending check and only the pending note is found.
	 */
	it('an APPROVE of a stop declaring PUBLISH is queued with its stop even with work pending', async () => {
		const { thread, issue } = await scene()
		const stop = await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, ask: publishAsk })
		await pendingSteer(thread.id.value, issue.id.value)

		await testBed.resolve(ResumeIssueOnStopResolved).handle(
			new ThreadStopResolvedEvent({
				entityId: thread.id.value,
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: {
					stopId: stop.stopId,
					issueId: issue.id.value,
					threadId: thread.id.value,
					resolution: StopResolution.APPROVE,
					posture: PermissionPosture.AUTO,
				},
			}),
		)

		const items = await issueItems(issue.id.value)
		expect(items).toHaveLength(2)
		expect(items[1]?.claimClass).toBe(MailboxClaimClass.DECISION_ANSWER)
		expect(ResumeIssuePayloadSchema.parse(items[1]?.payload)).toEqual(
			expect.objectContaining({ stopId: stop.stopId, resolution: StopResolution.APPROVE }),
		)
	})
})
