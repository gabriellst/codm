import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError, DomainEventRepository } from '@template/core-typescript'
import { ProviderKind } from '@template/contracts-typescript/wire/enums'
import { RunTerminalSession } from './RunTerminalSession'
import { AgentRunner, type AgentGenerateRequest, type AgentStreamRequest, type TerminalRuntimeEvent } from '../services/AgentRunner'
import { TerminalSessionRegistry, type TerminalOutputFrame } from '../services/TerminalSessionRegistry'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'

/** A runner that fails the session (non-zero exit) — drives the STOPPED branch deterministically. */
class FailingRunner extends AgentRunner {
	async generate<OutputSchema extends import('zod').ZodType>(_r: AgentGenerateRequest<OutputSchema>): Promise<import('zod').z.output<OutputSchema>> {
		return {} as import('zod').z.output<OutputSchema>
	}
	async *stream(_request: AgentStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		yield { type: 'output', line: { at: new Date().toISOString(), line: 'Error: API rate limit exceeded', stream: 'stderr' } }
		yield { type: 'exit', code: 1 }
	}
}

describe('RunTerminalSession use case', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = '00000000-0000-4000-8000-000000000001'
	const threadId = '019e4d24-6524-7041-9e1c-8108180cddae'

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
		const registry = testBed.resolve(TerminalSessionRegistry)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = '019e4d24-0000-7041-9e1c-000000000001'

		// Attach an SSE observer so the transport half of the two-stream split is observable.
		const frames: TerminalOutputFrame[] = []
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
		const registry = testBed.resolve(TerminalSessionRegistry)
		const issueId = '019e4d24-0000-7041-9e1c-000000000002'

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
		const issueId = '019e4d24-0000-7041-9e1c-000000000003'
		// CODEX is NOT_INSTALLED in the MockProviderDetector default catalog.
		await expect(useCase.execute({ ...baseInput(issueId), provider: ProviderKind.CODEX })).rejects.toThrow(
			expect.objectContaining({ name: 'PROVIDER_NOT_DETECTED' }) as BaseError,
		)
	})

	it('maps a failed run to a STOPPED outcome + a stop-raised fact (runner overridden last)', async () => {
		testBed.override(AgentRunner, new FailingRunner())
		const useCase = testBed.resolve(RunTerminalSession)
		const eventRepo = testBed.resolve(DomainEventRepository)
		const issueId = '019e4d24-0000-7041-9e1c-000000000004'

		const out = await useCase.execute(baseInput(issueId))

		expect(out.outcome).toBe('STOPPED')
		expect(out.stopId).toBeDefined()
		expect(await eventRepo.findByType(TerminalSessionStartedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalStopRaisedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(TerminalSessionCompletedEvent)).toHaveLength(0)
	})
})
