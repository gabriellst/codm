// scripts/desktop/generate.ts — renders the desktop shell's config surfaces FROM the desktop
// contract (template.config.ts REPO.desktop + WORKSPACES + REPO.env). Mirrors scripts/env/generate.ts:
// the contract is the single structural truth; this file is its compiler.
//
// Outputs (committed generated files, like .env.example):
//   packages/app/tauri/src-tauri/tauri.conf.json          — identity, window, devUrl, frontendDist,
//                                                           externalBin, CSP
//   packages/app/tauri/src-tauri/capabilities/default.json — permissions DERIVED from
//                                                           REPO.desktop.services
//   packages/app/tauri/src-tauri/src/generated.rs          — IDENTIFIER const + sidecars(data_dir)
//                                                           (include!-ed by lib.rs — lib.rs never
//                                                           hand-types a name/port/health path)
//
// Usage: `bun desktop:generate` (writes) · `bun desktop:generate --check` (exit 1 on drift —
// wired into test:tooling via scripts/desktop/generate.test.ts).
import { readFileSync, writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { resolve } from 'node:path'
import { REPO, type BootEnvSource, type SidecarDecl } from '../../template.config'

const ROOT = resolve(import.meta.dirname, '..', '..')

const shell = REPO.workspaces.appTauri
const srcTauriDir = posix.join(shell.pkgRoot, 'src-tauri')

// ── contract resolution helpers (fail-loud: an unknown key is a contract bug) ──

function envExample(key: string): string {
	const decl = (REPO.env as Record<string, { example: string } | undefined>)[key]
	if (decl === undefined) throw new Error(`desktop contract references env key '${key}' — not declared in REPO.env`)
	return decl.example
}

function sidecarPort(sidecar: SidecarDecl): number {
	const port = Number(envExample(sidecar.portEnvKey))
	if (!Number.isInteger(port) || port <= 0)
		throw new Error(`env key '${sidecar.portEnvKey}' example is not a port: '${envExample(sidecar.portEnvKey)}'`)
	return port
}

const binName = (sidecar: SidecarDecl): string => `${REPO.brand}-${sidecar.role}`

const vitePort = (): string => envExample(REPO.desktop.console.devPortEnvKey)

/** The dev/webview origins a desktop sidecar must allow — fixed tauri scheme + the dev console. */
const desktopOrigins = (): string => `tauri://localhost,http://localhost:${vitePort()}`

function resolveBootEnv(key: string, source: BootEnvSource): { literal: string } | { rust: string } {
	if ('value' in source) return { literal: source.value }
	switch (source.from) {
		case 'example':
			return { literal: envExample(key) }
		case 'desktopOrigins':
			return { literal: desktopOrigins() }
		case 'dataDir':
			return { rust: 'data_dir.into()' }
	}
}

// ── renderers ────────────────────────────────────────────────────────────────

export function renderTauriConf(): string {
	const console_ = REPO.desktop.console
	const consoleWs = REPO.workspaces[console_.workspace]
	if (consoleWs.nxProject === null) throw new Error(`console workspace '${console_.workspace}' has no nx project`)
	// Config paths resolve relative to src-tauri/ (where tauri.conf.json lives).
	const frontendDist = posix.relative(srcTauriDir, posix.join(consoleWs.pkgRoot, console_.distSubpath))
	// CSP connect-src derives from the DECLARED console→sidecar relation (console.connectsTo).
	const connectSrc = console_.connectsTo
		.map(role => {
			const sidecar = REPO.desktop.sidecars.find(s => s.role === role)
			if (sidecar === undefined) throw new Error(`console.connectsTo names unknown sidecar role '${role}'`)
			return sidecar
		})
		.flatMap(s => [`http://localhost:${sidecarPort(s)}`, `http://127.0.0.1:${sidecarPort(s)}`])
		.join(' ')
	const conf = {
		$schema: 'https://schema.tauri.app/config/2',
		productName: REPO.desktop.displayName,
		version: '0.1.0',
		identifier: REPO.desktop.identifier,
		build: {
			devUrl: `http://localhost:${vitePort()}${console_.devPath}`,
			frontendDist,
			beforeDevCommand: `bun x nx run ${consoleWs.nxProject}:dev`,
			beforeBuildCommand: `bun x nx run ${consoleWs.nxProject}:${console_.buildTarget}`,
		},
		app: {
			withGlobalTauri: true,
			windows: [
				{
					label: REPO.desktop.window.label,
					title: REPO.desktop.displayName,
					width: REPO.desktop.window.width,
					height: REPO.desktop.window.height,
					minWidth: REPO.desktop.window.minWidth,
					minHeight: REPO.desktop.window.minHeight,
				},
			],
			security: {
				csp: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${connectSrc} ipc: http://ipc.localhost`,
			},
		},
		bundle: {
			active: true,
			targets: 'all',
			externalBin: REPO.desktop.sidecars.map(s => `binaries/${binName(s)}`),
			icon: ['icons/icon.icns', 'icons/icon.ico', 'icons/32x32.png', 'icons/128x128.png'],
		},
	}
	return `${JSON.stringify(conf, null, '\t')}\n`
}

export function renderCapabilities(): string {
	const permissions = ['core:default', ...Object.values(REPO.desktop.services).flat()]
	const capability = {
		$schema: '../gen/schemas/desktop-schema.json',
		identifier: 'default',
		description:
			'GENERATED from template.config.ts REPO.desktop.services (bun desktop:generate) — permissions derive from the native services the console consumes; do NOT hand-edit.',
		windows: [REPO.desktop.window.label],
		permissions,
	}
	return `${JSON.stringify(capability, null, '\t')}\n`
}

export function renderGeneratedRs(): string {
	const lines: string[] = [
		'// GENERATED from template.config.ts REPO.desktop by scripts/desktop/generate.ts — do NOT hand-edit.',
		'// Regenerate: `bun desktop:generate` · drift gate: `bun desktop:generate --check` (test:tooling).',
		'// include!-ed by lib.rs AFTER the `Sidecar` struct definition.',
		'',
		'/// Bundle identifier — also the keychain service name (REPO.desktop.identifier).',
		`pub const IDENTIFIER: &str = "${REPO.desktop.identifier}";`,
		'',
		'/// Supervised sidecars — one entry per REPO.desktop.sidecars[]. Ports/env resolve from',
		'/// REPO.env examples at generation time; `data_dir` is the runtime app-data subdir the',
		'/// shell computes (the only boot-env value that cannot be a generation-time literal).',
		'pub fn sidecars(data_dir: &str) -> Vec<Sidecar> {',
		'    vec![',
	]
	for (const sidecar of REPO.desktop.sidecars) {
		lines.push(
			'        Sidecar {',
			`            name: "${binName(sidecar)}",`,
			`            port: ${sidecarPort(sidecar)},`,
			`            health_path: "${sidecar.healthPath}",`,
			'            env: vec![',
		)
		for (const [key, source] of Object.entries(sidecar.bootEnv)) {
			const resolved = resolveBootEnv(key, source)
			const valueExpr = 'literal' in resolved ? `"${resolved.literal}".into()` : resolved.rust
			lines.push(`                ("${key}".into(), ${valueExpr}),`)
		}
		lines.push('            ],', '        },')
	}
	lines.push('    ]', '}', '')
	return lines.join('\n')
}

// ── Cargo.toml identity check (name is stamped once, not generated — but drift is a bug) ──

export function cargoNameDrift(): string[] {
	const cargo = readFileSync(resolve(ROOT, srcTauriDir, 'Cargo.toml'), 'utf8')
	const problems: string[] = []
	const expectPkg = `${REPO.brand}-desktop`
	const expectLib = `${REPO.brand}_desktop_lib`
	if (!new RegExp(`^name = "${expectPkg}"$`, 'm').test(cargo))
		problems.push(`Cargo.toml [package] name must be '${expectPkg}' (REPO.brand-derived)`)
	if (!new RegExp(`^name = "${expectLib}"$`, 'm').test(cargo))
		problems.push(`Cargo.toml [lib] name must be '${expectLib}' (REPO.brand-derived)`)
	return problems
}

// ── entry point ──────────────────────────────────────────────────────────────

export const OUTPUTS: readonly { path: string; render: () => string }[] = [
	{ path: posix.join(srcTauriDir, 'tauri.conf.json'), render: renderTauriConf },
	{ path: posix.join(srcTauriDir, 'capabilities/default.json'), render: renderCapabilities },
	{ path: posix.join(srcTauriDir, 'src/generated.rs'), render: renderGeneratedRs },
]

if (import.meta.main) {
	const cargoProblems = cargoNameDrift()
	if (cargoProblems.length > 0) {
		for (const p of cargoProblems) console.error(`✗ ${p}`)
		process.exit(1)
	}
	if (process.argv.includes('--check')) {
		let drifted = false
		for (const out of OUTPUTS) {
			let current: string | null = null
			try {
				current = readFileSync(resolve(ROOT, out.path), 'utf8')
			} catch {
				current = null
			}
			if (current !== out.render()) {
				console.error(`✗ ${out.path} is out of sync with template.config.ts REPO.desktop — run: bun desktop:generate`)
				drifted = true
			}
		}
		if (drifted) process.exit(1)
		console.log(`✓ desktop shell config in sync with the contract (${OUTPUTS.length} files)`)
	} else {
		for (const out of OUTPUTS) {
			writeFileSync(resolve(ROOT, out.path), out.render())
			console.log(`✓ wrote ${out.path}`)
		}
	}
}
