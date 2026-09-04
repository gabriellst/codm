import { McpConfigSource } from '@codm/contracts-typescript/wire/enums'

/**
 * A PORTA QUE LÊ CONFIGURAÇÃO MCP DO DISCO — e a razão de ela ser porta.
 *
 * Medido em 04/09/2026: nesta máquina TRÊS das quatro fontes estão vazias (não há
 * `claude_desktop_config.json`, nem `.mcp.json` no workspace, nem no repo). Só o `~/.claude.json`
 * tem conteúdo. Se a leitura vivesse dentro do use case, a suíte passaria a depender de qual máquina
 * a roda — e o que passa aqui reprovaria no CI por ausência de arquivo, ou pior, passaria no CI por
 * ausência de arquivo e esconderia um parser quebrado.
 *
 * Então o disco é porta, ligada por ambiente (`mock` / `integration` / `real` / `e2e`), e o PARSE é
 * função pura em `mcp/importParse.ts`. Um teste de import não toca disco nenhum.
 */

/** Um documento lido de uma fonte, ainda como TEXTO — o parse é de quem chama. */
export interface McpConfigDocument {
	source: McpConfigSource
	/** O caminho absoluto de onde veio, para a tela poder dizer ao dono O QUE ela leu. */
	path: string
	raw: string
}

export interface McpDiscoveryContext {
	/** O workspace da thread. Decide o `.mcp.json` a ler E qual projeto do `~/.claude.json` interessa. */
	workspacePath?: string
}

export abstract class McpConfigDiscovery {
	/**
	 * Os documentos que EXISTEM. Uma fonte ausente simplesmente não aparece — ausência não é erro, é o
	 * estado normal de três das quatro fontes numa máquina qualquer.
	 *
	 * Um arquivo que existe mas não pode ser lido (permissão, disco) TAMBÉM não aparece: a leitura é
	 * best-effort por fonte, porque um `~/.claude.json` ilegível não pode impedir o dono de importar o
	 * `.mcp.json` do workspace dele.
	 */
	abstract discover(context: McpDiscoveryContext): Promise<McpConfigDocument[]>
}

/**
 * ONDE CADA FONTE MORA — relação declarada, resolvida por lookup.
 *
 * `PASTE` não está aqui, e a ausência é o desenho: colar JSON não tem arquivo. O membro existe no
 * enum para ETIQUETAR de onde um candidato veio, não para ser procurado no disco. Modelar isso como
 * `{ kind: 'none' }` obrigaria todo consumidor a um desvio de fluxo sobre um caso que não é caso —
 * exatamente o `if` de edge-case que a não-negociável nº 5 do CLAUDE.md proíbe.
 */
export interface FileSourceSpec {
	source: McpConfigSource
	/** O caminho absoluto, ou `null` quando esta fonte não se aplica ao contexto (ex.: sem workspace). */
	resolve(context: McpDiscoveryContext & { home: string; appData?: string }): string | null
}

/**
 * O diretório do Claude Desktop por família de SO — a MESMA forma do `PROCESS_TREES`: um lookup por
 * `process.platform`, nunca uma cadeia de `if`. O app grava em lugares diferentes e isso é fato do
 * sistema operacional, então é declarado por sistema operacional.
 */
export const CLAUDE_DESKTOP_DIR: Readonly<Record<'win32' | 'darwin' | 'posix', (env: { home: string; appData?: string }) => string>> = {
	win32: env => `${env.appData ?? `${env.home}/AppData/Roaming`}/Claude`,
	darwin: env => `${env.home}/Library/Application Support/Claude`,
	posix: env => `${env.home}/.config/Claude`,
}

export function claudeDesktopDir(platform: NodeJS.Platform, env: { home: string; appData?: string }): string {
	if (platform === 'win32') return CLAUDE_DESKTOP_DIR.win32(env)
	if (platform === 'darwin') return CLAUDE_DESKTOP_DIR.darwin(env)
	return CLAUDE_DESKTOP_DIR.posix(env)
}

/** As fontes que têm arquivo, e como achar cada uma. Ordem = ordem de apresentação na tela. */
export function fileSources(platform: NodeJS.Platform): readonly FileSourceSpec[] {
	return [
		{
			source: McpConfigSource.WORKSPACE_FILE,
			// Sem workspace não há `.mcp.json` a ler — `null`, não uma busca no diretório corrente.
			resolve: ctx => (ctx.workspacePath ? `${ctx.workspacePath}/.mcp.json` : null),
		},
		{
			source: McpConfigSource.CLAUDE_CODE,
			resolve: ctx => `${ctx.home}/.claude.json`,
		},
		{
			source: McpConfigSource.CLAUDE_DESKTOP,
			resolve: ctx => `${claudeDesktopDir(platform, ctx)}/claude_desktop_config.json`,
		},
	]
}
