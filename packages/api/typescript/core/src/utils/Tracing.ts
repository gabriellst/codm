import 'reflect-metadata'
import { context, SpanStatusCode, trace, type Span } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { Config } from './Config'
import { DependencyContainer } from 'tsyringe-neo'

const contextManager = new AsyncLocalStorageContextManager()

context.setGlobalContextManager(contextManager)

const tracedClasses = new Set<string>()

/**
 * Starts the OTEL SDK only when OTEL_COLLECTOR_TRACE_URL is explicitly set.
 *
 * When the SDK is not started, the OpenTelemetry API returns noop tracers/spans
 * automatically — every startSpan, setAttribute, addEvent call becomes a zero-cost
 * noop. This means autoTrace can wrap every class unconditionally: in dev without
 * a collector there is zero memory overhead, and in production with a collector
 * all classes are traced with proper bounds.
 */
export async function startTelemetry() {
	if (!process.env.OTEL_COLLECTOR_TRACE_URL) {
		console.log('⏭️  OTEL_COLLECTOR_TRACE_URL not set — telemetry disabled (noop spans)')
		return
	}

	const sdk = new NodeSDK({
		serviceName: Config.name,
		contextManager,
		instrumentations: [],
		spanProcessors: [
			new BatchSpanProcessor(
				new OTLPTraceExporter({
					url: Config.env.OTEL_COLLECTOR_TRACE_URL,
				}),
				{
					maxQueueSize: 2048,
					maxExportBatchSize: 512,
					scheduledDelayMillis: 5000,
				},
			),
		],
	})
	await sdk.start()
	console.log(`✅ Telemetry started → ${Config.env.OTEL_COLLECTOR_TRACE_URL}`)
}

/**
 * Describe a value for tracing without serializing it.
 * Returns a short, fixed-size string like "Object{3 keys}", "Array[5]", "string(42)", etc.
 * No JSON.stringify — zero large allocations.
 */
export function describeValue(value: unknown): string {
	if (value === null) return 'null'
	if (value === undefined) return 'undefined'
	if (typeof value === 'string') return `string(${value.length})`
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	if (Array.isArray(value)) return `Array[${value.length}]`
	if (value instanceof Error) return `${value.constructor.name}: ${value.message.slice(0, 100)}`
	if (typeof value === 'object') {
		const name = value.constructor?.name
		const keys = Object.keys(value as object)
		return name && name !== 'Object' ? `${name}{${keys.length} keys}` : `Object{${keys.length} keys}`
	}
	return typeof value
}

function addIOAttributes(span: Span, args: unknown[], result?: unknown) {
	if (args.length === 1) {
		span.setAttribute('method.input', describeValue(args[0]))
	} else if (args.length > 1) {
		span.setAttribute('method.input', `[${args.map(describeValue).join(', ')}]`)
	}
	if (result !== undefined) {
		span.setAttribute('method.output', describeValue(result))
	}
}

function addErrorIOEvents(span: Span, args: unknown[]) {
	span.addEvent('method.input', { 'input.description': `[${args.map(describeValue).join(', ')}]` })
}

// Utility function to add tracing to class methods
function traceClassMethods(prototype: any, className: string, module?: string) {
	Object.getOwnPropertyNames(prototype).forEach(methodName => {
		if (methodName === 'constructor') return

		const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName)

		if (descriptor && typeof descriptor.value === 'function' && descriptor.writable) {
			const originalMethod = descriptor.value
			const isAsync = originalMethod.constructor.name === 'AsyncFunction'

			Object.defineProperty(prototype, methodName, {
				value: isAsync
					? async function (this: any, ...args: any[]) {
							const ctx = context.active()
							const tracer = trace.getTracer(Config.name)
							const span = tracer.startSpan(`${className}.${methodName}`, {}, ctx)
							return await context.with(trace.setSpan(ctx, span), async () => {
								try {
									span.setAttribute('class.name', className)
									span.setAttribute('class.component', getComponentFromClassName(className))
									span.setAttribute('class.module', module || 'unknown')
									span.setAttribute('method.name', methodName)
									span.setAttribute('method.type', 'async')
									span.setAttribute('method.args.count', args.length)

									const startTime = Date.now()
									const result = await originalMethod.apply(this, args)

									span.setAttribute('method.duration.ms', Date.now() - startTime)
									addIOAttributes(span, args, result)

									return result
								} catch (error) {
									addErrorIOEvents(span, args)
									span.recordException(error as Error)
									span.setAttribute('method.error.type', (error as Error)?.constructor?.name || 'unknown')
									span.setAttribute('method.error.message', (error as Error)?.message || 'unknown error')
									span.setStatus({
										code: SpanStatusCode.ERROR,
										message: (error as Error)?.message || 'Internal Server Error',
									})
									throw error
								} finally {
									span.end()
								}
							})
						}
					: function (this: any, ...args: any[]) {
							const ctx = context.active()
							const tracer = trace.getTracer(Config.name)
							const span = tracer.startSpan(`${className}.${methodName}`, {}, ctx)
							return context.with(trace.setSpan(ctx, span), () => {
								try {
									span.setAttribute('class.name', className)
									span.setAttribute('class.component', getComponentFromClassName(className))
									span.setAttribute('class.module', module || 'unknown')
									span.setAttribute('method.name', methodName)
									span.setAttribute('method.type', 'sync')
									span.setAttribute('method.args.count', args.length)

									const startTime = Date.now()
									const result = originalMethod.apply(this, args)

									span.setAttribute('method.duration.ms', Date.now() - startTime)
									addIOAttributes(span, args, result)

									return result
								} catch (error) {
									addErrorIOEvents(span, args)
									span.recordException(error as Error)
									span.setAttribute('method.error.type', (error as Error)?.constructor?.name || 'unknown')
									span.setAttribute('method.error.message', (error as Error)?.message || 'unknown error')
									throw error
								} finally {
									span.end()
								}
							})
						},
				writable: true,
				configurable: true,
			})
		}
	})
}

export function traceClass(classes: any[]) {
	classes.forEach(clazz => {
		traceClassMethods(clazz.prototype, clazz.name)
	})
}

// Intercept container.resolve to apply tracing to all resolved classes
export function autoTrace(container: DependencyContainer, context?: string) {
	const originalResolve = container.resolve

	container.resolve = function <T>(this: typeof container, token: any): T {
		const service = originalResolve.call(this, token)

		if (service && typeof service === 'object') {
			const classConstructor = service.constructor
			const className = classConstructor.name

			if (!tracedClasses.has(className)) {
				traceClassMethods(classConstructor.prototype, className, context)
				tracedClasses.add(className)
			}
		}

		return service as T
	} as typeof container.resolve
}

function getComponentFromClassName(className: string): string {
	const components = ['router', 'middleware', 'controller', 'service', 'repository', 'handler', 'factory', 'event', 'mediator']
	return components.filter(component => className.toLowerCase().includes(component.toLowerCase())).at(-1) || 'unknown'
}
