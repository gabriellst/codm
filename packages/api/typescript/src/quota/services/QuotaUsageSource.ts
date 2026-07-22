import type { Transaction } from '@template/core-typescript'

import type { UsageWindow } from './QuotaCounter'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/** Reads the current usage of a quota key for an owner, dispatching to whichever context owns that
 *  key's counter. The single read `QuotaGate` calls; nothing else needs to know how usage is counted. */
export abstract class QuotaUsageSource {
	abstract usage(ownerId: string, key: QuotaKey, window?: UsageWindow, tx?: Transaction): Promise<number>
}
