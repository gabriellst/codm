import { injectable } from 'tsyringe-neo'
import { LoggingService } from '@codedm/core-typescript'
import { MailboxItemKind, MailboxTargetKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories'
import { WorkspaceRepository } from '@workspace/repositories'
import { MailboxRepository, type ClaimedMailboxItem } from '../../repositories'
import { RunOrchestratorTurn } from '../../usecases/RunOrchestratorTurn'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { MailboxDispatcher } from './MailboxDispatcher'

/** How long a claimed item stays leased before a crashed worker's item becomes claimable again. */
const LEASE_MS = 10 * 60 * 1000
/** Past this many failed turns an item is POISONED rather than retried — it is blocking its target. */
const MAX_ATTEMPTS = 3
const POLL_MIN_MS = 250
const POLL_MAX_MS = 15_000
const POLL_BACKOFF_FACTOR = 2

/**
 * The concrete scheduler (§7.4). See `MailboxDispatcher` for WHY each property exists.
 *
 * ### Why `drain()` loops instead of claiming once per tick
 * A tick that handled one item would make throughput a function of the poll interval, and the
 * end-of-turn re-poll would be indistinguishable from "wait for the next tick". Looping until
 * `claimNext` comes back empty means a target with three queued messages answers all three in one
 * pass, in order — and the loop IS the re-poll, which is why it needs no separate mechanism.
 */
@injectable()
export class DrizzleMailboxDispatcher extends MailboxDispatcher {
	private timer: ReturnType<typeof setTimeout> | null = null
	private stopping = false
	private draining: Promise<number> | null = null
	private pollIntervalMs = POLL_MIN_MS
	private readonly workerId = `mailbox-${crypto.randomUUID()}`

	constructor(
		private readonly mailbox: MailboxRepository,
		private readonly runOrchestratorTurn: RunOrchestratorTurn,
		private readonly runIssueTurn: RunIssueTurn,
		private readonly threads: ThreadRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	start(): void {
		if (this.timer) return
		this.stopping = false
		// THE BOOT SWEEP. Not a special code path — the ordinary drain already claims anything whose
		// lease has expired, and a process that died mid-turn left exactly that. Saying it out loud
		// because "recover orphaned work on startup" reads like a missing feature otherwise.
		void this.tick()
	}

	async stop(): Promise<void> {
		this.stopping = true
		if (this.timer) clearTimeout(this.timer)
		this.timer = null
		// Let an in-flight turn finish rather than abandoning it leased: the operator is waiting for
		// that reply, and killing it here would strand the item until the lease expired.
		await this.draining
	}

	async drain(): Promise<number> {
		// Re-entrancy guard: a tick that fired while a drain was still running would claim items the
		// running drain is about to claim, and both would run turns for different targets — legal, but
		// it makes the concurrency unbounded and the logs unreadable.
		if (this.draining) return this.draining
		this.draining = this.drainLoop().finally(() => {
			this.draining = null
		})
		return this.draining
	}

	private async drainLoop(): Promise<number> {
		let handled = 0
		for (;;) {
			const item = await this.mailbox.claimNext(this.workerId, LEASE_MS)
			if (!item) return handled
			await this.runTurn(item)
			handled++
			// The loop continues, which IS the end-of-turn re-poll (AC-T5.3): the next item for the SAME
			// target is now unblocked because this one is consumed, so it runs immediately instead of
			// waiting for the next tick.
		}
	}

	private async runTurn(item: ClaimedMailboxItem): Promise<void> {
		try {
			if (item.targetKind === MailboxTargetKind.THREAD) await this.runThreadTurn(item)
			else await this.runIssueWork(item)
			await this.mailbox.complete(item.id)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.logging.error({
				content: {
					message: 'mailbox turn failed',
					itemId: item.id,
					targetKind: item.targetKind,
					targetId: item.targetId,
					attempts: item.attempts,
					error: message,
				},
			})
			// attempts++ and the lease released. Past MAX_ATTEMPTS the row is poisoned — it is ordered
			// AHEAD of everything else for its target, so retrying forever would silence that thread.
			await this.mailbox.fail(item.id, message, MAX_ATTEMPTS)
		}
	}

	/**
	 * A THREAD item is a turn of the orchestrator (§7.4). The run context — which CLI, which directory —
	 * is resolved HERE rather than carried in the payload, because it is a property of the thread NOW
	 * and an item may have been queued minutes ago; a workspace rebound in between should take effect.
	 */
	private async runThreadTurn(item: ClaimedMailboxItem): Promise<void> {
		const thread = await this.threads.findById(item.targetId)
		if (!thread) return this.dropSilently(item, 'thread no longer exists')

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) return this.dropSilently(item, 'workspace no longer bound')

		const provider = thread.providers[0]
		if (!provider) return this.dropSilently(item, 'thread has no provider')

		const payload = item.payload as { entryId?: string }
		await this.runOrchestratorTurn.execute({
			ownerId: item.ownerId,
			threadId: item.targetId,
			workspacePath: workspace.path,
			provider,
			item: item.payload as Parameters<RunOrchestratorTurn['execute']>[0]['item'],
			// Only an OPERATOR_MESSAGE has an originating entry; an ISSUE_RESULT turn is triggered by a
			// subagent finishing, and the entry it will CITE is carried on the item, not on the token.
			entryId: item.kind === MailboxItemKind.OPERATOR_MESSAGE ? payload.entryId : undefined,
		})
	}

	/** An ISSUE item is a subagent turn — `WORK` today, `STEER` from F4. */
	private async runIssueWork(item: ClaimedMailboxItem): Promise<void> {
		const payload = item.payload as { threadId: string; key: string; title: string; goal: string; provider: string }
		const thread = await this.threads.findById(payload.threadId)
		if (!thread) return this.dropSilently(item, 'thread no longer exists')

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) return this.dropSilently(item, 'workspace no longer bound')

		await this.runIssueTurn.execute({
			ownerId: item.ownerId,
			issueId: item.targetId,
			threadId: payload.threadId,
			key: payload.key,
			title: payload.title,
			provider: thread.providers[0] ?? (payload.provider as never),
			workspacePath: workspace.path,
			// The issue OWNS its goal since the pivot — the prompt is what the operator asked for, not
			// the raw inbound text re-read from a transcript.
			prompt: payload.goal,
			messageId: item.id,
		})
	}

	/**
	 * A precondition that will never become true again — the thread was detached, the workspace
	 * unbound. Completed rather than failed: `fail` would retry three times and then poison, which
	 * spends three CLI spawns and leaves a dead row implying something is wrong. Logged at `warn`
	 * because a vanished target IS worth noticing, just not worth retrying.
	 */
	private async dropSilently(item: ClaimedMailboxItem, why: string): Promise<void> {
		this.logging.warn({
			content: { message: `mailbox item dropped — ${why}`, itemId: item.id, targetKind: item.targetKind, targetId: item.targetId },
		})
		await this.mailbox.complete(item.id)
	}

	private async tick(): Promise<void> {
		if (this.stopping) return
		let handled = 0
		try {
			handled = await this.drain()
		} catch (error) {
			this.logging.error({ content: { message: 'mailbox drain failed', error: error instanceof Error ? error.message : String(error) } })
		}
		// Busy → poll fast; idle → back off. A conversation is bursty, so the floor matters more than
		// the ceiling: the first message after a quiet hour should not wait 15 seconds for a tick.
		this.pollIntervalMs = handled > 0 ? POLL_MIN_MS : Math.min(this.pollIntervalMs * POLL_BACKOFF_FACTOR, POLL_MAX_MS)
		if (this.stopping) return
		this.timer = setTimeout(() => void this.tick(), this.pollIntervalMs)
	}
}
