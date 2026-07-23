import { injectable } from 'tsyringe-neo'
import { LoggingService } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMRunner } from '../TerminalLLMRunner'
import { TerminalLLMSessionRepository } from '../../repositories'

interface PrewarmCandidate {
	issueId: string
	cwd: string
}

const DEFAULT_LIMIT = 10
const DEFAULT_CONCURRENCY = 3

/**
 * Startup-time orchestrator (whatscode `MappingPrewarmService`, folded into the ONE inbound path
 * per the phase-10 plan: the mapping resolution it did is superseded by BC4 classification, so
 * what survives is the RECENCY sweep): selects the top-N most-recently-used issue sessions
 * (recency = `TerminalLLMSession.lastTurnAt`) and asks the runner to pre-warm each one with
 * bounded concurrency — the next inbound for those issues skips the claude cold-start.
 *
 * Fire-and-forget from the terminal context's `setup` hook — the daemon accepts traffic
 * immediately; pre-warm completes in the background. Per-issue failures are logged and ignored;
 * the failed issue falls back to the cold-start path on its first real message. Stub/mock runners
 * implement `prewarm` as a no-op, so tests and e2e are unaffected.
 *
 * Env:
 *   CODEDM_PREWARM_LIMIT       (default 10)  top-N to pre-warm; 0 disables entirely
 *   CODEDM_PREWARM_CONCURRENCY (default 3)   parallel spawn cap
 */
@injectable()
export class SessionPrewarmService {
	constructor(
		private readonly runner: TerminalLLMRunner,
		private readonly sessions: TerminalLLMSessionRepository,
		private readonly logging: LoggingService,
	) {}

	async start(): Promise<void> {
		const limit = readPositiveInt(process.env.CODEDM_PREWARM_LIMIT, DEFAULT_LIMIT)
		const concurrency = readPositiveInt(process.env.CODEDM_PREWARM_CONCURRENCY, DEFAULT_CONCURRENCY)
		if (limit <= 0) return

		const startedAt = Date.now()
		const candidates = await this.selectCandidates(limit)
		let succeeded = 0
		let failed = 0
		await this.runWithConcurrency(candidates, concurrency, async candidate => {
			try {
				await this.runner.prewarm({ issueId: candidate.issueId, cwd: candidate.cwd })
				succeeded++
			} catch (err) {
				failed++
				this.logging.warn({
					content: { message: 'prewarm failed', issueId: candidate.issueId, error: err instanceof Error ? err.message : String(err) },
				})
			}
		})
		if (candidates.length > 0) {
			const elapsedMs = Date.now() - startedAt
			this.logging.info({ content: { message: 'prewarm sweep done', candidates: candidates.length, succeeded, failed, elapsedMs } })
		}
	}

	private async selectCandidates(limit: number): Promise<PrewarmCandidate[]> {
		const sessions = await this.sessions.listRecentForPrewarm(limit * 2)
		const candidates: PrewarmCandidate[] = []
		for (const session of sessions) {
			// Only the claude engine has an interactive session to warm; other providers run one-shot.
			if (session.provider !== ProviderKind.CLAUDE_CODE) continue
			candidates.push({ issueId: session.issueId, cwd: session.cwd })
			if (candidates.length >= limit) break
		}
		return candidates
	}

	private async runWithConcurrency<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
		if (items.length === 0) return
		const queue = [...items]
		const workerCount = Math.max(1, Math.min(n, queue.length))
		const workers = Array.from({ length: workerCount }, async () => {
			while (queue.length > 0) {
				const item = queue.shift()
				if (item === undefined) return
				await fn(item)
			}
		})
		await Promise.all(workers)
	}
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
	if (raw === undefined || raw === '') return fallback
	const n = Number(raw)
	if (!Number.isFinite(n)) return fallback
	return Math.trunc(n)
}
