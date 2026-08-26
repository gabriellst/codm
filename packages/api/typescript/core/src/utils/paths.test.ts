import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { API_ROOT, API_SRC, API_PUBLIC, CLIENT_ROOT, APP_ROOT, MONOREPO_ROOT, ROOT_ENV, API_OPENAPI_SPEC, MIGRATIONS_DIR } from './paths'

describe('paths', () => {
	it('resolves API_ROOT to an existing directory', () => {
		expect(existsSync(API_ROOT)).toBe(true)
		expect(API_ROOT.endsWith('/packages/api/typescript')).toBe(true)
	})

	it('resolves CLIENT_ROOT and APP_ROOT to existing directories', () => {
		expect(existsSync(CLIENT_ROOT)).toBe(true)
		expect(existsSync(APP_ROOT)).toBe(true)
	})

	it('MONOREPO_ROOT contains a bun.lock file', () => {
		expect(existsSync(`${MONOREPO_ROOT}/bun.lock`)).toBe(true)
	})

	it('derived constants reflect packages/ layout', () => {
		expect(API_SRC.endsWith('/packages/api/typescript/src')).toBe(true)
		expect(API_PUBLIC.endsWith('/packages/api/typescript/public')).toBe(true)
		expect(API_OPENAPI_SPEC.endsWith('/packages/api/typescript/public/docs/openapi.json')).toBe(true)
		expect(MIGRATIONS_DIR.endsWith('/packages/api/typescript/src/shared/db/drizzle/migrations')).toBe(true)
		expect(ROOT_ENV.endsWith('/.env')).toBe(true)
	})
})
