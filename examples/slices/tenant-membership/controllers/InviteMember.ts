// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwnerMember } from '@owner/middlewares/RequireOwnerMember'
import { RequireOwnerRole } from '../middlewares/RequireOwnerRole'
import { Role } from '../enums/Role'
import { InviteMember, InviteMemberInputSchema, InviteMemberOutputSchema } from '../usecases/InviteMember'

export const InviteMemberControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ ownerId: z.uuid() }),
		}),
		// ownerId is supplied from ctx.session.ownerId, invitedByUserId from ctx.user.id — omitted from the HTTP surface.
		body: InviteMemberInputSchema.omit({ ownerId: true, invitedByUserId: true }),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' }, session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: {
				email: 'newmember@example.com',
				role: Role.MEMBER,
			},
		},
	])

export const InviteMemberControllerOutputSchema = InviteMemberOutputSchema.example([
	{ ownerInvitationId: '019e4d25-7c1f-7041-9e1c-8108180cddae' },
])

@injectable()
export class InviteMemberController extends Controller<
	typeof InviteMemberControllerInputSchema,
	typeof InviteMemberControllerOutputSchema
> {
	readonly path = '/owners/memberships'
	readonly method = 'post' as const
	readonly description = 'Issue a signed invitation envelope for a new owner member (C15 InviteMember)'
	readonly inputSchema = InviteMemberControllerInputSchema
	readonly outputSchema = InviteMemberControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireOwnerMember, RequireOwnerRole([Role.RESPONSIBLE, Role.ADMIN])]

	constructor(private inviteMember: InviteMember) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.inviteMember.execute({
			ownerId: request.ctx.session.ownerId,
			invitedByUserId: request.ctx.user.id,
			email: request.body.email,
			role: request.body.role,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
