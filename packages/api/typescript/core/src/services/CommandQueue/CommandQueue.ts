import { Handler } from '../../types/Handler'

// Generic command-name type — apps narrow this in their own subclasses.
type UseCases = string
import { tryCatch, tryCatchAsync } from '../../utils/TryCatch'
import type { Transaction } from '../UnitOfWork/UnitOfWork'
import { JobsOptions, Queue, Worker } from 'bullmq'
import { DependencyContainer } from 'tsyringe-neo'

export abstract class CommandQueue {
	protected readonly queues = new Map<string, Queue>()
	protected readonly workers = new Map<string, Worker>()

	/**
	 * Whether enqueue/cancel JOIN the caller's DB transaction (LibSqlCommandQueue: true — the write
	 * commits or rolls back with the domain write). Broker-backed drivers (BullMQ) are false: the `tx`
	 * param is ignored AND every call is network I/O — money-path callers MUST check this flag and
	 * tolerate failure (never let broker I/O fail a money transaction).
	 */
	abstract readonly transactional: boolean

	/**
	 * Enqueue a command, optionally delayed (`opts.delay`), deduplicated (`opts.jobId`) or repeatable
	 * (`opts.repeat`). `tx` is honored ONLY by transactional implementations (LibSqlCommandQueue): the
	 * enqueue commits or rolls back WITH the caller's domain write — no dual-write. Broker-backed
	 * implementations (BullMQ) ignore it (they cannot join a DB transaction).
	 */
	abstract enqueueCommand<T extends Handler>(commandName: T['name'], input: T['input'], opts?: JobsOptions, tx?: Transaction): Promise<void>
	/**
	 * Cancel a pending scheduled command by its caller-supplied `jobId` (see `opts.jobId`). Best-effort:
	 * a job already executing is not interrupted — handlers must stay idempotent so a lost race no-ops.
	 */
	abstract cancelCommand(commandName: string, jobId: string, tx?: Transaction): Promise<void>
	abstract getCommandQueue(commandName: UseCases): Queue
	abstract removeAllCommandHandlers(): Promise<void>
	/** Graceful shutdown: stop consuming, wait for in-flight work, release resources. Idempotent. */
	abstract close(): Promise<void>
	// Kept adjacent to its same-name static helper below (biome useAdjacentOverloadSignatures).
	abstract registerCommandHandler(handler: Handler): Promise<void>

	static async registerCommandHandler(
		container: DependencyContainer,
		commandQueue: CommandQueue,
		handlers: Record<string, new (...args: any[]) => Handler>,
	): Promise<number> {
		const handlerInstances: Handler[] = []
		let successCount = 0

		for (const [handlerName, HandlerClass] of Object.entries(handlers)) {
			if (typeof HandlerClass === 'function' && handlerName !== 'default') {
				const result = tryCatch(() => {
					const handlerInstance = container.resolve(HandlerClass).bindContainer(container)
					handlerInstances.push(handlerInstance)
					successCount++
				})
				if (!result.success) {
					console.warn(`Failed to resolve Handler ${handlerName}:`, result.error)
				}
			}
		}

		for (const handler of handlerInstances) {
			const result = await tryCatchAsync(async () => {
				await commandQueue.registerCommandHandler(handler)
			})
			if (!result.success) {
				console.warn(`Failed to register Handler:`, result.error)
				successCount--
			}
		}

		console.log(`✅ Registered ${successCount} Handlers to queue.`)
		return successCount
	}
}
