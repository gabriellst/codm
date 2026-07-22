import { BaseValueObject } from './BaseValueObject'
import { BaseDomainErrors } from '../errors/codes'
import { z } from '../utils/schema'
import Z from 'zod'

/**
 * A JSON-safe snapshot of an HTTP `Request`.
 *
 * A live `Request` is stream-bodied and has no enumerable own properties, so it
 * cannot be persisted (an event payload is stored via `JSON.parse(JSON.stringify(...))`)
 * nor used as a deterministic id seed. `SerializedRequest` captures the full
 * reconstructable surface of a server-received request — method, url, headers,
 * and the raw body bytes (as a string) — so it can ride on a domain event and be
 * rehydrated downstream via `deserialize()`.
 *
 * Built once at the ingest boundary (where the live request still exists) via
 * `SerializedRequest.fromRequest(req)`; rehydrated into a fresh `Request` by any
 * handler that reads it back off the outbox.
 */
export const SerializedRequestSchema = z.object({
	method: z.string().min(1, { error: 'INVALID_REQUEST' as BaseDomainErrors }),
	url: z.url({ error: 'INVALID_REQUEST' as BaseDomainErrors }),
	headers: z.record(z.string(), z.string()),
	body: z.string(),
})

export class SerializedRequest extends BaseValueObject<typeof SerializedRequestSchema> {
	static override schema = SerializedRequestSchema

	/**
	 * Snapshot a live request. Clones before reading so the caller's original
	 * request body stream stays unconsumed. `Headers` iterates in lexicographic
	 * order per the Fetch spec, so the captured header map is deterministic —
	 * the resulting VO serialises identically for identical requests.
	 */
	static async fromRequest(request: Request): Promise<SerializedRequest> {
		const headers: Record<string, string> = {}
		request.headers.forEach((value, key) => {
			headers[key] = value
		})

		return new SerializedRequest({
			method: request.method,
			url: request.url,
			headers,
			body: await request.clone().text(),
		})
	}

	/**
	 * Reconstruct a `Request` carrying all captured data. GET/HEAD and empty
	 * bodies omit the body init — `new Request` rejects a body on those methods.
	 */
	deserialize(): Request {
		const method = this.method.toUpperCase()
		const hasBody = !['GET', 'HEAD'].includes(method) && this.body.length > 0

		const init = {
			method,
			headers: this.headers,
			body: hasBody ? this.body : undefined,
		}

		return new Request(this.url, init)
	}

	equals(other: SerializedRequest): boolean {
		return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON())
	}

	override toString(): string {
		return `${this.method} ${this.url}`
	}
}

// Declaration merging — instance properties come from the schema output.
export interface SerializedRequest extends Z.infer<typeof SerializedRequestSchema> {}

export type SerializedRequestProps = Z.input<typeof SerializedRequestSchema>
