import type { Session } from '@auth/schemas'

/**
 * Single-operator identity — the collapse of the multi-tenant `ownerId` axis to ONE constant.
 *
 * CODM runs as a local, single-operator daemon (founder decision 2): there are no accounts, no
 * sign-up, no session lookup. Every request is the operator. `OPERATOR_ID` is a stable UUID used
 * both as the operator's user id and as the single tenant's `ownerId`.
 *
 * The collapse is at the BOUNDARY, not the schema: `ownerId` columns and repository scoping stay
 * everywhere downstream (decision 2). `OperatorMiddleware` stamps `OPERATOR_SESSION` (this exact
 * `SessionSchema` shape) onto `request.ctx`, so every controller that used to read
 * `ctx.user.id` / `ctx.session.ownerId` behind better-auth keeps working unchanged.
 */
export const OPERATOR_ID = '00000000-0000-4000-8000-000000000001'

export const OPERATOR_SESSION: Session = {
	user: { id: OPERATOR_ID, email: 'operator@codm.local', name: 'Operator', emailVerified: true },
	session: {
		id: OPERATOR_ID,
		userId: OPERATOR_ID,
		expiresAt: new Date('2999-12-31T00:00:00.000Z'),
		ownerId: OPERATOR_ID,
	},
}
