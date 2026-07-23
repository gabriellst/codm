import { describe, it, expect, beforeEach } from 'bun:test'
import { MockLoggingService } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMSession } from '../../entities/TerminalLLMSession'
import { MockTerminalLLMSessionRepository } from '../../repositories'
import { MockTerminalLLMRunner } from '../TerminalLLMRunner'
import { SessionPrewarmService } from './SessionPrewarmService'

interface PrewarmCall {
	issueId: string
	cwd: string
}

/**
 * Whatscode `MappingPrewarmService.test.ts` port, folded onto the issueId recency sweep (Fork B).
 * Direct construction sidesteps tsyringe-neo's emitDecoratorMetadata requirement for classes
 * declared inside .test.ts files (same rationale as the whatscode original).
 */
class InstrumentedRunner extends MockTerminalLLMRunner {
	public calls: PrewarmCall[] = []
	public concurrentPeak = 0
	private inflight = 0
	public failOn: Set<string> = new Set()
	public delayMs = 30

	override async prewarm(opts: { issueId: string; cwd: string; systemPrompt?: string }): Promise<void> {
		this.inflight++
		if (this.inflight > this.concurrentPeak) this.concurrentPeak = this.inflight
		try {
			await new Promise(r => setTimeout(r, this.delayMs))
			if (this.failOn.has(opts.issueId)) {
				throw new Error(`forced failure for ${opts.issueId}`)
			}
		} finally {
			this.inflight--
		}
		this.calls.push({ issueId: opts.issueId, cwd: opts.cwd })
	}
}

const OWNER = '00000000-0000-4000-8000-000000000001'
const THREAD = '00000000-0000-4000-8000-0000000000bb'

function issueId(n: number): string {
	return `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
}

async function seed(
	repo: MockTerminalLLMSessionRepository,
	n: number,
	lastTurnAt: Date,
	provider: ProviderKind = ProviderKind.CLAUDE_CODE,
): Promise<TerminalLLMSession> {
	const session = TerminalLLMSession.create({
		ownerId: OWNER,
		issueId: issueId(n),
		threadId: THREAD,
		provider,
		cwd: `/tmp/ws-${n}`,
		claudeSessionId: `cs-${n}`,
	})
	session.recordTurn(session.claudeSessionId, lastTurnAt)
	await repo.save(session)
	return session
}

describe('SessionPrewarmService', () => {
	let runner: InstrumentedRunner
	let repo: MockTerminalLLMSessionRepository
	let service: SessionPrewarmService

	beforeEach(() => {
		runner = new InstrumentedRunner()
		repo = new MockTerminalLLMSessionRepository()
		service = new SessionPrewarmService(runner, repo, new MockLoggingService())
		delete process.env.CODEDM_PREWARM_LIMIT
		delete process.env.CODEDM_PREWARM_CONCURRENCY
	})

	it('makes no runner.prewarm calls when there are no sessions', async () => {
		await service.start()
		expect(runner.calls).toEqual([])
	})

	it('selects the top-N candidates ordered by lastTurnAt DESC', async () => {
		await seed(repo, 1, new Date('2026-01-01T00:00:00Z'))
		await seed(repo, 2, new Date('2026-03-01T00:00:00Z'))
		await seed(repo, 3, new Date('2026-05-01T00:00:00Z'))
		process.env.CODEDM_PREWARM_LIMIT = '2'
		process.env.CODEDM_PREWARM_CONCURRENCY = '2'

		await service.start()

		expect(runner.calls.map(c => c.issueId).sort()).toEqual([issueId(2), issueId(3)])
	})

	it('skips non-claude providers — only the interactive engine has a session to warm', async () => {
		await seed(repo, 1, new Date('2026-05-01T00:00:00Z'), ProviderKind.CODEX)
		await seed(repo, 2, new Date('2026-04-01T00:00:00Z'))

		await service.start()

		expect(runner.calls.map(c => c.issueId)).toEqual([issueId(2)])
	})

	it('bounds concurrency to CODEDM_PREWARM_CONCURRENCY', async () => {
		for (let i = 1; i <= 6; i++) {
			await seed(repo, i, new Date(2026, 4, 1, 0, 0, i))
		}
		process.env.CODEDM_PREWARM_LIMIT = '6'
		process.env.CODEDM_PREWARM_CONCURRENCY = '2'
		runner.delayMs = 50

		await service.start()

		expect(runner.calls).toHaveLength(6)
		expect(runner.concurrentPeak).toBeLessThanOrEqual(2)
	})

	it('isolates per-issue failures — other candidates still complete', async () => {
		await seed(repo, 1, new Date('2026-05-01T00:00:00Z'))
		await seed(repo, 2, new Date('2026-05-02T00:00:00Z'))
		runner.failOn = new Set([issueId(2)])
		process.env.CODEDM_PREWARM_LIMIT = '10'

		// Service must not throw — failures are absorbed.
		await service.start()

		expect(runner.calls.map(c => c.issueId)).toEqual([issueId(1)])
	})

	it('opts out entirely when CODEDM_PREWARM_LIMIT=0', async () => {
		await seed(repo, 1, new Date('2026-05-01T00:00:00Z'))
		process.env.CODEDM_PREWARM_LIMIT = '0'

		await service.start()
		expect(runner.calls).toEqual([])
	})
})
