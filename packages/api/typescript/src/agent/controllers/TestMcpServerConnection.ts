import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import {
	TestMcpServerConnection,
	TestMcpServerConnectionInputSchema,
	TestMcpServerConnectionOutputSchema,
} from '../usecases/TestMcpServerConnection'

export const TestMcpServerConnectionControllerInputSchema = z
	.object({
		// A sessão é exigida mesmo sem `ownerId` no corpo: esta porta SPAWNA UM PROCESSO com o comando
		// que o corpo trouxer, e uma porta dessas não fica aberta para quem não está autenticado.
		ctx: z.object({ session: z.object({ ownerId: z.string() }) }),
		body: TestMcpServerConnectionInputSchema,
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cdd01' } },
			body: { key: 'everything', transport: McpTransport.STDIO, command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'] },
		},
	])

export const TestMcpServerConnectionControllerOutputSchema = TestMcpServerConnectionOutputSchema.example([
	{ ok: true, tools: ['echo', 'get-sum'] },
])

/**
 * Testa a conexão de uma configuração AINDA NÃO SALVA e devolve as ferramentas — ou o motivo.
 *
 * Responde 200 mesmo quando `ok` é falso, e isso é deliberado: a operação SUCEDEU em descobrir que a
 * configuração não conecta. Um 4xx/5xx aqui diria "a requisição falhou", que é outra coisa — e o
 * cliente teria de distinguir "não consegui perguntar" de "perguntei e a resposta é não".
 */
@injectable()
export class TestMcpServerConnectionController extends Controller<
	typeof TestMcpServerConnectionControllerInputSchema,
	typeof TestMcpServerConnectionControllerOutputSchema
> {
	readonly path = '/mcp-servers/test-connection'
	readonly method = 'post' as const
	readonly description = 'Connect to an unsaved MCP server config and report its tools, or why it failed'
	readonly inputSchema = TestMcpServerConnectionControllerInputSchema
	readonly outputSchema = TestMcpServerConnectionControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private usecase: TestMcpServerConnection) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: await this.usecase.execute(request.body) }
	}
}
