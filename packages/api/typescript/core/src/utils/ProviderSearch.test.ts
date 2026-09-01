import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeChildPath, PROVIDER_SEARCH, resolveBinary, type ProviderSearchEnv } from './ProviderSearch'

/**
 * The per-platform search table against a temp-dir fixture: the table is a function of (platform,
 * home, env), never of `process`, so the win32 row is testable from a POSIX host. Two hermeticity
 * rules keep these tests honest:
 *
 * - Every `resolveBinary` call uses a fixture-only command name (`fixture-provider-cli`), NEVER a
 *   real CLI's name: the POSIX rows' knownDirs include REAL absolute system dirs (`/usr/local/bin`,
 *   `/opt/homebrew/bin`), so a literal `claude` would leak the host machine's actual install into a
 *   `toBeNull()` assertion — deterministic failure on any machine with claude installed there.
 * - The one assertion that needs `accessSync X_OK` to REJECT a file (no exec bit) is guarded with
 *   `describe.skipIf(process.platform === 'win32')` — on Windows X_OK degrades to F_OK, which is
 *   exactly why the win32 row never offers the bare name.
 *
 * THE HERMETICITY IS NOT SYMMETRIC, and the asymmetry is a property of the platforms, not a gap
 * here. The win32 row is fully testable from a POSIX host because nothing about a POSIX absolute
 * path collides with `;`. The reverse does not hold: a Windows absolute path is `C:\...`, and `:`
 * IS the POSIX rows' declared `pathDelimiter`. Feeding one to a POSIX row splits `C:\Users\x\bin`
 * into `C` and `\Users\x\bin`; the second half still resolves (Windows reads a leading `\` against
 * the current drive) so the file is FOUND, just under a drive-less path — the assertion fails on a
 * value that is right about everything except the drive letter. No fixture can dodge that while
 * still living on a real Windows filesystem, so the cases that put a host-absolute path on `PATH`
 * are grouped into their own `describe.skipIf` below. The POSIX rows are covered on the POSIX
 * runners, where they are the rows that actually ship.
 */

const CLI = 'fixture-provider-cli'

let root: string

const dir = (...segments: string[]): string => {
	const path = join(root, ...segments)
	mkdirSync(path, { recursive: true })
	return path
}
/** An executable file. `mode` is what the exec bit is on POSIX — on Windows the extension is the bit. */
const executable = (at: string, name: string): string => {
	const path = join(at, name)
	writeFileSync(path, '#!/bin/sh\n', { mode: 0o755 })
	return path
}
const plainFile = (at: string, name: string): string => {
	const path = join(at, name)
	writeFileSync(path, 'not executable\n', { mode: 0o644 })
	return path
}
const env = (vars: Record<string, string>, home = root): ProviderSearchEnv => ({ home, env: vars })

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'provider-search-fixture-'))
})
afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('resolveBinary — darwin/linux rows (POSIX)', () => {
	// A host-absolute path ON `PATH`, read by a POSIX row — see the asymmetry note at the top of the
	// file. Every case in here builds a fixture dir and puts it on `PATH`; on Windows that string is
	// `C:\…`, and `:` is precisely this row's declared delimiter, so the row splits the drive letter
	// off and matches a path that is right except for the drive. Not constructible on a Windows
	// filesystem; covered on the POSIX runners, where these rows are the ones that ship.
	describe.skipIf(process.platform === 'win32')('a fixture dir on PATH (host-absolute)', () => {
		it('finds an executable on PATH and returns its absolute path', () => {
			const bin = dir('bin')
			const found = executable(bin, CLI)
			expect(resolveBinary(CLI, PROVIDER_SEARCH.darwin, env({ PATH: bin }))).toBe(found)
		})

		it('splits PATH on the DECLARED delimiter and honours entry order', () => {
			const first = dir('first')
			const second = dir('second')
			const winner = executable(first, CLI)
			executable(second, CLI)
			expect(resolveBinary(CLI, PROVIDER_SEARCH.linux, env({ PATH: `${first}:${second}` }))).toBe(winner)
		})

		it('PATH wins over the known dirs', () => {
			const bin = dir('bin')
			const onPath = executable(bin, CLI)
			executable(dir('.local', 'bin'), CLI)
			expect(resolveBinary(CLI, PROVIDER_SEARCH.linux, env({ PATH: bin }))).toBe(onPath)
		})
	})

	describe.skipIf(process.platform === 'win32')('exec bit / directory rejection (POSIX X_OK semantics)', () => {
		it('skips a file without the exec bit and a DIRECTORY with the binary’s name', () => {
			const bin = dir('bin')
			plainFile(bin, CLI) // needs X_OK to reject
			dir('dirs', CLI) // a directory named like the binary — `access(X_OK)` alone would accept it
			expect(resolveBinary(CLI, PROVIDER_SEARCH.darwin, env({ PATH: `${bin}:${join(root, 'dirs')}` }))).toBeNull()
		})
	})

	it('falls back to the known install dirs under HOME when PATH has nothing (darwin: ~/.claude/local)', () => {
		const local = dir('.claude', 'local')
		const found = executable(local, CLI)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.darwin, env({ PATH: dir('empty') }))).toBe(found)
	})

	it('linux knows the npm-global prefix (~/.npm-global/bin) — darwin does not need to', () => {
		const npmGlobal = dir('.npm-global', 'bin')
		const found = executable(npmGlobal, CLI)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.linux, env({ PATH: '' }))).toBe(found)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.darwin, env({ PATH: '' }))).toBeNull()
	})

	it('returns null when PATH is unset and nothing is installed', () => {
		expect(resolveBinary(CLI, PROVIDER_SEARCH.linux, env({}))).toBeNull()
	})
})

describe('resolveBinary — win32 row', () => {
	it('resolves through PATHEXT: a bare name (the npm bash shim) is IGNORED, `.exe` is found', () => {
		const bin = dir('bin')
		executable(bin, CLI) // extensionless shim — not a Windows executable
		const exe = executable(bin, `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' }))).toBe(exe)
	})

	it('tries the extensions in PATHEXT order — .exe before .cmd when both exist', () => {
		const bin = dir('bin')
		executable(bin, `${CLI}.cmd`)
		const exe = executable(bin, `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' }))).toBe(exe)
		// And the OTHER way round when the machine's PATHEXT says so: the order is the OS's, not ours.
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: bin, PATHEXT: '.CMD;.EXE' }))).toBe(join(bin, `${CLI}.cmd`))
	})

	it('uses the Windows default PATHEXT when the variable is unset', () => {
		const bin = dir('bin')
		const exe = executable(bin, `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: bin }))).toBe(exe)
	})

	it('splits PATH on `;` regardless of the host', () => {
		const first = dir('first')
		const second = dir('second')
		const exe = executable(second, `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: `${first};${second}`, PATHEXT: '.EXE' }))).toBe(exe)
	})

	it('knows %APPDATA%\\npm and %LOCALAPPDATA%\\Programs when those variables exist, and skips them when they do not', () => {
		const appData = dir('AppData', 'Roaming')
		const cmd = executable(dir('AppData', 'Roaming', 'npm'), `${CLI}.cmd`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: '', PATHEXT: '.EXE;.CMD', APPDATA: appData }))).toBe(cmd)

		const localAppData = dir('AppData', 'Local')
		const exe = executable(dir('AppData', 'Local', 'Programs'), `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: '', PATHEXT: '.EXE', LOCALAPPDATA: localAppData }))).toBe(exe)

		// Neither variable → neither dir is even a candidate.
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: '', PATHEXT: '.EXE;.CMD' }))).toBeNull()
	})

	it('knows the native installer’s home (~/.local/bin/<name>.exe) and ~/.claude/local, like POSIX', () => {
		const exe = executable(dir('.local', 'bin'), `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: '', PATHEXT: '.EXE' }))).toBe(exe)
	})
})

describe('PROVIDER_SEARCH — the declared platform → search relation', () => {
	it('declares the delimiter and the extensions per platform, never read from the host', () => {
		expect(PROVIDER_SEARCH.win32.pathDelimiter).toBe(';')
		expect(PROVIDER_SEARCH.darwin.pathDelimiter).toBe(':')
		expect(PROVIDER_SEARCH.linux.pathDelimiter).toBe(':')
		expect(PROVIDER_SEARCH.darwin.extensions(env({}))).toEqual([''])
		expect(PROVIDER_SEARCH.win32.extensions(env({ PATHEXT: '.COM;.EXE' }))).toEqual(['.com', '.exe'])
	})

	it('keeps today’s macOS list verbatim (Homebrew included)', () => {
		expect(PROVIDER_SEARCH.darwin.knownDirs(env({}, '/Users/x'))).toEqual([
			join('/Users/x', '.claude', 'local'),
			join('/Users/x', '.local', 'bin'),
			join('/Users/x', '.bun', 'bin'),
			'/usr/local/bin',
			'/opt/homebrew/bin',
		])
	})

	it('covers the platform this test is running on — the lookup in SystemProviderDetector can never be undefined', () => {
		expect(PROVIDER_SEARCH[process.platform]).toBeDefined()
	})
})

describe('composeChildPath — o PATH que um filho recebe, composto da relação declarada', () => {
	it('ordem: base herdada primeiro, depois os dirs atestados, depois os conhecidos da row', () => {
		const composed = composeChildPath(PROVIDER_SEARCH.darwin, env({}, '/Users/x'), {
			basePath: '/usr/bin:/bin',
			runtimeDirs: ['/runtime/interpreter', '/runtime/provider'],
		})
		expect(composed).toBe(
			[
				'/usr/bin',
				'/bin',
				'/runtime/interpreter',
				'/runtime/provider',
				join('/Users/x', '.claude', 'local'),
				join('/Users/x', '.local', 'bin'),
				join('/Users/x', '.bun', 'bin'),
				'/usr/local/bin',
				'/opt/homebrew/bin',
			].join(':'),
		)
	})

	it('deduplica sem reordenar e ignora entradas vazias da base (um PATH ausente vira base vazia)', () => {
		const composed = composeChildPath(PROVIDER_SEARCH.darwin, env({}, '/Users/x'), {
			basePath: '/usr/local/bin::',
			runtimeDirs: ['/usr/local/bin'],
		})
		const entries = composed.split(':')
		expect(entries.filter(e => e === '/usr/local/bin')).toHaveLength(1)
		expect(entries).not.toContain('')
		// A primeira ocorrência vence — a base continua na frente dos conhecidos.
		expect(entries[0]).toBe('/usr/local/bin')
	})

	it('a row win32 compõe com o delimitador dela e os dirs %VAR%-rooted declarados', () => {
		const composed = composeChildPath(PROVIDER_SEARCH.win32, env({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'C:\\Users\\x'), {
			basePath: 'C:\\Windows\\system32;C:\\Windows',
			runtimeDirs: ['C:\\runtime'],
		})
		const entries = composed.split(';')
		expect(entries.slice(0, 3)).toEqual(['C:\\Windows\\system32', 'C:\\Windows', 'C:\\runtime'])
		expect(entries).toContain(join('C:\\Users\\x\\AppData\\Roaming', 'npm'))
	})
})
