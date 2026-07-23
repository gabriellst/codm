import { describe, expect, it } from 'bun:test'
import { Container } from './container'
import { token } from './token'

describe('Container (frontend DI)', () => {
	it('resolves the instance a factory produces', () => {
		const t = token<{ value: number }>('Thing')
		const c = new Container()
		c.register(t, () => ({ value: 42 }))
		expect(c.resolve(t).value).toBe(42)
	})

	it('is SINGLETON — resolve caches, the factory runs exactly once', () => {
		const t = token<{ id: number }>('Singleton')
		let calls = 0
		const c = new Container()
		c.register(t, () => ({ id: ++calls }))
		const a = c.resolve(t)
		const b = c.resolve(t)
		expect(a).toBe(b)
		expect(calls).toBe(1)
	})

	it('hands the container to the factory (dependencies resolve through it)', () => {
		const dep = token<number>('Dep')
		const svc = token<{ doubled: number }>('Svc')
		const c = new Container()
		c.register(dep, () => 21)
		c.register(svc, container => ({ doubled: container.resolve(dep) * 2 }))
		expect(c.resolve(svc).doubled).toBe(42)
	})

	it('throws NAMING the token when it is unbound', () => {
		const t = token<string>('MissingService')
		const c = new Container()
		expect(() => c.resolve(t)).toThrow(/MissingService/)
	})

	it('two containers are isolated caches (the per-env / per-test seam)', () => {
		const t = token<{ n: number }>('Isolated')
		const a = new Container()
		const b = new Container()
		a.register(t, () => ({ n: 1 }))
		b.register(t, () => ({ n: 2 }))
		expect(a.resolve(t).n).toBe(1)
		expect(b.resolve(t).n).toBe(2)
	})
})
