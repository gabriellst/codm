// Generic command-name type — apps narrow this in their own subclasses.
type UseCases = string
import { BaseError } from '../../types/BaseError'
import { Handler } from '../../types/Handler'
import { Config } from '../../utils/Config'
import type { Transaction } from '../UnitOfWork/UnitOfWork'
import { JobsOptions, Queue, Worker, type ConnectionOptions, type Job, type WorkerOptions } from 'bullmq'
import { CommandQueue } from './CommandQueue'
import { BaseInfrastructureErrors } from '../../errors/codes'
import { injectable } from 'tsyringe-neo'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { describeValue } from '../../utils/Tracing'
import IORedis from 'ioredis'

@injectable()
export class BullMQ extends CommandQueue {
	// Redis broker: enqueue/cancel are network I/O, NOT part of the caller's DB tx (the `tx` param is
	// ignored). Money-path schedulers must prefer the transactional driver — see CommandQueue.transactional.
	readonly transactional = false
	private readonly connection: ConnectionOptions
	private readonly sharedConnection: IORedis

	constructor() {
		super()
		const url = new URL(Config.env.REDIS_URL)
		this.connection = {
			host: url.hostname,
			port: Number(url.port) || 6379,
			password: url.password || undefined,
			username: url.username || undefined,
		}
		this.sharedConnection = new IORedis({
			host: url.hostname,
			port: Number(url.port) || 6379,
			password: url.password || undefined,
			username: url.username || undefined,
			maxRetriesPerRequest: 5,
		})
	}

	private getOrCreateQueue(commandName: string): Queue {
		const existingQueue = this.queues.get(commandName)
		if (existingQueue) {
			return existingQueue
		}

		const queue = new Queue(commandName, {
			connection: this.sharedConnection.options,
			defaultJobOptions: {
				removeOnComplete: true,
				removeOnFail: 1000,
				attempts: 3,
				backoff: {
					type: 'exponential',
					delay: 1000,
				},
			},
		})

		this.queues.set(commandName, queue)
		return queue
	}

	getCommandQueue(commandName: UseCases): Queue {
		const queue = this.queues.get(commandName)
		if (!queue) {
			throw new BaseError<BaseInfrastructureErrors>('COMMAND_QUEUE_NOT_FOUND')
		}
		return queue
	}

	// `_tx` belongs to the port for TRANSACTIONAL implementations (SqliteCommandQueue). A Redis broker
	// cannot join a DB transaction, so it is accepted for signature parity and ignored.
	async enqueueCommand<T extends Handler>(commandName: T['name'], input: T['input'], opts?: JobsOptions, _tx?: Transaction): Promise<void> {
		const tracer = trace.getTracer(Config.name)
		const span = tracer.startSpan(`enqueue ${commandName}`, { root: true })

		span.setAttribute('queue.command', commandName)
		span.setAttribute('queue.operation', 'enqueue')
		span.setAttribute('queue.input', describeValue(input))
		if (opts?.delay) span.setAttribute('queue.delay', opts.delay)
		if (opts?.priority) span.setAttribute('queue.priority', opts.priority)

		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const queue = this.getOrCreateQueue(commandName)
				const job = await queue.add(commandName, input, opts)
				span.setAttribute('queue.job_id', job.id ?? 'unknown')
				span.setStatus({ code: SpanStatusCode.OK })
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error))
				span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
				span.recordException(err)
				throw error
			} finally {
				span.end()
			}
		})
	}

	// Best-effort broker removal (a job mid-execution is not interrupted). `_tx` ignored — see enqueueCommand.
	async cancelCommand(commandName: string, jobId: string, _tx?: Transaction): Promise<void> {
		const queue = this.getOrCreateQueue(commandName)
		const job = await queue.getJob(jobId)
		await job?.remove()
	}

	async registerCommandHandler(handler: Handler): Promise<void> {
		const existingWorker = this.workers.get(handler.name)
		if (existingWorker) {
			console.warn(`Worker for handler ${handler.name} already exists, skipping registration`)
			return
		}

		const queue = this.getOrCreateQueue(handler.name)

		const workerOptions: WorkerOptions = {
			connection: this.connection,
			concurrency: handler.concurrency ?? 1,
		}

		const worker = new Worker(
			queue.name,
			async (job: Job) => {
				const tracer = trace.getTracer(Config.name)
				const span = tracer.startSpan(`process ${handler.name}`, { root: true })

				span.setAttribute('queue.command', handler.name)
				span.setAttribute('queue.operation', 'process')
				span.setAttribute('queue.job_id', job.id ?? 'unknown')
				span.setAttribute('queue.attempt', job.attemptsMade + 1)
				span.setAttribute('queue.input', describeValue(job.data))

				return context.with(trace.setSpan(context.active(), span), async () => {
					try {
						const result = await handler.execute(job.data)
						span.setStatus({ code: SpanStatusCode.OK })
						return result
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error))
						span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
						span.recordException(err)
						throw error
					} finally {
						span.end()
					}
				})
			},
			workerOptions,
		)

		worker.on('completed', (job: Job) => {
			console.log(`Job ${job.id} in queue ${handler.name} completed`)
		})

		worker.on('failed', (job: Job | undefined, error: Error) => {
			console.error(`Job ${job?.id} in queue ${handler.name} failed:`, error.message)
		})

		worker.on('error', (error: Error) => {
			console.error(`Worker error in queue ${handler.name}:`, error.message)
		})

		this.workers.set(handler.name, worker)
		console.log(`Registered worker for handler: ${handler.name}`)
	}

	async removeAllCommandHandlers(): Promise<void> {
		const closePromises: Promise<void>[] = []

		for (const [name, worker] of this.workers) {
			console.log(`Closing worker for handler: ${name}`)
			closePromises.push(worker.close())
		}

		await Promise.all(closePromises)
		this.workers.clear()

		// Also close and clear queue references so stale Queue objects don't
		// accumulate in memory when handlers are re-registered (e.g. hot reload).
		const queueClosePromises: Promise<void>[] = []
		for (const [name, queue] of this.queues) {
			console.log(`Closing queue: ${name}`)
			queueClosePromises.push(queue.close())
		}
		await Promise.all(queueClosePromises)
		this.queues.clear()

		console.log('All command handlers removed')
	}

	async close(): Promise<void> {
		// removeAllCommandHandlers() closes and clears both workers and queues.
		await this.removeAllCommandHandlers()
		this.sharedConnection.disconnect()
		console.log('All queues closed')
	}
}
