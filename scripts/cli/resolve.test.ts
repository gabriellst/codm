import { describe, it, expect } from 'bun:test'
import { getGenerators, resolvePlatform, CROSS_PLATFORM_VERBS } from './resolve'

describe('resolvePlatform', () => {
	it('honors an explicit platform flag', () => {
		expect(resolvePlatform('expo')).toBe('expo')
		expect(resolvePlatform('astro')).toBe('astro')
	})
	it('defaults to react', () => {
		expect(resolvePlatform(undefined)).toBe('react')
	})
})

describe('getGenerators', () => {
	it('routes a cross-platform verb to react frontend + backend by default', () => {
		const g = getGenerators('typescript', 'react', 'component')
		expect(typeof g.component).toBe('function') // react component generator
		expect(typeof g.entity).toBe('function') // backend still available
	})
	it('routes a cross-platform verb to expo when platform=expo', () => {
		const react = getGenerators('typescript', 'react', 'component').component
		const expo = getGenerators('typescript', 'expo', 'component').component
		expect(typeof expo).toBe('function')
		expect(expo).not.toBe(react) // distinct generator
	})
	it('exposes single-platform verbs (store, form) regardless', () => {
		const g = getGenerators('typescript', 'react', 'store')
		expect(typeof g.store).toBe('function')
	})
	it('CROSS_PLATFORM_VERBS contains the cross-platform set', () => {
		expect([...CROSS_PLATFORM_VERBS].sort()).toEqual(['component', 'form', 'primitive', 'route'])
	})
})
