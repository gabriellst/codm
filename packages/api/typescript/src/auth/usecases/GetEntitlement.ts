import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@codm/core-typescript'
import { DeviceToken } from '../entities/DeviceToken'
import { DeviceTokenRepository } from '../repositories/DeviceTokenRepository'
import type { ApplicationErrors } from '../errors'

export const GetEntitlementInputSchema = z.object({
	token: z.string(),
})

export const GetEntitlementOutputSchema = z.object({
	active: z.literal(true),
	// LITERAL, not an enum — the founder's pivot (spec decision 1) cut every paid tier; there is no
	// plans table and none is planned. A second plan means this schema changes, not that a value gets
	// added to a set.
	plan: z.literal('free'),
	userId: z.uuid(),
})

/**
 * Resolves a Bearer device token to "does this install get to run" — the whole of entitlement post-
 * pivot (spec decision 1: "tem conta e o token é válido"). A read, not a mutation: no transaction, no
 * withTransaction — same posture as GetArtifactContent.
 */
@injectable()
export class GetEntitlement extends Handler<typeof GetEntitlementInputSchema, typeof GetEntitlementOutputSchema> {
	readonly name = 'get_entitlement' as const
	readonly inputSchema = GetEntitlementInputSchema
	readonly outputSchema = GetEntitlementOutputSchema

	constructor(private readonly deviceTokens: DeviceTokenRepository) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const entity = await this.deviceTokens.findByHash(DeviceToken.hashOf(input.token))
		// Not found and revoked answer the SAME code — see errors/index.ts DEVICE_TOKEN_INVALID note.
		if (!entity || entity.isRevoked()) throw new BaseError<ApplicationErrors>('DEVICE_TOKEN_INVALID')

		return { active: true, plan: 'free', userId: entity.userId.value }
	}
}
