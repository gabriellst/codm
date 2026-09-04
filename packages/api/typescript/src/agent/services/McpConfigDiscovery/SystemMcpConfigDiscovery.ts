import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { injectable } from 'tsyringe-neo'
import { Config } from '@codm/core-typescript'
import { McpConfigDiscovery, fileSources, type McpConfigDocument, type McpDiscoveryContext } from './McpConfigDiscovery'

/**
 * A implementação `real`: lê os arquivos declarados em `fileSources`.
 *
 * BEST-EFFORT POR FONTE, e isso é contrato e não descuido. Um `~/.claude.json` ilegível (permissão,
 * arquivo corrompido, disco) não pode impedir o dono de importar o `.mcp.json` do workspace dele —
 * são fontes independentes e a falha de uma é ausência dela, não falha do import.
 *
 * A distinção que importa: aqui um erro vira AUSÊNCIA (a fonte não aparece na lista). O que NÃO pode
 * virar ausência silenciosa é uma entrada que o parser não entende — essa vira rejeição visível, em
 * `importParse`. São dois níveis diferentes: "não consegui ler o arquivo" e "li e não sei o que é".
 */
@injectable()
export class SystemMcpConfigDiscovery extends McpConfigDiscovery {
	async discover(context: McpDiscoveryContext): Promise<McpConfigDocument[]> {
		// `Config.env.APPDATA`, nunca `process.env` cru: a porta tipada é a ÚNICA entrada de ambiente do
		// `src/` (rail D14/AC-4, com INVENTORY de exceções vazio de propósito). O `|| undefined` traduz
		// o default `''` da porta de volta para "não declarado", que é o que `claudeDesktopDir` espera
		// para cair no caminho derivado do home fora do Windows.
		const env = { ...context, home: homedir(), appData: Config.env.APPDATA || undefined }
		const specs = fileSources(process.platform)

		const documents = await Promise.all(
			specs.map(async spec => {
				const path = spec.resolve(env)
				if (path === null) return null
				try {
					return { source: spec.source, path, raw: await readFile(path, 'utf8') } satisfies McpConfigDocument
				} catch {
					// Ausente ou ilegível — o estado NORMAL de três das quatro fontes numa máquina qualquer.
					return null
				}
			}),
		)

		return documents.filter((doc): doc is McpConfigDocument => doc !== null)
	}
}
