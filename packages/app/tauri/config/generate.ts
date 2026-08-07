// packages/app/tauri/config/generate.ts — renders the desktop shell's config surfaces FROM the
// LOCAL config in this folder (./app, ./window, ./capabilities, ./sidecars) plus the abstract
// contract (template.config.ts — only REPO.brand / REPO.workspaces / REPO.env). The sidecar SET +
// boot ENV are code (the manifest + the Rust supervisor), NOT config — this file only compiles the
// two committed JSON surfaces.
//
// Outputs (committed generated files, like .env.example):
//   ../src-tauri/tauri.conf.json          — identity, window, devUrl, frontendDist,
//                                            externalBin, CSP, bundle.resources
//   ../src-tauri/capabilities/default.json — permissions DERIVED from ./capabilities CAPABILITIES
//                                            mapped through CAPABILITY_PERMISSIONS
//
// The sidecar boot env + the `IDENTIFIER` are NO LONGER generated as a .rs: env is inline in the
// Rust supervisor (src/sidecars/mod.rs), and the keychain service name is read at runtime from
// `app.config().identifier`. `externalBin` / the CSP port / `bundle.resources` derive from the
// package sidecar manifest, not a generated .rs.
//
// Usage: `bun desktop:generate` (writes) · `bun desktop:generate --check` (exit 1 on drift —
// wired into test:tooling via ./generate.test.ts).
import { readFileSync, writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { resolve } from 'node:path'
import { REPO } from '../../../../template.config'
import { CONSOLE, DISPLAY_NAME, IDENTIFIER } from './app'
import { CAPABILITIES, CAPABILITY_PERMISSIONS } from './capabilities'
import { ANALYTICS } from './analytics'
import { CLOUD } from './cloud'
import { DEEPLINK } from './deeplink'
import { SIDECARS, type SidecarManifestEntry } from './sidecars'
import { UPDATER } from './updater'
import { BOOT_ERROR_FRAME, WINDOW, WINDOW_FRAME } from './window'

// config/ → tauri → app → packages → repo root (four levels up). Output paths stay repo-relative
// (derived from REPO.workspaces.appTauri.pkgRoot) so they resolve to the same src-tauri/ files.
const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..')

const shell = REPO.workspaces.appTauri
const srcTauriDir = posix.join(shell.pkgRoot, 'src-tauri')

// The two dirs a compiled sidecar reads from DISK rather than from its own bundle. `build-sidecars.ts`
// stages both under `binaries/<subpath>`; `bundle.resources` copies them to the app resource dir at
// `<subpath>`; the Rust supervisor resolves `resource_dir/<subpath>` at runtime. Explicit lines here,
// mirrored in build-sidecars.ts + mod.rs.
//
//   migrations     — the Drizzle migrations dir; the daemon's `CODM_MIGRATIONS_DIR` points at it.
//   daemon-runtime — the libsql native-prebuild closure; it is the daemon's spawn CWD (`Sidecar.cwd`),
//                    because a `bun build --compile` binary resolves that dynamic `require` from the
//                    process CWD, never from the executable's directory.
const STAGED_RESOURCES = {
	'binaries/migrations': 'migrations',
	'binaries/daemon-runtime': 'daemon-runtime',
} as const

// ── contract resolution helpers (fail-loud: an unknown key is a contract bug) ──

function envExample(key: string): string {
	const decl = (REPO.env as Record<string, { example: string } | undefined>)[key]
	if (decl === undefined) throw new Error(`desktop config references env key '${key}' — not declared in REPO.env`)
	return decl.example
}

function sidecarPort(sidecar: SidecarManifestEntry): number {
	const port = Number(envExample(sidecar.portEnvKey))
	if (!Number.isInteger(port) || port <= 0)
		throw new Error(`env key '${sidecar.portEnvKey}' example is not a port: '${envExample(sidecar.portEnvKey)}'`)
	return port
}

const binName = (sidecar: SidecarManifestEntry): string => `${REPO.brand}-${sidecar.role}`

const vitePort = (): string => envExample(CONSOLE.devPortEnvKey)

// ── renderers ────────────────────────────────────────────────────────────────

export function renderTauriConf(): string {
	const console_ = CONSOLE
	const consoleWs = REPO.workspaces[console_.workspace]
	if (consoleWs.nxProject === null) throw new Error(`console workspace '${console_.workspace}' has no nx project`)
	// Config paths resolve relative to src-tauri/ (where tauri.conf.json lives).
	const frontendDist = posix.relative(srcTauriDir, posix.join(consoleWs.pkgRoot, console_.distSubpath))
	// CSP connect-src derives from the DECLARED console→sidecar relation (console.connectsTo),
	// resolving each role against the package manifest for its port.
	const connectSrc = console_.connectsTo
		.map(role => {
			const sidecar = SIDECARS.find(s => s.role === role)
			if (sidecar === undefined) throw new Error(`console.connectsTo names unknown sidecar role '${role}'`)
			return sidecar
		})
		.flatMap(s => [`http://localhost:${sidecarPort(s)}`, `http://127.0.0.1:${sidecarPort(s)}`])
		// A cloud entra na MESMA lista: o console fala com ela para trocar o código do deep link e
		// revogar no logout. Sem esta origem o webview bloqueia a requisição antes de sair (ver
		// ./cloud.ts — foi o que quebrou o login até a v0.1.8).
		.concat(CLOUD.origin)
		// O PostHog entra na MESMA lista pela MESMA razão (ver ./analytics.ts): telemetria bloqueada
		// pela CSP falha em silêncio — pior que o login, porque ninguém percebe, os números só ficam
		// vazios.
		.concat(ANALYTICS.origin)
		.join(' ')
	const conf = {
		$schema: 'https://schema.tauri.app/config/2',
		productName: DISPLAY_NAME,
		version: '0.3.0',
		identifier: IDENTIFIER,
		build: {
			// Desktop dev serves the root-based SPA (dev-spa → base '/'), so the webview loads the
			// ROOT — `console_.devBasePath` — NOT the web '/app/' mount (`console_.devPath`).
			devUrl: `http://localhost:${vitePort()}${console_.devBasePath}`,
			frontendDist,
			beforeDevCommand: `bun x nx run ${consoleWs.nxProject}:${console_.devTarget}`,
			beforeBuildCommand: `bun x nx run ${consoleWs.nxProject}:${console_.buildTarget}`,
		},
		app: {
			withGlobalTauri: true,
			windows: [
				{
					label: WINDOW_FRAME.label,
					title: DISPLAY_NAME,
					width: WINDOW_FRAME.width,
					height: WINDOW_FRAME.height,
					minWidth: WINDOW_FRAME.minWidth,
					minHeight: WINDOW_FRAME.minHeight,
					// Presentation (integrated title bar) is owned by ./window WINDOW — a house
					// standard, not a per-product knob. Spread AFTER the size/label so it always wins.
					...WINDOW,
				},
				// The boot-error splash — DECLARED, not built at runtime, so it inherits the same
				// drift gate as the main window and can be named in capabilities. Born hidden like
				// the main one: the readiness gate reveals exactly one of the two.
				{ ...BOOT_ERROR_FRAME },
			],
			security: {
				csp: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${connectSrc} ipc: http://ipc.localhost`,
			},
		},
		// Auto-update (SP1). Pubkey verifies minisign signatures; the endpoint here is the STABLE
		// channel default — the Rust side overrides it to beta when the machine opted in (see
		// config/updater.ts for the channel design and src/updater.rs for the runtime half).
		//
		// `codm://` (SP2, ./deeplink.ts) — registers the OS-level URL handler the
		// tauri-plugin-deep-link crate (src-tauri/src/lib.rs) hands back to the shell.
		// `desktop.schemes` is the plugin's config surface; mobile is out of scope.
		// ONE `plugins` object on purpose: a duplicated key silently drops the first in JS —
		// exactly the merge accident that ate the updater block once (2026-08-06).
		plugins: {
			updater: {
				pubkey: UPDATER.pubkey,
				endpoints: [UPDATER.stableEndpoint],
			},
			'deep-link': {
				desktop: {
					schemes: [DEEPLINK.scheme],
				},
			},
		},
		bundle: {
			active: true,
			// `tauri build` additionally emits the signed update artifact (.app.tar.gz + .sig) the
			// updater consumes — the DMG stays the human install path (SP1 decision 8).
			createUpdaterArtifacts: true,
			targets: 'all',
			externalBin: SIDECARS.map(s => `binaries/${binName(s)}`),
			icon: ['icons/icon.icns', 'icons/icon.ico', 'icons/32x32.png', 'icons/128x128.png'],
			// Assets a compiled sidecar reads from disk rather than from its own bundle — the Drizzle
			// migrations and the daemon's staged native-prebuild dir — are staged by build-sidecars.ts
			// under `binaries/<subpath>` and copied into the app resource dir at `<subpath>`; the Rust
			// supervisor resolves `resource_dir/<subpath>` (boot env + spawn cwd).
			resources: STAGED_RESOURCES,
			macOS: {
				// AD-HOC signature over the ASSEMBLED bundle. Without this the app ships with only the
				// linker's own signature on the main binary (`adhoc, linker-signed`), which DECLARES
				// sealed resources the bundle never got — Tauri assembles sidecars/resources around it
				// afterwards. `codesign --verify` then fails with "code has no resources but signature
				// indicates they must be present", and macOS shows the WORST dialog: "CODM está
				// danificado e não pode ser aberto" (measured on the shipped v0.1.0 DMG, 2026-08-07).
				// That one has no right-click → Abrir escape — only `xattr -cr` does.
				//
				// Signing the whole bundle makes the signature coherent, so an unsigned-by-Apple app
				// degrades to the NORMAL "desenvolvedor não identificado" dialog, which right-click →
				// Abrir does bypass — which is exactly what the landing's microcopy promises.
				//
				// '-' is codesign's ad-hoc identity. When the Developer ID arrives (roadmap decision 7,
				// deferred), the real identity comes from the APPLE_SIGNING_IDENTITY env in CI, which
				// overrides this — notarization is the other half and neither touches the updater
				// (minisign is independent of Apple).
				signingIdentity: '-',
				// Assinar liga o HARDENED RUNTIME (o Tauri assina com a opção `runtime`), e com ele a
				// library validation: o processo só carrega código do MESMO Team ID. O daemon faz
				// dlopen do prebuild nativo do libsql, que tem assinatura ad-hoc PRÓPRIA — duas
				// identidades, ambas sem Team ID — e o macOS recusava:
				//   dlopen(.../index.node): ... mapping process and mapped file (non-platform) have
				//   different Team IDs
				// Medido na v0.1.2 instalada: daemon morto no boot, portão de 60s disparado, usuário
				// vendo só "um ou mais serviços não responderam". Verificado: com o entitlement, o
				// daemon do bundle sobe e GET /v1/health responde 200.
				//
				// O plist fica SEM COMENTÁRIOS de propósito: o parser do AMFI (dentro do codesign)
				// rejeita XML com hífen duplo em comentário, e a primeira versão deste arquivo
				// documentava justamente a flag `runtime` com hífens — o build quebrou com
				// "AMFIUnserializeXML: syntax error". A razão mora aqui, no código que o referencia;
				// o plist fica mínimo e legível por máquina.
				// Continua necessário DEPOIS do Developer ID: app notarizado roda hardened runtime, e
				// o prebuild nativo segue não sendo nosso para assinar.
				entitlements: 'entitlements.plist',
			},
		},
	}
	return `${JSON.stringify(conf, null, '\t')}\n`
}

export function renderCapabilities(): string {
	// Each abstract capability key resolves to its Tauri permissions via the shell-owned map
	// (./capabilities). Fail loud on a capability with no mapping — the config declared a native
	// capability the shell package doesn't know how to grant.
	const permsFor = CAPABILITY_PERMISSIONS as Record<string, readonly string[] | undefined>
	const permissions = [
		'core:default',
		...CAPABILITIES.flatMap(cap => {
			const perms = permsFor[cap]
			if (perms === undefined)
				throw new Error(
					`desktop capability '${cap}' has no permission mapping in ./capabilities (CAPABILITY_PERMISSIONS)`,
				)
			return perms
		}),
	]
	const capability = {
		$schema: '../gen/schemas/desktop-schema.json',
		identifier: 'default',
		description:
			'GENERATED from config/capabilities.ts (bun desktop:generate) — permissions derive from the capabilities the console consumes; do NOT hand-edit.',
		// BOTH windows. `core:default` — which is what covers `invoke` — is granted PER WINDOW, so
		// without the splash's label here the boot-error page could not call `boot_failures` /
		// `retry_boot`, and the one screen that exists to explain a failed boot would render empty.
		windows: [WINDOW_FRAME.label, BOOT_ERROR_FRAME.label],
		permissions,
	}
	return `${JSON.stringify(capability, null, '\t')}\n`
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
				console.error(`✗ ${out.path} is out of sync with the desktop config — run: bun desktop:generate`)
				drifted = true
			}
		}
		if (drifted) process.exit(1)
		console.log(`✓ desktop shell config in sync (${OUTPUTS.length} files)`)
	} else {
		for (const out of OUTPUTS) {
			writeFileSync(resolve(ROOT, out.path), out.render())
			console.log(`✓ wrote ${out.path}`)
		}
	}
}
