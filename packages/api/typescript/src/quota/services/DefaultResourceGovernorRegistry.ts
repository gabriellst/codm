import { ResourceGovernorRegistry } from './ResourceGovernorRegistry'
import type { ResourceGovernor } from './ResourceGovernor'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/** Composes per-key governors into one registry. The governors map is built at the shared merge root
 *  (the composition root that legitimately knows every context) — this class names no key. */
export class DefaultResourceGovernorRegistry extends ResourceGovernorRegistry {
	constructor(private governors: Partial<Record<QuotaKey, ResourceGovernor>>) {
		super()
	}

	for(key: QuotaKey): ResourceGovernor {
		return this.governors[key]!
	}

	keys(): QuotaKey[] {
		return Object.keys(this.governors) as QuotaKey[]
	}
}
