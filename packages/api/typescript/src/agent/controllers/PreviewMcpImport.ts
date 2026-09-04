import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpConfigSource, McpImportRejection, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { PreviewMcpImport, PreviewMcpImportOutputSchema } from '../usecases/PreviewMcpImport'

export const PreviewMcpImportControllerInputSchema = z
	.object({
		ctx: z.object({ session: z.object({ ownerId: z.string() }) }),
		body: z.object({
			workspacePath: z.string().optional(),
			pasted: z.string().optional(),
		}),
	})
	.example([{ ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cdd01' } }, body: { workspacePath: '/Users/eu/repo' } }])

export const PreviewMcpImportControllerOutputSchema = PreviewMcpImportOutputSchema.example([
	{
		sources: [
			{
				source: McpConfigSource.WORKSPACE_FILE,
				path: '/Users/eu/repo/.mcp.json',
				candidates: [
					{
						key: 'playwright',
						transport: McpTransport.STDIO,
						command: 'npx',
						args: ['-y', '@playwright/mcp'],
						envKeys: [],
						headerKeys: [],
					},
				],
				rejections: [{ key: 'legado', reason: McpImportRejection.UNSUPPORTED_TRANSPORT, detail: 'sse' }],
			},
		],
	},
])

/**
 * A prévia do import: o que existe para importar, e o que foi recusado com o motivo.
 *
 * POST NUMA LEITURA, e a escolha tem razão em vez de descuido: o corpo carrega o documento COLADO
 * pelo dono, que é um JSON inteiro de configuração — a query string tem limite prático de tamanho e
 * o conteúdo pode conter qualquer coisa que precise de escaping. Um GET com esse payload seria um
 * corpo disfarçado de URL. Nada é escrito aqui: o registro é `ImportMcpServers`, outro caso de uso,
 * e a separação é o que dá ao dono a chance de ver antes de confirmar.
 */
@injectable()
export class PreviewMcpImportController extends Controller<
	typeof PreviewMcpImportControllerInputSchema,
	typeof PreviewMcpImportControllerOutputSchema
> {
	readonly path = '/mcp-servers/import/preview'
	readonly method = 'post' as const
	readonly description = 'Preview which MCP servers can be imported, and which were rejected and why'
	readonly inputSchema = PreviewMcpImportControllerInputSchema
	readonly outputSchema = PreviewMcpImportControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private usecase: PreviewMcpImport) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.usecase.execute({ ownerId: request.ctx.session.ownerId, ...request.body })
		return { status: HttpStatusCode.OK, data }
	}
}
