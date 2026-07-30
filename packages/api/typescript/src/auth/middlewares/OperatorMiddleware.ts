import { singleton } from 'tsyringe-neo'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware } from '@codm/core-typescript'
import { OPERATOR_ID, OPERATOR_SESSION } from '@auth/operator'

/**
 * OperatorMiddleware — the seam that replaces both AuthAccountMiddleware (session lookup) and
 * RequireOwner (tenancy gate) after the auth collapse.
 *
 * There is exactly ONE operator (founder decision 2): no credentials, no session store, no owner
 * lookup. This middleware stamps the constant operator identity onto `request.ctx` UNCONDITIONALLY,
 * preserving the exact `ctx.user` / `ctx.session` / `ctx.ownerId` shape downstream code already
 * reads. Swapping a real auth boundary back in is a one-file change here — the rest of the codebase
 * never learns the axis collapsed.
 */
@singleton()
export class OperatorMiddleware implements Middleware {
	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		request.ctx = {
			...request.ctx,
			user: OPERATOR_SESSION.user,
			session: OPERATOR_SESSION.session,
			ownerId: OPERATOR_ID,
		}
		return {}
	}
}
