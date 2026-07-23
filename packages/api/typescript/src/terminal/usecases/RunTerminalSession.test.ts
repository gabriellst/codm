import { testId } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError, DomainEventRepository } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { RunTerminalSession } from './RunTerminalSession'
import {
	TerminalLLMRunner,
	type AgentGenerateRequest,
	type TerminalLLMRunnerStreamRequest,
	type TerminalLLMSessionSnapshot,
	type TerminalRuntimeEvent,
} from '../services/TerminalLLMRunner'
import { AgentStreamRegistry, type TerminalSseFrame } from '../services/AgentStreamRegistry'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'

/** A runner that fails the session (non-zero exit) — drives the STOPPED branch deterministically. */
class FailingRunner extends TerminalLLMRunner {
	async generate<OutputSchema extends import('zod').ZodType>(
		_r: AgentGenerateRequest<OutputSchema>,
	): Promise<import('zod').z.output<OutputSchema>> {
		return {} as import('zod').z.output<OutputSchema>
	}
	async *stream(_request: TerminalLLMRunnerStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		yield { type: 'output', line: { at: new Date().toISOString(), line: 'Error: API rate limit exceeded', stream: 'stderr' } }
		yield { type: 'exit', code: 1 }
	}
	async getSession(_issueId: string): Promise<TerminalLLMSessionSnapshot | null> {
		return null
	}
	async killSession(_issueId: string): Promise<void> {}
	async prewarm(_opts: { issueId: string; cwd: string; systemPrompt?: string }): Promise<void> {}
}

describe('RunTerminalSession use case', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = testId('run-terminal-session', 'owner')
	const threadId = testId('run-terminal-session', 'thread')

	const baseInput = (issueId: string) => ({
		ownerId,
		issueId,
		threadId,
		key: 'coupon-focus',
		title: 'Coupon focus bug',
		provider: ProviderKind.CLAUDE_CODE,
		workspacePath: '/tmp/workspace',
		prompt: 'fix the coupon focus bug',
	})

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('happy path: streams transport frames to the observer + persists opened/reply/completed facts', async () => {
		const useCase = testBed.resolve(RunTerminalSession)
		const registry = testBed.resolve(AgentStreamRegistry)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-terminal-session', 'issue-1')

		// Attach an SSE observer so the transport half of the two-stream split is observable.
		const frames: TerminalSseFrame[] = []
		registry.register(issueId, ownerId, frame => frames.push(frame))

		const out = await useCase.execute(baseInput(issueId))

		expect(out.outcome).toBe('COMPLETED')
		expect(out.replyText).toContain('done')

		// TRANSPORT — observer received line frames tagged with the issue.
		expect(frames.length).toBeGreaterThan(0)
		expect(frames.every(f => f.issueId === issueId)).toBe(true)

		// FACTS — opened + reply + completed persisted; no stop.
		expect(await eventRepo.findByType(TerminalSessionStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalReplyDraftedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalSessionCompletedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalStopRaisedEvent)).toHaveLength(0)

		// TEARDOWN — the single-active claim is released.
		expect(registry.isActive(issueId)).toBe(false)
	})

	it('enforces one session per issue (single-active invariant)', async () => {
		const useCase = testBed.resolve(RunTerminalSession)
		const registry = testBed.resolve(AgentStreamRegistry)
		const issueId = testId('run-terminal-session', 'issue-2')

		registry.beginSession(issueId) // simulate an already-running session
		try {
			await expect(useCase.execute(baseInput(issueId))).rejects.toThrow(
				expect.objectContaining({ name: 'TERMINAL_ALREADY_RUNNING' }) as BaseError,
			)
		} finally {
			registry.endSession(issueId)
		}
	})

	it('rejects a provider that is not installed', async () => {
		const useCase = testBed.resolve(RunTerminalSession)
		const issueId = testId('run-terminal-session', 'issue-3')
		// CODEX is NOT_INSTALLED in the MockProviderDetector default catalog.
		await expect(useCase.execute({ ...baseInput(issueId), provider: ProviderKind.CODEX })).rejects.toThrow(
			expect.objectContaining({ name: 'PROVIDER_NOT_DETECTED' }) as BaseError,
		)
	})

	it('maps a failed run to a STOPPED outcome + a stop-raised fact (runner overridden last)', async () => {
		testBed.override(TerminalLLMRunner, new FailingRunner())
		const useCase = testBed.resolve(RunTerminalSession)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = testId('run-terminal-session', 'issue-4')

		const out = await useCase.execute(baseInput(issueId))

		expect(out.outcome).toBe('STOPPED')
		expect(out.stopId).toBeDefined()
		expect(await eventRepo.findByType(TerminalSessionStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalStopRaisedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalSessionCompletedEvent)).toHaveLength(0)
	})
})
