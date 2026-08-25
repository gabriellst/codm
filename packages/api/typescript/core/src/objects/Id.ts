import { BasePrimitiveValueObject } from './BasePrimitiveValueObject'
import type { BaseDomainErrors } from '../errors/codes'
import { createHash } from 'node:crypto'
import { uuidv7 } from 'uuidv7'
import z from 'zod'

export const IdSchema = z.string().refine(v => v.length > 0, { error: 'INVALID_ID' as BaseDomainErrors })

// Locked UUIDv5 namespace — byte-for-byte identical to `packages/api/go/core/objects/id.go`.
// Changing this orphans every previously-ingested deterministic id. Not exported.
const ID_NAMESPACE = 'f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e' as const

export class Id extends BasePrimitiveValueObject<typeof IdSchema> {
	static override schema = IdSchema

	constructor(value?: string) {
		super(value ?? Id.value())
	}

	/**
	 * Fresh primitive id string (UUIDv7). Use when an external library
	 * needs a raw id generator and we don't want to leak uuidv7 imports
	 * across the codebase.
	 */
	static value(): string {
		return uuidv7()
	}

	/**
	 * Deterministic UUIDv5 from a tuple of strings, using the locked
	 * `ID_NAMESPACE`. Same algorithm + namespace as Go's
	 * `objects.IDFromSeed(...)` — identical inputs produce identical UUIDs
	 * across languages.
	 *
	 * Implementation: RFC 4122 UUIDv5 = SHA-1(namespace_bytes || name_bytes)
	 * with version + variant bits set per spec. Inlined to avoid a `uuid`
	 * package dependency.
	 */
	static fromSeed(...parts: string[]): Id {
		if (parts.length === 0) throw new Error('Id.fromSeed requires at least one part')
		const name = parts.join(':')

		const namespaceBytes = Buffer.from(ID_NAMESPACE.replace(/-/g, ''), 'hex')
		const hash = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest()

		// Set UUIDv5 version (0x50 in byte 6) and RFC 4122 variant (0x80 in byte 8).
		hash[6] = (hash[6]! & 0x0f) | 0x50
		hash[8] = (hash[8]! & 0x3f) | 0x80

		const hex = hash.subarray(0, 16).toString('hex')
		const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` + `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
		return new Id(uuid)
	}

	equals(other: Id): boolean {
		return this.value === other.value
	}

	override toString(): string {
		return this.value
	}
}
