import { testId } from '@test/support'
import { describe, expect, it, mock } from 'bun:test'
import type { ExternalMediator } from '@codm/core-typescript'
import {
	IssueOpenedEvent,
	IssueCompletedEvent,
	ThreadIssueSignalEvent,
	ThreadStopRaisedEvent,
} from '@codm/contracts-typescript/wire/events'
import { IssueSignalLevel, ProviderKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { PublishAgentIntegrationEvents } from './PublishAgentIntegrationEvents'
import { AgentRunStartedEvent } from '../events/AgentRunStartedEvent'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { IssueSpokeEvent } from '../events/IssueSpokeEvent'
import { FactSource } from '../enums'

const ownerId = testId('terminal-bridge', 'owner')

function makeHandler() {
	const published: unknown[] = []
	const mediator = { publish: mock(async (event: unknown) => void published.push(event)) } as unknown as ExternalMediator
	return { handler: new PublishAgentIntegrationEvents(mediator), published }
}

describe('PublishAgentIntegrationEvents (terminal.* domain facts → frozen integration events)', () => {
	it('agent.run.started → integration.issue.opened', async () => {
		const { handler, published } = makeHandler()
		await handler.handle(
			new AgentRunStartedEvent({
				entityId: 'issue-1',
				ownerId,
				payload: {
					issueId: 'issue-1',
					threadId: 'thread-1',
					key: 'coupon-focus',
					title: 'Coupon focus',
					provider: ProviderKind.CLAUDE_CODE,
				},
			}) as never,
		)
		expect(published).toHaveLength(1)
		const event = published[0] as IssueOpenedEvent
		expect(event).toBeInstanceOf(IssueOpenedEvent)
		expect(event.name).toBe('integration.issue.opened')
		expect(event.ownerId).toBe(ownerId)
		expect(event.payload).toEqual({
			issueId: 'issue-1',
			threadId: 'thread-1',
			key: 'coupon-focus',
			title: 'Coupon focus',
			provider: ProviderKind.CLAUDE_CODE,
		})
	})

	/**
	 * `source` GOES IN AND DOES NOT COME OUT — the contract-cost claim of §4.3 rule 6, asserted.
	 *
	 * The field Fase 6 added to these two domain events is CONTEXT-PRIVATE: it never reaches TypeSpec,
	 * never reaches OpenAPI, and the bridge deliberately does not forward it. That is what makes
	 * "DECLARED vs INFERRED costs zero contract" true rather than asserted, and the `toEqual` below is
	 * where it is enforced — `toEqual` is exact, so a bridge that started copying `source` across would
	 * turn this red rather than silently widening the frozen integration event.
	 */
	it('agent.run.completed → integration.issue.completed, WITHOUT the private `source`', async () => {
		const { handler, published } = makeHandler()
		const completedAt = new Date('2026-07-22T00:00:00.000Z')
		await handler.handle(
			new AgentRunCompletedEvent({
				entityId: 'issue-1',
				ownerId,
				payload: { issueId: 'issue-1', threadId: 'thread-1', key: 'coupon-focus', completedAt, source: FactSource.DECLARED },
			}) as never,
		)
		const event = published[0] as IssueCompletedEvent
		expect(event).toBeInstanceOf(IssueCompletedEvent)
		expect(event.name).toBe('integration.issue.completed')
		expect(event.payload).toEqual({ issueId: 'issue-1', threadId: 'thread-1', key: 'coupon-focus', completedAt })
	})

	/** Fase 3 — the declared summary AND final artifact cross: the thread's closing line carries both. */
	it('agent.run.completed → integration.issue.completed carries the final artifact', async () => {
		const { handler, published } = makeHandler()
		const completedAt = new Date('2026-07-22T00:00:00.000Z')
		await handler.handle(
			new AgentRunCompletedEvent({
				entityId: 'issue-1',
				ownerId,
				payload: {
					issueId: 'issue-1',
					threadId: 'thread-1',
					key: 'coupon-focus',
					completedAt,
					source: FactSource.DECLARED,
					summary: 'live',
					finalArtifactId: 'artifact-1',
				},
			}) as never,
		)
		expect((published[0] as IssueCompletedEvent).payload).toMatchObject({ summary: 'live', finalArtifactId: 'artifact-1' })
	})

	/**
	 * The stop half of the same rule — plus the one field that DOES cross (D6-5).
	 *
	 * `detail` is the agent's own words, and the whole reason the phase added it to BOTH the domain
	 * event and `issue-stop-raised.tsp`: without it the `AskOperator` question dies at the bridge and
	 * the "Needs you" card falls back to a generic title. So this test pins the asymmetry in one place —
	 * `detail` crosses, `source` does not.
	 */
	it('agent.run.stop_raised → integration.thread.stop_raised: `detail` crosses, `source` does not', async () => {
		const { handler, published } = makeHandler()
		await handler.handle(
			new AgentRunStopRaisedEvent({
				entityId: 'issue-1',
				ownerId,
				payload: {
					stopId: 'stop-1',
					issueId: 'issue-1',
					threadId: 'thread-1',
					kind: StopKind.SERVER_ERROR,
					detail: 'provider exited with code 1',
					source: FactSource.INFERRED,
				},
			}) as never,
		)
		const event = published[0] as ThreadStopRaisedEvent
		expect(event).toBeInstanceOf(ThreadStopRaisedEvent)
		expect(event.name).toBe('integration.thread.stop_raised')
		expect(event.payload).toEqual({
			stopId: 'stop-1',
			issueId: 'issue-1',
			threadId: 'thread-1',
			kind: StopKind.SERVER_ERROR,
			detail: 'provider exited with code 1',
		})
	})

	/** Fase 3 — what an issue SAID crosses whole: the thread's output policy needs every field to route it. */
	it('agent.issue_spoke → integration.thread.issue_signal', async () => {
		const { handler, published } = makeHandler()
		const spoke = new IssueSpokeEvent({
			entityId: 'issue-1',
			ownerId,
			payload: {
				issueId: 'issue-1',
				threadId: 'thread-1',
				level: IssueSignalLevel.FEEDBACK,
				text: 'preview of the page',
				artifactIds: ['artifact-1', 'artifact-2'],
				mainArtifactId: 'artifact-1',
			},
		})
		await handler.handle(spoke as never)
		const event = published[0] as ThreadIssueSignalEvent
		expect(event).toBeInstanceOf(ThreadIssueSignalEvent)
		expect(event.name).toBe('integration.thread.issue_signal')
		expect(event.payload).toEqual({
			issueId: 'issue-1',
			threadId: 'thread-1',
			level: IssueSignalLevel.FEEDBACK,
			text: 'preview of the page',
			artifactIds: ['artifact-1', 'artifact-2'],
			mainArtifactId: 'artifact-1',
			signalId: spoke.id,
		})
	})

	/**
	 * The outbox is at-least-once: the SAME `agent.issue_spoke` (same persisted id) can reach this bridge
	 * twice, and each pass mints a NEW integration event with a new id. What the two share is `signalId` —
	 * the key the thread records the signal under, so the group never hears it twice.
	 */
	it('a redelivered agent.issue_spoke republishes under a new event id but the SAME signalId', async () => {
		const { handler, published } = makeHandler()
		const spoke = new IssueSpokeEvent({
			entityId: 'issue-1',
			ownerId,
			payload: { issueId: 'issue-1', threadId: 'thread-1', level: IssueSignalLevel.PROGRESS, text: 'done', artifactIds: [] },
		})
		await handler.handle(spoke as never)
		await handler.handle(spoke as never)
		const [first, second] = published as ThreadIssueSignalEvent[]
		expect(first?.id).not.toBe(second?.id)
		expect(first?.payload.signalId).toBe(spoke.id)
		expect(second?.payload.signalId).toBe(spoke.id)
	})

	/**
	 * Asserted EXACTLY, in order, because this bridge is the only thing that turns a context-private
	 * fact into something another service can see. A fact added here with no mapping is silence; a
	 * mapping with no fact is dead code. Both fail invisibly at runtime — nothing throws, a message
	 * simply never arrives.
	 *
	 * `agent.run.reply_drafted` LEFT in B1/B3: the turn's text now rides the ISSUE_RESULT mailbox item so
	 * the orchestrator composes it, instead of going to the channel as the raw worker voice. Keeping the
	 * mapping alongside the composition would have delivered BOTH — two messages per conclusion.
	 *
	 * Two joined in the orchestrator pivot, and NEITHER is a `terminal.*` execution fact:
	 *  - `agent.issue_forked` (§7.2) says an issue was DECLARED, before any work exists. It maps to
	 *    `integration.issue.created`, deliberately not to `issue.opened` — that one still means
	 *    "`RunIssueTurn` is spawning a turn", a different moment (D1).
	 *  - `agent.orchestrator_replied` (§7.5) says the thread's orchestrator SPOKE. The runtime knows
	 *    WHAT was said; only the thread context knows WHO to say it to, which is why it crosses.
	 */
	it('subscribes to exactly the THREE terminal.* facts plus the fork and the reply', () => {
		const { handler } = makeHandler()
		expect(handler.events).toEqual([
			'agent.run.started',
			'agent.issue_forked',
			'agent.orchestrator_replied',
			'agent.run.completed',
			'agent.run.stop_raised',
			'agent.issue_spoke',
		])
	})
})
