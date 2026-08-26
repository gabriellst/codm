/**
 * O env que o shell FORNECE — derivado do manifesto, não redigitado.
 *
 * `template.config.ts` declara, por chave de env, QUEM A LÊ (`consumers`). Três chaves listam
 * `appTauri` entre os leitores: `API_PORT`, `CHANNEL_PORT`, `CODM_CLOUD_URL`. Até 2026-08-26 o
 * supervisor Rust honrava essa relação só por `process.env`, com literais redigitados como default
 * (`port_from_env("API_PORT", 3030)` — cópia do `example` do manifesto, em dois arquivos) e SEM valor
 * nenhum para `CODM_CLOUD_URL`. Num app empacotado não há `process.env`, então o daemon nascia sem a
 * origem da nuvem e respondia `503 CLOUD_UNREACHABLE — "CODM_CLOUD_URL não está configurada"` a toda
 * tela (medido no 0.5.1 instalado). Era a redeclaração por convenção que a regra 5 do CLAUDE.md
 * proíbe: a informação existia no contrato e o consumidor a inferia — ou não.
 *
 * Aqui a relação vira TIPO: `ShellEnvKey` são exatamente as chaves do `REPO.env` cujos `consumers`
 * incluem `appTauri`. `SHELL_ENV` é `Record<ShellEnvKey, string>` — então:
 *   - acrescentar `appTauri` a uma chave no manifesto sem dar valor aqui = erro de `tsc`;
 *   - dar valor a uma chave que o manifesto NÃO entrega ao shell = excess property, erro de `tsc`.
 * O gate é por construção, não por rail.
 *
 * O que o shell ENCAMINHA a cada sidecar é álgebra de conjuntos sobre a mesma relação
 * (`forwardedEnv`): `ShellEnvKey ∩ { k | consumers(k) ∋ workspace do sidecar }`. Daemon (`apiTs`)
 * recebe `API_PORT` + `CODM_CLOUD_URL`; gateway (`apiGo`) recebe `CHANNEL_PORT`. Nada de
 * `if (key === 'X')`.
 *
 * Fatos de RUNTIME (`CODM_DATA_DIR`, `CODM_MIGRATIONS_DIR`, `CODM_PARENT_PID`, `CODM_APP_VERSION`,
 * `NODE_ENV`) NÃO passam por aqui: o supervisor os computa na hora (`src-tauri/src/sidecars/mod.rs`),
 * porque só ele conhece o data dir, o resource dir e o próprio pid. A fronteira é essa: constante
 * declarada no contrato → gerada; fato do processo → Rust.
 *
 * Como chega ao Rust: `./generate.ts` renderiza `src-tauri/shell-env.json` (comitado, vigiado pelo
 * `bun desktop:generate --check`), `src-tauri/build.rs` o lê e emite `cargo:rustc-env`
 * `CODM_SHELL_ENV_<SIDECAR>_<KEY>`, e `src/shell_env.rs` os expõe como `env!()` — constantes de
 * compilação, zero leitura de arquivo em runtime, zero literal em `.rs`. Em dev, `process.env`
 * continua sobrepondo (o `.env` da raiz), exatamente como antes.
 */
import { REPO, type WorkspaceId } from '../../../../template.config'
import { CLOUD } from './cloud'

type EnvDecls = typeof REPO.env

/** As chaves do manifesto que declaram o shell (`appTauri`) como leitor. */
export type ShellEnvKey = {
	[K in keyof EnvDecls]: 'appTauri' extends EnvDecls[K]['consumers'][number] ? K : never
}[keyof EnvDecls]

/**
 * Os valores que o shell fornece. Portas vêm do `example` do manifesto (a mesma fonte que o
 * `.env.example` e o `bun dev` usam — uma só família de portas); a origem da nuvem é a decisão de
 * shell em `./cloud.ts`, que também autoriza a origem na CSP.
 */
export const SHELL_ENV: Record<ShellEnvKey, string> = {
	API_PORT: REPO.env.API_PORT.example,
	CHANNEL_PORT: REPO.env.CHANNEL_PORT.example,
	CODM_CLOUD_URL: CLOUD.origin,
}

const SHELL_ENV_KEYS = Object.keys(SHELL_ENV) as ShellEnvKey[]

/**
 * O subconjunto de `SHELL_ENV` que um sidecar recebe no boot: as chaves que o shell fornece E que o
 * workspace daquele sidecar declara ler. Puro lookup sobre a relação do manifesto.
 */
export function forwardedEnv(workspace: WorkspaceId): Readonly<Partial<Record<ShellEnvKey, string>>> {
	const entries = SHELL_ENV_KEYS.filter(key => {
		const consumers: readonly string[] = REPO.env[key].consumers
		return consumers.includes(workspace)
	}).map(key => [key, SHELL_ENV[key]] as const)
	return Object.fromEntries(entries)
}
