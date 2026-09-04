import { describe, expect, it } from 'bun:test'
import { McpConfigSource } from '@codm/contracts-typescript/wire/enums'
import { claudeDesktopDir, fileSources } from './McpConfigDiscovery'
import { MockMcpConfigDiscovery } from './MockMcpConfigDiscovery'

/**
 * A metade do T3 que dá para MEDIR sem disco: ONDE cada fonte mora.
 *
 * Escrever isto como teste, e não como comentário, é a lição das duas semanas passadas neste repo —
 * o detector que mentia no Windows e o teardown que só falhava no POSIX foram ambos lógica de
 * plataforma sem metade pura, e ambos atravessaram a revisão porque a plataforma onde importavam era
 * a única onde nunca rodavam. `claudeDesktopDir` recebe a plataforma por PARÂMETRO exatamente para
 * que as três sejam exercitadas de qualquer host.
 */

const ENV = { home: '/home/dono', appData: 'C:/Users/dono/AppData/Roaming' }

describe('claudeDesktopDir — o app grava em lugar diferente por SO', () => {
	it('Windows usa APPDATA', () => {
		expect(claudeDesktopDir('win32', ENV)).toBe('C:/Users/dono/AppData/Roaming/Claude')
	})

	it('Windows sem APPDATA cai no caminho derivado do home, não em undefined no meio do caminho', () => {
		expect(claudeDesktopDir('win32', { home: 'C:/Users/dono' })).toBe('C:/Users/dono/AppData/Roaming/Claude')
	})

	it('macOS usa Application Support — o caminho que a plataforma de produção usa', () => {
		expect(claudeDesktopDir('darwin', ENV)).toBe('/home/dono/Library/Application Support/Claude')
	})

	it('linux e qualquer outro unix caem em ~/.config', () => {
		expect(claudeDesktopDir('linux', ENV)).toBe('/home/dono/.config/Claude')
		expect(claudeDesktopDir('freebsd', ENV)).toBe('/home/dono/.config/Claude')
	})
})

describe('fileSources — a relação declarada de onde procurar', () => {
	it('PASTE NÃO está na lista — colar JSON não tem arquivo, e o membro existe só para etiquetar a origem', () => {
		expect(fileSources('linux').map(s => s.source)).not.toContain(McpConfigSource.PASTE)
	})

	it('cobre as três fontes de arquivo, na ordem em que a tela as mostra', () => {
		expect(fileSources('linux').map(s => s.source)).toEqual([
			McpConfigSource.WORKSPACE_FILE,
			McpConfigSource.CLAUDE_CODE,
			McpConfigSource.CLAUDE_DESKTOP,
		])
	})

	it('sem workspace, o .mcp.json não é procurado — `null`, nunca uma busca no diretório corrente', () => {
		const spec = fileSources('linux').find(s => s.source === McpConfigSource.WORKSPACE_FILE)

		expect(spec?.resolve({ ...ENV })).toBeNull()
		expect(spec?.resolve({ ...ENV, workspacePath: '/repo' })).toBe('/repo/.mcp.json')
	})

	it('o ~/.claude.json sai do home, não de uma variável de ambiente qualquer', () => {
		const spec = fileSources('win32').find(s => s.source === McpConfigSource.CLAUDE_CODE)

		expect(spec?.resolve({ ...ENV })).toBe('/home/dono/.claude.json')
	})
})

describe('MockMcpConfigDiscovery', () => {
	/**
	 * Vazio por padrão É a escolha certa. Um default que fingisse ter arquivos faria a suíte afirmar um
	 * estado que nenhuma máquina real reproduz — medido: três das quatro fontes estavam ausentes aqui.
	 */
	it('não descobre nada até que a suíte declare o que está assumindo', async () => {
		expect(await new MockMcpConfigDiscovery().discover({})).toEqual([])
	})

	it('devolve o que foi semeado, sem tocar disco', async () => {
		const discovery = new MockMcpConfigDiscovery()
		discovery.seed({ source: McpConfigSource.CLAUDE_CODE, path: '/home/dono/.claude.json', raw: '{}' })

		expect(await discovery.discover({})).toHaveLength(1)
	})
})
