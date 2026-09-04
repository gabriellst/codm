// packages/api/typescript/src/agent/services/McpUpstreamRegistry/DefaultMcpUpstreamRegistry.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { BaseError, LoggingService, PROCESS_TREES, z } from '@codm/core-typescript'
import type { AgentDomainErrors } from '../../errors'
import type { McpServer } from '../../entities/McpServer'
import { McpServerRepository } from '../../repositories/McpServerRepository'
import { McpUpstreamRegistry, type UpstreamCallResult, type UpstreamTool } from './McpUpstreamRegistry'

/**
 * O env do processo filho — a allowlist do SDK, mais o que o DONO declarou. Nada além disso.
 *
 * A versão anterior copiava `process.env` INTEIRO e justificava outra coisa (evitar que uma
 * variável ausente virasse a string `"undefined"`). Isso resolvia um problema de tipo e criava um
 * de segurança: `StdioClientTransport` já monta o env do filho a partir de `getDefaultEnvironment()`
 * — uma allowlist deliberada, com o comentário *"inspired by the default env inheritance of sudo"* —
 * e passar um env explícito SOBRESCREVE essa proteção.
 *
 * O que ia junto: `JWT_SECRET`, `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_KEY`, a URL do Postgres da
 * nuvem com senha e os segredos de OAuth. Para um processo de TERCEIRO, spawnado a partir de um
 * `npx <pacote>` que o dono digitou num formulário. O spec gasta a decisão 14 inteira cercando o
 * raio de ação de prompt-injection→shell; entregar os segredos por env ao mesmo raio contradiz o
 * próprio modelo de ameaça.
 *
 * Se um servidor precisar de mais que a allowlist, isso é campo DECLARADO no cadastro (`server.env`,
 * que continua passando por cima), nunca herança silenciosa.
 */
export function childEnv(extra?: Record<string, string>): Record<string, string> {
	return { ...getDefaultEnvironment(), ...(extra ?? {}) }
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
 * A chave de cache de um servidor — SEMPRE o par (dono, key), nunca a key sozinha.
 *
 * A versão anterior cacheava só por `server.key`, e `key` é único POR DONO
 * (`MCP_SERVER_KEY_CONFLICT` checa `(ownerId, key)`, não `key` global) — então dois donos com a mesma
 * key ("playwright", o exemplo óbvio) compartilhariam cliente, transporte e cache de ferramentas.
 * Um cruzamento entre donos esperando para acontecer, não um bug hipotético.
 */
function cacheKey(ownerId: string, serverKey: string): string {
	return `${ownerId}::${serverKey}`
}

/**
 * Uma conexão viva por servidor habilitado, criada sob demanda e reaproveitada entre requisições.
 *
 * DIFERENTE do servidor gerado, que o door constrói FRESCO a cada request porque o transporte
 * stateless do lado servidor proíbe reúso. Aqui é o oposto: cada conexão é um PROCESSO (ou um socket),
 * e recriá-la por chamada pagaria um spawn de Node por `tools/call` — em Playwright, dezenas por
 * tarefa. O que o reúso obriga em troca é `shutdown`, e é por isso que ele está no contrato.
 *
 * DOIS CACHES A MAIS além do cliente, e o porquê de cada um (Task T8, §2 da revisão do PR-56):
 *
 * - `connecting` — um `Map<string, Promise<Client>>` de conexões EM VOO, consultado ANTES de
 *   spawnar. Duas chamadas paralelas de ferramenta contra o mesmo servidor ainda-não-conectado — o
 *   caso COMUM de uso paralelo, não o exótico — entravam as duas em `connect()` antes de qualquer
 *   `await` resolver: a segunda sobrescrevia `clients`/`transports` e a primeira ficava órfã,
 *   invisível a `shutdown()`. Como `Map.get`/`.set` são síncronos, registrar a promessa em voo antes
 *   do primeiro `await` fecha a janela — a segunda chamada encontra e aguarda a MESMA promessa.
 * - `toolsCache` — as ferramentas do último `tools/list` bem-sucedido, por chave. Sem isso, toda
 *   montagem de transporte (inclusive para chamar as NOSSAS ferramentas) reconsultava TODO upstream
 *   habilitado — um upstream HTTP inalcançável podia segurar `GetSettings` e o door até o timeout do
 *   SDK. `evict()` é a única porta de invalidação: uma falha (`catch` em `safeListTools`) nunca
 *   escreve no cache, para que o próximo `listTools` tente de novo em vez de fixar um erro transitório.
 */
@injectable()
export class DefaultMcpUpstreamRegistry extends McpUpstreamRegistry {
	private readonly clients = new Map<string, Client>()
	private readonly transports = new Map<string, StdioClientTransport>()
	private readonly connecting = new Map<string, Promise<Client>>()
	private readonly toolsCache = new Map<string, UpstreamTool[]>()

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

	async evict(ownerId: string, serverKey: string): Promise<void> {
		const key = cacheKey(ownerId, serverKey)
		const client = this.clients.get(key)
		if (client) {
			// Mesma ordem de `shutdown()`, e pelo mesmo motivo: o pid tem de ser lido ANTES do close,
			// nunca depois — `StdioClientTransport.close()` zera `this._process` de forma SÍNCRONA antes
			// de esperar qualquer coisa.
			const pid = this.transports.get(key)?.pid
			await client.close().catch(() => undefined)
			if (pid) PROCESS_TREES[process.platform].terminateByPid(pid, 2000)
		}
		this.clients.delete(key)
		this.transports.delete(key)
		this.toolsCache.delete(key)
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
			// `dist/esm/client/stdio.js:146`).
			//
			// `terminateByPid`, e não `terminate`: o `terminate` espera um `TreeRoot` — um filho que
			// NÓS adotamos, com `kill` de verdade e `spawnOptions` aplicadas. Nenhuma das duas coisas
			// existe aqui, porque quem spawna é o SDK, com opções fixas. A versão anterior contornava
			// isso passando um `TreeRoot` FABRICADO (`kill: () => true`) — e o `kill` de fallback do
			// POSIX, que é justamente o que roda quando o sinal de grupo falha, caía num no-op. Nenhum
			// sinal era entregue nunca; o único teardown real era o `close` fechar o stdin, que não
			// alcança neto nenhum.
			const pid = this.transports.get(key)?.pid
			await client.close().catch(() => undefined)
			if (pid) tree.terminateByPid(pid, 2000)
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
		const key = cacheKey(server.ownerId, server.key)
		const cached = this.toolsCache.get(key)
		if (cached) return cached

		try {
			const client = await this.connect(server)
			const { tools } = await client.listTools()
			const mapped = tools.map(tool => ({
				serverKey: server.key,
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
				approvalPolicy: server.approvalPolicy,
			}))
			// SÓ o sucesso entra no cache. Uma falha transitória (upstream ainda subindo, rede
			// momentaneamente fora) não pode virar um erro FIXO até o próximo `evict` — o próximo
			// `listTools` tenta de novo, exatamente como se não houvesse cache nenhum.
			this.toolsCache.set(key, mapped)
			return mapped
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
		const key = cacheKey(server.ownerId, server.key)
		const cached = this.clients.get(key)
		if (cached) return cached

		// Uma conexão já EM VOO para esta chave é devolvida como está — sem isso, duas chamadas
		// paralelas contra o mesmo servidor ainda-não-conectado entrariam as duas no `connect()` de
		// baixo, e a segunda sobrescreveria `clients`/`transports` da primeira antes dela terminar,
		// deixando o processo da primeira órfão (invisível a `shutdown()`). `Map.get`/`.set` são
		// síncronos, então registrar a promessa ANTES do primeiro `await` fecha essa janela.
		const inFlight = this.connecting.get(key)
		if (inFlight) return inFlight

		const promise = this.doConnect(server, key)
		this.connecting.set(key, promise)
		try {
			return await promise
		} finally {
			// Falha ou sucesso, a corrida acabou: uma falha não pode deixar uma promessa REJEITADA presa
			// no cache para sempre — a próxima tentativa tem de poder spawnar de novo.
			this.connecting.delete(key)
		}
	}

	private async doConnect(server: McpServer, key: string): Promise<Client> {
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
				// SEM `spawnOptions` AQUI, e a ausência é o fato — não um esquecimento.
				//
				// MEDIDO no SDK (`dist/cjs/client/stdio.js:72`): `StdioClientTransport` monta um objeto
				// FECHADO para o `cross-spawn` — `{ env, stdio, shell: false, windowsHide, cwd }` — lendo
				// dos parâmetros apenas `command`, `args`, `env`, `stderr` e `cwd`. `detached` NUNCA é
				// repassado. Espalhar `spawnOptions` aqui era inerte E enganoso: sugeria que o upstream
				// virava líder de grupo, quando ele nasce no grupo do PRÓPRIO daemon.
				//
				// É por isso que o teardown deste registry usa `terminateByPid` (árvore por snapshot do
				// `ps`) em vez do sinal de grupo do `terminate`: não existe grupo para sinalizar, e
				// `process.kill(-pid)` aqui alcançaria o grupo do daemon.
			})
			await client.connect(transport)
			this.transports.set(key, transport)
		} else {
			if (!server.url) throw new BaseError<AgentDomainErrors>('MCP_SERVER_TRANSPORT_INCOMPLETE', server.key)
			await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers ?? {} } }))
		}

		this.clients.set(key, client)
		return client
	}
}
