import { describe, expect, it } from 'bun:test'
import { McpImportRejection, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { parseMcpDocument } from './importParse'

/**
 * As formas deste arquivo NÃO são inventadas. Foram medidas em 04/09/2026 no `~/.claude.json` desta
 * máquina (91 KB, 19 projetos), e as três primeiras são literalmente os três servidores que o dono já
 * tinha configurados. Um parser desenhado contra a documentação teria descartado o primeiro deles.
 */

const WORKSPACE = 'C:\\Users\\detup\\Desktop\\Work'

describe('parseMcpDocument — a forma A: { mcpServers }', () => {
	/**
	 * O `supermemory` real: `{ command, args }`, SEM `type`. Exigir o campo descartaria o primeiro
	 * servidor da lista de verdade do dono — e silenciosamente, que é o pior jeito.
	 */
	it('trata `type` AUSENTE como STDIO — a forma do servidor real que não declara transporte', () => {
		const { candidates, rejections } = parseMcpDocument(
			JSON.stringify({ mcpServers: { supermemory: { command: 'npx', args: ['-y', '@supermemory/mcp'] } } }),
		)

		expect(rejections).toEqual([])
		expect(candidates).toHaveLength(1)
		expect(candidates[0]).toMatchObject({
			key: 'supermemory',
			transport: McpTransport.STDIO,
			command: 'npx',
			args: ['-y', '@supermemory/mcp'],
		})
	})

	it('lê o STDIO que declara o transporte, com env', () => {
		const { candidates } = parseMcpDocument(
			JSON.stringify({ mcpServers: { ruflo: { type: 'stdio', command: 'node', args: ['s.js'], env: { API_TOKEN: 'sk-SEGREDO' } } } }),
		)

		expect(candidates[0]).toMatchObject({ key: 'ruflo', transport: McpTransport.STDIO, command: 'node' })
	})

	it('lê o HTTP com headers', () => {
		const { candidates } = parseMcpDocument(
			JSON.stringify({
				mcpServers: { github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer SEGREDO' } } },
			}),
		)

		expect(candidates[0]).toMatchObject({ key: 'github', transport: McpTransport.HTTP, url: 'https://api.githubcopilot.com/mcp/' })
	})

	/**
	 * O SEGREDO NÃO CHEGA A EXISTIR NO CANDIDATO. Descartar o valor AQUI, na entrada, é mais forte do
	 * que confiar na camada seguinte para não persistir: não há objeto intermediário carregando o
	 * token por onde um log ou um erro possa expô-lo.
	 */
	it('guarda só os NOMES de env e headers — o valor é descartado na entrada', () => {
		const doc = JSON.stringify({
			mcpServers: {
				comenv: { command: 'node', env: { API_TOKEN: 'sk-NAO-PODE-VAZAR', REGION: 'us' } },
				comheader: { type: 'http', url: 'https://x.dev/mcp', headers: { Authorization: 'Bearer NAO-PODE-VAZAR' } },
			},
		})

		const { candidates } = parseMcpDocument(doc)

		expect(candidates.find(c => c.key === 'comenv')?.envKeys).toEqual(['API_TOKEN', 'REGION'])
		expect(candidates.find(c => c.key === 'comheader')?.headerKeys).toEqual(['Authorization'])
		// A contraprova que importa: nenhum valor sobreviveu em lugar nenhum da saída.
		expect(JSON.stringify(candidates)).not.toContain('NAO-PODE-VAZAR')
		expect(JSON.stringify(candidates)).not.toContain('sk-')
	})
})

describe('parseMcpDocument — a forma B: { projects: { "<caminho>": { mcpServers } } }', () => {
	/** A estrutura REAL do `~/.claude.json`: não há `mcpServers` no topo. */
	const CLAUDE_JSON = JSON.stringify({
		numStartups: 42,
		projects: {
			'C:/Users/detup/Desktop/ranking_msc': { mcpServers: { outro: { command: 'node' } } },
			'C:/Users/detup/Desktop/Work': { mcpServers: { daqui: { command: 'npx', args: ['-y', 'x'] } } },
		},
	})

	/**
	 * O CASO QUE UMA COMPARAÇÃO DE STRING CRUA ERRA — e erra da pior forma, parecendo sucesso.
	 *
	 * MEDIDO: a chave de projeto é gravada com BARRA NORMAL (`C:/Users/...`) mesmo no Windows,
	 * enquanto o `workspacePath` que a thread carrega usa barra INVERTIDA. Sem normalizar, nenhum
	 * projeto casa, o import volta VAZIO e sem erro, e o dono conclui que não havia nada para importar.
	 */
	it('casa o workspace mesmo com separador diferente do gravado no arquivo', () => {
		const { candidates } = parseMcpDocument(CLAUDE_JSON, { workspacePath: WORKSPACE })

		expect(candidates.map(c => c.key)).toEqual(['daqui'])
	})

	it('ignora o case do caminho — Windows não distingue maiúsculas em diretório', () => {
		const { candidates } = parseMcpDocument(CLAUDE_JSON, { workspacePath: 'c:\\users\\detup\\desktop\\work' })

		expect(candidates.map(c => c.key)).toEqual(['daqui'])
	})

	it('não importa a configuração de OUTRO projeto — o workspace é o filtro, não uma sugestão', () => {
		const { candidates } = parseMcpDocument(CLAUDE_JSON, { workspacePath: WORKSPACE })

		expect(candidates.map(c => c.key)).not.toContain('outro')
	})

	it('sem workspace, a forma B não rende candidato — importar projeto alheio é pior que não importar', () => {
		expect(parseMcpDocument(CLAUDE_JSON).candidates).toEqual([])
	})
})

describe('parseMcpDocument — as rejeições, que são o ponto', () => {
	it('`sse` é RECUSADO COM MOTIVO, nunca descartado em silêncio', () => {
		const { candidates, rejections } = parseMcpDocument(
			JSON.stringify({ mcpServers: { velho: { type: 'sse', url: 'https://x.dev/sse' } } }),
		)

		expect(candidates).toEqual([])
		expect(rejections).toEqual([{ key: 'velho', reason: McpImportRejection.UNSUPPORTED_TRANSPORT, detail: 'sse' }])
	})

	/** O nome ORIGINAL viaja na rejeição: o dono precisa reconhecer o que foi recusado. */
	it('chave fora do padrão é recusada com o nome como estava no arquivo', () => {
		const { rejections } = parseMcpDocument(JSON.stringify({ mcpServers: { My_Server: { command: 'node' } } }))

		expect(rejections).toEqual([{ key: 'My_Server', reason: McpImportRejection.INVALID_KEY }])
	})

	it('STDIO sem comando e HTTP sem url são recusados por motivos DIFERENTES', () => {
		const { rejections } = parseMcpDocument(JSON.stringify({ mcpServers: { semcmd: { type: 'stdio' }, semurl: { type: 'http' } } }))

		expect(rejections).toEqual([
			{ key: 'semcmd', reason: McpImportRejection.MISSING_COMMAND },
			{ key: 'semurl', reason: McpImportRejection.MISSING_URL },
		])
	})

	it('o que o dono já tem é recusado como duplicata, não importado por cima', () => {
		const { candidates, rejections } = parseMcpDocument(JSON.stringify({ mcpServers: { everything: { command: 'npx' } } }), {
			alreadyRegistered: ['everything'],
		})

		expect(candidates).toEqual([])
		expect(rejections).toEqual([{ key: 'everything', reason: McpImportRejection.ALREADY_REGISTERED }])
	})

	it('JSON quebrado vira UMA rejeição, nunca uma exceção que derruba a tela', () => {
		expect(() => parseMcpDocument('{ isso não é json')).not.toThrow()
		expect(parseMcpDocument('{ isso não é json').rejections).toEqual([{ key: '', reason: McpImportRejection.MALFORMED }])
	})

	it('um array no topo é malformado — JSON válido não é documento válido', () => {
		expect(parseMcpDocument('[]').rejections).toEqual([{ key: '', reason: McpImportRejection.MALFORMED }])
	})

	/**
	 * O TESTE QUE PROVA QUE NADA SOME. As rejeições não são um canto escuro: a soma do que entra tem de
	 * bater com a soma do que sai, senão existe um caminho de descarte silencioso que ninguém mediu.
	 */
	it('toda entrada sai como candidato OU como rejeição — a contagem fecha', () => {
		const doc = JSON.stringify({
			mcpServers: {
				bom: { command: 'npx' },
				velho: { type: 'sse', url: 'https://x.dev' },
				My_Server: { command: 'node' },
				semcmd: { type: 'stdio' },
				http: { type: 'http', url: 'https://y.dev/mcp' },
			},
		})

		const { candidates, rejections } = parseMcpDocument(doc)

		expect(candidates.length + rejections.length).toBe(5)
	})
})
