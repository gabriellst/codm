import { TerminalLLMRunnerBusyError } from '../TerminalLLMRunner'

interface QueuedWrite {
	text: string
	resolve(): void
	reject(err: Error): void
}

export interface WriteQueue {
	enqueue(text: string): Promise<void>
	dequeue(): QueuedWrite | undefined
	size(): number
	depth(): number
}

/**
 * Per-session bounded write queue with backpressure.
 *
 * `enqueue` returns a Promise that resolves when the corresponding turn completes (the caller
 * resolves it after observing the turn-completed event). On overflow the enqueue call throws
 * `TerminalLLMRunnerBusyError`.
 *
 * The queue is FIFO. Only `ClaudeCliTerminalLLMRunner` constructs queues — one per issueId
 * (Fork B: session identity = issue).
 */
export function createWriteQueue(issueId: string, maxDepth: number): WriteQueue {
	const items: QueuedWrite[] = []
	return {
		async enqueue(text) {
			if (items.length >= maxDepth) throw new TerminalLLMRunnerBusyError(issueId)
			return new Promise<void>((resolve, reject) => {
				items.push({ text, resolve, reject })
			})
		},
		dequeue() {
			return items.shift()
		},
		size() {
			return items.length
		},
		depth() {
			return maxDepth
		},
	}
}
