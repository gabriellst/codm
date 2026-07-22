// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { Role } from '../enums/Role'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwnerMember } from '@owner/middlewares/RequireOwnerMember'
import { RequireOwnerRole } from '../middlewares/RequireOwnerRole'
import { ChangeMemberRole, ChangeMemberRoleInputSchema } from '../usecases/ChangeMemberRole'

export const ChangeMemberRoleControllerInputSchema = z
	.object({
		ctx: z.object({
			session: z.object({ ownerId: z.uuid() }),
		}),
		// `ids` are the userIds of the members to re-role under the active owner.
		// Bulk: apply `newRole` to all of them in one call.
		// ownerId is supplied from ctx.session.ownerId — omitted from the HTTP surface.
		body: ChangeMemberRoleInputSchema.omit({ ownerId: true }),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: {
				ids: ['019e4d25-7c1f-7041-9e1c-8108180cddae'],
				newRole: Role.ADMIN,
			},
		},
	])

export const ChangeMemberRoleControllerOutputSchema = z.void()

@injectable()
export class ChangeMemberRoleController extends Controller<
	typeof ChangeMemberRoleControllerInputSchema,
	typeof ChangeMemberRoleControllerOutputSchema
> {
	readonly path = '/owners/memberships/role'
	readonly method = 'patch' as const
	readonly description = "Change one or more owner members' role (C18 ChangeMemberRole; LAST_OWNER guarded)"
	readonly inputSchema = ChangeMemberRoleControllerInputSchema
	readonly outputSchema = ChangeMemberRoleControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireOwnerMember, RequireOwnerRole([Role.RESPONSIBLE])]

	constructor(private changeMemberRole: ChangeMemberRole) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.changeMemberRole.execute({
			ownerId: request.ctx.session.ownerId,
			ids: request.body.ids,
			newRole: request.body.newRole,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
