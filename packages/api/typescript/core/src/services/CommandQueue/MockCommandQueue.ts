// Generic command-name type — apps narrow this in their own subclasses.
type UseCases = string
import { Handler } from '../../types/Handler'
import { BaseError } from '../../types/BaseError'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import type { Transaction } from '../UnitOfWork/UnitOfWork'
import { CommandQueue } from './CommandQueue'
import { injectable } from 'tsyringe-neo'
import type { JobsOptions, Queue } from 'bullmq'

@injectable()
export class MockCommandQueue extends CommandQueue {
	// In-process: no broker I/O; tests exercise the transactional path.
	readonly transactional = true
	private handlers = new Map<string, Handler>()
	private lastResult: unknown = undefined
	/** DELAYED commands are stored (never executed inline) — keyed by jobId. See enqueueCommand. */
	private delayed = new Map<string, { commandName: string; input: unknown; delay: number }>()
	/** Monotonic fallback-jobId counter — `delayed.size` would collide after a cancel and drop the
	 *  next command as a "dedup" (false green in a test). The real drivers mint unique ids. */
	private delayedSeq = 0

	// Immediate/repeat commands execute inline (no queue, no tx semantics) — `_tx` accepted for port
	// parity. DELAYED commands (opts.delay > 0) are STORED instead: executing them inline would run the
	// handler synchronously INSIDE the caller's open transaction, which no real driver does. Tests
	// inspect via getDelayed() and fire via drainDelayed().
	async enqueueCommand<T extends Handler>(commandName: T['name'], input: T['input'], opts?: JobsOptions, _tx?: Transaction): Promise<void> {
		if (opts?.delay && opts.delay > 0) {
			const jobId = opts.jobId ?? `${commandName}:${this.delayedSeq++}`
			// jobId dedup parity: a pending delayed command with the same id makes this a no-op.
			if (!this.delayed.has(jobId)) this.delayed.set(jobId, { commandName, input, delay: opts.delay })
			return
		}
		const handler = this.handlers.get(commandName)
		if (!handler) {
			throw new BaseError<BaseInfrastructureErrors>(
				'COMMAND_HANDLER_NOT_FOUND',
				`No handler registered for command '${commandName}' — call registerCommandHandler(...) first.`,
			)
		}
		this.lastResult = await handler.execute(input)
	}

	// Cancels a stored DELAYED command (immediate ones already executed inline — nothing to cancel).
	async cancelCommand(_commandName: string, jobId: string, _tx?: Transaction): Promise<void> {
		this.delayed.delete(jobId)
	}

	/** Test helper: the currently-scheduled delayed command for a jobId (undefined if none/canceled). */
	getDelayed(jobId: string): { commandName: string; input: unknown; delay: number } | undefined {
		return this.delayed.get(jobId)
	}

	/** Test helper: every pending delayed jobId. */
	listDelayed(): string[] {
		return [...this.delayed.keys()]
	}

	/** Test helper: drop every stored delayed command WITHOUT executing (suite isolation in beforeEach). */
	clearDelayed(): void {
		this.delayed.clear()
	}

	/** Test helper: "time passes" — execute every stored delayed command (FIFO) and clear the store. */
	async drainDelayed(): Promise<void> {
		const entries = [...this.delayed.entries()]
		this.delayed.clear()
		for (const [, { commandName, input }] of entries) {
			const handler = this.handlers.get(commandName)
			if (!handler) {
				throw new BaseError<BaseInfrastructureErrors>(
					'COMMAND_HANDLER_NOT_FOUND',
					`No handler registered for delayed command '${commandName}' — call registerCommandHandler(...) first.`,
				)
			}
			this.lastResult = await handler.execute(input)
		}
	}

	getLastResult(): unknown {
		return this.lastResult
	}

	getCommandQueue(_commandName: UseCases): Queue {
		throw new BaseError<BaseInfrastructureErrors>(
			'NOT_IMPLEMENTED',
			'MockCommandQueue does not use BullMQ queues — getCommandQueue is only meaningful for the Bull-backed implementation.',
		)
	}

	async registerCommandHandler(handler: Handler): Promise<void> {
		this.handlers.set(handler.name, handler)
	}

	async removeAllCommandHandlers(): Promise<void> {
		this.handlers.clear()
	}

	async close(): Promise<void> {
		await this.removeAllCommandHandlers()
		this.delayed.clear()
	}
}
