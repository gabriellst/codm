import { describe, it, expect } from 'bun:test'
import { getGenerators, resolvePlatform, CROSS_PLATFORM_VERBS } from './resolve'

describe('resolvePlatform', () => {
	it('honors an explicit platform flag', () => {
		expect(resolvePlatform('astro')).toBe('astro')
		expect(resolvePlatform('react')).toBe('react')
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
	it('routes a cross-platform verb to a hard astro stub when platform=astro', () => {
		const react = getGenerators('typescript', 'react', 'component').component
		const astro = getGenerators('typescript', 'astro', 'component').component
		expect(typeof astro).toBe('function')
		expect(astro).not.toBe(react) // distinct generator (astro not-implemented stub)
	})
	it('exposes single-platform verbs (store, form) regardless', () => {
		const g = getGenerators('typescript', 'react', 'store')
		expect(typeof g.store).toBe('function')
	})
	it('CROSS_PLATFORM_VERBS contains the cross-platform set', () => {
		expect([...CROSS_PLATFORM_VERBS].sort()).toEqual(['component', 'form', 'primitive', 'route'])
	})
})
