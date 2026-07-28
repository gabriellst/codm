import { BoundedContext } from '@codedm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import * as controllers from './controllers'
import { McpRouterController } from './mcp/router'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

// No `setup:` hook, and that is a DELETION rather than an omission (D7, §5.3): the startup prewarm
// sweep existed to pay claude's REPL cold-start ahead of the first inbound. With bidirectional
// stream-json on pipes there is no REPL to keep warm — every turn is its own short-lived process — so
// a sweep would spawn N processes at boot to warm nothing.
// OPENAPI CARVE-OUT — the MCP router is a runtime-only JSON-RPC door (`/mcp/:scope`). It is a REAL
// production route, but emitting it would render a tool endpoint into the SDK as React Query hooks
// with no consumer. Same discipline as `ChannelProxy` (external/index.ts) and `TestIngressController`
// (shared/index.ts): emission runs with EMIT_OPENAPI=true and only collects routers, so mounting it
// conditionally keeps the spec clean while every real boot serves it. AC-6.8(d) checks BOTH halves —
// zero hits in openapi.json AND an actual `initialize` round trip — because "not emitted" is not the
// same claim as "not implemented".
const runtimeControllers =
	process.env.EMIT_OPENAPI === 'true' ? controllers : { ...controllers, McpRouterController }

const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.agent,
	controllers: runtimeControllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
