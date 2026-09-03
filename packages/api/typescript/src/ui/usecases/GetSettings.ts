import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, Handler, z, Config } from '@codm/core-typescript'
import { owners } from '@codm/contracts/db'
import { McpApprovalPolicy, McpTransport, ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { ProviderDetector } from '@agent/services/ProviderDetector'
// The LEAF, not the barrel: the barrel re-exports the runner implementations, whose graph reaches
// `agent/mcp/exposure.ts` → `@ui/controllers` → back here. See that barrel's header.
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
import { McpServerRepository } from '@agent/repositories/McpServerRepository'
import { StopPolicyConfigRepository } from '@thread/repositories/StopPolicyConfigRepository'

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
})

export const GetSettingsInputSchema = z.object({ ownerId: z.uuid() })
export const GetSettingsOutputSchema = z.object({
	providers: z.array(ProviderAvailabilitySchema),
	mcpServers: z.array(McpServerSummarySchema),
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
 *                    (see `McpServerSummarySchema`). The discovered-tools list and `reachable` flag
 *                    are OUT of scope here — they need `McpUpstreamRegistry` (Task T13).
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

		const mcpServers = (await this.mcpServers.listByOwner(input.ownerId)).map(server => ({
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
		}))

		const stopCriteria = await this.stopPolicy.get(input.ownerId)

		const ownerRow = await this.driver.db
			.select({ name: owners.name, timezone: owners.timezone })
			.from(owners)
			.where(eq(owners.id, input.ownerId))
			.limit(1)

		return {
			providers,
			mcpServers,
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
