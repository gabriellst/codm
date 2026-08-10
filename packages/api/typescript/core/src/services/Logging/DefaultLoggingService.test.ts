import 'reflect-metadata'
import { describe, it, expect, afterEach, spyOn } from 'bun:test'
import { Config } from '../../utils/Config'
import { DefaultLoggingService } from './DefaultLoggingService'
import { MockLoggingService } from './MockLoggingService'
import { OtlpLoggingService } from './OtlpLoggingService'

// `Config` is declared `as const`, so its fields are `readonly` at the type level even though the
// underlying object is a plain mutable object at runtime. Cast to `any` to override deterministically
// instead of depending on real `process.env`.
const env = Config.env as any

describe('DefaultLoggingService', () => {
	let savedUrl: string
	let savedServiceName: string

	afterEach(() => {
		env.OTEL_COLLECTOR_LOG_URL = savedUrl
		env.OTEL_SERVICE_NAME = savedServiceName
	})

	it('falls back to the console path (MockLoggingService delegate) and warns once when OTEL_COLLECTOR_LOG_URL is unset', () => {
		savedUrl = env.OTEL_COLLECTOR_LOG_URL
		savedServiceName = env.OTEL_SERVICE_NAME
		env.OTEL_COLLECTOR_LOG_URL = ''

		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})

		const service = new DefaultLoggingService()

		expect((service as unknown as { delegate: unknown }).delegate).toBeInstanceOf(MockLoggingService)
		expect(warnSpy).toHaveBeenCalledTimes(1)
		expect(warnSpy.mock.calls[0]?.[0]).toContain('OTEL_COLLECTOR_LOG_URL')

		warnSpy.mockRestore()
	})

	it('delegates to a real OtlpLoggingService when OTEL_COLLECTOR_LOG_URL is set, without warning', () => {
		savedUrl = env.OTEL_COLLECTOR_LOG_URL
		savedServiceName = env.OTEL_SERVICE_NAME
		env.OTEL_COLLECTOR_LOG_URL = 'http://localhost:4317/v1/logs'
		env.OTEL_SERVICE_NAME = 'template-backend-test'

		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})

		const service = new DefaultLoggingService()

		expect((service as unknown as { delegate: unknown }).delegate).toBeInstanceOf(OtlpLoggingService)
		expect(warnSpy).not.toHaveBeenCalled()

		warnSpy.mockRestore()
	})

	it('delegates every public method 1:1 to the underlying LoggingService (console path)', () => {
		savedUrl = env.OTEL_COLLECTOR_LOG_URL
		savedServiceName = env.OTEL_SERVICE_NAME
		env.OTEL_COLLECTOR_LOG_URL = ''

		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})

		const service = new DefaultLoggingService()
		const delegate = (service as unknown as { delegate: MockLoggingService }).delegate

		for (const method of ['debug', 'error', 'info', 'warn'] as const) {
			const methodSpy = spyOn(delegate, method)
			const args = { content: { method } }
			service[method](args)
			expect(methodSpy).toHaveBeenCalledWith(args)
			methodSpy.mockRestore()
		}

		warnSpy.mockRestore()
	})
})
