import { BoundedContext, byEnvironment, Config } from '@codm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import * as controllers from './controllers'
import { McpDoorController } from './mcp/door'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

// No `setup:` hook, and that is a DELETION rather than an omission (D7, §5.3): the startup prewarm
// sweep existed to pay claude's REPL cold-start ahead of the first inbound. With bidirectional
// stream-json on pipes there is no REPL to keep warm — every turn is its own short-lived process — so
// a sweep would spawn N processes at boot to warm nothing.

// TEST-ONLY turn trigger (Fase 7), split OFF the barrel so all three mount decisions read in one
// place. It is IN the barrel because the WIRE-03 rail requires every controller class to be — a
// controller hidden from its barrel is indistinguishable from dead wiring — and it is pulled out
// here because it must never serve outside the Playwright harness.
const { TestRunIssueTurnController, ...productionControllers } = controllers

// OPENAPI CARVE-OUT — the MCP door is a runtime-only JSON-RPC endpoint (`/mcp/:scope`). It is a REAL
// production route, but emitting it would render a tool endpoint into the SDK as React Query hooks
// with no consumer. Same discipline as `ChannelProxy` (external/index.ts) and `TestIngressController`
// (shared/index.ts): emission runs with EMIT_OPENAPI=true and only collects routers, so mounting it
// conditionally keeps the spec clean while every real boot serves it. AC-6.8(d) checks BOTH halves —
// zero hits in openapi.json AND an actual `initialize` round trip — because "not emitted" is not the
// same claim as "not implemented".
const runtimeControllers = Config.env.EMIT_OPENAPI === 'true' ? productionControllers : { ...productionControllers, McpDoorController }

// The test trigger takes the same carve-out, one environment tighter: emission never selects `e2e`,
// so it is doubly absent from the spec, and a production boot refuses any non-`real` environment
// outright (`setBoundedContextEnvironment`, src/server.ts). It exists so a spec can attach the
// console's SSE observer BEFORE the run it means to watch; the controller documents why nothing on the
// production path can.
//
// Declared dispatch (T5, NN-5): `byEnvironment` reads whichever environment `start()` selected before
// this module (a routers side-effect) was imported — see the ordering note in shared/index.ts.
// Explicit type argument: without it, TS infers the column type from `default`/`e2e` independently and
// produces a non-overlapping union that fails structural assignment — declaring it as the union of the
// two ACTUAL branch shapes keeps both members precise.
const mountedControllers = byEnvironment<
	typeof runtimeControllers | (typeof runtimeControllers & { TestRunIssueTurnController: typeof TestRunIssueTurnController })
>({
	default: runtimeControllers,
	e2e: { ...runtimeControllers, TestRunIssueTurnController },
})

const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.agent,
	controllers: mountedControllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
