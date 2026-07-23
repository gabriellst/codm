import { testId } from '@test/support'
import { describe, expect, it, mock } from 'bun:test'
import type { ExternalMediator } from '@codedm/core-typescript'
import {
	IssueOpenedEvent,
	IssueCompletedEvent,
	IssueStopRaisedEvent,
	AgentReplyDraftedEvent,
} from '@codedm/contracts-typescript/wire/events'
import { ProviderKind, StopKind } from '@codedm/contracts-typescript/wire/enums'
import { PublishTerminalIntegrationEvents } from './PublishTerminalIntegrationEvents'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'

const ownerId = testId('terminal-bridge', 'owner')

function makeHandler() {
	const published: unknown[] = []
	const mediator = { publish: mock(async (event: unknown) => void published.push(event)) } as unknown as ExternalMediator
	return { handler: new PublishTerminalIntegrationEvents(mediator), published }
}

describe('PublishTerminalIntegrationEvents (terminal.* domain facts → frozen integration events)', () => {
	it('terminal.session.started → integration.issue.opened', async () => {
		const { handler, published } = makeHandler()
		await handler.handle(
			new TerminalSessionStartedEvent({
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

	it('terminal.agent.reply_drafted → integration.agent.reply_drafted (labeled)', async () => {
		const { handler, published } = makeHandler()
		await handler.handle(
			new TerminalReplyDraftedEvent({
				entityId: 'issue-1',
				ownerId,
				payload: { issueId: 'issue-1', threadId: 'thread-1', key: 'coupon-focus', text: 'Fixed it. PR #214.' },
			}) as never,
		)
		const event = published[0] as AgentReplyDraftedEvent
		expect(event).toBeInstanceOf(AgentReplyDraftedEvent)
		expect(event.name).toBe('integration.agent.reply_drafted')
		expect(event.payload).toEqual({
			issueId: 'issue-1',
			threadId: 'thread-1',
			labelIssueKey: 'coupon-focus',
			labelThreadId: 'thread-1',
			text: 'Fixed it. PR #214.',
		})
	})

	it('terminal.session.completed → integration.issue.completed', async () => {
		const { handler, published } = makeHandler()
		const completedAt = new Date('2026-07-22T00:00:00.000Z')
		await handler.handle(
			new TerminalSessionCompletedEvent({
				entityId: 'issue-1',
				ownerId,
				payload: { issueId: 'issue-1', threadId: 'thread-1', key: 'coupon-focus', completedAt },
			}) as never,
		)
		const event = published[0] as IssueCompletedEvent
		expect(event).toBeInstanceOf(IssueCompletedEvent)
		expect(event.name).toBe('integration.issue.completed')
		expect(event.payload).toEqual({ issueId: 'issue-1', threadId: 'thread-1', key: 'coupon-focus', completedAt })
	})

	it('terminal.stop.raised → integration.issue.stop_raised', async () => {
		const { handler, published } = makeHandler()
		await handler.handle(
			new TerminalStopRaisedEvent({
				entityId: 'issue-1',
				ownerId,
				payload: { stopId: 'stop-1', issueId: 'issue-1', threadId: 'thread-1', kind: StopKind.SERVER_ERROR },
			}) as never,
		)
		const event = published[0] as IssueStopRaisedEvent
		expect(event).toBeInstanceOf(IssueStopRaisedEvent)
		expect(event.name).toBe('integration.issue.stop_raised')
		expect(event.payload).toEqual({ stopId: 'stop-1', issueId: 'issue-1', threadId: 'thread-1', kind: StopKind.SERVER_ERROR })
	})

	it('subscribes to exactly the four terminal.* facts', () => {
		const { handler } = makeHandler()
		expect(handler.events).toEqual([
			'terminal.session.started',
			'terminal.agent.reply_drafted',
			'terminal.session.completed',
			'terminal.stop.raised',
		])
	})
})
