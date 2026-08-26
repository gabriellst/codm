// packages/app/tauri/config/generate.ts — renders the desktop shell's config surfaces FROM the
// LOCAL config in this folder (./app, ./window, ./capabilities, ./sidecars, ./env) plus the
// abstract contract (template.config.ts — only REPO.brand / REPO.workspaces / REPO.env). The
// sidecar SET is code (the manifest + the Rust supervisor), NOT config — this file only compiles
// the three committed surfaces.
//
// Outputs (committed generated files, like .env.example):
//   ../src-tauri/tauri.conf.json          — identity, window, devUrl, frontendDist,
//                                            externalBin, CSP, bundle.resources
//   ../src-tauri/capabilities/default.json — permissions DERIVED from ./capabilities CAPABILITIES
//                                            mapped through CAPABILITY_PERMISSIONS
//   ../src-tauri/shell-env.json            — the env the shell SUPPLIES each sidecar, DERIVED from
//                                            REPO.env's `consumers` relation (./env) — read by
//                                            build.rs into `cargo:rustc-env`, so the Rust side
//                                            carries no port/URL literal
//
// What is (still) NOT generated: the RUNTIME half of the sidecar boot env — `CODM_DATA_DIR`,
// `CODM_MIGRATIONS_DIR`, `CODM_PARENT_PID`, `CODM_APP_VERSION`, `NODE_ENV` — stays inline in the
// Rust supervisor (src/sidecars/mod.rs), because only the running process knows its data dir,
// resource dir and pid. The line is: a constant the manifest declares the shell reads → generated
// (shell-env.json); a fact of the process → Rust. The keychain service name is read at runtime
// from `app.config().identifier`; `externalBin` / the CSP ports / `bundle.resources` derive from the
// package sidecar manifest.
//
// Usage: `bun desktop:generate` (writes) · `bun desktop:generate --check` (exit 1 on drift —
// wired into test:tooling via ./generate.test.ts, and run by both release workflows before
// `tauri build`).
import { readFileSync, writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { resolve } from 'node:path'
import { REPO } from '../../../../template.config'
import { CONSOLE, DISPLAY_NAME, IDENTIFIER } from './app'
import { CAPABILITIES, CAPABILITY_PERMISSIONS } from './capabilities'
import { ANALYTICS } from './analytics'
import { DEEPLINK } from './deeplink'
import { DMG } from './dmg'
import { candidateValues, fixedValue, forwardedEnv, SHELL_ENV } from './env'
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

// As portas CANDIDATAS de um sidecar vêm da MESMA lista que o shell entrega a ele no boot
// (./env SHELL_ENV) — a CSP e o supervisor Rust leem uma fonte só. O supervisor escolhe UMA delas em
// runtime (a primeira livre — `sidecars::lifecycle::choose_free_port`), o que a CSP não pode saber
// em tempo de GERAÇÃO — então ela autoriza TODAS as candidatas. O preço de uma porta dinâmica é uma
// CSP um pouco mais larga; o alternativo (autorizar só uma) é reintroduzir o mesmo sintoma do
// `CODM_CLOUD_URL` ausente (`./cloud.ts`): um `TypeError: Load failed` sem status, porque o webview
// bloqueia a origem ANTES de o pedido sair — indistinguível de "servidor fora do ar" para quem lê o
// erro. Esquecer de regenerar depois de mudar `./ports.ts` reproduz exatamente esse sintoma.
function sidecarPortCandidates(sidecar: SidecarManifestEntry): number[] {
	const raw = candidateValues(SHELL_ENV[sidecar.portEnvKey])
	return raw.map(value => {
		const port = Number(value)
		if (!Number.isInteger(port) || port <= 0) throw new Error(`env key '${sidecar.portEnvKey}' candidate is not a port: '${value}'`)
		return port
	})
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
	// The sidecar origins the console addresses DIRECTLY, derived from the DECLARED console→sidecar
	// relation (console.connectsTo) and resolved against the package manifest for EVERY candidate
	// port (see `sidecarPortCandidates` — the supervisor picks one at runtime, so generation time
	// cannot narrow this to a single origin). Both CSP fetch directives below are built from this ONE
	// list — a literal port in either would be a second copy of the manifest, and the one nobody
	// remembers to update.
	const sidecarOrigins = console_.connectsTo
		.map(role => {
			const sidecar = SIDECARS.find(s => s.role === role)
			if (sidecar === undefined) throw new Error(`console.connectsTo names unknown sidecar role '${role}'`)
			return sidecar
		})
		.flatMap(s => sidecarPortCandidates(s).flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]))
	// `connect-src` alcança os sidecars MAIS os dois destinos remotos que o console chama por XHR.
	// A cloud: o console fala com ela para trocar o código do deep link e revogar no logout — sem
	// esta origem o webview bloqueia a requisição antes de sair (ver ./cloud.ts, foi o que quebrou o
	// login até a v0.1.8). A origem é a MESMA que o shell entrega ao daemon em `CODM_CLOUD_URL`
	// (./env) — uma fonte, então a CSP não pode autorizar uma nuvem e o daemon perguntar a outra. O
	// PostHog, pela MESMA razão (ver ./analytics.ts): telemetria bloqueada pela CSP falha em
	// silêncio — pior que o login, porque ninguém percebe, os números só ficam vazios.
	const connectSrc = [...sidecarOrigins, fixedValue(SHELL_ENV.CODM_CLOUD_URL), ANALYTICS.origin].join(' ')
	// `img-src` alcança os MESMOS sidecars — e SÓ eles, porque nem a cloud nem o PostHog servem
	// imagem alguma.
	//
	// O daemon serve bytes que o webview desenha: os artefatos que os agentes gravam e, desde a foto
	// no balão do chat, os avatares dos contatos. A CDN do WhatsApp (`pps.whatsapp.net`)
	// deliberadamente NÃO entra: a url é assinada e expira, e cada avatar pintado anunciaria o IP do
	// operador para a Meta. O daemon busca uma vez, guarda em disco e serve dali — então a origem a
	// liberar é a DELE, derivada da mesma relação declarada que o connect-src usa.
	const imgSrc = ["'self'", 'data:', 'blob:', ...sidecarOrigins].join(' ')
	const conf = {
		$schema: 'https://schema.tauri.app/config/2',
		productName: DISPLAY_NAME,
		version: '0.5.4',
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
				csp: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src ${imgSrc}; connect-src 'self' ${connectSrc} ipc: http://ipc.localhost`,
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
				// '-' is codesign's ad-hoc identity, and it stays here ON PURPOSE: this file is
				// committed, so a real identity baked in would make every local `tauri build` demand
				// the certificate. The Developer ID exists since 07/08/2026 and reaches the RELEASE
				// builds through the APPLE_SIGNING_IDENTITY env, which overrides this value.
				//
				// That override is the whole load-bearing assumption, and a failed override is
				// invisible in the artifact — so both release workflows re-check the OUTPUT
				// (`codesign -dv` must report `Authority=Developer ID Application`) and fail the run
				// otherwise. Shipping ad-hoc is not a cosmetic Gatekeeper wart: TCC pins an ad-hoc
				// app's disk permission to its cdhash, so every update revokes it and the agents the
				// daemon spawns lose the workspace. See docs/RELEASE.md.
				signingIdentity: '-',
				// Assinar liga o HARDENED RUNTIME (o Tauri assina com a opção `runtime`), e com ele a
				// library validation: o processo só carrega código do MESMO Team ID. O daemon faz
				// dlopen do prebuild nativo do libsql, que tem assinatura ad-hoc PRÓPRIA — duas
				// identidades, ambas sem Team ID — e o macOS recusava:
				//   dlopen(.../index.node): ... mapping process and mapped file (non-platform) have
				//   different Team IDs
				// Medido na v0.1.2 instalada: daemon morto no boot, portão de 60s disparado, usuário
				// vendo só "um ou mais serviços não responderam". Verificado: com o entitlement, o
				// daemon do bundle sobe e GET /health responde 200.
				//
				// O plist fica SEM COMENTÁRIOS de propósito: o parser do AMFI (dentro do codesign)
				// rejeita XML com hífen duplo em comentário, e a primeira versão deste arquivo
				// documentava justamente a flag `runtime` com hífens — o build quebrou com
				// "AMFIUnserializeXML: syntax error". A razão mora aqui, no código que o referencia;
				// o plist fica mínimo e legível por máquina.
				// Continua necessário DEPOIS do Developer ID: app notarizado roda hardened runtime, e
				// o prebuild nativo segue não sendo nosso para assinar.
				entitlements: 'entitlements.plist',
				// The install window ("drag to Applications"). Every field comes from ./dmg — the SAME
				// object scripts/og/dmg-background.ts draws the background from, so the arrow in the
				// picture and the icons Finder places never disagree. The picture is committed
				// (`bun desktop:dmg-background`); the bundler only copies it into the volume.
				dmg: {
					background: DMG.background,
					windowSize: DMG.windowSize,
					windowPosition: DMG.windowPosition,
					appPosition: DMG.appPosition,
					applicationFolderPosition: DMG.applicationFolderPosition,
				},
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

/**
 * `shell-env.json` — por sidecar (chave = `role` do manifesto), o env que o shell FORNECE no boot,
 * derivado de `REPO.env`'s `consumers` (./env `forwardedEnv`). `build.rs` lê este arquivo e emite
 * `cargo:rustc-env=CODM_SHELL_ENV_<ROLE>_<KEY>=<valor>` para cada par; `src/shell_env.rs` os expõe
 * como `env!()`. O shell também lê daqui as portas e a origem da nuvem para o próprio cliente SDK
 * (`src/api/mod.rs`) — nunca uma porta literal em `.rs`.
 *
 * A forma é deliberadamente plana e nomeada pelo role: quem lê o JSON (build.rs, um humano no
 * diff) vê "o daemon recebe X, o gateway recebe Y", sem precisar do manifesto ao lado. Uma entrada
 * `{ kind: 'candidates' }` (portas) renderiza como ARRAY de strings; uma `{ kind: 'fixed' }` (URL,
 * nome de marca) renderiza como string única — `build.rs` distingue pelo TIPO do valor JSON
 * (`serde_json::Value::Array` vs `::String`), nunca pelo sufixo do nome da chave.
 */
export function renderShellEnv(): string {
	const byRole = Object.fromEntries(
		SIDECARS.map(s => {
			const env = forwardedEnv(s.build.workspace)
			const rendered = Object.fromEntries(
				Object.entries(env).map(([key, entry]) => [key, entry?.kind === 'candidates' ? [...entry.candidates] : entry ? entry.value : undefined]),
			)
			return [s.role, rendered]
		}),
	)
	return `${JSON.stringify(byRole, null, '\t')}\n`
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
	{ path: posix.join(srcTauriDir, 'shell-env.json'), render: renderShellEnv },
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
