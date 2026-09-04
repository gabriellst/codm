import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ImportMcpServers, ImportMcpServersInputSchema, ImportMcpServersOutputSchema } from '../usecases/ImportMcpServers'

// Body COMPOSTO da entrada do use case menos o envelope — `ownerId` vem do middleware, como em
// `RegisterMcpServer`. Mesma porta, mesma forma.
export const ImportMcpServersControllerInputSchema = z
	.object({
		ctx: z.object({ session: z.object({ ownerId: z.string() }) }),
		body: ImportMcpServersInputSchema.omit({ ownerId: true }),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cdd01' } },
			body: {
				entries: [{ key: 'playwright', transport: McpTransport.STDIO, command: 'npx', args: ['-y', '@playwright/mcp'], envKeys: [] }],
				approvalPolicy: McpApprovalPolicy.ASK,
			},
		},
	])

export const ImportMcpServersControllerOutputSchema = ImportMcpServersOutputSchema.example([
	{ imported: [{ key: 'playwright', mcpServerId: '019e4d24-6524-7041-9e1c-8108180cddaf' }] },
])

/**
 * Importa os servidores que o dono ESCOLHEU na prévia.
 *
 * O corpo carrega `envKeys` / `headerKeys` — nomes, nunca valores. O contrato desta porta é "traga a
 * forma, não o segredo": o dono preenche os valores depois, no formulário, com o salvar bloqueado até
 * lá (o mesmo `hasBlankSecret` da reconfiguração).
 */
@injectable()
export class ImportMcpServersController extends Controller<
	typeof ImportMcpServersControllerInputSchema,
	typeof ImportMcpServersControllerOutputSchema
> {
	readonly path = '/mcp-servers/import'
	readonly method = 'post' as const
	readonly description = 'Import the chosen MCP servers, with secret NAMES only (values stay blank)'
	readonly inputSchema = ImportMcpServersControllerInputSchema
	readonly outputSchema = ImportMcpServersControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private usecase: ImportMcpServers) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.usecase.execute({ ownerId: request.ctx.session.ownerId, ...request.body })
		return { status: HttpStatusCode.CREATED, data }
	}
}
