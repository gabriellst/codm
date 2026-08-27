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
 * OS PROTÓTIPOS QUE `autoTrace` NÃO PODE TOCAR, e a razão de este arquivo ter uma denylist.
 *
 * `autoTrace` deduz a classe de um serviço resolvido por `service.constructor`. Quando o token
 * resolve para um OBJETO LITERAL (um bag de config, o retorno de um `useFactory` que devolve `{...}`),
 * esse constructor é o `Object` — e a linha seguinte então instrumentava `Object.prototype`. A partir
 * daí TODO `hasOwnProperty` do processo — zod, drizzle, ky, react-jsx-runtime, bullmq, os internos do
 * node — passava por `startSpan` + `context.with` + seis `setAttribute`. Medido no perfil cloud:
 * 2957 de 3000 chamadas embrulhadas eram `Object.hasOwnProperty`, o daemon prendia um core em 100%,
 * não respondia a `/health` e ignorava SIGTERM (só `kill -9`).
 *
 * O sintoma era MUDO em dois níveis: nada no log, e só com o SDK GRAVANDO — com spans noop o mesmo
 * wrapper é barato o bastante para passar despercebido, que é como isto sobreviveu ao dev local.
 *
 * A denylist é por PROTÓTIPO e não por nome: `className === 'Object'` cairia junto com qualquer
 * classe de aplicação que por acaso se chamasse `Object`, e não pegaria `Array`/`Map`/`Promise`.
 */
const INTRINSIC_PROTOTYPES: ReadonlySet<unknown> = new Set<unknown>([
	Object.prototype,
	Array.prototype,
	Function.prototype,
	Promise.prototype,
	Map.prototype,
	Set.prototype,
	WeakMap.prototype,
	WeakSet.prototype,
	Date.prototype,
	RegExp.prototype,
	Error.prototype,
])

/**
 * IS THERE ANYWHERE FOR A SPAN TO GO — the single derivation every telemetry site reads
 * (`startTelemetry`, `traceClass`, `autoTrace`). Telemetry is on when, and only when, a collector
 * URL is configured; no site consults anything else, so none of them can drift into a second
 * opinion about whether instrumentation is live.
 *
 * Read from `Config.env` (the typed env port) rather than `process.env`: same vocabulary as every
 * other env consumer (rail `tests/architecture/process-env.test.ts`), and it is what lets a test
 * override the field deterministically instead of shelling out a subprocess.
 */
export function isTelemetryEnabled(): boolean {
	return Config.env.OTEL_COLLECTOR_TRACE_URL !== ''
}

/**
 * Starts the OTEL SDK only when a collector URL is configured (`isTelemetryEnabled`).
 *
 * THE WRAPPERS BELOW ARE GATED BY THE SAME PREDICATE, and they have to be. Without the SDK the
 * OTel API hands back non-recording spans, so no trace is ever created or exported — but the
 * wrapper still pays, on EVERY call: `context.active()` plus an `ALS.run()` frame from
 * `context.with`, a freshly allocated `ProxyTracer` (with no delegate `getTracer` caches nothing —
 * `ProxyTracerProvider.getTracer`), a `NonRecordingSpan` allocation, two `Date.now()`s, and
 * `describeValue()` over every argument AND the return value — that work runs eagerly, as the
 * arguments to the `setAttribute` calls that are the no-ops. Measured 451 ns per instrumented call
 * against 2 ns unwrapped (300k calls, trivial method, no collector) — on every method of every
 * DI-resolved class. This file used to claim that path was "zero-cost ... zero memory overhead";
 * it is not, and the desktop build is exactly where it landed: the shell injects no `OTEL_*` env
 * into either sidecar (`src-tauri/src/sidecars/mod.rs`), so the packaged daemon paid the wrapper on
 * every repository/service/mediator call with no collector to ship a span to.
 *
 * Gating on CONFIG rather than on "did the SDK start" is what keeps boot order irrelevant:
 * `start()` wraps (`traceClass`, then `autoTrace` per context) BEFORE `main()` awaits this.
 */
export async function startTelemetry() {
	if (!isTelemetryEnabled()) {
		console.log('⏭️  OTEL_COLLECTOR_TRACE_URL not set — telemetry disabled (no spans, no wrappers)')
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

/**
 * Wrap the given classes' methods — a NO-OP when telemetry is off, so the prototypes are left
 * exactly as authored instead of paying `startTelemetry`'s measured 451 ns/call for spans that
 * nothing records. The gate lives HERE, not at the call sites (`composition/server.ts`), so a
 * future wrap site inherits it without remembering to ask.
 */
export function traceClass(classes: any[]) {
	if (!isTelemetryEnabled()) return

	classes.forEach(clazz => {
		traceClassMethods(clazz.prototype, clazz.name)
	})
}

/**
 * Intercept `container.resolve` to apply tracing to every resolved class — a NO-OP when telemetry
 * is off: `resolve` is left un-patched, so nothing gets wrapped and DI resolution keeps its own
 * cost. This is the site that made the overhead global (`BoundedContext.create` calls it for every
 * context), which is why the gate is inside rather than at that call.
 */
export function autoTrace(container: DependencyContainer, context?: string) {
	if (!isTelemetryEnabled()) return

	const originalResolve = container.resolve

	container.resolve = function <T>(this: typeof container, token: any): T {
		const service = originalResolve.call(this, token)

		if (service && typeof service === 'object') {
			const classConstructor = service.constructor
			const prototype = classConstructor?.prototype

			if (prototype && !INTRINSIC_PROTOTYPES.has(prototype)) {
				const className = classConstructor.name

				if (!tracedClasses.has(className)) {
					traceClassMethods(prototype, className, context)
					tracedClasses.add(className)
				}
			}
		}

		return service as T
	} as typeof container.resolve
}

function getComponentFromClassName(className: string): string {
	const components = ['router', 'middleware', 'controller', 'service', 'repository', 'handler', 'factory', 'event', 'mediator']
	return components.filter(component => className.toLowerCase().includes(component.toLowerCase())).at(-1) || 'unknown'
}
