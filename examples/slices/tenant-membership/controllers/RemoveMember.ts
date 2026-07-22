// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwnerMember } from '@owner/middlewares/RequireOwnerMember'
import { RequireOwnerRole } from '../middlewares/RequireOwnerRole'
import { Role } from '../enums/Role'
import { RemoveMember, RemoveMemberInputSchema } from '../usecases/RemoveMember'

export const RemoveMemberControllerInputSchema = z
	.object({
		ctx: z.object({
			session: z.object({ ownerId: z.uuid() }),
		}),
		// `ids` are the userIds of the members to remove — OwnerMembership has no
		// separate id; a membership is uniquely identified by (ownerId, userId).
		// Bulk: remove all of them under the active owner in one call.
		// ownerId is supplied from ctx.session.ownerId — omitted from the HTTP surface.
		body: RemoveMemberInputSchema.omit({ ownerId: true }),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: { ids: ['019e4d25-7c1f-7041-9e1c-8108180cddae'] },
		},
	])

export const RemoveMemberControllerOutputSchema = z.void()

@injectable()
export class RemoveMemberController extends Controller<
	typeof RemoveMemberControllerInputSchema,
	typeof RemoveMemberControllerOutputSchema
> {
	readonly path = '/owners/memberships'
	readonly method = 'delete' as const
	readonly description = 'Remove one or more owner members (C17 RemoveMember; LAST_OWNER guarded)'
	readonly inputSchema = RemoveMemberControllerInputSchema
	readonly outputSchema = RemoveMemberControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireOwnerMember, RequireOwnerRole([Role.RESPONSIBLE, Role.ADMIN])]

	constructor(private removeMember: RemoveMember) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.removeMember.execute({
			ownerId: request.ctx.session.ownerId,
			ids: request.body.ids,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
