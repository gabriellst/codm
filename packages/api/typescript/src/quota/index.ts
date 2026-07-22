import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'

// Generic Tier-2 quota context (medscall@f04e8a0f port): kernel gate + ports/governors, override
// ledger, entitlement port, enforcement. Zero product keys wired — the merge root plugs the real
// counters/governors. Zero default middlewares (D-5) — ApplyQuotaOverride is operator-key gated.
const ctx = await BoundedContext.create({
	name: 'quota',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
