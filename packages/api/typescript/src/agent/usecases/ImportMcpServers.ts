import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpServer } from '../entities/McpServer'
import { McpServerRepository } from '../repositories/McpServerRepository'
import type { AgentApplicationErrors } from '../errors'

const ImportEntrySchema = z.object({
	key: z.string(),
	transport: z.enum(McpTransport),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	url: z.string().optional(),
	/**
	 * Os NOMES das variáveis de ambiente, sem valor.
	 *
	 * É `envKeys`, e não `env`, DE PROPÓSITO — o contrato desta operação é "traga a forma, não o
	 * segredo". Aceitar `env` aqui abriria um caminho pelo qual um token viajaria do arquivo do dono
	 * para o nosso banco sem que ele tivesse digitado nada, que é exatamente a decisão que o founder
	 * tomou ao contrário (04/09/2026). O valor é preenchido depois, pelo dono, via `UpdateMcpServer`.
	 */
	envKeys: z.array(z.string()).optional(),
	headerKeys: z.array(z.string()).optional(),
})

export const ImportMcpServersInputSchema = z.object({
	ownerId: z.uuid(),
	entries: z.array(ImportEntrySchema).min(1),
	approvalPolicy: z.enum(McpApprovalPolicy).optional(),
})

export const ImportMcpServersOutputSchema = z.object({
	imported: z.array(z.object({ key: z.string(), mcpServerId: z.string() })),
})

/**
 * REGISTRA N SERVIDORES DE UMA VEZ, com os segredos ENTRANDO EM BRANCO.
 *
 * ### O segredo entra vazio, e essa é a decisão
 * Um `env: { GITHUB_TOKEN: '' }` no banco não é um valor faltando por descuido — é a FORMA preservada
 * com o valor deliberadamente ausente. O console já sabe lidar com isso: o `hasBlankSecret` do
 * formulário de reconfiguração (PR #56, Task T5) BLOQUEIA o salvar enquanto houver segredo em branco.
 * Reaproveitar aquele mecanismo em vez de inventar um segundo é o ponto: um servidor importado e um
 * servidor reconfigurado chegam ao dono no MESMO estado, com a MESMA trava, e ele não precisa
 * aprender duas regras.
 *
 * A alternativa — importar os valores — foi oferecida e recusada pelo founder. O motivo é que o dono
 * nunca VIU aquele token nesta sessão: ele estaria copiando um segredo de um arquivo para o nosso
 * SQLite por um caminho que não passou pelos olhos dele.
 *
 * ### Tudo ou nada
 * Uma transação só. Importar 4 de 6 e falhar no quinto deixaria o dono com um estado que ele não
 * pediu e não consegue nomear — e a lista de rejeições da prévia já existe exatamente para dizer, com
 * antecedência, o que não vai entrar. Uma falha AQUI é uma surpresa, e surpresa não se resolve pela
 * metade.
 */
@injectable()
export class ImportMcpServers extends Handler<typeof ImportMcpServersInputSchema, typeof ImportMcpServersOutputSchema> {
	readonly name = 'import_mcp_servers' as const
	readonly inputSchema = ImportMcpServersInputSchema
	readonly outputSchema = ImportMcpServersOutputSchema

	constructor(private servers: McpServerRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// A checagem de colisão acontece ANTES de qualquer escrita, para as seis entradas: com uma
		// transação única, descobrir a colisão no meio custaria o rollback de tudo que já passou. A
		// prévia já recusa o que existe (`ALREADY_REGISTERED`), então chegar aqui com uma key tomada
		// significa que o mundo mudou entre a prévia e a confirmação — raro, e ainda assim nomeado.
		for (const entry of input.entries) {
			const existing = await this.servers.findByKey(input.ownerId, entry.key, tx)
			if (existing)
				throw new BaseError<AgentApplicationErrors>(
					'MCP_SERVER_KEY_CONFLICT',
					`an MCP server with key "${entry.key}" is already registered`,
				)
		}

		const servers = input.entries.map(entry =>
			McpServer.create({
				ownerId: input.ownerId,
				key: entry.key,
				transport: entry.transport,
				command: entry.command,
				args: entry.args,
				url: entry.url,
				approvalPolicy: input.approvalPolicy,
				// A forma sem o valor: cada nome vira uma entrada de valor vazio.
				env: blanks(entry.envKeys),
				headers: blanks(entry.headerKeys),
			}),
		)

		try {
			await this.withTransaction(tx, async tx => {
				for (const server of servers) await this.servers.save(server, tx)
			})
		} catch (error) {
			// A REDE PARA A CORRIDA, igual à do `RegisterMcpServer` e pelo mesmo motivo: a checagem acima
			// é o caminho normal e devolve o erro nomeado sem gastar escrita, mas dois imports simultâneos
			// da mesma key passam OS DOIS pela leitura, e só o índice único os separa. Sem este catch o
			// dono receberia um erro cru do driver (500) no lugar do 409 que o contrato promete.
			//
			// NÃO VERIFICADO, e dito aqui em vez de suposto: o casamento por mensagem é a forma do driver
			// de PRODUÇÃO (SQLite/LibSQL), e removendo a checagem prévia para prova vermelha o erro que
			// sobe no ambiente de teste NÃO cai neste `if`. Ou seja: este ramo não é exercitado pela
			// suíte. Ele existe porque a janela de corrida é real e o irmão `RegisterMcpServer` a cobre
			// do mesmo jeito — copiar a forma dele é melhor que inventar uma segunda, mas a cobertura é
			// dívida declarada, não fato.
			if (error instanceof Error && error.message.includes('agent_mcp_servers.owner_id') && error.message.includes('agent_mcp_servers.key'))
				throw new BaseError<AgentApplicationErrors>('MCP_SERVER_KEY_CONFLICT', 'an MCP server with one of those keys is already registered')
			throw error
		}

		return { imported: servers.map(server => ({ key: server.key, mcpServerId: server.id.value })) }
	}
}

/**
 * `['A','B']` → `{ A: '', B: '' }`, e `undefined` quando não há nome nenhum.
 *
 * O `undefined` importa: um `{}` gravado é diferente de "este servidor não tem env", e a entidade
 * distingue os dois. Um record vazio faria a tela mostrar uma seção de variáveis sem variáveis.
 */
function blanks(keys: readonly string[] | undefined): Record<string, string> | undefined {
	if (!keys || keys.length === 0) return undefined
	return Object.fromEntries(keys.map(key => [key, '']))
}
