import { describe, expect, it } from 'bun:test'
import { type Bindings, Container } from './container'
import { token } from './token'

describe('Container (frontend DI)', () => {
	it('load + resolve constructs an instance of the bound class', () => {
		class Thing {
			readonly value = 42
		}
		const t = token<Thing>('Thing')
		const c = new Container()
		c.load([[t, Thing]])
		expect(c.resolve(t)).toBeInstanceOf(Thing)
		expect(c.resolve(t).value).toBe(42)
	})

	it('is SINGLETON — resolve caches, the class is constructed exactly once', () => {
		let ctorCalls = 0
		class Counter {
			constructor() {
				ctorCalls++
			}
		}
		const t = token<Counter>('Singleton')
		const c = new Container()
		c.load([[t, Counter]])
		const a = c.resolve(t)
		const b = c.resolve(t)
		expect(a).toBe(b)
		expect(ctorCalls).toBe(1)
	})

	it('resolves `static deps` RECURSIVELY and injects them in ctor order (shared singletons)', () => {
		class Engine {
			readonly hp = 400
		}
		const EngineToken = token<Engine>('Engine')
		class Car {
			static deps = [EngineToken] as const
			constructor(readonly engine: Engine) {}
		}
		const CarToken = token<Car>('Car')

		const bindings: Bindings = [
			[EngineToken, Engine],
			[CarToken, Car],
		]
		const c = new Container()
		c.load(bindings)

		const car = c.resolve(CarToken)
		expect(car).toBeInstanceOf(Car)
		expect(car.engine).toBeInstanceOf(Engine)
		expect(car.engine.hp).toBe(400)
		// the injected dep is the SAME singleton the container hands out directly
		expect(car.engine).toBe(c.resolve(EngineToken))
	})

	it('throws NAMING the token when it is unbound', () => {
		const t = token<string>('MissingService')
		const c = new Container()
		expect(() => c.resolve(t)).toThrow(/MissingService/)
	})

	it('throws (naming the token) on a circular dependency instead of blowing the stack', () => {
		const ATok = token<unknown>('CycleA')
		const BTok = token<unknown>('CycleB')
		class A {
			static deps = [BTok] as const
			constructor(readonly b: unknown) {}
		}
		class B {
			static deps = [ATok] as const
			constructor(readonly a: unknown) {}
		}
		const bindings: Bindings = [
			[ATok, A],
			[BTok, B],
		]
		const c = new Container()
		c.load(bindings)
		expect(() => c.resolve(ATok)).toThrow(/circular/i)
	})

	it('two containers are isolated caches (the per-env / per-test seam)', () => {
		class One {
			readonly n = 1
		}
		class Two {
			readonly n = 2
		}
		const t = token<{ n: number }>('Isolated')
		const a = new Container()
		const b = new Container()
		a.load([[t, One]])
		b.load([[t, Two]])
		expect(a.resolve(t).n).toBe(1)
		expect(b.resolve(t).n).toBe(2)
	})
})
