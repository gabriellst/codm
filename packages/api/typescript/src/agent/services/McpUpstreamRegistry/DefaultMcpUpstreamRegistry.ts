// packages/api/typescript/src/agent/services/McpUpstreamRegistry/DefaultMcpUpstreamRegistry.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { BaseError, LoggingService, PROCESS_TREES, z } from '@codm/core-typescript'
import type { AgentDomainErrors } from '../../errors'
import type { McpServer } from '../../entities/McpServer'
import { McpServerRepository } from '../../repositories/McpServerRepository'
import { McpUpstreamRegistry, type UpstreamCallResult, type UpstreamTool } from './McpUpstreamRegistry'

/**
 * O env do processo filho, montado sem `as`.
 *
 * `process.env` é `Record<string, string | undefined>` e o transporte stdio pede
 * `Record<string, string>`. Um cast faria a diferença sumir do TIPO em vez de tratá-la, e uma variável
 * ausente chegaria ao servidor MCP como a string literal `"undefined"` — o tipo de defeito que só
 * aparece quando alguém depura por que o token não autenticou. A narrowing depois do filtro é
 * verdadeira, e é a única no arquivo.
 */
function childEnv(extra?: Record<string, string>): Record<string, string> {
	const base: Record<string, string> = {}
	for (const [key, value] of Object.entries(process.env)) if (value !== undefined) base[key] = value
	return { ...base, ...(extra ?? {}) }
}

/**
 * A forma que ESTE serviço consome do resultado de um `tools/call` upstream — os dois campos que
 * `UpstreamCallResult` declara, e nada mais.
 *
 * Existe para que a ponte entre o tipo do SDK e o nosso não precise de asserção: o `parse` devolve o
 * tipo inferido, que é o nosso contrato. `looseObject` porque o resto do payload do upstream não nos
 * interessa, e descartar campos que o protocolo pode acrescentar amanhã seria uma decisão nossa que o
 * contrato não pediu.
 */
const UPSTREAM_CALL_RESULT_SCHEMA = z.looseObject({ content: z.array(z.unknown()), isError: z.boolean().optional() })

/**
 * Uma conexão viva por servidor habilitado, criada sob demanda e reaproveitada entre requisições.
 *
 * DIFERENTE do servidor gerado, que o door constrói FRESCO a cada request porque o transporte
 * stateless do lado servidor proíbe reúso. Aqui é o oposto: cada conexão é um PROCESSO (ou um socket),
 * e recriá-la por chamada pagaria um spawn de Node por `tools/call` — em Playwright, dezenas por
 * tarefa. O que o reúso obriga em troca é `shutdown`, e é por isso que ele está no contrato.
 */
@injectable()
export class DefaultMcpUpstreamRegistry extends McpUpstreamRegistry {
	private readonly clients = new Map<string, Client>()
	private readonly transports = new Map<string, StdioClientTransport>()

	constructor(
		private servers: McpServerRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	async listTools(ownerId: string): Promise<UpstreamTool[]> {
		const enabled = await this.servers.listEnabledByOwner(ownerId)
		const lists = await Promise.all(enabled.map(server => this.safeListTools(server)))
		return lists.flat()
	}

	async call(input: { ownerId: string; serverKey: string; toolName: string; args: Record<string, unknown> }): Promise<UpstreamCallResult> {
		const server = await this.servers.findByKey(input.ownerId, input.serverKey)
		if (!server?.enabled) return { content: [{ type: 'text', text: `unknown MCP server "${input.serverKey}"` }], isError: true }

		const client = await this.connect(server)
		// `CallToolResultSchema` NAMED explicitly, not omitted: the SDK's default overload resolves to
		// `CompatibilityCallToolResultSchema`'s inferred type, a union with a LEGACY member that carries
		// `toolResult` instead of `content` — and TypeScript can only type a union-member access through
		// the constituents' common index signature (`[x: string]: unknown`), so `.content` reads as
		// `unknown` even on the modern shape. Naming the schema removes the legacy union member.
		//
		// O QUE FICAVA DE RESÍDUO, e por que não fica mais: aqui havia um
		// `as { content: unknown[]; isError?: boolean }` — estreito, depois da validação, e documentado
		// como "gap residual" do `$loose` do zod 4. Mesmo estreito é a forma proibida pelo primeiro
		// não-negociável: o defeito é de TIPO e a cura é dar um tipo, não calar o erro. E havia uma cura
		// óbvia, porque a FORMA QUE ESTE MÉTODO CONSOME É NOSSA: `UpstreamCallResult` declara dois
		// campos, então o parse pelo NOSSO schema devolve o nosso tipo inferido e a ponte com a forma do
		// SDK deixa de precisar de asserção. De brinde, o contorno fica mais estreito que o cast era: um
		// upstream que devolvesse `content` ausente passava pelo cast e estourava depois, no consumidor.
		const raw = await client.callTool({ name: input.toolName, arguments: input.args }, CallToolResultSchema)
		const result = UPSTREAM_CALL_RESULT_SCHEMA.parse(raw)
		return { content: result.content, isError: result.isError === true }
	}

	async shutdown(): Promise<void> {
		const tree = PROCESS_TREES[process.platform]
		for (const [key, client] of this.clients) {
			// O pid é lido ANTES do close, nunca depois: `StdioClientTransport.close()` zera
			// `this._process` de forma SÍNCRONA antes de esperar qualquer coisa (medido no SDK,
			// `dist/esm/client/stdio.js:146`), e `get pid()` é `this._process?.pid ?? null` — ler
			// depois do await sempre devolve `null`, o `if (pid)` nunca entra, e `tree.terminate`
			// nunca roda. É a causa raiz do vazamento que o T11 reportou.
			const pid = this.transports.get(key)?.pid
			await client.close().catch(() => undefined)
			// `client.close()` fecha o stdio; o TREE é o que alcança os netos que o servidor spawnou
			// (um MCP de navegador abre o próprio browser). Matar só o filho direto vaza o browser.
			if (pid) tree.terminate({ pid, kill: () => true, exitCode: null, signalCode: null }, Promise.resolve(), 2000)
		}
		this.clients.clear()
		this.transports.clear()
	}

	/**
	 * Um upstream quebrado devolve LISTA VAZIA, nunca uma exceção que suba até a porta. Um servidor mal
	 * configurado não pode deixar o agente sem NENHUMA ferramenta — inclusive sem as nossas, que é o
	 * que aconteceria se este erro propagasse para o `tools/list`.
	 *
	 * E devolver lista vazia é METADE do contrato: o AC-15 pede que a falha fique VISÍVEL. Um `catch`
	 * mudo aqui produz exatamente o defeito mais caro de diagnosticar deste recurso — o agente roda
	 * sem a ferramenta que o dono cadastrou, a tela de settings mostra `reachable: false` sem dizer
	 * por quê, e não há nada no log que nomeie a causa. Vai pelo `LoggingService` INJETADO e não por
	 * um `console.warn`: é o que `tests/architecture/console-discipline.test.ts` exige de uma classe
	 * `@injectable()` resolvida do container, e é o único caminho que chega ao Loki com correlação de
	 * trace — que é onde um servidor MCP quebrado numa máquina sem ninguém olhando é diagnosticado.
	 */
	private async safeListTools(server: McpServer): Promise<UpstreamTool[]> {
		try {
			const client = await this.connect(server)
			const { tools } = await client.listTools()
			return tools.map(tool => ({
				serverKey: server.key,
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
				approvalPolicy: server.approvalPolicy,
			}))
		} catch (error) {
			this.logging.warn({
				content: {
					serverKey: server.key,
					transport: server.transport,
					message: 'upstream MCP server unreachable — its tools are absent from this run',
					error: error instanceof Error ? error.message : String(error),
				},
			})
			return []
		}
	}

	private async connect(server: McpServer): Promise<Client> {
		const cached = this.clients.get(server.key)
		if (cached) return cached

		const client = new Client({ name: 'codm', version: '1.0.0' }, { capabilities: {} })
		// Sem `!`: a entidade garante o campo por transporte via `.refine()`, mas o TIPO não carrega
		// essa garantia, e uma asserção esconderia exatamente o caso que a garantia protege. Um
		// servidor incoerente é recusado aqui com o mesmo código de domínio que o schema nomeia.
		if (server.transport === McpTransport.STDIO) {
			if (!server.command) throw new BaseError<AgentDomainErrors>('MCP_SERVER_TRANSPORT_INCOMPLETE', server.key)
			const transport = new StdioClientTransport({
				command: server.command,
				args: [...(server.args ?? [])],
				env: childEnv(server.env),
				...PROCESS_TREES[process.platform].spawnOptions,
			})
			await client.connect(transport)
			this.transports.set(server.key, transport)
		} else {
			if (!server.url) throw new BaseError<AgentDomainErrors>('MCP_SERVER_TRANSPORT_INCOMPLETE', server.key)
			await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers ?? {} } }))
		}

		this.clients.set(server.key, client)
		return client
	}
}
