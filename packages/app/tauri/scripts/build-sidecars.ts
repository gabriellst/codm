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
import { existsSync, mkdirSync } from 'node:fs'
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
console.log(`[sidecars] done → src-tauri/binaries/ (${triple})`)
