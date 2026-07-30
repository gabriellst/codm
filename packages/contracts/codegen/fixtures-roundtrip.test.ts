/**
 * TS consumer of the SHARED wire fixtures (fixtures/events) — the same bytes the Go
 * (generated/go/tests/fixtures_test.go) and Rust (generated/rust/tests/roundtrip.rs)
 * binding tests parse. This test mirrors the REAL TS ingress boundary verbatim:
 * `JSON.parse(raw, reviveIsoDates)` → `adaptWireEnvelope` → contract schema parse —
 * the exact path SqlExternalMediator/RedisExternalMediator run for every frame.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { adaptWireEnvelope, reviveIsoDates } from '@codedm/core-typescript'
import { IntegrationEventSchema } from '@codedm/contracts-typescript/wire'

const FIXTURES = join(import.meta.dir, '../fixtures/events')

const files = readdirSync(FIXTURES).filter(f => f.endsWith('.json'))
const eventFiles = files.filter(f => !f.startsWith('_'))

describe('shared fixtures — TS ingress parity', () => {
	test('fixtures exist (run `bun run codegen:fixtures` when this fails)', () => {
		expect(eventFiles.length).toBeGreaterThan(0)
	})

	test('every event fixture survives the ingress boundary into the contract union', () => {
		for (const f of eventFiles) {
			const raw = readFileSync(join(FIXTURES, f), 'utf-8')
			const adapted = adaptWireEnvelope(JSON.parse(raw, reviveIsoDates))
			const parsed = IntegrationEventSchema.safeParse(adapted)
			if (!parsed.success) {
				throw new Error(`${f}: ingress parse failed:\n${parsed.error.message}`)
			}
			expect(parsed.data.ownerId).toBe('fixture-tenant')
			expect(parsed.data.name).toBe(f.replace(/\.minimal\.json$|\.json$/, ''))
		}
	})

	test('the unknown-event probe is rejected by the closed union (TS policy: consumer drops, schema rejects)', () => {
		const raw = readFileSync(join(FIXTURES, '_unknown-event.json'), 'utf-8')
		const adapted = adaptWireEnvelope(JSON.parse(raw, reviveIsoDates))
		expect(IntegrationEventSchema.safeParse(adapted).success).toBe(false)
	})
})
