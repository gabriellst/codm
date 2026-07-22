// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/integration/controllers/ConnectIntegration.ts

import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { ConnectionMode, Role, SalesPlatform, StoreIntegrationType } from '@codedm/contracts-typescript/wire/enums'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { RequireStoreRole } from '@tenancy/middlewares/RequireStoreRole'
import { ConnectIntegration, ConnectIntegrationBodySchema, ConnectIntegrationOutputSchema } from '../usecases/ConnectIntegration'

// Body = the use case's ConnectIntegrationBodySchema: the registry-derived
// connect union (one leaf per connectionMode × type × platform, each with its
// mode-specific credential fields) without the server-injected storeId/userId —
// storeId comes from the session's active store (RequireStoreMember), userId from the session.
// Sourced from the use case so the SDK exposes the precise per-platform shapes, not a loose record.
export const ConnectIntegrationControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ storeId: z.uuid() }),
		}),
		body: ConnectIntegrationBodySchema,
	})
	.example([
		{
			ctx: {
				user: { id: 'user-123' },
				session: { storeId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			},
			body: {
				connectionMode: ConnectionMode.CREDENTIALS,
				type: StoreIntegrationType.SALES_CHANNEL,
				platform: SalesPlatform.SHOPIFY,
				credentials: { shopDomain: 'acme.myshopify.com', clientId: 'shp_api_key', clientSecret: 'shp_secret' },
			},
		},
	])

export const ConnectIntegrationControllerOutputSchema = ConnectIntegrationOutputSchema.example([
	{
		storeIntegrationId: '019e4d24-7000-7041-9e1c-8108180cddae',
		active: true,
		externalId: 'acme.myshopify.com',
		displayName: 'Acme Store',
	},
])

/**
 * C21 ConnectIntegration. POST /integrations.
 *
 * 201 on success — the integration is persisted only after the exchange AND the
 * handshake both pass. Any failure (bad oauth code, revoked credentials,
 * insufficient scopes, unreachable provider) throws a named error that the error
 * middleware maps to a 4xx/5xx, leaving no row or event behind.
 */
@injectable()
export class ConnectIntegrationController extends Controller<
	typeof ConnectIntegrationControllerInputSchema,
	typeof ConnectIntegrationControllerOutputSchema
> {
	readonly path = '/integrations'
	readonly method = 'post' as const
	readonly description = 'Connect a provider integration to the store (C21 ConnectIntegration)'
	readonly inputSchema = ConnectIntegrationControllerInputSchema
	readonly outputSchema = ConnectIntegrationControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember, RequireStoreRole([Role.OWNER, Role.ADMIN])]

	constructor(private connect: ConnectIntegration) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		// Body is already the precise connect union; merge the server-injected
		// coordinate (storeId from the session's active store, userId from the session)
		// to form the use case input — no cast, the union narrows by connectionMode downstream.
		const data = await this.connect.execute({
			...request.body,
			storeId: request.ctx.session.storeId,
			userId: request.ctx.user.id,
		})
		return {
			status: HttpStatusCode.CREATED,
			data,
		}
	}
}
