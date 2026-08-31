import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import { quoteForCmd, resolveInvocation, resolveProviderEnv } from './platformInvocation'

/**
 * A DECISÃO É TESTADA NUMA MÁQUINA QUE NÃO É WINDOWS — é isso que `resolveInvocation`'s terceiro
 * parâmetro compra. O defeito que originou este arquivo (spawn de `claude.cmd` → `EINVAL`) sobreviveu
 * meses porque nada aqui rodava em Windows: nem CI (a perna era cross-compilada, compila mas não
 * executa) nem teste. Uma decisão de plataforma passada como argumento é uma decisão que se prova em
 * qualquer plataforma.
 */
describe('resolveInvocation', () => {
	it('POSIX: entrega o binário e os argumentos sem intermediário', () => {
		const invocation = resolveInvocation('/opt/bin/claude', ['--print', '--model', 'sonnet'], 'darwin')

		expect(invocation.file).toBe('/opt/bin/claude')
		expect(invocation.args).toEqual(['--print', '--model', 'sonnet'])
		expect(invocation.options).toEqual({})
	})

	it('Windows com .exe de verdade: também sem intermediário — o desvio é do script de lote, não do sistema', () => {
		const invocation = resolveInvocation('C:\\Program Files\\claude\\claude.exe', ['--version'], 'win32')

		expect(invocation.file).toBe('C:\\Program Files\\claude\\claude.exe')
		expect(invocation.args).toEqual(['--version'])
		expect(invocation.options.windowsVerbatimArguments).toBeUndefined()
	})

	/** O caso do founder, 2026-08-27: `AppData\Roaming\npm\claude.cmd`, três tentativas, EINVAL. */
	it('Windows com .cmd: passa pelo interpretador, com a linha citada e entregue verbatim', () => {
		const invocation = resolveInvocation('C:\\Users\\Yayhe\\AppData\\Roaming\\npm\\claude.cmd', ['--print'], 'win32')

		expect(invocation.file.toLowerCase()).toContain('cmd')
		expect(invocation.args.slice(0, 3)).toEqual(['/d', '/s', '/c'])
		expect(invocation.args[3]).toBe('"C:\\Users\\Yayhe\\AppData\\Roaming\\npm\\claude.cmd" "--print"')
		expect(invocation.options.windowsVerbatimArguments).toBe(true)
	})

	it('.bat conta como script de lote, e a extensão não é sensível a caixa', () => {
		expect(resolveInvocation('C:\\x\\claude.BAT', [], 'win32').args.slice(0, 3)).toEqual(['/d', '/s', '/c'])
		expect(resolveInvocation('C:\\x\\claude.Cmd', [], 'win32').options.windowsVerbatimArguments).toBe(true)
	})

	/** O motivo de existir citação: `--add-dir` carrega pasta escolhida pelo operador. */
	it('caminho com espaço chega inteiro, não como dois argumentos', () => {
		const invocation = resolveInvocation('C:\\npm\\claude.cmd', ['--add-dir', 'C:\\Users\\Fulano\\Meus Projetos'], 'win32')

		expect(invocation.args[3]).toBe('"C:\\npm\\claude.cmd" "--add-dir" "C:\\Users\\Fulano\\Meus Projetos"')
	})
})

/**
 * Como em `resolveInvocation`: todo fato do host é parâmetro, então a composição inteira — inclusive
 * a do Windows — se prova de qualquer máquina. O que produção deixa nos defaults (`process.execPath`,
 * `process.env`, `Config.env.PATH`) os testes fixam via `host`.
 */
describe('resolveProviderEnv', () => {
	const host = {
		platform: 'darwin' as const,
		execPath: '/daemon/runtime/bun',
		home: '/Users/x',
		env: { PATH: '/usr/bin:/bin', HOME: '/Users/x', LANG: 'pt_BR.UTF-8' },
		basePath: '/usr/bin:/bin',
	}

	it('o PATH do filho é a base + o dir do interpretador do daemon + o dir do binário + os conhecidos', () => {
		const env = resolveProviderEnv('/Users/x/.nvm/versions/node/v22.0.0/bin/claude', host)

		const entries = (env.PATH ?? '').split(':')
		expect(entries.slice(0, 4)).toEqual(['/usr/bin', '/bin', '/daemon/runtime', '/Users/x/.nvm/versions/node/v22.0.0/bin'])
		// Os conhecidos da row darwin fecham a lista — declarados, nunca hardcoded aqui.
		expect(entries).toContain('/opt/homebrew/bin')
		expect(entries).toContain(join('/Users/x', '.bun', 'bin'))
	})

	it('preserva o resto do ambiente herdado — o CLI ainda precisa de HOME para achar as credenciais', () => {
		const env = resolveProviderEnv('/opt/bin/claude', host)

		expect(env.HOME).toBe('/Users/x')
		expect(env.LANG).toBe('pt_BR.UTF-8')
	})

	it('UMA chave de PATH só: a variante de caixa do Windows (`Path`) sai antes da nossa entrar', () => {
		const env = resolveProviderEnv('C:\\npm\\claude.cmd', {
			platform: 'win32',
			execPath: 'C:\\daemon\\runtime.exe',
			home: 'C:\\Users\\x',
			env: { Path: 'C:\\Windows\\system32', APPDATA: 'C:\\Users\\x\\AppData\\Roaming' },
			basePath: 'C:\\Windows\\system32',
		})

		expect(Object.keys(env).filter(key => key.toUpperCase() === 'PATH')).toEqual(['PATH'])
		const entries = (env.PATH ?? '').split(';')
		expect(entries.slice(0, 3)).toEqual(['C:\\Windows\\system32', 'C:\\daemon', 'C:\\npm'])
		expect(entries).toContain(join('C:\\Users\\x\\AppData\\Roaming', 'npm'))
	})

	it('binário relativo (nome nu) não contribui dir nenhum — cwd não é diretório atestável', () => {
		const env = resolveProviderEnv('claude', host)

		expect((env.PATH ?? '').split(':')).not.toContain('.')
	})
})

describe('quoteForCmd', () => {
	it('envolve em aspas sempre — uniforme, sem caso de borda por espaço', () => {
		expect(quoteForCmd('--print')).toBe('"--print"')
	})

	it('duplica as barras invertidas que precedem uma aspa antes de escapá-la', () => {
		// Sem a duplicação, a barra escaparia a aspa que ela mesma deveria fechar.
		expect(quoteForCmd('a\\"b')).toBe('"a\\\\\\"b"')
	})

	it('duplica as barras invertidas do FIM, senão elas escapam a aspa de fechamento', () => {
		expect(quoteForCmd('C:\\dir\\')).toBe('"C:\\dir\\\\"')
	})
})
