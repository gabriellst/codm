import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { InvoiceNumberSequencer } from './InvoiceNumberSequencer'

@injectable()
export class MockInvoiceNumberSequencer extends InvoiceNumberSequencer {
	private readonly counters = new Map<string, number>()

	async next(prefix: string, _tx: Transaction): Promise<string> {
		const n = this.counters.get(prefix) ?? 1
		this.counters.set(prefix, n + 1)
		return `${prefix}-${String(n).padStart(6, '0')}`
	}

	/** Reset the in-memory counters between tests (matches the TestBed `clear()` convention). */
	clear(): void {
		this.counters.clear()
	}
}
