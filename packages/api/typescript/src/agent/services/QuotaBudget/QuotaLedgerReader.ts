import type { QuotaLedger } from './QuotaLedger'

/**
 * How far back the budget reads (fase 4, item 2): the week the reserve and the weekly window need, plus three more
 * for the learned ceiling's memory — a cut older than this is forgotten and the ceiling drifts back toward the seed.
 */
export const QUOTA_LEDGER_HORIZON_MS = 28 * 24 * 60 * 60 * 1000

/**
 * The budget's read port (fase 4, S2): the facts `QuotaBudget` is derived from, since an instant. `real` and
 * `integration` read `shared_events` by `name` + `occurred_at` (`events_name_idx`); `mock` is an in-memory ledger a
 * test scripts. Only usage facts WITH a role are returned — a row written before fase 4 is never guessed into one.
 */
export abstract class QuotaLedgerReader {
	abstract read(since: Date): Promise<QuotaLedger>
}
