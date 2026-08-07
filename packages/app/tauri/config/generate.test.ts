// Drift gate for the desktop config (mirrors the env-model ENV-04 rail): the committed
// tauri.conf.json / capabilities/default.json must be EXACTLY what ./generate.ts renders from the
// LOCAL config (./app, ./window, ./capabilities, ./sidecars) + the abstract contract
// (template.config.ts REPO.brand/workspaces/env). Any hand-edit of a generated file, or a config
// change without regeneration, is a red build.
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO } from '../../../../template.config'
import { CONSOLE, IDENTIFIER } from './app'
import { CAPABILITIES, CAPABILITY_PERMISSIONS } from './capabilities'
import { DEEPLINK } from './deeplink'
import { CLOUD } from './cloud'
import { UPDATER } from './updater'
import { cargoNameDrift, OUTPUTS, renderCapabilities, renderTauriConf } from './generate'
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
