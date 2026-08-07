import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { CloudSession } from '../services/CloudSession'

export const SetCloudTokenControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		body: z.object({ token: z.string().min(1) }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			body: { token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
		},
	])

export const SetCloudTokenControllerOutputSchema = z.void()

/**
 * The console's half of the login handoff (T6 → T7, spec decisions 4-5): once the desktop trades its
 * one-time deep-link code for a device token (`POST /v1/cloud/devices/exchange`, T2), it PUSHES the
 * plaintext HERE so the local daemon's `CloudSession` — the thing `DrizzleMailboxDispatcher` gates
 * every turn on — picks it up without a restart (AC-3). The exchange happens in the react console
 * process, not this daemon, so the token has to cross that process boundary somehow; this endpoint is
 * the crossing.
 *
 * OperatorMiddleware-gated like every other local-only endpoint (`AddWorkspace`, `DetectProviders`,
 * …): the caller is this machine's own console, never the cloud — CloudSession itself is process-wide
 * (one operator per daemon, spec "sem multi-conta por máquina"), so `ctx.ownerId` is validated but
 * unused, same posture as DetectProviders.
 */
@injectable()
export class SetCloudTokenController extends Controller<
	typeof SetCloudTokenControllerInputSchema,
	typeof SetCloudTokenControllerOutputSchema
> {
	readonly path = '/session/cloud-token'
	readonly method = 'post' as const
	readonly description = "Push a freshly-exchanged device token into the local daemon's CloudSession cache"
	readonly inputSchema = SetCloudTokenControllerInputSchema
	readonly outputSchema = SetCloudTokenControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private readonly cloudSession: CloudSession) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		this.cloudSession.setToken(request.body.token)
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
