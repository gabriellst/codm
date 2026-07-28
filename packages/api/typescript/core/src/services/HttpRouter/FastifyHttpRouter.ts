import { trace, context, Span } from '@opentelemetry/api'
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Readable } from 'node:stream'
import { Controller } from '../../types/Controller'
import { type HttpMethod, type HttpControllerRequest, type HttpCookie, HttpStatusCode, HttpControllerError } from '../../types/Http'
import { Config } from '../../utils/Config'
import { HttpRouter } from '.'
import { injectable } from 'tsyringe-neo'

@injectable()
export class FastifyHttpRouter implements HttpRouter {
	private app: FastifyInstance
	private listening = false

	constructor() {
		this.app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 })

		// Buffer all bodies as Buffer so we can both parse them ourselves
		// and feed the raw bytes to a constructed Web Request (used by
		// Better Auth's `auth.handler(request)` and the channel proxy).
		this.app.removeAllContentTypeParsers()
		this.app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

		this.app.options('/*', async (req, reply) => this.handleCorsPreflight(req, reply))
	}

	async on(path: string, method: HttpMethod | HttpMethod[], controller: Controller): Promise<void> {
		const methods = Array.isArray(method) ? method : [method]

		for (const m of methods) {
			this.app.route({
				method: m.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
				url: path,
				handler: async (req, reply) => {
					const tracer = trace.getTracer(Config.name)
					const span = tracer.startSpan(`${req.method} ${path}`, { root: true })

					this.addHttpAttributes(span, req)

					return context.with(trace.setSpan(context.active(), span), async () => {
						try {
							await this.handleControllerRequest(req, reply, controller, span)
						} catch (error) {
							await this.handleError(error, req, reply, span)
						} finally {
							span.end()
						}
					})
				},
			})
		}
	}

	async listen(port: number): Promise<void> {
		await this.app.listen({ port, host: '0.0.0.0' })
		this.listening = true
	}

	async stop(): Promise<void> {
		if (this.listening) {
			await this.app.close()
			this.listening = false
			console.log('✅ HTTP server stopped')
		}
	}

	isRunning(): boolean {
		return this.listening
	}

	private async handleControllerRequest(req: FastifyRequest, reply: FastifyReply, controller: Controller, span: Span): Promise<void> {
		const controllerRequest = await this.buildControllerRequest(req, reply)
		const response = await controller.executeController(controllerRequest)

		span.setAttribute('http.status_code', response.status)
		span.setAttribute('http.timestamp.end', Date.now())

		const corsHeaders = this.getCorsHeaders(req)
		await this.sendWebResponse(reply, response, corsHeaders)
	}

	private async buildControllerRequest(req: FastifyRequest, reply: FastifyReply): Promise<HttpControllerRequest<unknown>> {
		const bodyBuffer = (req.body as Buffer | undefined) ?? Buffer.alloc(0)
		const jsonBody =
			bodyBuffer.length > 0 && (req.headers['content-type'] ?? '').includes('json')
				? (JSON.parse(bodyBuffer.toString('utf8')) as Record<string, unknown>)
				: undefined

		// Preserve repeated query params as arrays (e.g. ?id=a&id=b -> ['a','b']).
		// Array-typed filters rely on this; the `z.stringToArray(element)` helper
		// normalizes single string | string[] | comma-separated into a typed array.
		const query: Record<string, string | string[] | undefined> = {}
		const fastifyQuery = req.query as Record<string, string | string[]>
		for (const [key, value] of Object.entries(fastifyQuery)) {
			query[key] = value
		}

		const params = (req.params as Record<string, string>) ?? {}

		const cookieHeader = req.headers.cookie
		const parsedCookies: Record<string, HttpCookie> = {}
		if (cookieHeader) {
			cookieHeader.split(';').forEach(cookie => {
				const [key, value] = cookie.trim().split('=')
				if (key && value) {
					parsedCookies[key] = { value, HttpOnly: true, Secure: true, SameSite: 'lax' }
				}
			})
		}

		const headers: Record<string, string> = {}
		for (const [k, v] of Object.entries(req.headers)) {
			if (Array.isArray(v)) headers[k] = v.join(', ')
			else if (v != null) headers[k] = String(v)
		}

		return {
			url: this.fullUrl(req),
			body: jsonBody as Record<string, unknown>,
			headers,
			params,
			query,
			cookie: parsedCookies,
			ctx: {},
			raw: this.buildWebRequest(req, reply, bodyBuffer),
		}
	}

	private buildWebRequest(req: FastifyRequest, reply: FastifyReply, body: Buffer): Request {
		const url = this.fullUrl(req)

		const webHeaders = new Headers()
		for (const [k, v] of Object.entries(req.headers)) {
			// biome-ignore lint/suspicious/useIterableCallbackReturn: <explanation>
			if (Array.isArray(v)) v.forEach(vv => webHeaders.append(k, vv))
			else if (v != null) webHeaders.set(k, String(v))
		}

		// Hook the client disconnect to a Web AbortSignal so that consumers
		// using `request.raw.signal` (SSE streams, Better Auth) detect it.
		//
		// TWO listeners, because neither event alone covers both shapes of disconnect.
		//
		// (1) The RESPONSE's `close`. `req.raw`'s own `close` is unusable as the primary: it fires as
		//     soon as the request stream is fully read — which for any body-carrying request is BEFORE
		//     the controller runs — so a consumer forwarding this signal to an upstream fetch (the
		//     service proxy) would see every POST born aborted. `writableFinished` discriminates a
		//     genuine early close from a completed response.
		//
		// (2) The REQUEST's `aborted`. MEASURED (Fase 7, instrumented daemon under a real Chromium):
		//     when the browser aborts an in-flight SSE fetch, `reply.raw` emits NEITHER `finish` NOR
		//     `close` — the response never completes and Node never tears it down — while `req.raw`
		//     emits `aborted`, then `close`, and the socket closes. With (1) alone the signal therefore
		//     never fired for exactly the case it was written for, and every SSE controller leaked
		//     whatever its `onStart` had claimed: the console's terminal panel took one observer slot
		//     per issue and then answered 409 `issue already streaming` on every reconnect for the life
		//     of the process. `aborted` is emitted ONLY on a premature client disconnect — never on a
		//     completed request — so it is the discriminator (1) is missing, with none of the
		//     false-positive risk that made `req.raw`'s `close` unusable.
		//
		// `AbortController.abort()` is idempotent, so a disconnect that trips both is harmless.
		const ac = new AbortController()
		reply.raw.once('close', () => {
			if (!reply.raw.writableFinished) ac.abort()
		})
		req.raw.once('aborted', () => ac.abort())

		const method = req.method.toUpperCase()
		const hasBody = !['GET', 'HEAD'].includes(method) && body.length > 0

		return new Request(url, {
			method,
			headers: webHeaders,
			// Node Buffer is a valid request body at runtime. The cast is
			// lib-agnostic: `BodyInit` only exists once DOM types are pulled in
			// transitively (via the SDK http module on the api-typescript build);
			// core compiles without DOM, so we can't name BodyInit here.
			body: hasBody ? (body as unknown as undefined) : undefined,
			signal: ac.signal,
		})
	}

	private fullUrl(req: FastifyRequest): string {
		const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? (req.protocol || 'http')
		const host = req.headers.host ?? 'localhost'
		return `${proto}://${host}${req.url}`
	}

	private addHttpAttributes(span: Span, req: FastifyRequest): void {
		const url = new URL(this.fullUrl(req))

		span.setAttribute('http.method', req.method.toUpperCase())
		span.setAttribute('http.route', url.pathname)
		span.setAttribute('http.url', url.toString())
		span.setAttribute('http.scheme', url.protocol.replace(':', ''))
		span.setAttribute('http.user_agent', String(req.headers['user-agent'] ?? 'unknown'))
		span.setAttribute('http.host', String(req.headers.host ?? 'unknown'))
		span.setAttribute('http.content_length', String(req.headers['content-length'] ?? '0'))

		if (url.search) {
			span.setAttribute('http.query_string', url.search.substring(1))
		}

		const forwardedFor = req.headers['x-forwarded-for']
		if (forwardedFor) {
			span.setAttribute('http.x_forwarded_for', String(forwardedFor))
		}

		for (const [key, value] of Object.entries((req.params as Record<string, string>) ?? {})) {
			if (value) span.setAttribute(`http.params.${key}`, String(value))
		}
	}

	private async sendWebResponse(reply: FastifyReply, response: Response, corsHeaders: Record<string, string> | null): Promise<void> {
		reply.status(response.status)

		response.headers.forEach((value, key) => {
			reply.header(key, value)
		})

		if (corsHeaders) {
			for (const [key, value] of Object.entries(corsHeaders)) {
				reply.header(key, value)
			}
		}

		if (!response.body) {
			await reply.send()
			return
		}

		const nodeStream = Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0])
		await reply.send(nodeStream)
	}

	private async handleError(error: unknown, req: FastifyRequest, reply: FastifyReply, span: Span): Promise<void> {
		const corsHeaders = this.getCorsHeaders(req)

		if (error instanceof HttpControllerError) {
			const { status, message, name } = error
			const statusCode = status ?? HttpStatusCode.INTERNAL_SERVER_ERROR

			span.setAttribute('http.status_code', Number(statusCode))
			span.setAttribute('http.error', true)
			span.setAttribute('http.error.name', name)
			span.setAttribute('http.error.message', message)
			span.setAttribute('http.error.type', error.constructor.name)
			span.recordException(error)

			reply.status(Number(statusCode)).header('Content-Type', 'application/json')
			if (corsHeaders) {
				for (const [k, v] of Object.entries(corsHeaders)) reply.header(k, v)
			}
			await reply.send({ code: name, ...(message ? { message } : undefined) })
			return
		}

		span.setAttribute('http.status_code', HttpStatusCode.INTERNAL_SERVER_ERROR)
		span.setAttribute('http.error', true)
		span.setAttribute('http.error.message', 'Unknown error')
		span.setAttribute('http.error.type', 'UnknownError')
		span.recordException(error instanceof Error ? error : new Error(String(error)))

		reply.status(HttpStatusCode.INTERNAL_SERVER_ERROR).header('Content-Type', 'application/json')
		if (corsHeaders) {
			for (const [k, v] of Object.entries(corsHeaders)) reply.header(k, v)
		}
		await reply.send({ code: 'INTERNAL_SERVER_ERROR' })
	}

	private async handleCorsPreflight(req: FastifyRequest, reply: FastifyReply): Promise<void> {
		const corsHeaders = this.getCorsHeaders(req)

		if (!corsHeaders) {
			await reply.status(403).send('CORS policy violation')
			return
		}

		reply.status(204)
		for (const [key, value] of Object.entries(corsHeaders)) {
			reply.header(key, value)
		}
		reply.header('Access-Control-Max-Age', '86400')
		await reply.send()
	}

	private getCorsHeaders(req: FastifyRequest): Record<string, string> | null {
		const origin = req.headers.origin as string | undefined
		const allowedOrigins = Config.env.CORS_ALLOWED_ORIGINS

		const isAllowed = allowedOrigins.includes('*') || (!!origin && allowedOrigins.includes(origin))
		if (!isAllowed) return null

		const allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With', 'x-account-id']

		return {
			'Access-Control-Allow-Origin': origin || '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
			'Access-Control-Allow-Headers': allowedHeaders.join(', '),
			'Access-Control-Allow-Credentials': 'true',
		}
	}
}
