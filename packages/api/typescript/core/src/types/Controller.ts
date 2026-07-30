import { z, type ZodType } from 'zod'
import { setTimeout as sleep } from 'node:timers/promises'
import { container } from 'tsyringe-neo'

type BodyInit = NonNullable<ConstructorParameters<typeof Response>[0]>
import { Handler } from './Handler'
import {
	HttpControllerRequest,
	HttpControllerResponse,
	HttpMethod,
	HttpMiddlewareResponse,
	MimeTypes,
	HttpControllerError,
	HttpCookie,
	HttpStatusCode,
} from './Http'
import { Middleware, MiddlewareClass } from './Middleware'
import { BaseError } from './BaseError'
import { BaseInterfaceErrors } from '../errors/codes'
import { type AllErrors, GlobalErrorMapper } from '../utils/GlobalErrorMapper'
import { tryCatchAsync } from '../utils/TryCatch'

// Helper to extract examples from Zod schema meta
const getSchemaExamples = (schema: ZodType): unknown[] => {
	const examples = schema?.meta()?.examples as unknown[]
	return examples ?? []
}

// CTRL-07 — the HTTP layer only populates body/query/params/ctx on the envelope, so a
// flat root key silently resolves to undefined at runtime. The self-referential
// constraint below turns that latent bug into a tsc error at the controller class
// declaration.
type EnvelopeKeys = 'body' | 'query' | 'params' | 'ctx'

// Wire-input of the schema. Reads `_zod.input` structurally (instead of z.input's
// `$ZodType` bound) so the F-bounded `InputSchema extends ... & ValidEnvelope<InputSchema>`
// constraint stays non-circular. Zod tracks the composed input type through
// .refine()/.pipe()/.transform()/.example() wrappers, so refined/piped envelopes whose
// underlying object shape is valid still pass. Non-object inputs (z.unknown(), the bare
// ZodType default) resolve to `unknown`, whose keyof is never — always valid.
type EnvelopeInput<S> = S extends { _zod: { input: infer I } } ? I : unknown

// Only literal string keys count as flat-key violations: z.object({}) infers its input as
// Record<string, never> (keyof = string), so index signatures must be ignored.
type LiteralStringKeys<T> = keyof T extends infer K ? (K extends string ? (string extends K ? never : K) : never) : never

// Resolves to `unknown` (constraint satisfied) for a valid envelope; for an invalid one,
// resolves to an object type the schema can never have — tsc reports the missing property,
// whose name spells out the rule and whose type lists the offending keys.
export type ValidEnvelope<S> =
	Exclude<LiteralStringKeys<EnvelopeInput<S>>, EnvelopeKeys> extends never
		? unknown
		: {
				'InputSchema root keys must be body | query | params | ctx — flat keys are never populated at runtime': Exclude<
					LiteralStringKeys<EnvelopeInput<S>>,
					EnvelopeKeys
				>
			}

export abstract class Controller<
	InputSchema extends ZodType & ValidEnvelope<InputSchema> = ZodType,
	OutputSchema extends ZodType = ZodType,
> extends Handler<InputSchema, OutputSchema> {
	// Required properties.
	abstract readonly path: `/${string}`
	abstract readonly method: HttpMethod | HttpMethod[]
	abstract readonly description: string

	// Optional properties.
	readonly contentType: MimeTypes = MimeTypes['.json']
	readonly mockController: boolean = false
	middlewares: (Middleware | MiddlewareClass)[] = []
	skipMiddlewares: (Middleware | MiddlewareClass)[] = []

	/**
	 * WHICH declared tool surfaces expose this operation as a model-callable MCP tool.
	 *
	 * `static`, and the difference from `middlewares` right above is the whole reason: `middlewares` is
	 * a property of the RUNNING controller (each instance may be re-wired by the router), while "is
	 * this endpoint exposed as a tool" is a property of the CLASS — read by the OpenAPI emitter during
	 * the scan, and by a runtime scan over the `controllers/index.ts` barrels, neither of which wants
	 * to construct anything to ask the question.
	 *
	 * `readonly string[]` and not an enum: core does not know what this product's surfaces are called.
	 * The product tightens it (`static override mcpScopes = [McpScope.ISSUE_HANDLING]`), and the
	 * assignment typechecks because the enum's members are strings.
	 *
	 * ABSENT IS THE DEFAULT AND ABSENT MEANS NOT EXPOSED. Measured: with no filter,
	 * `@kubb/plugin-mcp` turns every operation in the spec into a tool. The security property comes
	 * ENTIRELY from this being opt-in, per class, in the file a reviewer is already reading.
	 */
	static readonly mcpScopes?: readonly string[]

	// Base Properties
	readonly errorMapper = GlobalErrorMapper
	readonly errors: AllErrors[] = []
	readonly baseErrors: AllErrors[] = ['VALIDATION_ERROR']

	// Override input type to wrap in HTTP request
	declare readonly input: HttpControllerRequest<z.output<(typeof this)['inputSchema']>>
	// Override output type to wrap in HTTP response (allows cookies)
	// @ts-expect-error - Intentionally overriding to wrap in HTTP response with cookie support
	declare readonly output: HttpControllerResponse<z.output<(typeof this)['outputSchema']>>

	name = this.constructor.name

	/**
	 * Optional hook for mock controllers to return a custom response (e.g. with cookies).
	 * Receives the validated request. If defined and mockController is true, its return value is used instead of the schema example.
	 */
	protected getMockResponse?(
		_request: z.output<InputSchema>,
	): { status: HttpStatusCode; data: z.output<OutputSchema>; cookie?: Record<string, HttpCookie> } | undefined

	override async execute(input: unknown): Promise<this['output']> {
		const validated = this.validatedRequest(input)
		// handle() returns `this['output'] | void` (Handler base
		// signature widened so void-output handlers can return bare);
		// controllers always return a real response so the cast is
		// type-safe in practice.
		return (await this.handle({ ...(input as Record<string, unknown>), ...validated })) as this['output']
	}

	async executeController(request: HttpControllerRequest<unknown>): Promise<Response> {
		const result = await tryCatchAsync(async () => {
			const middlewareResponse = await this.executeMiddlewares(request)
			if (middlewareResponse) return middlewareResponse
			if (this.mockController) {
				await sleep(600)
				const validated = this.validatedRequest(request)
				const customMock = this.getMockResponse?.(validated as z.output<InputSchema>)
				if (customMock) {
					return this.buildResponse({
						status: customMock.status,
						data: customMock.data,
						cookie: customMock.cookie,
					})
				}
				const examples = getSchemaExamples(this.outputSchema)
				const firstOutputExample = examples[0]
				if (!firstOutputExample) throw new BaseError<BaseInterfaceErrors>('INVALID_CONTROLLER_EXAMPLES')
				return this.buildResponse({
					status: HttpStatusCode.OK,
					data: firstOutputExample,
				})
			}
			const response = await this.execute(request)
			if (response instanceof Response) return response
			return this.buildResponse(response)
		})
		if (!result.success) {
			return this.handleError(result.error)
		}
		return result.data
	}

	/**
	 * Sanctioned escape hatch for controllers that return a raw Web `Response` — streaming
	 * (SSE) and passthrough (better-auth) endpoints. `executeController` detects `Response`
	 * instances and returns them untouched, so the output schema only describes the logical
	 * payload (what the SDK types), never the transport. This is the ONE place that cast
	 * lives; handle() implementations call `this.rawResponse(response)` instead of casting.
	 */
	protected rawResponse(response: Response): this['output'] {
		return response as unknown as this['output']
	}

	private async executeMiddlewares(request: HttpControllerRequest<unknown>): Promise<Response | undefined> {
		const blacklist = new Set(
			this.skipMiddlewares.map(skip => {
				if (typeof skip === 'function') return skip.name
				return skip.constructor.name
			}),
		)

		for (const middlewareOrClass of this.middlewares) {
			let middleware: Middleware
			if (typeof middlewareOrClass === 'function') {
				middleware = container.resolve(middlewareOrClass)
			} else {
				middleware = middlewareOrClass
			}

			if (blacklist.has(middleware.constructor.name)) {
				continue
			}

			const middlewareResponse = await middleware.execute(request)
			this.applyMiddlewareResponse(request, middlewareResponse)

			// If middleware returns a status, build and return the response early
			if (middlewareResponse.status) {
				return this.buildMiddlewareResponse(middlewareResponse)
			}
		}
	}

	private buildMiddlewareResponse(middlewareResponse: HttpMiddlewareResponse<unknown>): Response {
		const { status, headers, cookie } = middlewareResponse
		const response = new Response(null, { status })
		this.setResponseHeaders(response, headers)
		this.setResponseCookies(response, cookie)
		return response
	}

	private applyMiddlewareResponse(request: HttpControllerRequest<unknown>, middlewareResponse: HttpMiddlewareResponse<unknown>): void {
		const { cookie, headers } = middlewareResponse
		if (cookie) request.cookie = { ...request.cookie, ...cookie }
		if (headers) request.headers = { ...request.headers, ...this.filterUndefinedValues(headers) }
	}

	private filterUndefinedValues<T extends Record<string, unknown>>(obj: T): Partial<T> {
		return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>
	}

	private buildResponse(controllerResponse: HttpControllerResponse<z.output<ZodType>>): Response {
		const { status, data, headers, cookie } = controllerResponse
		const isVoid = data === undefined || data === null
		const body = isVoid ? null : this.serializeBody(data)
		const responseStatus = isVoid && status === HttpStatusCode.OK ? HttpStatusCode.NO_CONTENT : status
		const response = new Response(body, { status: responseStatus })
		if (!isVoid) this.setContentType(response)
		this.setResponseHeaders(response, headers)
		this.setResponseCookies(response, cookie)
		return response
	}

	private serializeBody(data: unknown): BodyInit {
		if (this.isBodyInit(data)) {
			return data as BodyInit
		}
		return JSON.stringify(data)
	}

	private isBodyInit(data: unknown): data is BodyInit {
		return (
			data !== undefined &&
			data !== null &&
			(data instanceof Blob ||
				data instanceof FormData ||
				data instanceof URLSearchParams ||
				data instanceof ReadableStream ||
				data instanceof ArrayBuffer ||
				typeof data === 'string' ||
				ArrayBuffer.isView(data))
		)
	}

	private setResponseHeaders(response: Response, headers?: Record<string, string | undefined>): void {
		if (!headers) return
		Object.entries(headers).forEach(([key, value]) => {
			if (value !== undefined) {
				response.headers.set(key, value)
			}
		})
	}

	private setResponseCookies(response: Response, cookies?: Record<string, HttpCookie>): void {
		if (!cookies) return
		Object.entries(cookies).forEach(([key, cookie]) => {
			if (cookie.value) {
				const cookieString = this.buildCookieString(key, cookie)
				response.headers.append('Set-Cookie', cookieString)
			}
		})
	}

	private buildCookieString(key: string, cookie: HttpCookie): string {
		const cookieString = `${key}=${cookie.value}`
		const attributes = this.buildCookieAttributes(cookie)
		return attributes ? `${cookieString}; ${attributes}` : cookieString
	}

	private buildCookieAttributes(cookie: HttpCookie): string {
		return Object.entries(cookie)
			.filter(([attr, value]) => attr !== 'value' && value !== undefined)
			.map(([attr, value]) => `${attr}=${value}`)
			.join('; ')
	}

	private setContentType(response: Response): void {
		if (this.contentType) {
			response.headers.set('Content-Type', this.contentType)
		}
	}

	private handleError(error: unknown): Response {
		if (error instanceof BaseError) {
			const { name, message } = error
			const status = this.errorMapper[name as AllErrors] ?? HttpStatusCode.INTERNAL_SERVER_ERROR
			throw new HttpControllerError(name, status, message)
		}
		throw error
	}
}
