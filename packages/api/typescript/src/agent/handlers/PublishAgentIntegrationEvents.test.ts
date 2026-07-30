import { testId } from '@test/support'
import { describe, expect, it, mock } from 'bun:test'
import type { ExternalMediator } from '@codedm/core-typescript'
import { IssueOpenedEvent, IssueCompletedEvent, ThreadStopRaisedEvent } from '@codedm/contracts-typescript/wire/events'
import { ProviderKind, StopKind } from '@codedm/contracts-typescript/wire/enums'
import { PublishAgentIntegrationEvents } from './PublishAgentIntegrationEvents'
import { AgentRunStartedEvent } from '../events/AgentRunStartedEvent'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
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
		])
	})
})
