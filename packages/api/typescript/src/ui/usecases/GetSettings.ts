import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, Handler, z, Config } from '@codm/core-typescript'
import { owners, workspaces } from '@codm/contracts/db'
import { McpApprovalPolicy, McpTransport, ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { ProviderDetector } from '@agent/services/ProviderDetector'
// The LEAF, not the barrel: the barrel re-exports the runner implementations, whose graph reaches
// `agent/mcp/exposure.ts` → `@ui/controllers` → back here. See that barrel's header.
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
import { McpServerRepository } from '@agent/repositories/McpServerRepository'
import { McpUpstreamRegistry } from '@agent/services/McpUpstreamRegistry'
import { StopPolicyConfigRepository } from '@thread/repositories/StopPolicyConfigRepository'
import { MCP_PRESETS } from '@catalog'

import pkg from '../../../package.json' with { type: 'json' }

/**
 * Versão do APP para a linha "Sobre".
 *
 * O shell injeta `CODM_APP_VERSION` (sidecars/mod.rs) porque a versão é fato do BUNDLE, não deste
 * workspace: lendo só o package.json daqui, a tela mostrava 0.0.1 enquanto o app instalado era
 * 0.1.10 — o comentário anterior prometia "nunca desviar da versão real" e apontava para o arquivo
 * errado. O package.json fica como fallback do `bun dev`, onde não existe bundle.
 */
export function resolveAppVersion(env: NodeJS.ProcessEnv = process.env): string {
	// `||` e não `??`: a chave é DECLARADA no registry com exemplo vazio, então todo `.env` gerado a
	// define como string vazia — e `??` aceitaria o vazio como valor válido, publicando uma linha
	// "Sobre" em branco. Aconteceu no CI em 2026-08-07 (esperava 0.0.1, recebeu ""). Vazio aqui
	// significa "ninguém injetou", que é exatamente o caso do fallback.
	return env.CODM_APP_VERSION || pkg.version
}

const APP_VERSION: string = resolveAppVersion()

const ProviderAvailabilitySchema = z.object({
	provider: z.enum(ProviderKind),
	status: z.enum(ProviderStatus),
	/** Installed AND drivable — both axes, the same composition the attach wizard applies. */
	available: z.boolean(),
	/** No runner class drives this CLI yet — the second axis, documented on `DetectProvidersOutputSchema`. */
	comingSoon: z.boolean(),
	version: z.string().optional(),
})

/**
 * O que a tela de settings mostra de um servidor MCP — e, tão importante quanto, o que ela NÃO mostra.
 *
 * `env` e `headers` ficam de fora POR CONTRATO, não por esquecimento: são os campos que carregam
 * token de API dos servidores de terceiros, e este DTO vira `openapi.json` público mais SDK do
 * cliente. Um segredo que nunca entra no schema não vaza por um `console.log` de resposta nem por um
 * devtools aberto. O console mostra QUE existem variáveis configuradas (`envKeys`), nunca os valores.
 */
const McpServerSummarySchema = z.object({
	id: z.string(),
	key: z.string(),
	transport: z.enum(McpTransport),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	url: z.string().optional(),
	/** Só os NOMES das variáveis/headers configurados. Nunca os valores. */
	envKeys: z.array(z.string()),
	headerKeys: z.array(z.string()),
	enabled: z.boolean(),
	approvalPolicy: z.enum(McpApprovalPolicy),
	/**
	 * As ferramentas que ESTE upstream publicou, na última vez que conseguimos falar com ele.
	 * `policy: null` significa "sem override — herda a `approvalPolicy` do servidor" (ver
	 * `McpServer.toolPolicies`). O console precisa do override de volta na LEITURA — não só na
	 * escrita — para o seletor por ferramenta renderizar o próprio estado.
	 */
	tools: z.array(z.object({ name: z.string(), policy: z.enum(McpApprovalPolicy).nullable() })),
	/**
	 * `false` quando o servidor está desabilitado OU quando estava habilitado mas o upstream não
	 * respondeu (`McpUpstreamRegistry.listTools` engole a exceção e devolve lista vazia — ver
	 * `DefaultMcpUpstreamRegistry.safeListTools`). Um upstream quebrado nunca pode derrubar a tela
	 * inteira: os outros servidores continuam presentes com suas próprias `tools`.
	 */
	reachable: z.boolean(),
	/**
	 * POR QUE não está alcançável — presente só quando `reachable` é falso E houve tentativa.
	 *
	 * É a mesma mensagem que a sonda do "Testar conexão" devolve, agora para um servidor JÁ cadastrado.
	 * Sem ela, `reachable: false` cobria três causas com uma palavra ("não alcançável"), e a única
	 * forma de o dono descobrir qual era apagar o servidor e recadastrar para testar.
	 */
	unreachableReason: z.string().optional(),
})

/**
 * Um servidor que o produto SUGERE — ponto de partida de um cadastro, nunca um cadastro.
 *
 * Vem do catálogo declarado (`MCP_PRESETS`), a mesma forma do `PROVIDER_MODELS`: o console é LEITOR
 * da relação, nunca uma segunda cópia dela. `envKeys` são NOMES (o formulário abre com os campos
 * vazios e o `hasBlankSecret` trava o salvar) — um preset jamais carrega valor de segredo, e há rail
 * varrendo o catálogo inteiro atrás disso.
 */
const McpPresetSchema = z.object({
	key: z.string(),
	transport: z.enum(McpTransport),
	command: z.string(),
	args: z.array(z.string()),
	envKeys: z.array(z.string()),
	/** CHAVE de i18n, não a frase: o catálogo não carrega texto de UI. */
	descriptionKey: z.string(),
})

export const GetSettingsInputSchema = z.object({ ownerId: z.uuid() })
export const GetSettingsOutputSchema = z.object({
	providers: z.array(ProviderAvailabilitySchema),
	mcpServers: z.array(McpServerSummarySchema),
	/** O catálogo de sugestões — estático, mas servido pela MESMA query que a tela já faz. */
	mcpPresets: z.array(McpPresetSchema),
	/**
	 * Os workspaces do dono — a informação SEM A QUAL o import lê só o que foi colado.
	 *
	 * MEDIDO contra o daemon vivo: sem `workspacePath`, a prévia devolve a fonte `CLAUDE_CODE` VAZIA,
	 * porque o `~/.claude.json` guarda a configuração sob `projects['<caminho absoluto>']` e é o
	 * caminho que escolhe qual projeto interessa. O `.mcp.json` do workspace nem chega a ser procurado.
	 * Sem este campo, três das quatro fontes ficavam inalcançáveis pela tela — a de colar era a única
	 * que funcionava, e a seção das outras renderizava vazia sem dizer por quê.
	 */
	workspacePaths: z.array(z.string()),
	stopCriteria: z.object({
		serverErrors: z.boolean(),
		blockedByClassification: z.boolean(),
		humanRequested: z.boolean(),
		approvalNeeded: z.boolean(),
		authRequired: z.boolean(),
	}),
	general: z.object({
		operatorName: z.string(),
		timezone: z.string(),
		dataDir: z.string(),
	}),
	appVersion: z.string(),
})

/**
 * Read — Settings (T08). The settings screen's panels, composed in the ui BFF context:
 *   - providers    — per-CLI availability (the detection Service probe: DETECTED + version, or
 *                    NOT_INSTALLED), the same shape the attach wizard renders.
 *   - mcpServers   — the registered third-party MCP servers, secrets stripped to key names only
 *                    (see `McpServerSummarySchema`), each carrying the tools its upstream published
 *                    (with the per-tool policy override, read back so the console's selector knows
 *                    its own state) and whether that upstream was reachable this call (Task T13).
 *   - stopCriteria — the per-owner stop-policy toggles (BC5 settings row, defaulted when unset).
 *   - general      — operator identity + the embedded data directory (local-daemon config).
 *   - appVersion   — the About row.
 */
@injectable()
export class GetSettings extends Handler<typeof GetSettingsInputSchema, typeof GetSettingsOutputSchema> {
	readonly name = 'get_settings' as const
	readonly inputSchema = GetSettingsInputSchema
	readonly outputSchema = GetSettingsOutputSchema

	constructor(
		private readonly driver: LibSqlDatabaseDriver,
		private readonly providerDetector: ProviderDetector,
		private readonly stopPolicy: StopPolicyConfigRepository,
		private readonly agentRunnerFactory: AgentRunnerFactory,
		private readonly mcpServers: McpServerRepository,
		private readonly mcpUpstreamRegistry: McpUpstreamRegistry,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const detections = await this.providerDetector.detect()
		// The runner-bearing set, from the wiring layer that owns it — never a list restated here.
		const drivable = this.agentRunnerFactory.supported
		const providers = detections.map(d => {
			const comingSoon = !drivable.includes(d.name)
			return {
				provider: d.name,
				status: d.status,
				available: d.status === ProviderStatus.DETECTED && !comingSoon,
				comingSoon,
				version: d.version,
			}
		})

		const registeredServers = await this.mcpServers.listByOwner(input.ownerId)
		// UMA chamada, não uma por servidor. E `listToolsByServer` em vez de `listTools`: a versão achatada
		// perde QUAL servidor falhou e POR QUÊ — um upstream quebrado e um upstream sem ferramentas somem
		// da lista exatamente do mesmo jeito, e era daí que nascia o `reachable` ambíguo desta tela.
		const upstreamByServer = await this.mcpUpstreamRegistry.listToolsByServer(input.ownerId)

		const mcpServers = registeredServers.map(server => {
			// Desabilitado nunca é conectado — `listToolsByServer` já filtra por `listEnabledByOwner`, mas
			// o gate fica explícito aqui também: um servidor desligado nunca mostra ferramentas que
			// porventura sobraram no mapa.
			const outcome = server.enabled ? upstreamByServer.get(server.key) : undefined
			const tools = outcome?.ok ? outcome.tools : []
			return {
				id: server.id.value,
				key: server.key,
				transport: server.transport,
				command: server.command,
				args: server.args,
				url: server.url,
				envKeys: Object.keys(server.env ?? {}),
				headerKeys: Object.keys(server.headers ?? {}),
				enabled: server.enabled,
				approvalPolicy: server.approvalPolicy,
				tools: tools.map(tool => ({ name: tool.name, policy: server.toolPolicies?.[tool.name] ?? null })),
				// AGORA O SINAL É LIDO, NÃO INFERIDO. Antes era `enabled && tools.length > 0`, e a
				// consequência era que "comando errado", "token vencido" e "servidor legitimamente sem
				// ferramentas" produziam a MESMA palavra na tela. `outcome.ok` vem do próprio upstream.
				reachable: outcome?.ok === true,
				// E o motivo viaja junto quando falhou — é a mesma informação que o botão "Testar conexão"
				// entrega ANTES de salvar, agora disponível também para um servidor JÁ cadastrado. Sem ele,
				// o dono só descobria o porquê apagando e recadastrando.
				unreachableReason: outcome?.ok === false ? outcome.error : undefined,
			}
		})

		const stopCriteria = await this.stopPolicy.get(input.ownerId)

		const workspaceRows = await this.driver.db
			.select({ path: workspaces.path })
			.from(workspaces)
			.where(eq(workspaces.ownerId, input.ownerId))

		const ownerRow = await this.driver.db
			.select({ name: owners.name, timezone: owners.timezone })
			.from(owners)
			.where(eq(owners.id, input.ownerId))
			.limit(1)

		return {
			providers,
			mcpServers,
			// Copiado do catálogo, não repassado: `MCP_PRESETS` é `readonly` e entregá-lo direto daria ao
			// chamador uma referência para a constante do módulo.
			mcpPresets: MCP_PRESETS.map(preset => ({ ...preset, args: [...preset.args], envKeys: [...preset.envKeys] })),
			workspacePaths: workspaceRows.map(row => row.path),
			stopCriteria,
			general: {
				// Empty when unnamed — the frontend renders its own i18n placeholder; never an EN literal from the API.
				operatorName: ownerRow[0]?.name ?? '',
				timezone: ownerRow[0]?.timezone ?? '',
				dataDir: Config.env.CODM_DATA_DIR,
			},
			appVersion: APP_VERSION,
		}
	}
}
