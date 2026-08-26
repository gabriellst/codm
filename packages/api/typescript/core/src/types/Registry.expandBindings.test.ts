import { describe, expect, test } from 'bun:test'
import { expandBindings } from './Registry'

class Port {}
class MockImpl {}
class RealImpl {}
class IntImpl {}

describe('expandBindings (declarative per-token bindings → per-env InstanceRegistry)', () => {
	test('integration omitted mirrors real', () => {
		const r = expandBindings([{ token: Port, mock: MockImpl, real: RealImpl }])
		expect(r.mock).toEqual([{ token: Port, instance: MockImpl }])
		expect(r.integration).toEqual([{ token: Port, instance: RealImpl }])
		expect(r.real).toEqual([{ token: Port, instance: RealImpl }])
	})

	test('explicit integration overrides the mirror', () => {
		const r = expandBindings([{ token: Port, mock: MockImpl, integration: IntImpl, real: RealImpl }])
		expect(r.integration).toEqual([{ token: Port, instance: IntImpl }])
	})

	test('null is a DECLARED absence — the env gets no entry', () => {
		const r = expandBindings([{ token: Port, mock: null, integration: null, real: RealImpl }])
		expect(r.mock).toEqual([])
		expect(r.integration).toEqual([])
		expect(r.real).toEqual([{ token: Port, instance: RealImpl }])
	})

	test('integration: null does NOT inherit real (absence must stay declared)', () => {
		const r = expandBindings([{ token: Port, mock: MockImpl, integration: null, real: RealImpl }])
		expect(r.integration).toEqual([])
	})

	test('e2e omitted mirrors integration (which mirrors real when integration is also omitted)', () => {
		const r = expandBindings([{ token: Port, mock: MockImpl, real: RealImpl }])
		expect(r.e2e).toEqual([{ token: Port, instance: RealImpl }])
	})

	test('e2e omitted mirrors explicit integration', () => {
		const r = expandBindings([{ token: Port, mock: MockImpl, integration: IntImpl, real: RealImpl }])
		expect(r.e2e).toEqual([{ token: Port, instance: IntImpl }])
	})

	test('explicit e2e overrides the mirror', () => {
		class E2eImpl {}
		const r = expandBindings([{ token: Port, mock: MockImpl, integration: IntImpl, real: RealImpl, e2e: E2eImpl }])
		expect(r.e2e).toEqual([{ token: Port, instance: E2eImpl }])
	})

	test('e2e: null is a DECLARED absence — does NOT inherit integration', () => {
		const r = expandBindings([{ token: Port, mock: MockImpl, integration: IntImpl, real: RealImpl, e2e: null }])
		expect(r.e2e).toEqual([])
	})

	test('{ useFactory } values become factory entries; declaration order is preserved', () => {
		const factory = { useFactory: () => new RealImpl() }
		const r = expandBindings([
			{ token: 'a', mock: factory, real: factory },
			{ token: 'b', mock: MockImpl, real: RealImpl },
		])
		expect(r.mock[0]).toEqual({ token: 'a', useFactory: factory.useFactory })
		expect(r.mock.map(e => e.token)).toEqual(['a', 'b'])
		expect(r.real[0]).toEqual({ token: 'a', useFactory: factory.useFactory })
	})
})
