import IORedis from 'ioredis'
import { hostname } from 'node:os'
import { BaseEvent } from '../../types/BaseEvent'
import { Handler } from '../../types/Handler'
import { BaseInfrastructureErrors } from '../../errors/codes'
import { BaseError } from '../../types/BaseError'
import { tryCatchAsync } from '../../utils/TryCatch'
import { Config } from '../../utils/Config'
import { EventCallback, ExternalMediator, Unsubscribe, handlerEventNames } from './Mediator'
import { injectable } from 'tsyringe-neo'

const STREAM_PREFIX = 'events:'
const DEAD_SUFFIX = ':dead'
const MAX_STREAM_LEN = 10_000
const READ_COUNT = 32
const BLOCK_MS = 5_000
const MAX_DELIVERIES = 5

type XReadGroupResult = null | [string, [string, string[]][]][]

@injectable()
export class RedisExternalMediator extends ExternalMediator {
	private producer!: IORedis
	private consumer!: IORedis
	private groupId!: string
	private consumerName!: string
	private handlerMap = new Map<string, Handler[]>()
	private callbacks = new Set<EventCallback>()
	private namedCallbacks = new Map<string, Set<EventCallback>>()
	private consuming = false
	private stopped = false
	private readLoop: Promise<void> | null = null

	override async start(): Promise<void> {
		await this.connect()
		await this.startConsuming()
	}

	override async stop(): Promise<void> {
		await this.disconnect()
	}

	private async connect(): Promise<void> {
		// Disconnect stale connections from bun --hot reload (same singleton, new start)
		this.consumer?.disconnect()
		this.producer?.disconnect()
		this.consuming = false
		this.stopped = false
		this.readLoop = null
		this.handlerMap.clear()

		const url = Config.env.REDIS_URL
		this.groupId = Config.env.API_EVENT_GROUP_ID
		this.consumerName = `${this.groupId}-${hostname()}-${process.pid}`

		this.producer = new IORedis(url, { maxRetriesPerRequest: null })
		this.consumer = new IORedis(url, { maxRetriesPerRequest: null })

		await Promise.all([this.producer.ping(), this.consumer.ping()])
		console.log('✅ Redis mediator connected')
	}

	async register(handler: Handler): Promise<void> {
		for (const name of handlerEventNames(handler)) {
			const existing = this.handlerMap.get(name)
			if (existing) {
				existing.push(handler)
				continue
			}
			this.handlerMap.set(name, [handler])
		}
	}

	private async startConsuming(): Promise<void> {
		if (this.consuming) return

		const streams = Array.from(this.handlerMap.keys(), streamKey)
		if (streams.length === 0) {
			console.log('No external handler streams to subscribe to, skipping Redis consumer')
			return
		}

		for (const stream of streams) {
			try {
				await this.consumer.xgroup('CREATE', stream, this.groupId, '$', 'MKSTREAM')
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				if (!message.includes('BUSYGROUP')) {
					console.warn(`Failed to create consumer group for ${stream}:`, message)
				}
			}
		}

		this.consuming = true
		this.readLoop = this.runReadLoop(streams).catch(error => {
			console.error('Redis read loop crashed:', error)
		})

		console.log(`✅ Redis consumer running on ${streams.length} streams: ${streams.map(stripPrefix).join(', ')}`)
	}

	async publish(event: BaseEvent): Promise<void> {
		const payload = JSON.stringify(event.toJSON())
		await this.producer.xadd(streamKey(event.name), 'MAXLEN', '~', MAX_STREAM_LEN, '*', 'data', payload)
		this.notifyCallbacks(event.name, event)
	}

	async dispatch(event: BaseEvent): Promise<void> {
		// Fire-and-forget to match in-process dispatch semantics of the Kafka implementation.
		const handlers = this.handlerMap.get(event.name)
		if (!handlers) return

		for (const handler of handlers) {
			void tryCatchAsync(async () => handler.execute(event)).then(result => {
				if (!result.success) {
					console.error(`[Redis] Handler ${handler.name} failed for event ${event.name}:`, result.error)
				}
			})
		}
	}

	async execute<T extends Handler>(_handler: T['name'], _input: T['input']): Promise<T['output']> {
		throw new BaseError<BaseInfrastructureErrors>('NOT_IMPLEMENTED')
	}

	removeAllListeners(): void {
		this.handlerMap.clear()
		this.callbacks.clear()
		this.namedCallbacks.clear()
	}

	registerCallback(callback: EventCallback, eventName?: string): Unsubscribe {
		if (eventName) {
			let set = this.namedCallbacks.get(eventName)
			if (!set) {
				set = new Set()
				this.namedCallbacks.set(eventName, set)
			}
			set.add(callback)
			return () => set!.delete(callback)
		}

		this.callbacks.add(callback)
		return () => this.callbacks.delete(callback)
	}

	private async disconnect(): Promise<void> {
		this.stopped = true
		await this.readLoop?.catch(() => {})
		this.readLoop = null
		this.consumer?.disconnect()
		this.producer?.disconnect()
		console.log('✅ Redis mediator disconnected')
	}

	private async runReadLoop(streams: string[]): Promise<void> {
		// First drain any pending entries from a previous run, then switch to live mode.
		let draining = true

		while (!this.stopped) {
			const ids = streams.map(() => (draining ? '0' : '>'))
			const result = await tryCatchAsync(() =>
				(this.consumer.xreadgroup as any)(
					'GROUP',
					this.groupId,
					this.consumerName,
					'COUNT',
					READ_COUNT,
					'BLOCK',
					BLOCK_MS,
					'STREAMS',
					...streams,
					...ids,
				),
			)
			if (!result.success) {
				if (this.stopped) return
				console.error('Redis XREADGROUP failed:', result.error)
				await sleep(1000)
				continue
			}

			const entries = result.data as XReadGroupResult
			let sawAny = false
			for (const [stream, messages] of entries ?? []) {
				if (messages.length === 0) continue
				sawAny = true
				for (const [id, fields] of messages) {
					await this.processEntry(stream, id, fields)
				}
			}

			if (draining && !sawAny) draining = false
		}
	}

	private async processEntry(stream: string, id: string, fields: string[]): Promise<void> {
		const eventName = stripPrefix(stream)
		const data = getField(fields, 'data')
		if (!data) {
			await this.ack(stream, id)
			return
		}

		let parsed: unknown
		try {
			parsed = JSON.parse(data)
		} catch (error) {
			console.error(`Failed to parse Redis entry on ${stream} (${id}):`, error)
			await this.moveToDeadLetter(stream, id, data, 'parse_error')
			return
		}

		const handlers = this.handlerMap.get(eventName) ?? []
		for (const handler of handlers) {
			const result = await tryCatchAsync(() => handler.execute(parsed))
			if (!result.success) {
				console.error(`Handler ${handler.name} failed on ${id}:`, result.error)
				const deliveries = await this.getDeliveryCount(stream, id)
				if (deliveries >= MAX_DELIVERIES) {
					await this.moveToDeadLetter(stream, id, data, String(result.error))
				}
				// Otherwise leave unacked so the PEL redelivers on next draining pass.
				return
			}
		}

		if (isBaseEvent(parsed)) this.notifyCallbacks(eventName, parsed)
		await this.ack(stream, id)
	}

	private async ack(stream: string, id: string): Promise<void> {
		const result = await tryCatchAsync(() => this.consumer.xack(stream, this.groupId, id))
		if (!result.success) {
			console.error(`Failed to XACK ${stream}/${id}:`, result.error)
		}
	}

	private async getDeliveryCount(stream: string, id: string): Promise<number> {
		const result = await tryCatchAsync(() => (this.consumer.xpending as any)(stream, this.groupId, 'IDLE', 0, id, id, 1))
		if (!result.success || !Array.isArray(result.data) || result.data.length === 0) return 0
		// XPENDING entry shape: [id, consumer, idleMs, deliveryCount]
		const count = Number((result.data[0] as unknown[])[3] ?? 0)
		return Number.isFinite(count) ? count : 0
	}

	private async moveToDeadLetter(stream: string, id: string, data: string, reason: string): Promise<void> {
		const deadStream = stream + DEAD_SUFFIX
		const result = await tryCatchAsync(() =>
			this.producer.xadd(deadStream, 'MAXLEN', '~', MAX_STREAM_LEN, '*', 'data', data, 'reason', reason, 'originalId', id),
		)
		if (!result.success) {
			console.error(`Failed to push ${id} to dead-letter stream ${deadStream}:`, result.error)
			return
		}
		await this.ack(stream, id)
		console.warn(`Moved ${id} from ${stream} to ${deadStream} (reason: ${reason})`)
	}

	private notifyCallbacks(eventName: string, event: BaseEvent): void {
		for (const cb of this.callbacks) cb(event)
		const named = this.namedCallbacks.get(eventName)
		if (named) for (const cb of named) cb(event)
	}
}

function streamKey(eventName: string): string {
	return STREAM_PREFIX + eventName
}

function stripPrefix(stream: string): string {
	return stream.startsWith(STREAM_PREFIX) ? stream.slice(STREAM_PREFIX.length) : stream
}

function getField(fields: string[], key: string): string | undefined {
	for (let i = 0; i < fields.length; i += 2) {
		if (fields[i] === key) return fields[i + 1]
	}
	return undefined
}

function isBaseEvent(value: unknown): value is BaseEvent {
	return typeof value === 'object' && value !== null && 'name' in value && 'id' in value && 'payload' in value
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}
