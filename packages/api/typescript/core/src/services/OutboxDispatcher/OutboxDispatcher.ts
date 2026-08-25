export abstract class OutboxDispatcher {
	abstract start(): void
	abstract stop(): Promise<void>
	abstract flush(): Promise<void>
}
