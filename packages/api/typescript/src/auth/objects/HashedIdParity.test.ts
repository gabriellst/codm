import { describe, expect, it } from 'bun:test'
import { Id } from '@template/core-typescript'

/**
 * Deterministic-ID parity lock between TS and Go.
 *
 * Both polyglot core implementations
 * (`packages/api/typescript/core/src/objects/Id.ts` `Id.fromSeed(...)` and
 * `packages/api/go/core/objects/id.go` `IDFromSeed(...)`) use the same
 * algorithm: RFC 4122 UUIDv5 with the locked `BK_DASH_NAMESPACE`, joining
 * parts with `:` before SHA-1.
 *
 * The golden values below match the Go-side parity test
 * (`packages/api/go/core/objects/id_test.go` `TestIDFromSeed_Golden*`).
 * If either side drifts, both tests fail LOUD before previously-ingested
 * canonical rows orphan across services.
 */
describe('Id.fromSeed — deterministic-ID parity with Go IDFromSeed', () => {
	it('matches the Go golden value for ("integration", "SHOPIFY", "foo.myshopify.com")', () => {
		expect(Id.fromSeed('integration', 'EXAMPLE', 'foo.example.com').value).toBe('7d55c512-b5e1-523b-9945-8335b3103633')
	})

	it('matches the Go golden value for ("integration", "EXAMPLE", "x")', () => {
		expect(Id.fromSeed('integration', 'EXAMPLE', 'x').value).toBe('f174fbd3-677d-5099-a109-e5de85346b59')
	})

	it('throws on empty input', () => {
		expect(() => Id.fromSeed()).toThrow()
	})
})
