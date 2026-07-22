// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { BaseError, z } from '@template/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware, MiddlewareClass } from '@template/core-typescript'
import type { BaseInterfaceErrors } from '@template/core-typescript'
import { Role as OwnerRole } from '../enums/Role'

/**
 * Factory returning a Middleware class that reads `request.ctx.membership.role`
 * (stamped by `RequireOwnerMember`) and throws `FORBIDDEN` when the role isn't
 * in the allow-list.
 *
 * Usage:
 *   override middlewares = [
 *     AuthAccountMiddleware,
 *     RequireOwnerMember,
 *     RequireOwnerRole([OwnerRole.RESPONSIBLE, OwnerRole.ADMIN]),
 *   ]
 */
export function RequireOwnerRole(allowed: OwnerRole[]): MiddlewareClass {
	const allowedSet = new Set<string>(allowed)

	// Parse only the membership slice stamped by RequireOwnerMember.
	const MembershipCtxSchema = z.object({
		membership: z.object({ role: z.enum(OwnerRole) }),
	})

	class RequireOwnerRoleMiddleware implements Middleware {
		async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
			const ctx = MembershipCtxSchema.safeParse(request.ctx)
			if (!ctx.success) throw new BaseError<BaseInterfaceErrors>('FORBIDDEN')

			const role = ctx.data.membership.role
			if (!allowedSet.has(role)) throw new BaseError<BaseInterfaceErrors>('FORBIDDEN')

			return {}
		}
	}

	return RequireOwnerRoleMiddleware
}
