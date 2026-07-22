// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { Role } from '../enums/Role'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { AcceptInvitation, AcceptInvitationInputSchema, AcceptInvitationOutputSchema } from '../usecases/AcceptInvitation'

export const AcceptInvitationControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
		}),
		// userId is supplied from ctx.user.id — omitted from the HTTP surface.
		body: AcceptInvitationInputSchema.omit({ userId: true }),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' } },
			body: { invitationToken: 'eyJzaWQiOiI...envelope...sig' },
		},
	])

export const AcceptInvitationControllerOutputSchema = AcceptInvitationOutputSchema.example([
	{
		ownerId: '019e4d24-6524-7041-9e1c-8108180cddae',
		role: Role.MEMBER,
	},
])

@injectable()
export class AcceptInvitationController extends Controller<
	typeof AcceptInvitationControllerInputSchema,
	typeof AcceptInvitationControllerOutputSchema
> {
	readonly path = '/memberships/accept'
	readonly method = 'post' as const
	readonly description = 'Accept a signed invitation envelope and create the OwnerMembership (C16)'
	readonly inputSchema = AcceptInvitationControllerInputSchema
	readonly outputSchema = AcceptInvitationControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private acceptInvitation: AcceptInvitation) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.acceptInvitation.execute({
			userId: request.ctx.user.id,
			invitationToken: request.body.invitationToken,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
