import { AggregateRoot, z } from '@template/core-typescript'
import Z from 'zod'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/**
 * One quota-override grant — the owner, the meter it loosens, the signed delta, and the idem key
 * that makes a redelivered grant a no-op (medscall@f04e8a0f port).
 *
 * This is a LEDGER entry (append-only, summed on read by
 * `QuotaOverrideRepository.currentDelta`/`currentDeltaMany`) — it has no lifecycle beyond "exists"
 * and no state-transition methods. Deliberately NOT inventing invariants: `id` is the usual
 * technical identity (a fresh UUID per grant); `idemKey` is the natural business identity a repeated
 * command is deduplicated on (enforced at the DB via `UNIQUE(idem_key)` + `onConflictDoNothing`,
 * not here).
 */
const QuotaOverrideSchema = z.object({
	ownerId: z.string().min(1),
	meter: z.enum(QuotaKey),
	delta: z.number().int(),
	idemKey: z.string().min(1),
})

export type QuotaOverrideProps = Z.infer<typeof QuotaOverrideSchema>

export class QuotaOverride extends AggregateRoot<typeof QuotaOverrideSchema> {
	static override schema = QuotaOverrideSchema

	static create(data: { ownerId: string; meter: QuotaKey; delta: number; idemKey: string }): QuotaOverride {
		return new QuotaOverride({
			ownerId: data.ownerId,
			meter: data.meter,
			delta: data.delta,
			idemKey: data.idemKey,
		})
	}
}

export interface QuotaOverride extends QuotaOverrideProps {}
