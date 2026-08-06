import { BoundedContext } from '@codm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import { container } from 'tsyringe-neo'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { BetterAuth } from './services/Authentication'

const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.auth,
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

/**
 * Better-auth's raw fetch handler — `(request: Request) => Promise<Response>`, better-auth's own
 * API. Exported (not mounted) here: mounting it at `/api/auth/*` behind Fastify, gated by
 * `CODM_PROFILE === 'cloud'`, is the cloud-profile boot wiring (a later task) — this context's job
 * is only to make the handler resolvable and testable. The local daemon profile never calls this
 * function, so it never constructs a `BetterAuth` instance (registry: `mock: null`).
 */
export function resolveAuthHandler(): (request: Request) => Promise<Response> {
	return container.resolve(BetterAuth).auth.handler
}

export default ctx.router
