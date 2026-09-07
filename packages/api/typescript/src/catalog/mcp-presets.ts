import { McpTransport } from '@codm/contracts-typescript/wire/enums'

/**
 * OS SERVIDORES MCP QUE O PRODUTO SUGERE — relação declarada, não lista solta no React.
 *
 * ### Por que catálogo e não constante no console
 * É a mesma forma do `PROVIDER_MODELS` ao lado: informação estrutural (o que o produto oferece)
 * declarada UMA vez e lida por lookup, nunca redigitada na tela que a renderiza. Um preset que
 * vivesse no front seria invisível para o backend, para o teste e para qualquer outra superfície que
 * um dia precise dele — e a primeira divergência apareceria como um comando que funciona num lugar e
 * não no outro.
 *
 * ### O que um preset É, e o que ele NÃO é
 * Um preset é o PONTO DE PARTIDA de um cadastro: a chave sugerida, o transporte e o comando. Ele não
 * cadastra nada sozinho e não é um servidor — o dono ainda vê o formulário, ainda pode editar tudo, e
 * ainda decide a política de aprovação.
 *
 * Preset NENHUM carrega valor de segredo. `envKeys` diz QUAIS variáveis aquele servidor costuma
 * exigir, para o formulário já mostrar os campos vazios — é a mesma regra do import (a forma viaja, o
 * segredo não), e aqui ela é ainda mais óbvia: um valor de token num catálogo versionado seria um
 * segredo commitado.
 *
 * ### Por que esta lista é curta, e por que isso é uma escolha
 * O ecossistema MCP tem centenas de servidores e cresce toda semana. Um catálogo nosso vai estar
 * sempre atrás — e é por isso que o IMPORT (Fase 1) é a entrega principal e o preset é conveniência:
 * o import pega QUALQUER servidor que o dono já tenha, e o preset só encurta o caminho dos poucos
 * casos que quase todo mundo quer. Crescer esta lista sem limite seria fingir que somos um diretório.
 */
export interface McpPreset {
	/** A chave SUGERIDA. Válida contra `MCP_SERVER_KEY_PATTERN` — há rail que prova. */
	key: string
	transport: McpTransport
	command: string
	args: readonly string[]
	/**
	 * As variáveis que este servidor costuma exigir — NOMES, nunca valores. O formulário abre com os
	 * campos presentes e vazios, e o `hasBlankSecret` bloqueia o salvar até o dono preenchê-los.
	 */
	envKeys: readonly string[]
	/** Chave i18n da descrição de uma linha. O catálogo não carrega texto de UI, carrega a CHAVE dele. */
	descriptionKey: string
}

export const MCP_PRESETS: readonly McpPreset[] = [
	{
		key: 'playwright',
		transport: McpTransport.STDIO,
		command: 'npx',
		args: ['-y', '@playwright/mcp'],
		envKeys: [],
		descriptionKey: 'settings.mcpServers.presets.playwright',
	},
	{
		key: 'filesystem',
		transport: McpTransport.STDIO,
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-filesystem'],
		envKeys: [],
		descriptionKey: 'settings.mcpServers.presets.filesystem',
	},
	{
		// O servidor de REFERÊNCIA do protocolo, e ele ganha lugar no catálogo por um motivo prático:
		// é com ele que o dono descobre se o cadastro dele funciona, sem depender de credencial nenhuma.
		key: 'everything',
		transport: McpTransport.STDIO,
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-everything'],
		envKeys: [],
		descriptionKey: 'settings.mcpServers.presets.everything',
	},
	{
		key: 'github',
		transport: McpTransport.STDIO,
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-github'],
		// O ÚNICO com segredo, e por isso o mais importante do catálogo: ele é a prova de que um preset
		// entrega a FORMA e não o valor. O campo abre vazio e o salvar fica bloqueado.
		envKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
		descriptionKey: 'settings.mcpServers.presets.github',
	},
]

/** O preset de uma chave, ou `undefined`. Lookup, nunca `find` redigitado no ponto de uso. */
export function presetByKey(key: string): McpPreset | undefined {
	return MCP_PRESETS.find(preset => preset.key === key)
}
