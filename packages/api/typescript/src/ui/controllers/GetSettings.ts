import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpApprovalPolicy, McpScope, McpTransport, ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { GetSettings, GetSettingsOutputSchema } from '../usecases/GetSettings'

export const GetSettingsControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const GetSettingsControllerOutputSchema = GetSettingsOutputSchema.example([
	{
		providers: [
			{ provider: ProviderKind.CLAUDE_CODE, status: ProviderStatus.DETECTED, available: true, comingSoon: false, version: '1.2.3' },
		],
		mcpServers: [
			{
				id: '019e4d24-6524-7041-9e1c-8108180cdd02',
				key: 'playwright',
				transport: McpTransport.STDIO,
				command: 'npx',
				args: ['-y', '@playwright/mcp'],
				envKeys: [],
				headerKeys: [],
				enabled: true,
				approvalPolicy: McpApprovalPolicy.ASK,
			},
		],
		stopCriteria: {
			serverErrors: true,
			blockedByClassification: true,
			humanRequested: true,
			approvalNeeded: true,
			authRequired: true,
		},
		general: { operatorName: 'Ada Lovelace', timezone: 'America/Sao_Paulo', dataDir: '/home/ada/.codm' },
		appVersion: '0.1.10',
	},
])

@injectable()
export class GetSettingsController extends Controller<typeof GetSettingsControllerInputSchema, typeof GetSettingsControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/ui/settings'
	readonly method = 'get' as const
	readonly description = 'Settings — providers, stop criteria, general, app version (T08)'
	readonly inputSchema = GetSettingsControllerInputSchema
	readonly outputSchema = GetSettingsControllerOutputSchema

	override middlewares = [CloudSessionMiddleware]

	constructor(private query: GetSettings) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
