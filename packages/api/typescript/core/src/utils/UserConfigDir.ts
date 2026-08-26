import { posix, win32 } from 'node:path'
import type { BaseInfrastructureErrors } from '../errors/codes'
import { BaseError } from '../types/BaseError'

/**
 * `os.UserConfigDir()` do Go, transcrito — porque é ISSO que o gateway usa quando ninguém lhe passa
 * um data dir (`packages/api/go/core/db/sqlite/store.go`, `resolveDataDir("")` →
 * `filepath.Join(os.UserConfigDir(), <produto>)`). Dois processos, o mesmo arquivo de banco
 * (`<produto>.db`): se o daemon standalone escolhesse outra pasta por default, o operador sem
 * `.env` veria dois bancos e nenhum erro.
 *
 * A regra por SO é uma TABELA, não uma cadeia de `if (platform === …)`: cada linha declara de onde
 * vem a base e com que sabor de `path` se junta (o `filepath.Join` do Go usa o separador do SO —
 * no Windows o resultado leva `\`). Quem não tem linha própria cai na regra unix, que é o `default:`
 * do switch do Go. As recusas são as do Go, uma a uma: `%AppData%` indefinido, `$HOME` indefinido,
 * `$XDG_CONFIG_HOME` relativo.
 *
 * PURO: plataforma, env e home entram por parâmetro, para a tabela ser testada linha a linha num
 * macOS sem fingir SO por mocks globais.
 */
export interface UserConfigDirInput {
	readonly platform: NodeJS.Platform
	readonly env: Readonly<Record<string, string | undefined>>
	/** `os.homedir()` no chamador real — o Go lê `$HOME`; `homedir()` honra `$HOME` e cai no passwd. */
	readonly home: string
}

interface UserConfigDirRule {
	/** Sabor de `path` do SO — o Go junta com o separador nativo, então o Windows junta com `\`. */
	readonly path: typeof posix | typeof win32
	readonly base: (input: UserConfigDirInput) => string
}

/** Mesma família de erro que o resto do boot usa para "o ambiente não me deu o que preciso". */
function unusableEnv(detail: string): BaseError<BaseInfrastructureErrors> {
	return new BaseError<BaseInfrastructureErrors>('MISSING_ENVIRONMENT_VARIABLE', `cannot resolve the user config dir: ${detail}`)
}

const DARWIN: UserConfigDirRule = {
	path: posix,
	base: ({ home }) => {
		if (!home) throw unusableEnv('$HOME is not defined')
		return posix.join(home, 'Library', 'Application Support')
	},
}

const WINDOWS: UserConfigDirRule = {
	path: win32,
	base: ({ env }) => {
		const dir = env.APPDATA
		if (!dir) throw unusableEnv('%AppData% is not defined')
		return dir
	},
}

const UNIX: UserConfigDirRule = {
	path: posix,
	base: ({ env, home }) => {
		const xdg = env.XDG_CONFIG_HOME
		if (!xdg) {
			if (!home) throw unusableEnv('neither $XDG_CONFIG_HOME nor $HOME are defined')
			return posix.join(home, '.config')
		}
		if (!posix.isAbsolute(xdg)) throw unusableEnv('path in $XDG_CONFIG_HOME is relative')
		return xdg
	},
}

/** Linhas com regra própria; tudo o mais é unix — o `default:` do `switch runtime.GOOS` do Go. */
const RULE_BY_PLATFORM: Partial<Record<NodeJS.Platform, UserConfigDirRule>> = {
	darwin: DARWIN,
	win32: WINDOWS,
}

function ruleFor(platform: NodeJS.Platform): UserConfigDirRule {
	return RULE_BY_PLATFORM[platform] ?? UNIX
}

/** `os.UserConfigDir()` — a base por SO, sem o produto. */
export function userConfigDir(input: UserConfigDirInput): string {
	return ruleFor(input.platform).base(input)
}

/** `filepath.Join(os.UserConfigDir(), product)` — o default de CODM_DATA_DIR do daemon E do gateway. */
export function defaultDataDir(input: UserConfigDirInput, product: string): string {
	const rule = ruleFor(input.platform)
	return rule.path.join(rule.base(input), product)
}
