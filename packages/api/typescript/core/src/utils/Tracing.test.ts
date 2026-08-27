import 'reflect-metadata'
import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { container } from 'tsyringe-neo'
import { Config } from './Config'
import { autoTrace, isTelemetryEnabled, startTelemetry, traceClass } from './Tracing'

/**
 * THE INSTRUMENTATION IS NOT FREE WHEN IT HAS NOWHERE TO EXPORT — this suite pins the gate that
 * `startTelemetry`'s docblock explains. Without a collector the OTel API returns non-recording
 * spans (no trace is created, nothing is exported), but the wrapper still allocated a ProxyTracer +
 * a NonRecordingSpan, ran an `ALS.run()` frame and called `describeValue()` over every argument and
 * return value on EVERY method of EVERY DI-resolved class: measured 451 ns/call against 2 ns
 * unwrapped. The packaged desktop daemon is exactly that case — the shell injects no `OTEL_*` env
 * into either sidecar.
 *
 * The assertions are on PROTOTYPE / `resolve` IDENTITY rather than on a timing delta: "the method
 * is still the method the author wrote" is the fact that makes the cost impossible, and it does not
 * flake on a busy machine.
 *
 * `Config` is `as const` (readonly at the type level) over a plain mutable object, and `Config.env`
 * is parsed ONCE at import — so the deterministic override is the field itself, exactly as
 * `DefaultLoggingService.test.ts` does it. Never read the ambient value: nx loads the repo `.env`
 * into tests, where a collector URL may well be set.
 */
const env = Config.env as { OTEL_COLLECTOR_TRACE_URL: string }

describe('Tracing — instrumentation is gated on a configured collector', () => {
	let saved: string | undefined

	afterEach(() => {
		if (saved !== undefined) env.OTEL_COLLECTOR_TRACE_URL = saved
		saved = undefined
	})

	function withTraceUrl(url: string): void {
		saved = env.OTEL_COLLECTOR_TRACE_URL
		env.OTEL_COLLECTOR_TRACE_URL = url
	}

	it('isTelemetryEnabled follows the configured URL, and nothing else', () => {
		withTraceUrl('')
		expect(isTelemetryEnabled()).toBe(false)

		env.OTEL_COLLECTOR_TRACE_URL = 'http://localhost:4317/v1/traces'
		expect(isTelemetryEnabled()).toBe(true)
	})

	it('traceClass leaves the prototype untouched when no collector is configured', () => {
		withTraceUrl('')

		class TraceOffProbe {
			work(payload: { a: number }): number {
				return payload.a + 1
			}
		}
		const original = TraceOffProbe.prototype.work

		traceClass([TraceOffProbe])

		expect(TraceOffProbe.prototype.work).toBe(original)
		expect(new TraceOffProbe().work({ a: 1 })).toBe(2)
	})

	it('traceClass still wraps — preserving behaviour — once a collector is configured', () => {
		withTraceUrl('http://localhost:4317/v1/traces')

		class TraceOnProbe {
			work(payload: { a: number }): number {
				return payload.a + 1
			}
		}
		const original = TraceOnProbe.prototype.work

		traceClass([TraceOnProbe])

		expect(TraceOnProbe.prototype.work).not.toBe(original)
		expect(new TraceOnProbe().work({ a: 1 })).toBe(2)
	})

	it('autoTrace does not patch container.resolve when no collector is configured', () => {
		withTraceUrl('')

		const child = container.createChildContainer()
		const original = child.resolve

		autoTrace(child)

		expect(child.resolve).toBe(original)
	})

	it('autoTrace still patches container.resolve once a collector is configured', () => {
		withTraceUrl('http://localhost:4317/v1/traces')

		const child = container.createChildContainer()
		const original = child.resolve

		autoTrace(child)

		expect(child.resolve).not.toBe(original)
	})

	it('startTelemetry starts no SDK and says so when no collector is configured', async () => {
		withTraceUrl('')

		const logSpy = spyOn(console, 'log').mockImplementation(() => {})
		await startTelemetry()

		expect(logSpy).toHaveBeenCalledTimes(1)
		expect(logSpy.mock.calls[0]?.[0]).toContain('OTEL_COLLECTOR_TRACE_URL not set')
		logSpy.mockRestore()
	})
})
