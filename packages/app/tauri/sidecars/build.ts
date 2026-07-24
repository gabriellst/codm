/**
 * Build the sidecar binaries Tauri bundles via `bundle.externalBin` — DRIVEN BY THE
 * DESKTOP CONTRACT (template.config.ts REPO.desktop.sidecars): binary names, source
 * workspaces (cwd), entries, and build kinds all come from the contract; this script
 * owns only the host-triple knowledge and the spawn loop.
 *
 * Tauri resolves external binaries by `<name>-<target-triple>` next to src-tauri,
 * so outputs land in src-tauri/binaries/ with the host triple suffix.
 *
 * PGlite inside a bun single-binary was proven by the D2 spike —
 * .specs/codedm/2026-07-23-fork-d2-spike.md
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, type SidecarDecl } from '../../../../template.config'

// Genuine toolchain knowledge — platform data, not repo identity (correctly local).
const HOST_TRIPLES: Record<string, string> = {
	'darwin-arm64': 'aarch64-apple-darwin',
	'darwin-x64': 'x86_64-apple-darwin',
	'linux-arm64': 'aarch64-unknown-linux-gnu',
	'linux-x64': 'x86_64-unknown-linux-gnu',
	'win32-x64': 'x86_64-pc-windows-msvc',
}

async function run(label: string, cmd: string[], cwd: string): Promise<void> {
	console.log(`[sidecars] ${label}: ${cmd.join(' ')}`)
	const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
	const code = await proc.exited
	if (code !== 0) {
		console.error(`[sidecars] ${label} failed (exit ${code})`)
		process.exit(code)
	}
}

/** Build command per declared kind — the contract names the kind, this maps it to a toolchain. */
function buildCmd(sidecar: SidecarDecl, outfile: string): string[] {
	switch (sidecar.build.kind) {
		case 'bun-compile':
			return ['bun', 'build', '--compile', sidecar.build.entry, '--outfile', outfile]
		case 'go-build':
			return ['go', 'build', '-o', outfile, sidecar.build.entry]
	}
}

export async function buildSidecars(): Promise<void> {
	const hostKey = `${process.platform}-${process.arch}`
	const triple = HOST_TRIPLES[hostKey]
	if (!triple) {
		console.error(`[sidecars] unsupported host ${hostKey} — add it to HOST_TRIPLES`)
		process.exit(1)
	}

	const pkgRoot = join(import.meta.dir, '..')
	const repoRoot = join(pkgRoot, '..', '..', '..')
	const outDir = join(pkgRoot, 'src-tauri', 'binaries')
	mkdirSync(outDir, { recursive: true })
	const exe = process.platform === 'win32' ? '.exe' : ''

	const outputs: string[] = []
	for (const sidecar of REPO.desktop.sidecars) {
		const name = `${REPO.brand}-${sidecar.role}`
		const outfile = join(outDir, `${name}-${triple}${exe}`)
		const cwd = join(repoRoot, REPO.workspaces[sidecar.workspace].pkgRoot)
		await run(name, buildCmd(sidecar, outfile), cwd)
		outputs.push(`${name}-${triple}${exe}`)
	}

	for (const name of outputs) {
		if (!existsSync(join(outDir, name))) {
			console.error(`[sidecars] expected output missing: ${name}`)
			process.exit(1)
		}
	}

	// Stage assets a compiled sidecar can't inline. Today that's the Drizzle migrations: a
	// `bun build --compile` binary has no node_modules and the drizzle migrator reads the folder via
	// node fs (which can't walk the `/$bunfs` virtual FS), so the migrations must travel as a bundle
	// resource. Every `resourceDir` boot-env `subpath` is materialized under `binaries/<subpath>`;
	// tauri.conf `bundle.resources` (generated) copies it to the app resource dir, and the daemon's
	// CODEDM_MIGRATIONS_DIR resolves `resource_dir/<subpath>` at runtime. The standalone daemon boot is
	// pointed straight at this staged dir. Source is the canonical contracts migrations output.
	const contractsMigrations = join(repoRoot, REPO.workspaces.contracts.pkgRoot, 'db', 'migrations')
	const stagedSubpaths = new Set<string>()
	for (const sidecar of REPO.desktop.sidecars) {
		for (const source of Object.values(sidecar.bootEnv)) {
			if ('from' in source && source.from === 'resourceDir') stagedSubpaths.add(source.subpath)
		}
	}
	for (const subpath of stagedSubpaths) {
		const dest = join(outDir, subpath)
		rmSync(dest, { recursive: true, force: true })
		cpSync(contractsMigrations, dest, { recursive: true })
		if (!existsSync(dest)) {
			console.error(`[sidecars] failed to stage migrations resource: ${subpath}`)
			process.exit(1)
		}
		console.log(`[sidecars] staged migrations → src-tauri/binaries/${subpath}/`)
	}

	console.log(`[sidecars] done → src-tauri/binaries/ (${triple})`)
}

// Run as a standalone script (`bun sidecars/build.ts`) — the package "sidecars" script and the
// nx `sidecars` target both invoke it this way. Importing the module (e.g. via `./index.ts` for
// its exported types) does NOT trigger a build.
if (import.meta.main) {
	await buildSidecars()
}
