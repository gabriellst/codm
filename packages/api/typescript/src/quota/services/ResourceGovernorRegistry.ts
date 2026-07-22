import type { ResourceGovernor } from './ResourceGovernor'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/** The keyed lookup `ResourceLimitEnforcer` (and any other quota-key-driven caller) uses to reach the
 *  governor for a given quota key, without knowing which context owns that key's resource. */
export abstract class ResourceGovernorRegistry {
	abstract for(key: QuotaKey): ResourceGovernor
	abstract keys(): QuotaKey[]
}
