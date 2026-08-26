/// <reference lib="dom" />
/**
 * ky-based HTTP client. Ported from dev:packages/client/src/http/index.ts with
 * one addition: requests carry a `service` tag so the resolver can pick the
 * right base URL out of the per-service registry (we have N backends; dev
 * had 1).
 *
 * Edge cases handled:
 *  - retries with exponential backoff + jitter (configurable per-call)
 *  - timeout (default 30s, overrideable; `false` disables)
 *  - structured error mapping (extracts `{ code, message }` from JSON bodies)
 *  - Date → ISO serialization in both bodies and params
 *  - response types: json | text | blob | arraybuffer | stream | formData | document
 *  - 204 / `content-length: 0` returns `undefined` (no parse attempt)
 */

import ky, { type Options as KyOptions, HTTPError } from 'ky'
import { resolveURL } from './config'

export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | 'formData'

export type RetryConfig = {
	limit?: number
	methods?: Array<'get' | 'put' | 'patch' | 'post' | 'delete' | 'head' | 'options' | 'trace'>
	statusCodes?: number[]
	backoffLimit?: number
	retryOnTimeout?: boolean
	delay?: (attemptCount: number) => number
	jitter?: boolean | ((delay: number) => number)
}

export type RequestConfig<TData = unknown> = {
	url: string
	method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE'
	params?: object
	data?: TData | FormData | Blob | File | ArrayBuffer | ArrayBufferView | ReadableStream
	responseType?: ResponseType
	signal?: AbortSignal
	headers?: HeadersInit
	retry?: number | RetryConfig | false
	timeout?: number | false
	/** Per-call override of the configured base URL for this service. */
	baseURL?: string
}

export type ResponseConfig<TData = unknown> = {
	data: TData
	status: number
	statusText: string
}

export type ResponseErrorConfig<TError = unknown> = {
	data: TError
	status: number
	statusText: string
}

const DEFAULT_RETRY = {
	limit: 2,
	methods: ['get', 'put', 'head', 'delete', 'options', 'trace'] as const,
	statusCodes: [408, 413, 429, 500, 502, 503, 504],
	backoffLimit: 10000,
	retryOnTimeout: true,
	jitter: true,
} satisfies KyOptions['retry']

function isBodyInit(data: unknown): data is BodyInit {
	return (
		data != null &&
		(data instanceof Blob ||
			data instanceof FormData ||
			data instanceof URLSearchParams ||
			(typeof ReadableStream !== 'undefined' && data instanceof ReadableStream) ||
			data instanceof ArrayBuffer ||
			ArrayBuffer.isView(data) ||
			typeof data === 'string')
	)
}

function buildRetryOptions(retry: RequestConfig['retry']): KyOptions['retry'] {
	if (retry === false) return 0
	if (typeof retry === 'number') return retry
	if (!retry) return DEFAULT_RETRY
	return {
		limit: retry.limit ?? DEFAULT_RETRY.limit,
		methods: retry.methods ?? DEFAULT_RETRY.methods,
		statusCodes: retry.statusCodes ?? DEFAULT_RETRY.statusCodes,
		backoffLimit: retry.backoffLimit ?? DEFAULT_RETRY.backoffLimit,
		retryOnTimeout: retry.retryOnTimeout ?? DEFAULT_RETRY.retryOnTimeout,
		jitter: retry.jitter ?? DEFAULT_RETRY.jitter,
		...(retry.delay && { delay: retry.delay }),
	}
}

function serializeValue(value: unknown): unknown {
	if (value === null || value === undefined) return value
	if (value instanceof Date) return value.toISOString()
	if (Array.isArray(value)) return value.map(serializeValue)
	if (typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [key, val] of Object.entries(value)) result[key] = serializeValue(val)
		return result
	}
	return value
}

function buildBody(data: unknown): BodyInit | Record<string, unknown> | undefined {
	if (data == null) return undefined
	if (!isBodyInit(data) && typeof data === 'object') return serializeValue(data) as Record<string, unknown>
	return data as BodyInit
}

function serializeParams(params: object): Record<string, string> {
	const result: Record<string, string> = {}
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null) continue
		if (value instanceof Date) result[key] = value.toISOString()
		else if (typeof value === 'object') result[key] = JSON.stringify(serializeValue(value))
		else result[key] = String(value)
	}
	return result
}

const responseHandlers: Record<ResponseType, (r: Response) => unknown> = {
	arraybuffer: r => r.arrayBuffer(),
	blob: r => r.blob(),
	stream: r => r.body,
	text: r => r.text(),
	formData: r => r.formData(),
	document: async r => {
		const txt = await r.text()
		if (typeof DOMParser !== 'undefined') {
			const ct = r.headers.get('content-type') || ''
			const type = ct.includes('xml') ? 'text/xml' : 'text/html'
			return new DOMParser().parseFromString(txt, type) as unknown
		}
		return txt
	},
	json: r => r.json(),
}

async function parseResponse<TData>(response: Response, responseType: ResponseType): Promise<TData> {
	if (response.status === 204 || response.headers.get('content-length') === '0') {
		return undefined as TData
	}
	const handler = responseHandlers[responseType] ?? responseHandlers.json
	return (await handler(response)) as TData
}

const kyInstance = ky.create({
	credentials: 'include',
	timeout: 30000,
	retry: DEFAULT_RETRY,
	hooks: {
		beforeError: [
			async (error: HTTPError) => {
				try {
					const body = (await error.response.clone().json()) as {
						code?: string
						message?: string
						error?: string
					}
					if (body.message || body.error) error.message = body.message || body.error || error.message
				} catch {
					// not JSON; keep original
				}
				return error
			},
		],
	},
})

/**
 * Create a service-bound client function. The returned function is what each
 * Kubb-generated operation will import as `client`. It already knows which
 * service it represents, so it can resolve the base URL from the registry.
 */
export function createClient(service: string) {
	return async function client<TData, _TError = unknown, TVariables = unknown>(
		config: RequestConfig<TVariables>,
	): Promise<ResponseConfig<TData>> {
		const { url, params, method, data, responseType = 'json', signal, headers, retry, timeout, baseURL } = config

		const resolvedUrl = resolveURL(service, url, baseURL)
		const searchParams = params ? new URLSearchParams(serializeParams(params)) : undefined
		const body = buildBody(data)
		const isJsonBody = body != null && !isBodyInit(data)

		const kyOptions: KyOptions = {
			method: method.toLowerCase() as KyOptions['method'],
			searchParams,
			signal,
			headers,
			retry: buildRetryOptions(retry),
			...(timeout !== undefined && { timeout }),
			...(isJsonBody ? { json: body } : { body: body as BodyInit | undefined }),
		}

		try {
			const response = await kyInstance(resolvedUrl, kyOptions)
			const responseData = await parseResponse<TData>(response, responseType)
			return { data: responseData, status: response.status, statusText: response.statusText }
		} catch (err) {
			if (err instanceof HTTPError) {
				const errorData = await parseResponse<{ code?: string; message?: string; error?: string }>(
					err.response.clone(),
					'json',
				).catch(() => null)

				const error = new Error(errorData?.message || errorData?.error || err.message || 'UNKNOWN_ERROR') as Error & {
					code?: string
					status?: number
				}
				error.code = errorData?.code || 'UNKNOWN_ERROR'
				error.status = err.response.status
				throw error
			}
			if (err instanceof Error) throw err
			throw new Error('UNKNOWN_ERROR')
		}
	}
}

export type Client = ReturnType<typeof createClient>
