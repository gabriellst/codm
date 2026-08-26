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
 * incluem `appTauri`. `SHELL_ENV` é `Record<ShellEnvKey, ShellEnvEntry>` — então:
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
 *
 * ── portas: CANDIDATAS, não um valor único (incidente 2026-08-25) ───────────────────────────────
 * `API_PORT`/`CHANNEL_PORT` continuam sendo as chaves que os dois sidecars leem — o que mudou é QUEM
 * decide o valor: não mais `REPO.env.<KEY>.example` (a família de portas do `bun dev`, 3030/3032 —
 * um app empacotado não tem por que disputar essa faixa com qualquer outro `bun dev`/Node/Go do
 * mesmo founder), e sim `./ports.ts` `PORT_CANDIDATES` — uma lista de portas incomuns, na mesma
 * ordem em que o supervisor Rust tenta cada uma (`sidecars::lifecycle::choose_free_port`: primeira
 * livre vence). Um `ShellEnvEntry` é ou uma LISTA de candidatas (portas) ou um valor FIXO (URL/nome
 * de marca) — a distinção é DECLARADA por chave abaixo, nunca inferida de `key.endsWith('_PORT')`.
 */
import { REPO, type WorkspaceId } from '../../../../template.config'
import { CLOUD } from './cloud'
import { PORT_CANDIDATES } from './ports'

type EnvDecls = typeof REPO.env

/** As chaves do manifesto que declaram o shell (`appTauri`) como leitor. */
export type ShellEnvKey = {
	[K in keyof EnvDecls]: 'appTauri' extends EnvDecls[K]['consumers'][number] ? K : never
}[keyof EnvDecls]

/**
 * Um valor de `SHELL_ENV`: ou uma lista ORDENADA de portas candidatas (o supervisor tenta cada uma,
 * na ordem, e usa a primeira livre — `sidecars::lifecycle::choose_free_port`), ou um valor fixo
 * único (URL, nome de marca). `renderShellEnv`/`build.rs` tratam as duas formas explicitamente —
 * nunca por convenção de sufixo no NOME da chave.
 */
export type ShellEnvEntry =
	| { readonly kind: 'candidates'; readonly candidates: readonly string[] }
	| { readonly kind: 'fixed'; readonly value: string }

function candidates(ports: readonly number[]): ShellEnvEntry {
	return { kind: 'candidates', candidates: ports.map(String) }
}

function fixed(value: string): ShellEnvEntry {
	return { kind: 'fixed', value }
}

/** Lê um `ShellEnvEntry` fixo, ou falha alto — usado por quem só sabe lidar com um valor único (a
 *  origem da cloud, o nome de marca). Um `'candidates'` ali é bug de contrato, nunca um caso a tratar. */
export function fixedValue(entry: ShellEnvEntry): string {
	if (entry.kind !== 'fixed') throw new Error(`expected a fixed ShellEnvEntry, got '${entry.kind}'`)
	return entry.value
}

/** Lê um `ShellEnvEntry` de candidatas, ou falha alto — o inverso de `fixedValue`. */
export function candidateValues(entry: ShellEnvEntry): readonly string[] {
	if (entry.kind !== 'candidates') throw new Error(`expected a candidates ShellEnvEntry, got '${entry.kind}'`)
	return entry.candidates
}

/**
 * Os valores que o shell fornece. `API_PORT`/`CHANNEL_PORT` vêm de `./ports.ts` (candidatas — a
 * PACKAGED app tem sua própria faixa incomum, nunca a família de dev); a origem da nuvem é a decisão
 * de shell em `./cloud.ts`, que também autoriza a origem na CSP.
 */
export const SHELL_ENV: Record<ShellEnvKey, ShellEnvEntry> = {
	API_PORT: candidates(PORT_CANDIDATES.API_PORT),
	CHANNEL_PORT: candidates(PORT_CANDIDATES.CHANNEL_PORT),
	CODM_CLOUD_URL: fixed(CLOUD.origin),
	// O nome que o CLIENTE vê: dispositivo vinculado no WhatsApp (gateway) e chrome do e-mail
	// (daemon). É a marca de exibição, não o token minúsculo (`REPO.brand` = identificador de
	// bundle/pastas). Medido no 0.5.3: sem esta entrada os dois sidecars caíam em 'Your Product'.
	PRODUCT_NAME: fixed(REPO.brandDisplay),
}

const SHELL_ENV_KEYS = Object.keys(SHELL_ENV) as ShellEnvKey[]

/**
 * O subconjunto de `SHELL_ENV` que um sidecar recebe no boot: as chaves que o shell fornece E que o
 * workspace daquele sidecar declara ler. Puro lookup sobre a relação do manifesto.
 */
export function forwardedEnv(workspace: WorkspaceId): Readonly<Partial<Record<ShellEnvKey, ShellEnvEntry>>> {
	const entries = SHELL_ENV_KEYS.filter(key => {
		const consumers: readonly string[] = REPO.env[key].consumers
		return consumers.includes(workspace)
	}).map(key => [key, SHELL_ENV[key]] as const)
	return Object.fromEntries(entries)
}
