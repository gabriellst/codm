// packages/api/typescript/src/agent/controllers/RegisterMcpServer.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { MCP_SERVER_KEY_PATTERN } from '../entities/McpServer'
import { RegisterMcpServer, RegisterMcpServerOutputSchema } from '../usecases/RegisterMcpServer'

/**
 * O BODY é uma UNIÃO DISCRIMINADA de verdade, e é aqui que ela precisa existir.
 *
 * A entidade guarda a mesma regra como invariante sobre um objeto plano (ver o docblock de
 * `McpServerSchema`), porque `AggregateRoot` exige um ZodObject. Mas é ESTE schema que vira a OpenAPI,
 * a SDK e o validador do form no console — e um form achatado, com `command` e `url` ambos opcionais,
 * é exatamente o que `FRM-P43`/`FRM-P44` proíbem. Com a união, o console lê o discriminante, troca a
 * variante, e cada variante valida contra seu membro concreto.
 */
const StdioConfigSchema = z.object({
	transport: z.literal(McpTransport.STDIO),
	command: z.string().trim().min(1),
	args: z.array(z.string()).default([]),
	env: z.record(z.string(), z.string()).optional(),
})
const HttpConfigSchema = z.object({
	transport: z.literal(McpTransport.HTTP),
	url: z.url(),
	headers: z.record(z.string(), z.string()).optional(),
})
export const McpServerConfigSchema = z.discriminatedUnion('transport', [StdioConfigSchema, HttpConfigSchema])

export const RegisterMcpServerControllerInputSchema = z
	.object({
		ctx: z.object({ session: z.object({ ownerId: z.string() }) }),
		body: z.intersection(
			z.object({
				// O padrão vem da entidade (`MCP_SERVER_KEY_PATTERN`), nunca redigitado aqui: duas cópias
				// do mesmo regex divergem no primeiro que alguém mudar, e esta seria a pior divergência
				// possível — entre o que o controller ACEITA e o que a entidade VALIDA.
				key: z.string().regex(MCP_SERVER_KEY_PATTERN),
				approvalPolicy: z.enum(McpApprovalPolicy).optional(),
			}),
			McpServerConfigSchema,
		),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cdd01' } },
			body: { key: 'playwright', transport: McpTransport.STDIO, command: 'npx', args: ['-y', '@playwright/mcp'] },
		},
	])
export const RegisterMcpServerControllerOutputSchema = RegisterMcpServerOutputSchema.example([
	{ mcpServerId: '019e4d24-6524-7041-9e1c-8108180cdd0a' },
])

@injectable()
export class RegisterMcpServerController extends Controller<
	typeof RegisterMcpServerControllerInputSchema,
	typeof RegisterMcpServerControllerOutputSchema
> {
	readonly path = '/mcp-servers'
	readonly method = 'post' as const
	readonly description = 'Register a third-party MCP server for this owner'
	readonly inputSchema = RegisterMcpServerControllerInputSchema
	readonly outputSchema = RegisterMcpServerControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private usecase: RegisterMcpServer) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.usecase.execute({ ownerId: request.ctx.session.ownerId, ...request.body })
		return { status: HttpStatusCode.CREATED, data }
	}
}
