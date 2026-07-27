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
import { cargoNameDrift, OUTPUTS, renderCapabilities, renderTauriConf } from './generate'
import { SIDECARS } from './sidecars'

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
		}
	})

	it('DSK-04: tauri.conf reflects the manifest — externalBin + identity + staged resources', () => {
		const conf = JSON.parse(renderTauriConf()) as {
			identifier: string
			bundle: { externalBin: string[]; resources: Record<string, string> }
		}
		expect(conf.identifier).toBe(IDENTIFIER)
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
		const rendered = JSON.parse(renderCapabilities()) as { permissions: string[] }
		const expected = ['core:default', ...CAPABILITIES.flatMap(cap => map[cap] ?? [])]
		expect(rendered.permissions).toEqual(expected)
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
})
