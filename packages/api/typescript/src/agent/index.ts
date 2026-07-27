import { BoundedContext } from '@codedm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import * as controllers from './controllers'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

// No `setup:` hook, and that is a DELETION rather than an omission (D7, §5.3): the startup prewarm
// sweep existed to pay claude's REPL cold-start ahead of the first inbound. With bidirectional
// stream-json on pipes there is no REPL to keep warm — every turn is its own short-lived process — so
// a sweep would spawn N processes at boot to warm nothing.
const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.agent,
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
