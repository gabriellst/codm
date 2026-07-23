import { BoundedContext } from '@codedm/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'

// OPENAPI CARVE-OUT — the ChannelProxy is a runtime-only wildcard (`/external/channel/*`): it must
// never leak into openapi.json / the SDK (the gateway's own spec is the typed surface; kubb would
// choke a meaningless `channel/*` catch-all into every client). Mirror of the TestIngress pattern
// (shared/index.ts): emission runs with EMIT_OPENAPI=true and collects routers only, so mounting
// zero controllers there keeps the spec clean while every real boot mounts the proxy.
const runtimeControllers: typeof controllers | Record<string, never> = process.env.EMIT_OPENAPI === 'true' ? {} : controllers

const ctx = await BoundedContext.create({
	name: 'external',
	controllers: runtimeControllers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
