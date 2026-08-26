// Drift gate for the desktop config (mirrors the env-model ENV-04 rail): the committed
// tauri.conf.json / capabilities/default.json must be EXACTLY what ./generate.ts renders from the
// LOCAL config (./app, ./window, ./capabilities, ./sidecars) + the abstract contract
// (template.config.ts REPO.brand/workspaces/env). Any hand-edit of a generated file, or a config
// change without regeneration, is a red build.
import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO } from '../../../../template.config'
import { CONSOLE, IDENTIFIER } from './app'
import { CAPABILITIES, CAPABILITY_PERMISSIONS } from './capabilities'
import { DEEPLINK } from './deeplink'
import { DMG } from './dmg'
import { ANALYTICS } from './analytics'
import { CLOUD } from './cloud'
import { UPDATER } from './updater'
import { candidateValues, fixedValue, SHELL_ENV, type ShellEnvKey } from './env'
import { cargoNameDrift, OUTPUTS, renderCapabilities, renderShellEnv, renderTauriConf } from './generate'
import { PORT_CANDIDATES } from './ports'
import { SIDECARS } from './sidecars'
import { BOOT_ERROR_FRAME, WINDOW_FRAME } from './window'

// config/ → tauri → app → packages → repo root (four levels up).
const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..')

describe('desktop config (packages/app/tauri/config)', () => {
	it('DSK-01: every committed output is exactly the config rendering (bun desktop:generate)', () => {
		for (const out of OUTPUTS) {
			const committed = readFileSync(resolve(ROOT, out.path), 'utf8')
			expect(committed === out.render(), `${out.path} is out of sync with the desktop config — run: bun desktop:generate`).toBe(true)
		}
	})

	it('DSK-02: Cargo.toml package/lib names are brand-derived (stamped, drift-checked)', () => {
		expect(cargoNameDrift()).toEqual([])
	})

	it('DSK-03: sidecar manifest workspaces + port env keys resolve (renderers fail loud on dangling refs)', () => {
		// renderTauriConf throws on an unknown console→sidecar role or a non-port env example —
		// rendering IS the assertion. The manifest's own refs (workspace, portEnvKey) must resolve too.
		expect(renderTauriConf().length).toBeGreaterThan(0)
		for (const sidecar of SIDECARS) {
			expect(REPO.workspaces[sidecar.build.workspace], `sidecar '${sidecar.role}' names unknown workspace`).toBeDefined()
			expect(
				(REPO.env as Record<string, unknown>)[sidecar.portEnvKey],
				`sidecar '${sidecar.role}' names unknown port env key '${sidecar.portEnvKey}'`,
			).toBeDefined()
			// NO readiness path here. Since E1 the shell probes through the generated `health()`
			// operation, so the path lives in the OpenAPI contract; a path field in this manifest
			// would be documentation nobody reads — editing it would not change what the SDK calls.
			expect('healthPath' in sidecar, `sidecar '${sidecar.role}' re-declares a health path — it lives in the contract`).toBe(
				false,
			)
		}
	})

	it('DSK-04: tauri.conf reflects the manifest — externalBin + identity + staged resources', () => {
		const conf = JSON.parse(renderTauriConf()) as {
			identifier: string
			app: { windows: { label: string; visible: boolean; url?: string }[] }
			bundle: { externalBin: string[]; resources: Record<string, string> }
		}
		expect(conf.identifier).toBe(IDENTIFIER)
		// TWO windows, and BOTH born hidden: the readiness gate reveals exactly one of them
		// (Reveal::Main | Reveal::BootError). A visible main window here would resurrect the
		// fail-open the gate exists to kill — the console painting over dead backends.
		expect(conf.app.windows.map(w => w.label)).toEqual([WINDOW_FRAME.label, BOOT_ERROR_FRAME.label])
		expect(conf.app.windows.map(w => w.visible)).toEqual([false, false])
		// The splash is a static file from the console's public/, never a React route.
		expect(conf.app.windows.find(w => w.label === BOOT_ERROR_FRAME.label)?.url).toBe('boot-error.html')
		expect(conf.bundle.externalBin).toEqual(SIDECARS.map(s => `binaries/${REPO.brand}-${s.role}`))
		// The staged assets a compiled sidecar reads from disk: the Drizzle migrations, and the
		// daemon's libsql native-prebuild dir — which is ALSO its spawn cwd (Sidecar.cwd in mod.rs).
		expect(conf.bundle.resources).toEqual({
			'binaries/migrations': 'migrations',
			'binaries/daemon-runtime': 'daemon-runtime',
		})
	})

	it('DSK-06: capabilities render through the shell-owned CAPABILITY_PERMISSIONS map (every key mapped)', () => {
		// The abstract config (CAPABILITIES) holds ONLY capability keys; the capability → Tauri
		// permission map lives in ./capabilities. Every declared capability MUST have a mapping
		// there — renderCapabilities throws otherwise.
		const map = CAPABILITY_PERMISSIONS as Record<string, readonly string[] | undefined>
		for (const cap of CAPABILITIES) {
			expect(map[cap], `capability '${cap}' has no permission mapping in ./capabilities`).toBeDefined()
		}
		// Rendering is behaviour-preserving: core:default + each capability's mapped permissions, in order.
		const rendered = JSON.parse(renderCapabilities()) as { permissions: string[]; windows: string[] }
		const expected = ['core:default', ...CAPABILITIES.flatMap(cap => map[cap] ?? [])]
		expect(rendered.permissions).toEqual(expected)
		// BOTH window labels — `core:default` (which covers `invoke`) is granted per window, so
		// dropping the splash's label would leave the boot-error page unable to call boot_failures.
		expect(rendered.windows).toEqual([WINDOW_FRAME.label, BOOT_ERROR_FRAME.label])
	})

	it('DSK-05: desktop dev serves the root-based SPA (devUrl = ROOT, beforeDevCommand = dev-spa target)', () => {
		const conf = JSON.parse(renderTauriConf()) as { build: { devUrl: string; beforeDevCommand: string } }
		const console_ = CONSOLE
		const consoleWs = REPO.workspaces[console_.workspace]
		const vitePort = REPO.env.VITE_PORT.example
		// devUrl is the ROOT (desktop base '/'), NOT the web '/app/' mount — the whole bug.
		expect(conf.build.devUrl).toBe(`http://localhost:${vitePort}${console_.devBasePath}`)
		expect(console_.devBasePath).toBe('/')
		expect(conf.build.devUrl).toBe(`http://localhost:${vitePort}/`)
		expect(conf.build.devUrl.endsWith('/app/')).toBe(false)
		// beforeDevCommand runs the SPA/desktop dev target (base '/', nitro kept for the dev
		// document server — stripped only for build-spa), never the web `dev`.
		expect(console_.devTarget).toBe('dev-spa')
		expect(conf.build.beforeDevCommand).toBe(`bun x nx run ${consoleWs.nxProject}:${console_.devTarget}`)
	})

	it('DSK-13: the install window (bundle.macOS.dmg) is config/dmg.ts verbatim and its background is committed', () => {
		const conf = JSON.parse(renderTauriConf()) as {
			bundle: { macOS: { dmg: Record<string, unknown> } }
		}
		expect(conf.bundle.macOS.dmg).toEqual({
			background: DMG.background,
			windowSize: DMG.windowSize,
			windowPosition: DMG.windowPosition,
			appPosition: DMG.appPosition,
			applicationFolderPosition: DMG.applicationFolderPosition,
		})
		// Both icons sit inside the window, on the same baseline, app on the left — the arrow drawn
		// between them (scripts/og/dmg-background.ts) assumes exactly this.
		expect(DMG.appPosition.y).toBe(DMG.applicationFolderPosition.y)
		expect(DMG.appPosition.x).toBeLessThan(DMG.applicationFolderPosition.x)
		expect(DMG.applicationFolderPosition.x).toBeLessThan(DMG.windowSize.width)
		expect(DMG.appPosition.y).toBeLessThan(DMG.windowSize.height)
		// The bundler copies the picture from src-tauri/<background>; a missing file is a silent
		// fallback to the bare Finder window (the tauri CLI only warns).
		expect(existsSync(resolve(ROOT, REPO.workspaces.appTauri.pkgRoot, 'src-tauri', DMG.background))).toBe(true)
	})

	it('DSK-10: the bundle is ad-hoc signed, so macOS says "unidentified developer" and not "damaged"', () => {
		// The shipped v0.1.0 DMG carried only the linker's signature on the main binary, which claims
		// sealed resources the assembled bundle never had — `codesign --verify` failed and macOS
		// refused it as DAMAGED (no right-click → Abrir escape). Signing the assembled bundle is what
		// keeps the landing's Gatekeeper microcopy true.
		const conf = JSON.parse(renderTauriConf()) as { bundle: { macOS?: { signingIdentity?: string; entitlements?: string } } }
		expect(conf.bundle.macOS?.signingIdentity).toBe('-')
		// Assinar sem o entitlement é PIOR que não assinar: o hardened runtime que vem junto liga a
		// library validation e o daemon morre no dlopen do prebuild nativo (v0.1.2, 2026-08-07). Os
		// dois andam sempre juntos — por isso a asserção mora no mesmo rail.
		expect(conf.bundle.macOS?.entitlements).toBe('entitlements.plist')
	})

	it('DSK-11: a CSP autoriza a origem da cloud — sem ela o login morre antes de sair do webview', () => {
		// `connect-src` é lista fechada: o que não está nela o WKWebView recusa com um TypeError sem
		// status, indistinguível de servidor fora do ar. A v0.1.8 falhava exatamente assim.
		const conf = JSON.parse(renderTauriConf()) as { app: { security: { csp: string } } }
		expect(conf.app.security.csp).toContain(CLOUD.origin)
		// Telemetria bloqueada pela CSP não dá erro visível — só um dashboard vazio que ninguém
		// associa a um bug. Por isso a origem do PostHog é gateada junto com a da cloud.
		expect(conf.app.security.csp).toContain(ANALYTICS.origin)
	})

	it('DSK-12: img-src alcança o daemon (que serve artefato e avatar) e NÃO a CDN do WhatsApp', () => {
		// O daemon serve bytes que o webview desenha: os artefatos gravados pelos agentes e a foto do
		// contato em cada balão do chat. Se a origem dele não estiver no `img-src`, o WKWebView recusa
		// a imagem em silêncio — nada no console distingue isso de "esse contato não tem foto".
		//
		// A CDN da Meta (`pps.whatsapp.net`) fica FORA de propósito, e é por isso que o endpoint de
		// avatar existe: a url é assinada e expira, e cada avatar pintado direto da CDN entregaria o IP
		// do operador. Esta asserção é o que impede alguém de "consertar" o avatar liberando a origem.
		const conf = JSON.parse(renderTauriConf()) as { app: { security: { csp: string } } }
		const imgSrc = conf.app.security.csp.split(';').find(directive => directive.trim().startsWith('img-src'))
		expect(imgSrc).toBeDefined()
		// As MESMAS origens que o connect-src deriva de console.connectsTo — TODAS as candidatas
		// (spec 2026-08-25/26): a porta é escolhida em RUNTIME pelo supervisor, então a CSP não pode
		// saber qual delas vai vencer e tem de liberar a lista inteira, nunca uma porta literal.
		for (const role of CONSOLE.connectsTo) {
			const sidecar = SIDECARS.find(s => s.role === role)
			const ports = candidateValues(SHELL_ENV[sidecar?.portEnvKey ?? 'API_PORT'])
			for (const port of ports) {
				expect(imgSrc).toContain(`http://localhost:${port}`)
				expect(imgSrc).toContain(`http://127.0.0.1:${port}`)
			}
		}
		// data:/blob: continuam (ícones inline, previews de upload); a CDN não entra.
		expect(imgSrc).toContain("'self'")
		expect(imgSrc).toContain('data:')
		expect(imgSrc).toContain('blob:')
		expect(conf.app.security.csp).not.toContain('whatsapp.net')
		// A cloud é do connect-src, não do img-src: ela não serve imagem nenhuma.
		expect(imgSrc).not.toContain(CLOUD.origin)
	})

	it('DSK-09: tauri.conf declares the codm:// deep link scheme from config/deeplink.ts', () => {
		// SP2 device-token flow (spec Decision 4): the system browser redirects to
		// `codm://auth?code=…` after OAuth completes. The scheme is declared ONCE in
		// ./deeplink.ts and rendered here — a literal scheme string anywhere else is a bug.
		const conf = JSON.parse(renderTauriConf()) as {
			plugins: { 'deep-link': { desktop: { schemes: string[] } } }
		}
		expect(DEEPLINK.scheme).toBe('codm')
		expect(conf.plugins['deep-link'].desktop.schemes).toEqual([DEEPLINK.scheme])
	})

	it('DSK-16: SHELL_ENV is exactly the manifest keys the shell consumes (appTauri ∈ consumers) — no more, no less', () => {
		// The relation is declared ONCE, in template.config.ts `consumers`. The shell's table is typed
		// against it (a missing/extra key is a tsc error); this rail states the same fact at runtime
		// so a reader sees the set, and so a consumer edit in the manifest shows up here by name.
		const declared = Object.entries(REPO.env)
			.filter(([, decl]) => (decl.consumers as readonly string[]).includes('appTauri'))
			.map(([key]) => key)
			.sort()
		expect(Object.keys(SHELL_ENV).sort()).toEqual(declared)
		// Ports are the PACKAGED app's own candidate list (./ports.ts) — never the manifest's `.env`
		// example (that family is dev/e2e/bun-dev only, see ./ports.ts docblock for the incident);
		// the cloud origin is the shell decision in ./cloud.ts.
		expect(candidateValues(SHELL_ENV.API_PORT)).toEqual(PORT_CANDIDATES.API_PORT.map(String))
		expect(candidateValues(SHELL_ENV.CHANNEL_PORT)).toEqual(PORT_CANDIDATES.CHANNEL_PORT.map(String))
		expect(fixedValue(SHELL_ENV.CODM_CLOUD_URL)).toBe(CLOUD.origin)
	})

	it('DSK-17: every declared port candidate is authorized in the CSP — none silently left out', () => {
		// Tooling rail the task calls for explicitly: a candidate added to ./ports.ts without
		// regenerating reproduces the exact `Load failed` symptom `./cloud.ts` documents for a
		// missing origin — this fails LOUD instead.
		const conf = JSON.parse(renderTauriConf()) as { app: { security: { csp: string } } }
		for (const role of CONSOLE.connectsTo) {
			const sidecar = SIDECARS.find(s => s.role === role)
			if (!sidecar) continue
			for (const port of candidateValues(SHELL_ENV[sidecar.portEnvKey])) {
				expect(conf.app.security.csp).toContain(`http://localhost:${port}`)
				expect(conf.app.security.csp).toContain(`http://127.0.0.1:${port}`)
			}
		}
	})

	it('DSK-14: shell-env.json hands each sidecar exactly the shell keys its workspace reads (set algebra, per role)', () => {
		// 0.5.1 shipped a daemon with NO CODM_CLOUD_URL in its boot env — every screen answered
		// 503 CLOUD_UNREACHABLE. The manifest had declared apiTs + appTauri as its readers all
		// along; the supervisor just re-typed the env by hand. Now the forwarded set is derived.
		const rendered = JSON.parse(renderShellEnv()) as Record<string, Record<string, string | string[]>>
		expect(Object.keys(rendered).sort()).toEqual(SIDECARS.map(s => s.role).sort())
		for (const sidecar of SIDECARS) {
			const expected = (Object.keys(SHELL_ENV) as ShellEnvKey[]).filter(key =>
				(REPO.env[key].consumers as readonly string[]).includes(sidecar.build.workspace),
			)
			expect(Object.keys(rendered[sidecar.role] ?? {}).sort()).toEqual(expected.sort())
			// A porta candidata da chave é sempre um ARRAY no JSON renderizado — a CSP e o processo
			// leem a MESMA lista, e é por isso que a CSP autoriza todas, não só a que vence em runtime.
			expect(rendered[sidecar.role]?.[sidecar.portEnvKey]).toEqual([...candidateValues(SHELL_ENV[sidecar.portEnvKey])])
		}
		// The daemon is the one that asks the cloud who the operator is — it MUST get the origin.
		expect(rendered.daemon?.CODM_CLOUD_URL).toBe(CLOUD.origin)
		expect(rendered.gateway?.CODM_CLOUD_URL).toBeUndefined()
	})

	it('DSK-15: the CSP authorizes the SAME cloud origin the daemon is booted with (one source, two readers)', () => {
		const conf = JSON.parse(renderTauriConf()) as { app: { security: { csp: string } } }
		const rendered = JSON.parse(renderShellEnv()) as { daemon: { CODM_CLOUD_URL: string } }
		expect(conf.app.security.csp).toContain(rendered.daemon.CODM_CLOUD_URL)
	})

	it('DSK-07: the Rust updater mirrors config/updater.ts betaEndpoint verbatim (cross-lang seam gate)', () => {
		// Rust cannot import the TS config, so src/updater.rs carries a MIRROR of the beta endpoint
		// and names config/updater.ts as its source of truth — this rail is what keeps the two
		// copies from drifting (same posture as walker.go mirroring template.config.ts).
		const rust = readFileSync(resolve(import.meta.dir, '../src-tauri/src/updater.rs'), 'utf8')
		expect(rust).toContain(`const BETA_ENDPOINT: &str = "${UPDATER.betaEndpoint}"`)
	})

	it('DSK-08: the generated conf carries the updater plugin (pubkey + STABLE endpoint) and update artifacts', () => {
		// Stable is the default every installed app boots with; beta is a RUNTIME override in
		// src/updater.rs (spec decision 2). createUpdaterArtifacts is what makes `tauri build`
		// emit the signed .app.tar.gz the updater consumes (spec decision 8).
		const conf = JSON.parse(renderTauriConf()) as {
			plugins?: { updater?: { pubkey?: string; endpoints?: string[] } }
			bundle: { createUpdaterArtifacts?: boolean }
		}
		expect(conf.plugins?.updater?.pubkey).toBe(UPDATER.pubkey)
		expect(conf.plugins?.updater?.endpoints).toEqual([UPDATER.stableEndpoint])
		expect(conf.bundle.createUpdaterArtifacts).toBe(true)
	})
})
