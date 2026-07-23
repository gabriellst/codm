// Drift gate for the desktop contract (mirrors the env-model ENV-04 rail): the committed
// tauri.conf.json / capabilities/default.json / generated.rs must be EXACTLY what
// scripts/desktop/generate.ts renders from template.config.ts REPO.desktop. Any hand-edit
// of a generated file, or contract change without regeneration, is a red build.
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO } from '../../template.config'
import { cargoNameDrift, OUTPUTS, renderGeneratedRs, renderTauriConf } from './generate'

const ROOT = resolve(import.meta.dirname, '..', '..')

describe('desktop contract (REPO.desktop)', () => {
	it('DSK-01: every committed output is exactly the contract rendering (bun desktop:generate)', () => {
		for (const out of OUTPUTS) {
			const committed = readFileSync(resolve(ROOT, out.path), 'utf8')
			expect(committed === out.render(), `${out.path} is out of sync with REPO.desktop — run: bun desktop:generate`).toBe(true)
		}
	})

	it('DSK-02: Cargo.toml package/lib names are brand-derived (stamped, drift-checked)', () => {
		expect(cargoNameDrift()).toEqual([])
	})

	it('DSK-03: sidecar workspaces + env keys resolve (renderers fail loud on dangling refs)', () => {
		// The renderers throw on unknown env keys / workspaces / roles — rendering IS the assertion.
		expect(renderTauriConf().length).toBeGreaterThan(0)
		expect(renderGeneratedRs().length).toBeGreaterThan(0)
		for (const sidecar of REPO.desktop.sidecars) {
			expect(REPO.workspaces[sidecar.workspace], `sidecar '${sidecar.role}' names unknown workspace`).toBeDefined()
		}
	})

	it('DSK-04: the contract is live — changing a value changes the rendering (drift detectable)', () => {
		const rendered = renderGeneratedRs()
		expect(rendered).toContain(`pub const IDENTIFIER: &str = "app.${REPO.brand}.desktop";`)
		for (const sidecar of REPO.desktop.sidecars) {
			expect(rendered).toContain(`name: "${REPO.brand}-${sidecar.role}"`)
			expect(rendered).toContain(`health_path: "${sidecar.healthPath}"`)
		}
	})
})
