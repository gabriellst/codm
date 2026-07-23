/**
 * Build the two sidecar binaries Tauri bundles via `bundle.externalBin`:
 *   codedm-daemon  — the TS daemon (packages/api/typescript) compiled with `bun build --compile`
 *                    (PGlite inside a bun single-binary was proven by the D2 spike —
 *                    .specs/codedm/2026-07-23-fork-d2-spike.md)
 *   codedm-gateway — the Go gateway (packages/api/go ./cmd/api) via `go build`
 *
 * Tauri resolves external binaries by `<name>-<target-triple>` next to src-tauri,
 * so both outputs land in src-tauri/binaries/ with the host triple suffix.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

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

// 1) TS daemon — single-file executable.
await run(
	'codedm-daemon',
	[
		'bun',
		'build',
		'--compile',
		'./src/index.ts',
		'--outfile',
		join(outDir, `codedm-daemon-${triple}${exe}`),
	],
	join(repoRoot, 'packages', 'api', 'typescript'),
)

// 2) Go gateway.
await run(
	'codedm-gateway',
	['go', 'build', '-o', join(outDir, `codedm-gateway-${triple}${exe}`), './cmd/api'],
	join(repoRoot, 'packages', 'api', 'go'),
)

for (const name of [`codedm-daemon-${triple}${exe}`, `codedm-gateway-${triple}${exe}`]) {
	if (!existsSync(join(outDir, name))) {
		console.error(`[sidecars] expected output missing: ${name}`)
		process.exit(1)
	}
}
console.log(`[sidecars] done → src-tauri/binaries/ (${triple})`)
