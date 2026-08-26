#!/usr/bin/env bun
/**
 * Smoke dos sidecars recém-compilados — o gate que um build sozinho nunca dá. `build-sidecars.ts`
 * avisa em texto: o binário do daemon COMPILA limpo e morre no primeiro connect quando o prebuild
 * nativo do libsql não está ao lado dele. Este script sobe cada binário de `src-tauri/binaries/`
 * com o env que o shell injeta (espelho de `sidecars()` em src-tauri/src/sidecars/mod.rs, gate
 * cross-lang em ./smoke-sidecars.test.ts); o daemon com o MESMO cwd do shell (daemon-runtime), o
 * gateway num cwd SEM `.env` — desvio deliberado, ver BOOT.gateway. Espera o health responder 200
 * no mesmo orçamento do supervisor (60s, cadência 500ms) e derruba tudo.
 *
 * Puro no núcleo (`planSmoke`, `healthPathOf`) e fino na casca (CLI) — mesmo desenho do
 * make-manifest.ts. Roda em macOS, Linux e Windows: é o passo `smoke` de todo entry da matriz de
 * release e do job Linux do correctness.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { REPO } from '../../template.config'
import { SIDECARS } from '../../packages/app/tauri/config/sidecars'

/** Mesmo orçamento e cadência do bootstrap do supervisor (mod.rs: 60s, 500ms). */
export const HEALTH_BUDGET_MS = 60_000
export const HEALTH_CADENCE_MS = 500

/**
 * MIRROR of `core/src/utils/StdinShutdown.ts` `SHUTDOWN_SENTINEL_LINE` and
 * `src-tauri/src/sidecars/lifecycle.rs` `SHUTDOWN_SENTINEL` — a three-way frozen wire constant.
 * Pinned as a literal here, NOT imported from core: scripts under `scripts/` stay standalone (no
 * dependency on the api-typescript workspace).
 */
const SHUTDOWN_SENTINEL_LINE = 'supervisor:shutdown'

/** Quanto esperar o daemon drenar sozinho depois da sentinela, antes de escalar para kill(). */
const SENTINEL_STOP_BUDGET_MS = 5_000

/**
 * Portas do smoke — NUNCA as de produção (3030/3032). O runner macOS é a máquina de trabalho do
 * founder, e o daemon real dela escuta nas portas de produção; um smoke nelas falharia por
 * EADDRINUSE ou, pior, mediria o daemon errado.
 */
export const SMOKE_PORTS = { daemon: 3130, gateway: 3132 } as const

type Role = (typeof SIDECARS)[number]['role']

export interface SmokeInputs {
	brand: string
	platform: NodeJS.Platform
	binariesDir: string
	/** `readdirSync(binariesDir)` — injetado para o núcleo não tocar disco. */
	entries: readonly string[]
	dataDir: string
	parentPid: number
	appVersion: string
	ports: { daemon: number; gateway: number }
	/** Path de health por papel, lido do openapi.json de cada backend (ver `healthPathOf`). */
	healthPaths: Record<Role, string>
	/** O env de CONTRATO que o shell injeta em cada sidecar (mod.rs: `shell_env::value_from_env`),
	 *  por papel, lido do MESMO `shell-env.json` comitado que o build.rs consome — nunca um literal
	 *  aqui, e nunca chave a chave: uma chave nova no manifesto (`config/env.ts`) chega ao smoke
	 *  sozinha, exatamente como chega ao Rust. Foi `cloudUrl: string` até 2026-08-26; o dia em que
	 *  `PRODUCT_NAME` entrou no `SHELL_ENV`, o gate cross-lang acusou o espelho desatualizado. */
	shellEnv: ShellEnvByRole
}

/** A forma do `shell-env.json`: papel → chave → valor, os papéis sendo os de `SIDECARS`. */
export type ShellEnvByRole = Record<Role, Record<string, string>>

export interface SidecarPlan {
	role: Role
	name: string
	binary: string
	cwd: string
	env: Record<string, string>
	healthUrl: string
}

/** Um spec OpenAPI só precisa de `paths` aqui. Exige EXATAMENTE 1 path de health — dois seria
 * ambiguidade que merece decisão humana, não um first-match silencioso. */
export function healthPathOf(spec: { paths: Record<string, unknown> }): string {
	const matches = Object.keys(spec.paths).filter(p => p.split('/').at(-1) === 'health')
	if (matches.length !== 1) {
		throw new Error(`esperava exatamente 1 path de health no openapi.json, achei ${matches.length} (${matches.join(', ') || 'nenhum'})`)
	}
	return matches[0] as string
}

/**
 * O boot de cada papel, ESPELHO de `sidecars()` em src-tauri/src/sidecars/mod.rs — env e a base do
 * health; cwd do daemon idêntico ao do shell. O gateway é o ÚNICO desvio deliberado: o shell o
 * spawna com `cwd: None` (herda o cwd do shell), mas `config.go` faz `godotenv.Overload(".env")`
 * relativo ao cwd, POR CIMA do env recebido — na raiz do repo isso trocaria
 * CODM_DATA_DIR/CHANNEL_PORT pelos valores de produção; por isso o smoke o põe no dataDir
 * temporário, que garantidamente não tem `.env`. A fronteira `/api` do gateway é decisão do shell
 * (api/mod.rs: pertence à BASE URL, não ao contrato), então mora aqui também.
 */
const BOOT: Record<Role, (i: SmokeInputs) => { cwd: string; env: Record<string, string>; healthBase: string }> = {
	daemon: i => ({
		cwd: join(i.binariesDir, 'daemon-runtime'),
		env: {
			// Contrato primeiro (CODM_CLOUD_URL, PRODUCT_NAME, …), runtime do smoke por cima — a
			// porta é a de TESTE (3130), sobrepondo o API_PORT de produção que o contrato traz.
			...i.shellEnv.daemon,
			API_PORT: String(i.ports.daemon),
			CODM_DATA_DIR: i.dataDir,
			CODM_MIGRATIONS_DIR: join(i.binariesDir, 'migrations'),
			// O rail espelha CHAVES, não valores: o shell deriva do CHANNEL_PORT do contrato;
			// aqui a URL aponta o gateway DO SMOKE (3132) — senão o daemon mediria o gateway errado.
			API_GO_URL: `http://localhost:${i.ports.gateway}`,
			NODE_ENV: 'production',
			CODM_PARENT_PID: String(i.parentPid),
			CODM_APP_VERSION: i.appVersion,
		},
		healthBase: `http://127.0.0.1:${i.ports.daemon}`,
	}),
	gateway: i => ({
		cwd: i.dataDir,
		env: {
			...i.shellEnv.gateway,
			CHANNEL_PORT: String(i.ports.gateway),
			CODM_DATA_DIR: i.dataDir,
			CHANNEL_ALLOWED_ORIGINS: 'tauri://localhost,http://localhost:5173',
			CODM_PARENT_PID: String(i.parentPid),
		},
		healthBase: `http://127.0.0.1:${i.ports.gateway}/api`,
	}),
}

export function planSmoke(i: SmokeInputs): SidecarPlan[] {
	// Staging incompleto falha AQUI, legível — não como spawn ENOENT críptico nem timeout de 60s.
	for (const dir of ['daemon-runtime', 'migrations'] as const) {
		if (!i.entries.includes(dir)) throw new Error(`${dir} ausente em ${i.binariesDir} — rode bun desktop:sidecars`)
	}
	const exe = i.platform === 'win32' ? '.exe' : ''
	return SIDECARS.map(sidecar => {
		const name = `${i.brand}-${sidecar.role}`
		const candidates = i.entries.filter(e => e.startsWith(`${name}-`) && e.endsWith(exe))
		if (candidates.length !== 1) {
			throw new Error(
				`esperava exatamente 1 binário ${name}-<triple>${exe} em ${i.binariesDir}, achei ${candidates.length} (${candidates.join(', ') || 'nenhum'}) — rode bun desktop:sidecars`,
			)
		}
		const boot = BOOT[sidecar.role](i)
		return {
			role: sidecar.role,
			name,
			binary: join(i.binariesDir, candidates[0] as string),
			cwd: boot.cwd,
			env: boot.env,
			healthUrl: `${boot.healthBase}${i.healthPaths[sidecar.role]}`,
		}
	})
}

/**
 * O que os filhos herdam do processo do smoke — uma allowlist, não `...process.env`. O bun carrega
 * o `.env` da raiz no próprio process.env ao rodar da raiz do repo, e repassá-lo inteiro levaria
 * CODM_DATA_DIR/PORT/REDIS_URL de dev para dentro dos sidecars: o smoke deixaria de medir o boot
 * que o shell faz. O que entra é só o que o SO precisa para executar um binário.
 */
const INHERITED_ENV = [
	'PATH',
	'HOME',
	'TMPDIR',
	'LANG',
	'LC_ALL',
	// Windows: sem SystemRoot o runtime nem resolve DLLs; os *APPDATA são o os.UserConfigDir do Go.
	'SystemRoot',
	'SYSTEMROOT',
	'windir',
	'TEMP',
	'TMP',
	'USERPROFILE',
	'APPDATA',
	'LOCALAPPDATA',
	'ProgramData',
	'COMSPEC',
	'PATHEXT',
] as const

function inheritedEnv(): Record<string, string> {
	const out: Record<string, string> = {}
	for (const key of INHERITED_ENV) {
		const v = process.env[key]
		if (v !== undefined) out[key] = v
	}
	return out
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/**
 * Spawn num helper próprio para o tsc INFERIR `stderr: 'pipe'` no tipo do Subprocess: `proc.stderr`
 * sai `ReadableStream<Uint8Array>` (async-iterável no bun) e o `for await` dispensa qualquer cast —
 * tipar por `ReturnType<typeof Bun.spawn>` (genérico nos defaults) mascararia isso com um `as`.
 *
 * Espelha o shell mais fielmente para o daemon: `stdin: 'pipe'`, mantido aberto pelo run inteiro,
 * porque `armStdinShutdown` (core/src/utils/StdinShutdown.ts) só é armado quando `CODM_PARENT_PID`
 * está setado — e este smoke seta (mirrora o env do shell). Sem um pipe vivo, o padrão do
 * `Bun.spawn` é `stdin: 'ignore'`, que o filho lê como EOF imediato; era exatamente isso que
 * derrubava o daemon antes dele responder health (ver `stop`/`stopGracefully` abaixo para o uso
 * desse pipe). O gateway não lê stdin — fica no default.
 */
function spawnSidecar(plan: SidecarPlan) {
	if (plan.role === 'daemon') {
		return Bun.spawn([plan.binary], {
			cwd: plan.cwd,
			env: { ...inheritedEnv(), ...plan.env },
			stdin: 'pipe',
			stdout: 'ignore',
			stderr: 'pipe',
		})
	}
	return Bun.spawn([plan.binary], {
		cwd: plan.cwd,
		env: { ...inheritedEnv(), ...plan.env },
		stdout: 'ignore',
		stderr: 'pipe',
	})
}
type Spawned = ReturnType<typeof spawnSidecar>

interface Running {
	plan: SidecarPlan
	proc: Spawned
	stderr: string[]
}

function launch(plan: SidecarPlan): Running {
	console.log(`[smoke] ${plan.name}: ${plan.binary} (cwd ${plan.cwd})`)
	const proc = spawnSidecar(plan)
	const stderr: string[] = []
	// Tail do stderr — é a única coisa que explica um daemon que morreu antes de abrir a porta.
	void (async () => {
		for await (const chunk of proc.stderr) {
			for (const line of new TextDecoder().decode(chunk).split('\n')) {
				if (line.trim().length === 0) continue
				stderr.push(line)
				if (stderr.length > 40) stderr.shift()
			}
		}
	})()
	return { plan, proc, stderr }
}

/** 200 = pronto; 503 = vivo mas ainda não (segue); sem resposta = ainda não abriu a porta (segue). */
async function waitHealthy(r: Running): Promise<string | null> {
	const deadline = Date.now() + HEALTH_BUDGET_MS
	let last = 'sem resposta'
	while (Date.now() < deadline) {
		if (r.proc.exitCode !== null) return `${r.plan.name} saiu antes de ficar saudável (exit ${r.proc.exitCode})`
		try {
			const res = await fetch(r.plan.healthUrl, { signal: AbortSignal.timeout(2_000) })
			if (res.status === 200) return null
			last = `HTTP ${res.status}`
		} catch (error) {
			last = error instanceof Error ? error.message : String(error)
		}
		await sleep(HEALTH_CADENCE_MS)
	}
	return `${r.plan.name} não respondeu 200 em ${r.plan.healthUrl} dentro de ${HEALTH_BUDGET_MS / 1000}s (último: ${last})`
}

/**
 * O PASSO GRACIOSO que o shell exercita no quit (`lifecycle.rs` `Supervised::terminate`, TODA
 * plataforma) — mirrorado aqui de ponta a ponta para o smoke provar isso de verdade, em todo
 * runner: escreve a linha-sentinela no stdin do daemon (o `armStdinShutdown` do lado de lá só
 * reage a essa linha exata — EOF não dispara mais nada, ver `StdinShutdown.ts`), depois espera o
 * drain. `false` sem lançar quando não há `stdin` piped (só o daemon tem, ver `spawnSidecar`) ou
 * quando a escrita falha (pipe já fechado) — o chamador escala para `kill()` de todo modo.
 */
async function stopGracefully(proc: Spawned): Promise<boolean> {
	if (!proc.stdin) return false
	try {
		proc.stdin.write(`${SHUTDOWN_SENTINEL_LINE}\n`)
		await proc.stdin.flush()
	} catch {
		return false
	}
	return Promise.race([proc.exited.then(() => true), sleep(SENTINEL_STOP_BUDGET_MS).then(() => false)])
}

async function stop(r: Running): Promise<void> {
	if (r.proc.exitCode !== null) return
	if (r.plan.role === 'daemon') {
		const graceful = await stopGracefully(r.proc)
		console.log(`[smoke] ${r.plan.name}: ${graceful ? 'saiu pela linha-sentinela (graceful)' : 'nao respondeu a sentinela a tempo, kill'}`)
	}
	if (r.proc.exitCode !== null) return
	// SIGTERM no unix (o daemon drena); no Windows o bun termina o processo — o que o shell também faz lá.
	r.proc.kill()
	const exited = await Promise.race([r.proc.exited.then(() => true), sleep(10_000).then(() => false)])
	if (!exited) {
		r.proc.kill('SIGKILL')
		// Espere a morte DE VERDADE antes do finally apagar o dataDir: no Windows um processo ainda
		// vivo segura lock nos arquivos SQLite e o rmSync lança (force:true não cobre EBUSY/EPERM).
		await Promise.race([r.proc.exited, sleep(2_000)])
	}
}

function openapiPath(workspace: keyof typeof REPO.workspaces): string {
	return resolve(import.meta.dirname, '..', '..', REPO.workspaces[workspace].pkgRoot, 'public', 'docs', 'openapi.json')
}

/** ÚNICA fonte do env de contrato dos sidecars: o `shell-env.json` COMITADO que `config/generate.ts`
 *  renderiza e `build.rs` lê para o supervisor Rust — nunca um literal aqui (mesmo insumo, dois
 *  runtimes). Exportado para o teste do gate cross-lang montar o plano sobre o arquivo REAL. */
export function shellEnvByRole(): ShellEnvByRole {
	const path = resolve(import.meta.dirname, '..', '..', REPO.workspaces.appTauri.pkgRoot, 'src-tauri', 'shell-env.json')
	return JSON.parse(readFileSync(path, 'utf8')) as ShellEnvByRole
}

async function main(): Promise<number> {
	const binariesDir = resolve(import.meta.dirname, '..', '..', REPO.workspaces.appTauri.pkgRoot, 'src-tauri', 'binaries')
	const dataDir = mkdtempSync(join(tmpdir(), `${REPO.brand}-smoke-`))
	const healthPaths = Object.fromEntries(
		SIDECARS.map(s => [s.role, healthPathOf(JSON.parse(readFileSync(openapiPath(s.build.workspace), 'utf8')))]),
	) as Record<Role, string>
	const plans = planSmoke({
		brand: REPO.brand,
		platform: process.platform,
		binariesDir,
		entries: readdirSync(binariesDir),
		dataDir,
		parentPid: process.pid,
		appVersion: process.env.CODM_APP_VERSION ?? '0.0.0-smoke',
		ports: SMOKE_PORTS,
		healthPaths,
		shellEnv: shellEnvByRole(),
	})

	// Os dois de uma vez, como o shell — eles abrem o MESMO SQLite e migram de forma idempotente em
	// qualquer ordem; subir em série esconderia justamente a corrida que o boot real tem.
	const running = plans.map(launch)
	let failure: string | null = null
	try {
		const results = await Promise.all(running.map(waitHealthy))
		failure = results.find(r => r !== null) ?? null
		for (const [i, r] of running.entries()) {
			if (results[i] === null) console.log(`[smoke] ${r.plan.name}: 200 em ${r.plan.healthUrl}`)
		}
	} finally {
		await Promise.all(running.map(stop))
		rmSync(dataDir, { recursive: true, force: true })
	}
	if (failure !== null) {
		console.error(`::error::${failure}`)
		for (const r of running) {
			if (r.stderr.length === 0) continue
			console.error(`--- stderr ${r.plan.name} (últimas ${r.stderr.length} linhas)`)
			for (const line of r.stderr) console.error(`  ${line}`)
		}
		return 1
	}
	console.log(`[smoke] ${plans.length} sidecars saudáveis — ok`)
	return 0
}

if (import.meta.main) {
	process.exit(await main())
}
