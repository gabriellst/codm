// Pure-function rail for the sidecar cross-build support (CROSS-TRIPLE GAP, closed in
// ./build-sidecars.ts). Covers ONLY the declared tables + argv/env assembly — never a full build
// (network + minutes; the real proof runs in CI on the runner, and locally via
// `bun config/build-sidecars.ts --target win32-x64`). Runs in the same lane as ./generate.test.ts
// (`bun test ./packages/app/tauri/config`).
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO } from '../../../../template.config'
import {
	buildCmd,
	DAEMON_RUNTIME,
	isNativePrebuildFamily,
	isTargetKey,
	parseCliArgs,
	pickDependencyVersions,
	resolveHostKey,
	resolveTargetKey,
	shouldStageOptionalDependency,
	TARGETS,
} from './build-sidecars'
import { SIDECARS } from './sidecars'

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..')

describe('build-sidecars (packages/app/tauri/config)', () => {
	it('BSC-01: TARGETS is total — every declared key carries every field, no empty toolchain values', () => {
		expect(Object.keys(TARGETS).sort()).toEqual(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64'])
		for (const [key, spec] of Object.entries(TARGETS)) {
			expect(['darwin', 'linux', 'win32'], key).toContain(spec.platform)
			expect(['arm64', 'x64'], key).toContain(spec.arch)
			expect(spec.triple.length, key).toBeGreaterThan(0)
			expect(spec.bunTarget.startsWith('bun-'), key).toBe(true)
			expect(spec.go.GOOS.length, key).toBeGreaterThan(0)
			expect(spec.go.GOARCH.length, key).toBeGreaterThan(0)
			// The key itself is `${platform}-${arch}` in the SAME vocabulary the fields carry —
			// resolveHostKey and the TARGETS keys must agree, or a real host would never match its
			// own row (see BSC-05).
			expect(key).toBe(`${spec.platform}-${spec.arch}`)
		}
	})

	it('BSC-02: DAEMON_RUNTIME.nativePrebuild covers exactly the TARGETS keys (tsc enforces it too via satisfies)', () => {
		expect(Object.keys(DAEMON_RUNTIME.nativePrebuild).sort()).toEqual(Object.keys(TARGETS).sort())
		for (const [key, pkg] of Object.entries(DAEMON_RUNTIME.nativePrebuild)) {
			expect(pkg.startsWith('@libsql/'), key).toBe(true)
		}
		// The specific gap this whole file exists to close.
		expect(DAEMON_RUNTIME.nativePrebuild['win32-x64']).toBe('@libsql/win32-x64-msvc')
	})

	it('BSC-03: isTargetKey accepts exactly the declared keys — closed set', () => {
		for (const key of Object.keys(TARGETS)) expect(isTargetKey(key)).toBe(true)
		expect(isTargetKey('win32-arm64')).toBe(false)
		expect(isTargetKey('bogus')).toBe(false)
		expect(isTargetKey('')).toBe(false)
	})

	it('BSC-04: resolveHostKey is `${platform}-${arch}`, the same vocabulary TARGETS keys use', () => {
		expect(resolveHostKey('darwin', 'arm64')).toBe('darwin-arm64')
		expect(resolveHostKey('linux', 'x64')).toBe('linux-x64')
		expect(resolveHostKey('freebsd', 'x64')).toBe('freebsd-x64')
	})

	it('BSC-05: parseCliArgs — no args, valid --target, and closed-set rejection', () => {
		expect(parseCliArgs([])).toEqual({ target: undefined })
		expect(parseCliArgs(['--target', 'win32-x64'])).toEqual({ target: 'win32-x64' })
		expect(() => parseCliArgs(['--target', 'win32-arm64'])).toThrow(/unknown --target 'win32-arm64'/)
		expect(() => parseCliArgs(['--target', 'win32-arm64'])).toThrow(/win32-x64/) // lists the valid keys
		expect(() => parseCliArgs(['--target'])).toThrow(/flag with no value/)
		expect(() => parseCliArgs(['--bogus', 'x'])).toThrow(/unknown flag: --bogus/)
	})

	it('BSC-06: resolveTargetKey — default is host, explicit --target wins, unsupported host fails loud', () => {
		expect(resolveTargetKey([], 'darwin-arm64')).toBe('darwin-arm64')
		expect(resolveTargetKey(['--target', 'win32-x64'], 'darwin-arm64')).toBe('win32-x64')
		expect(() => resolveTargetKey([], 'freebsd-x64')).toThrow(/unsupported host freebsd-x64/)
	})

	it('BSC-07: pickDependencyVersions pins from an already-parsed manifest, fails loud on a missing dep', () => {
		const manifest = { dependencies: { '@libsql/client': '^0.17.4', other: '1.0.0' } }
		expect(pickDependencyVersions(manifest, ['@libsql/client'], 'fixture')).toEqual({ '@libsql/client': '^0.17.4' })
		expect(() => pickDependencyVersions(manifest, ['@libsql/missing'], 'fixture')).toThrow(
			/'@libsql\/missing' is not a declared dependency in fixture/,
		)
	})

	it('BSC-08: buildCmd assembles the right toolchain per sidecar kind + target — bun --target, go GOOS/GOARCH', () => {
		const bunSidecar = SIDECARS.find(s => s.build.kind === 'bun-compile')
		const goSidecar = SIDECARS.find(s => s.build.kind === 'go-build')
		expect(bunSidecar).toBeDefined()
		expect(goSidecar).toBeDefined()
		if (!bunSidecar || !goSidecar) return

		const win = TARGETS['win32-x64']
		const { cmd: bunCmd, env: bunEnv } = buildCmd(bunSidecar, '/out/daemon.exe', win)
		expect(bunCmd).toEqual(['bun', 'build', '--compile', '--target=bun-windows-x64', bunSidecar.build.entry, '--outfile', '/out/daemon.exe'])
		expect(bunEnv).toBeUndefined()

		const { cmd: goCmd, env: goEnv } = buildCmd(goSidecar, '/out/gateway.exe', win)
		expect(goCmd).toEqual(['go', 'build', '-o', '/out/gateway.exe', goSidecar.build.entry])
		expect(goEnv).toEqual({ GOOS: 'windows', GOARCH: 'amd64' })

		// Host-shaped target produces a command with NO surprises — same toolchain, just its own
		// bunTarget/GOOS/GOARCH instead of windows'. No flag = host behavior, byte-identical shape.
		const mac = TARGETS['darwin-arm64']
		const { cmd: hostBunCmd } = buildCmd(bunSidecar, '/out/daemon', mac)
		expect(hostBunCmd).toEqual(['bun', 'build', '--compile', '--target=bun-darwin-arm64', bunSidecar.build.entry, '--outfile', '/out/daemon'])
	})

	it('BSC-09: every SIDECARS build.kind is covered by buildCmd (no silent fallthrough)', () => {
		const win = TARGETS['win32-x64']
		for (const sidecar of SIDECARS) {
			const { cmd } = buildCmd(sidecar, '/out/bin', win)
			expect(cmd.length, sidecar.role).toBeGreaterThan(0)
		}
	})

	it('BSC-10: core/package.json still declares every DAEMON_RUNTIME.packages entry — the cross-target pin source is live', () => {
		// This is what materializeCrossPlatformClosure reads at runtime (via pickDependencyVersions)
		// to seed the scratch install; a drift here would fail the REAL cross build, not this rail —
		// so this rail exists to catch it earlier, without touching the network.
		const coreDir = resolve(ROOT, REPO.workspaces.apiTs.pkgRoot, DAEMON_RUNTIME.resolveFrom)
		const manifest = JSON.parse(readFileSync(resolve(coreDir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
		const versions = pickDependencyVersions(manifest, DAEMON_RUNTIME.packages, 'core/package.json')
		for (const pkg of DAEMON_RUNTIME.packages) {
			expect(versions[pkg]?.length, pkg).toBeGreaterThan(0)
		}
	})

	it('BSC-11: DAEMON_RUNTIME.role names a real sidecar in the manifest', () => {
		expect(SIDECARS.some(s => s.role === DAEMON_RUNTIME.role)).toBe(true)
	})

	// Defect (B): a linux-x64-gnu HOST resolves BOTH `@libsql/linux-x64-gnu` and
	// `@libsql/linux-x64-musl` (bun's optional-dep os/cpu gate has no libc axis) — the staging walk
	// used to copy both into the bundle, and glibc `ldd` died on the musl `.node` inside linuxdeploy.
	// These rails cover the pure classifier/filter the walk now runs every optional dep through
	// (`resolveStagedRoots` itself needs a real node_modules tree, so it stays outside this pure
	// lane — see the file banner).
	describe('defect (B) — native-prebuild family walk-filter', () => {
		// The real shape of `libsql`'s own optionalDependencies: every platform+libc variant,
		// siblings in ONE object — exactly the co-occurrence the classifier keys off.
		const libsqlOptionalDepNames = [
			'@libsql/darwin-arm64',
			'@libsql/darwin-x64',
			'@libsql/linux-arm64-gnu',
			'@libsql/linux-arm64-musl',
			'@libsql/linux-x64-gnu',
			'@libsql/linux-x64-musl',
			'@libsql/win32-x64-msvc',
		]

		it('BSC-12: isNativePrebuildFamily is true for a set containing a declared nativePrebuild value', () => {
			expect(isNativePrebuildFamily(libsqlOptionalDepNames, DAEMON_RUNTIME.nativePrebuild)).toBe(true)
		})

		it('BSC-13: isNativePrebuildFamily is false for a set with no declared nativePrebuild value', () => {
			expect(isNativePrebuildFamily(['@neon-rs/load', 'some-other-optional'], DAEMON_RUNTIME.nativePrebuild)).toBe(false)
			expect(isNativePrebuildFamily([], DAEMON_RUNTIME.nativePrebuild)).toBe(false)
		})

		it('BSC-14: shouldStageOptionalDependency excludes the undeclared musl sibling on a linux-x64 target', () => {
			expect(
				shouldStageOptionalDependency('@libsql/linux-x64-musl', libsqlOptionalDepNames, 'linux-x64', DAEMON_RUNTIME.nativePrebuild),
			).toBe(false)
		})

		it('BSC-15: shouldStageOptionalDependency keeps the declared gnu prebuild on a linux-x64 target', () => {
			expect(
				shouldStageOptionalDependency('@libsql/linux-x64-gnu', libsqlOptionalDepNames, 'linux-x64', DAEMON_RUNTIME.nativePrebuild),
			).toBe(true)
		})

		it('BSC-16: shouldStageOptionalDependency keeps @libsql/win32-x64-msvc ONLY for the win32-x64 target', () => {
			expect(
				shouldStageOptionalDependency('@libsql/win32-x64-msvc', libsqlOptionalDepNames, 'win32-x64', DAEMON_RUNTIME.nativePrebuild),
			).toBe(true)
			for (const other of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'] as const) {
				expect(
					shouldStageOptionalDependency('@libsql/win32-x64-msvc', libsqlOptionalDepNames, other, DAEMON_RUNTIME.nativePrebuild),
					other,
				).toBe(false)
			}
		})

		it('BSC-17: a non-prebuild optional dependency always passes through, regardless of target', () => {
			const nonFamily = ['@neon-rs/load']
			for (const target of Object.keys(TARGETS) as (keyof typeof TARGETS)[]) {
				expect(shouldStageOptionalDependency('@neon-rs/load', nonFamily, target, DAEMON_RUNTIME.nativePrebuild), target).toBe(true)
			}
		})
	})
})
