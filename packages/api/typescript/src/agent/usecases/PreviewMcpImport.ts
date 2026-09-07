import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { z as zt } from 'zod'
import { McpConfigSource, McpImportRejection, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpConfigDiscovery } from '../services/McpConfigDiscovery'
import { McpServerRepository } from '../repositories/McpServerRepository'
import { parseMcpDocument } from '../mcp/importParse'

const CandidateSchema = z.object({
	key: z.string(),
	transport: z.enum(McpTransport),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	url: z.string().optional(),
	/** Só os NOMES. O valor foi descartado lá atrás, no parser — ver `importParse`. */
	envKeys: z.array(z.string()),
	headerKeys: z.array(z.string()),
})

const RejectionSchema = z.object({
	/** O nome COMO ESTAVA no arquivo. O dono precisa reconhecer o que foi recusado. */
	key: z.string(),
	reason: z.enum(McpImportRejection),
	detail: z.string().optional(),
})

const SourceResultSchema = z.object({
	source: z.enum(McpConfigSource),
	/** De onde veio, para a tela dizer ao dono O QUE ela leu. Ausente no `PASTE`, que não tem arquivo. */
	path: z.string().optional(),
	candidates: z.array(CandidateSchema),
	rejections: z.array(RejectionSchema),
})

export const PreviewMcpImportInputSchema = z.object({
	ownerId: z.uuid(),
	/** O workspace da thread: escolhe o `.mcp.json` e QUAL projeto do `~/.claude.json` interessa. */
	workspacePath: z.string().optional(),
	/** O documento que o dono colou. Ausente ⇒ só as fontes de arquivo são consultadas. */
	pasted: z.string().optional(),
})

export const PreviewMcpImportOutputSchema = z.object({ sources: z.array(SourceResultSchema) })

/** Os DTOs, exportados: quem consome a prévia (controller, teste, futuramente o import) tipa por eles. */
export type McpImportCandidateDto = zt.infer<typeof CandidateSchema>
export type McpImportRejectionDto = zt.infer<typeof RejectionSchema>
export type McpImportSourceDto = zt.infer<typeof SourceResultSchema>

/**
 * O QUE DÁ PARA IMPORTAR, por fonte — e o que NÃO dá, com o motivo ao lado.
 *
 * Lê, não escreve: é a prévia que o dono confirma antes de qualquer registro acontecer. O import de
 * verdade é outro caso de uso, e a separação é deliberada — um import que acontecesse no mesmo gesto
 * da descoberta tiraria do dono a chance de ver o que seria criado.
 *
 * AS FONTES SÃO INDEPENDENTES. Cada uma sai com seus próprios candidatos e suas próprias rejeições, e
 * um documento ilegível numa não apaga as outras (o `McpConfigDiscovery` já entrega só o que
 * conseguiu ler). Achatar tudo numa lista só pareceria mais simples e destruiria a informação que o
 * dono usa para decidir: "isto veio do MEU repositório" e "isto veio da config global" são confianças
 * diferentes.
 *
 * `alreadyRegistered` é resolvido AQUI e passado ao parser, em vez de consultado lá dentro: manter o
 * parser puro é o que o torna testável sem banco, e "já existe" é fato do repositório, não do
 * documento.
 */
@injectable()
export class PreviewMcpImport extends Handler<typeof PreviewMcpImportInputSchema, typeof PreviewMcpImportOutputSchema> {
	readonly name = 'preview_mcp_import' as const
	readonly inputSchema = PreviewMcpImportInputSchema
	readonly outputSchema = PreviewMcpImportOutputSchema

	constructor(
		private readonly discovery: McpConfigDiscovery,
		private readonly servers: McpServerRepository,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const registered = (await this.servers.listByOwner(input.ownerId)).map(server => server.key)
		const options = { workspacePath: input.workspacePath, alreadyRegistered: registered }

		const documents = await this.discovery.discover({ workspacePath: input.workspacePath })
		const fromFiles = documents.map(doc => ({
			source: doc.source,
			path: doc.path,
			...parseMcpDocument(doc.raw, options),
		}))

		// O `PASTE` entra na MESMA lista, com a mesma forma, e por isso não existe um segundo caminho de
		// código para "colado" — a tela renderiza uma coleção de fontes, não um caso especial ao lado
		// de uma coleção. É a diferença entre uma fonte a mais e um `if` a mais.
		const pasted = input.pasted?.trim()
		const fromPaste = pasted ? [{ source: McpConfigSource.PASTE, ...parseMcpDocument(pasted, options) }] : []

		return { sources: [...fromPaste, ...fromFiles] }
	}
}
