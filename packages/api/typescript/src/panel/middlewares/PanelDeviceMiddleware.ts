import { injectable } from 'tsyringe-neo'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware } from '@codm/core-typescript'
import { PANEL_IDENTITY } from '../utils/panelIdentity'

/**
 * Reads the panel DEVICE cookie (fase 2, item 6a) off the raw request and stamps it on `ctx.panelDevice`.
 *
 * Controllers only see `body/query/params/ctx`, so a cookie reaches a use case the way the session does:
 * a middleware puts it in `ctx`. It decides nothing — no cookie, or a stale one, is simply "nobody",
 * which the use case answers. Never refuses a request.
 */
@injectable()
export class PanelDeviceMiddleware implements Middleware {
	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const header = request.raw.headers.get('cookie') ?? ''
		const prefix = `${PANEL_IDENTITY.cookieName}=`
		const value = header
			.split(';')
			.map(part => part.trim())
			.find(part => part.startsWith(prefix))
			?.slice(prefix.length)
		request.ctx = { ...request.ctx, ...(value ? { panelDevice: value } : {}) }
		return {}
	}
}
