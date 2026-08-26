import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { healthPathOf, planSmoke, shellEnvByRole, SMOKE_PORTS, type SmokeInputs } from './smoke-sidecars'

const ROOT = resolve(import.meta.dirname, '..', '..')

const base: SmokeInputs = {
	brand: 'codm',
	platform: 'darwin',
	binariesDir: '/repo/packages/app/tauri/src-tauri/binaries',
	entries: ['codm-daemon-aarch64-apple-darwin', 'codm-gateway-aarch64-apple-darwin', 'daemon-runtime', 'migrations'],
	dataDir: '/tmp/codm-smoke-abc',
	parentPid: 4242,
	appVersion: '0.5.0-beta.7',
	ports: SMOKE_PORTS,
	healthPaths: { daemon: '/health', gateway: '/health' },
	// O arquivo REAL comitado, não uma cópia à mão: o gate cross-lang abaixo compara o plano com o
	// Rust, e os dois têm de nascer do mesmo `shell-env.json`.
	shellEnv: shellEnvByRole(),
}

/**
 * As chaves de env que o SHELL passa a cada sidecar, extraídas do Rust — `sidecars()` em
 * src-tauri/src/sidecars/mod.rs escreve cada par como `("CHAVE".into(), …)`. O `\s*` entre o
 * parêntese e a aspa é OBRIGATÓRIO: o rustfmt quebra tuplas longas em várias linhas (hoje,
 * CHANNEL_ALLOWED_ORIGINS em mod.rs:138-141 — `(` numa linha, `"CHAVE".into(),` na seguinte);
 * um regex colado perderia essas chaves em silêncio. Mesmo desenho do DSK-07 (updater.rs
 * espelha updater.ts): o smoke não pode divergir do supervisor em silêncio.
 */
function shellBootEnvKeys(role: 'daemon' | 'gateway'): string[] {
	const source = readFileSync(resolve(ROOT, 'packages/app/tauri/src-tauri/src/sidecars/mod.rs'), 'utf8')
	const block = source.split(`name: "codm-${role}"`)[1]?.split('Sidecar {')[0] ?? ''
	return [...block.matchAll(/\(\s*"([A-Z_]+)"\.into\(\)/g)].map(m => m[1] as string)
}

describe('smoke-sidecars (planSmoke — o espelho do supervisor)', () => {
	it('escolhe o binário pelo prefixo <brand>-<role>- e ignora as pastas staged', () => {
		const plans = planSmoke(base)
		expect(plans.map(p => p.role)).toEqual(['daemon', 'gateway'])
		expect(plans[0]?.binary).toBe('/repo/packages/app/tauri/src-tauri/binaries/codm-daemon-aarch64-apple-darwin')
		expect(plans[1]?.binary).toBe('/repo/packages/app/tauri/src-tauri/binaries/codm-gateway-aarch64-apple-darwin')
	})

	it('no Windows exige o sufixo .exe (é o nome que o Tauri resolve como externalBin)', () => {
		const plans = planSmoke({
			...base,
			platform: 'win32',
			entries: ['codm-daemon-x86_64-pc-windows-msvc.exe', 'codm-gateway-x86_64-pc-windows-msvc.exe', 'daemon-runtime', 'migrations'],
		})
		expect(plans.every(p => p.binary.endsWith('.exe'))).toBe(true)
		// Sem .exe no win32 = build que não vai virar bundle; o smoke tem de falhar aqui, legível.
		expect(() => planSmoke({ ...base, platform: 'win32' })).toThrow('codm-daemon')
	})

	it('falha alto quando um binário falta ou há dois para o mesmo papel', () => {
		expect(() => planSmoke({ ...base, entries: ['codm-daemon-aarch64-apple-darwin', 'daemon-runtime', 'migrations'] })).toThrow(
			'codm-gateway',
		)
		expect(() => planSmoke({ ...base, entries: [...base.entries, 'codm-daemon-x86_64-apple-darwin'] })).toThrow('codm-daemon')
	})

	it('falha alto quando o staging não tem daemon-runtime ou migrations', () => {
		// Sem isso o erro seria um spawn ENOENT críptico ou um timeout de 60s — aqui é legível.
		expect(() => planSmoke({ ...base, entries: base.entries.filter(e => e !== 'daemon-runtime') })).toThrow('daemon-runtime')
		expect(() => planSmoke({ ...base, entries: base.entries.filter(e => e !== 'migrations') })).toThrow('migrations')
	})

	it('o daemon nasce DENTRO de daemon-runtime e o gateway num cwd sem .env', () => {
		const [daemon, gateway] = planSmoke(base)
		expect(daemon?.cwd).toBe('/repo/packages/app/tauri/src-tauri/binaries/daemon-runtime')
		// Desvio DELIBERADO do shell (que spawna o gateway com cwd herdado — mod.rs cwd: None):
		// godotenv.Overload(".env") no config.go do gateway lê o .env do CWD por cima do env recebido —
		// rodando na raiz do repo ele trocaria CODM_DATA_DIR/CHANNEL_PORT pelos de produção do founder.
		expect(gateway?.cwd).toBe('/tmp/codm-smoke-abc')
	})

	it('espelha EXATAMENTE as chaves de env que o Rust passa a cada sidecar (gate cross-lang)', () => {
		const [daemon, gateway] = planSmoke(base)
		expect(Object.keys(daemon?.env ?? {}).sort()).toEqual(shellBootEnvKeys('daemon').sort())
		expect(Object.keys(gateway?.env ?? {}).sort()).toEqual(shellBootEnvKeys('gateway').sort())
		expect(shellBootEnvKeys('daemon').length).toBeGreaterThan(0)
		// Guard contra rot do próprio extrator: a tupla multi-linha do rustfmt TEM de aparecer.
		expect(shellBootEnvKeys('gateway')).toContain('CHANNEL_ALLOWED_ORIGINS')
	})

	it('valores: portas do smoke, data dir temporário, migrations staged, pid do supervisor', () => {
		const [daemon, gateway] = planSmoke(base)
		expect(daemon?.env).toMatchObject({
			API_PORT: '3130',
			CODM_DATA_DIR: '/tmp/codm-smoke-abc',
			CODM_MIGRATIONS_DIR: '/repo/packages/app/tauri/src-tauri/binaries/migrations',
			API_GO_URL: 'http://localhost:3132',
			NODE_ENV: 'production',
			CODM_PARENT_PID: '4242',
			CODM_APP_VERSION: '0.5.0-beta.7',
		})
		expect(gateway?.env).toMatchObject({
			CHANNEL_PORT: '3132',
			CODM_DATA_DIR: '/tmp/codm-smoke-abc',
			CHANNEL_ALLOWED_ORIGINS: 'tauri://localhost,http://localhost:5173',
			CODM_PARENT_PID: '4242',
		})
	})

	it('URLs de health: daemon direto na porta, gateway sob a fronteira /api (api/mod.rs)', () => {
		const [daemon, gateway] = planSmoke(base)
		expect(daemon?.healthUrl).toBe('http://127.0.0.1:3130/health')
		expect(gateway?.healthUrl).toBe('http://127.0.0.1:3132/api/health')
	})
})

describe('smoke-sidecars (healthPathOf — o caminho vem do CONTRATO, não de literal)', () => {
	it('acha o path cujo último segmento é health', () => {
		expect(healthPathOf({ paths: { '/v1/session': {}, '/v1/health': {} } })).toBe('/v1/health')
		expect(healthPathOf({ paths: { '/health': {}, '/healthz-not': {} } })).toBe('/health')
	})
	it('recusa um spec sem health — o supervisor não teria o que chamar', () => {
		expect(() => healthPathOf({ paths: { '/v1/session': {} } })).toThrow('health')
	})
	it('recusa ambiguidade — dois paths de health é decisão humana, não first-match silencioso', () => {
		expect(() => healthPathOf({ paths: { '/health': {}, '/v1/health': {} } })).toThrow('esperava exatamente 1')
	})
})
