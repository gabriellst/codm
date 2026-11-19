import { injectable } from 'tsyringe-neo'
import { EMPTY_QUOTA_LEDGER, type QuotaLedger } from './QuotaLedger'
import { QuotaLedgerReader } from './QuotaLedgerReader'

/** The `mock` ledger: empty until a test scripts it — and an empty ledger admits (no spend, the seed ceiling). */
@injectable()
export class MockQuotaLedgerReader extends QuotaLedgerReader {
	private ledger: QuotaLedger = EMPTY_QUOTA_LEDGER

	script(ledger: QuotaLedger): void {
		this.ledger = ledger
	}

	async read(since: Date): Promise<QuotaLedger> {
		const from = since.getTime()
		const after = <T extends { at: number }>(facts: readonly T[]) => facts.filter(fact => fact.at >= from)
		return {
			...this.ledger,
			usage: after(this.ledger.usage),
			limits: after(this.ledger.limits),
			holds: after(this.ledger.holds),
			issueRunStarts: after(this.ledger.issueRunStarts),
		}
	}
}
