import 'reflect-metadata'
import { describe, it, expect, afterEach, spyOn } from 'bun:test'
import { Config } from '../../utils/Config'
import { createLoggingServiceFactory } from './LoggingBinding'
import { MockLoggingService } from './MockLoggingService'
import { OtlpLoggingService } from './OtlpLoggingService'

// `Config` is declared `as const`, so its fields are `readonly` at the type level even though the
// underlying object is a plain mutable object at runtime. Cast to `any` to override deterministically
// instead of depending on real `process.env`.
const env = Config.env as any

describe('createLoggingServiceFactory', () => {
	let savedUrl: string
	let savedServiceName: string

	afterEach(() => {
		env.OTEL_COLLECTOR_LOG_URL = savedUrl
		env.OTEL_SERVICE_NAME = savedServiceName
	})

	it('falls back to MockLoggingService and warns once when OTEL_COLLECTOR_LOG_URL is unset', () => {
		savedUrl = env.OTEL_COLLECTOR_LOG_URL
		savedServiceName = env.OTEL_SERVICE_NAME
		env.OTEL_COLLECTOR_LOG_URL = ''

		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})

		const resolve = createLoggingServiceFactory()
		const first = resolve()
		const second = resolve()

		expect(first).toBeInstanceOf(MockLoggingService)
		expect(second).toBe(first) // lazy singleton — same reference across resolves
		expect(warnSpy).toHaveBeenCalledTimes(1) // warns once, not once per resolve
		expect(warnSpy.mock.calls[0]?.[0]).toContain('OTEL_COLLECTOR_LOG_URL')

		warnSpy.mockRestore()
	})

	it('builds a lazy-singleton OtlpLoggingService when OTEL_COLLECTOR_LOG_URL is set', () => {
		savedUrl = env.OTEL_COLLECTOR_LOG_URL
		savedServiceName = env.OTEL_SERVICE_NAME
		env.OTEL_COLLECTOR_LOG_URL = 'http://localhost:4317/v1/logs'
		env.OTEL_SERVICE_NAME = 'template-backend-test'

		const resolve = createLoggingServiceFactory()
		const first = resolve()
		const second = resolve()

		expect(first).toBeInstanceOf(OtlpLoggingService)
		// Lazy singleton: constructing OtlpLoggingService twice would leak a second
		// LoggerProvider/BatchLogRecordProcessor (each owns its own export queue/timer) — the factory
		// must memoize instead of building a fresh instance per resolve.
		expect(second).toBe(first)
	})

	it('gives independent resolvers per factory call (no cross-call shared cache)', () => {
		savedUrl = env.OTEL_COLLECTOR_LOG_URL
		savedServiceName = env.OTEL_SERVICE_NAME
		env.OTEL_COLLECTOR_LOG_URL = ''

		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})

		const resolveA = createLoggingServiceFactory()
		const resolveB = createLoggingServiceFactory()

		const a = resolveA()
		const b = resolveB()

		expect(a).toBeInstanceOf(MockLoggingService)
		expect(b).toBeInstanceOf(MockLoggingService)
		expect(a).not.toBe(b) // independent closures, independent cached instances

		warnSpy.mockRestore()
	})
})
