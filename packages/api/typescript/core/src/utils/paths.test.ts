import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { API_ROOT, API_SRC, API_PUBLIC, CLIENT_ROOT, APP_ROOT, MONOREPO_ROOT, ROOT_ENV, API_OPENAPI_SPEC, MIGRATIONS_DIR } from './paths'

/**
 * The constants under test are built with `join`/`resolve`, so they carry the HOST's separator —
 * `\` on Windows. Spelling the expected suffix as a `/` literal would assert the POSIX layout of a
 * path the module never claims to produce, which is why these read as `join(...)` too: the same
 * layout is asserted on every platform, in that platform's spelling. The leading separator is part
 * of it: without it `endsWith` would also accept a directory merely ENDING in "…packages".
 */
const suffix = (...segments: string[]): string => sep + join(...segments)

describe('paths', () => {
	it('resolves API_ROOT to an existing directory', () => {
		expect(existsSync(API_ROOT)).toBe(true)
		expect(API_ROOT.endsWith(suffix('packages', 'api', 'typescript'))).toBe(true)
	})

	it('resolves CLIENT_ROOT and APP_ROOT to existing directories', () => {
		expect(existsSync(CLIENT_ROOT)).toBe(true)
		expect(existsSync(APP_ROOT)).toBe(true)
	})

	it('MONOREPO_ROOT contains a bun.lock file', () => {
		expect(existsSync(join(MONOREPO_ROOT, 'bun.lock'))).toBe(true)
	})

	it('derived constants reflect packages/ layout', () => {
		expect(API_SRC.endsWith(suffix('packages', 'api', 'typescript', 'src'))).toBe(true)
		expect(API_PUBLIC.endsWith(suffix('packages', 'api', 'typescript', 'public'))).toBe(true)
		expect(API_OPENAPI_SPEC.endsWith(suffix('packages', 'api', 'typescript', 'public', 'docs', 'openapi.json'))).toBe(true)
		expect(MIGRATIONS_DIR.endsWith(suffix('packages', 'api', 'typescript', 'src', 'shared', 'db', 'drizzle', 'migrations'))).toBe(true)
		expect(ROOT_ENV.endsWith(suffix('.env'))).toBe(true)
	})
})
