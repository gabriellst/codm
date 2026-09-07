import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpUpstreamRegistry } from '../services/McpUpstreamRegistry'

export const TestMcpServerConnectionInputSchema = z.object({
	key: z.string(),
	transport: z.enum(McpTransport),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string(), z.string()).optional(),
	url: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
})

export const TestMcpServerConnectionOutputSchema = z.object({
	ok: z.boolean(),
	/** Os NOMES das ferramentas publicadas. Vazio quando `ok` é falso. */
	tools: z.array(z.string()),
	/**
	 * O MOTIVO da falha, em texto, quando `ok` é falso.
	 *
	 * É o campo que justifica esta operação existir. Hoje o dono salva e descobre "não alcançável",
	 * porque `GetSettings` computa `enabled && tools.length > 0` e o `safeListTools` engole a exceção
	 * devolvendo lista vazia — o MESMO sinal para "quebrado" e para "sem ferramentas". A informação
	 * existe (está no log desde a Task T13) e era descartada no caminho de volta.
	 */
	error: z.string().optional(),
})

/**
 * "ISTO CONECTA?" — perguntado ANTES de salvar.
 *
 * NÃO PERSISTE NADA e não recebe `ownerId`: não há linha a criar, não há dono a escopar, e a sonda é
 * derrubada antes de responder. O que ela executa é o comando que o dono acabou de digitar — o mesmo
 * que o cadastro executaria, só que agora ele vê o resultado antes de comprometer estado.
 *
 * O segredo aqui é o VALOR de verdade, diferente do import: o dono digitou-o nesta tela, nesta
 * sessão, para testar. Ele não é gravado — chega, é usado na conexão, e morre com a sonda.
 */
@injectable()
export class TestMcpServerConnection extends Handler<
	typeof TestMcpServerConnectionInputSchema,
	typeof TestMcpServerConnectionOutputSchema
> {
	readonly name = 'test_mcp_server_connection' as const
	readonly inputSchema = TestMcpServerConnectionInputSchema
	readonly outputSchema = TestMcpServerConnectionOutputSchema

	constructor(private readonly upstream: McpUpstreamRegistry) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const result = await this.upstream.probe(input)
		return result.ok ? { ok: true, tools: result.tools.map(tool => tool.name) } : { ok: false, tools: [], error: result.error }
	}
}
