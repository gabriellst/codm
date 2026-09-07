// packages/api/typescript/src/agent/entities/McpServer.ts — arquivo final COMPLETO
import { AggregateRoot, z } from '@codm/core-typescript'
import type Z from 'zod'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import type { DomainErrors } from '../errors'

/**
 * A `key` é o NAMESPACE das ferramentas deste servidor dentro da nossa porta: uma ferramenta upstream
 * é registrada como `<key>__<tool>` e chega ao CLI como `mcp__codm__<key>__<tool>`. Por isso o formato
 * é invariante de domínio e não cosmética — uma key contendo `__` produziria um nome de fio ambíguo
 * (não dá para saber onde termina a key e começa a ferramenta), e uma com espaço produziria um nome
 * que o cliente MCP não consegue chamar.
 */
export const MCP_SERVER_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/

/**
 * `McpServer` — um servidor MCP de terceiro que o operador registrou nesta máquina.
 *
 * Agregado FINO, na forma de `Workspace`: as invariantes são o formato da key e a coerência do
 * transporte; a UNICIDADE da key é do banco (índice) mais a checagem em `RegisterMcpServer`, porque
 * duas requisições concorrentes passam por qualquer checagem feita só em memória.
 *
 * O schema é um objeto com `superRefine` e NÃO uma união discriminada, apesar de a obrigatoriedade dos
 * campos ser por transporte. Motivo: `AggregateRoot` é parametrizado por um ZodObject (precisa de
 * `.extend`/`.pick` para compor id, version e timestamps), e uma união não oferece essa superfície. A
 * união vive onde ela precisa existir para o consumidor — o schema do CONTROLLER, que é o que vira a
 * SDK e o que o form do console valida contra. Aqui a mesma regra é invariante checada, não forma.
 */
export const McpServerSchema = z
	.object({
		ownerId: z.uuid(),
		key: z.string().regex(MCP_SERVER_KEY_PATTERN),
		transport: z.enum(McpTransport),

		command: z.string().trim().min(1).optional(),
		args: z.array(z.string()).optional(),
		env: z.record(z.string(), z.string()).optional(),

		url: z.url().optional(),
		headers: z.record(z.string(), z.string()).optional(),

		enabled: z.boolean(),
		approvalPolicy: z.enum(McpApprovalPolicy),
		/** Override por ferramenta; ausente = vale a do servidor. Ver `mcp/approvalPolicy.ts`. */
		toolPolicies: z.record(z.string(), z.enum(McpApprovalPolicy)).optional(),
		addedAt: z.date(),
	})
	// Um erro NOMEADO em vez de uma mensagem solta, à moda de `Owner`
	// (`.regex(…, { error: 'INVALID_TIMEZONE' as DomainErrors })`): é o código que o frontend traduz e
	// o que um teste assere, e é o que faz `this.validate()` levantar a coisa certa.
	.refine(v => v.transport !== McpTransport.STDIO || Boolean(v.command), {
		error: 'MCP_SERVER_TRANSPORT_INCOMPLETE' as DomainErrors,
		path: ['command'],
	})
	.refine(v => v.transport !== McpTransport.HTTP || Boolean(v.url), {
		error: 'MCP_SERVER_TRANSPORT_INCOMPLETE' as DomainErrors,
		path: ['url'],
	})

export type McpServerProps = Z.infer<typeof McpServerSchema>

export class McpServer extends AggregateRoot<typeof McpServerSchema> {
	static override schema = McpServerSchema

	static create(data: {
		ownerId: string
		key: string
		transport: McpTransport
		command?: string
		args?: string[]
		env?: Record<string, string>
		url?: string
		headers?: Record<string, string>
		approvalPolicy?: McpApprovalPolicy
	}): McpServer {
		return new McpServer({
			ownerId: data.ownerId,
			key: data.key,
			transport: data.transport,
			command: data.command,
			args: data.args,
			env: data.env,
			url: data.url,
			headers: data.headers,
			enabled: true,
			// ASK por padrão. Um servidor recém-cadastrado é exatamente aquele sobre o qual o dono
			// ainda não formou opinião — e o raio de ação inclui shell e filesystem.
			approvalPolicy: data.approvalPolicy ?? McpApprovalPolicy.ASK,
			addedAt: new Date(),
		})
	}

	enable(): void {
		this.enabled = true
		this.validate()
	}

	disable(): void {
		this.enabled = false
		this.validate()
	}

	setApprovalPolicy(policy: McpApprovalPolicy): void {
		this.approvalPolicy = policy
		this.validate()
	}

	/**
	 * Override por ferramenta. `undefined` REMOVE o override em vez de gravar um valor — "voltar a
	 * seguir o servidor" precisa ser expressável, senão a única saída seria adivinhar qual valor
	 * coincide com a política atual, e ela muda.
	 */
	setToolPolicy(toolName: string, policy: McpApprovalPolicy | undefined): void {
		const next = { ...(this.toolPolicies ?? {}) }
		if (policy) next[toolName] = policy
		else Reflect.deleteProperty(next, toolName)
		this.toolPolicies = Object.keys(next).length > 0 ? next : undefined
		this.validate()
	}

	/**
	 * Reconfigura o transporte INTEIRO de uma vez. Não há setter por campo porque `command` sem
	 * `transport` é uma combinação que o schema recusa — trocar meio transporte é um estado que não
	 * deve ser representável nem por um instante.
	 */
	reconfigure(config: {
		transport: McpTransport
		command?: string
		args?: string[]
		env?: Record<string, string>
		url?: string
		headers?: Record<string, string>
	}): void {
		this.transport = config.transport
		this.command = config.command
		this.args = config.args
		this.env = config.env
		this.url = config.url
		this.headers = config.headers
		// Muta e valida — o mesmo par de `AgentSession.recordTurn`. Um `safeParse` manual aqui
		// reimplementaria, pior, o que a base já faz: `validate()` roda o schema da entidade e levanta o
		// erro que o `.refine()` nomeou.
		this.validate()
	}
}

export interface McpServer extends McpServerProps {}
