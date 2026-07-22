/**
 * Runtime registry mapping error codes → HTTP status. Core seeds it with the
 * framework's own codes; bounded contexts register their codes via
 * `registerErrorCodes()` at module-load time (mirrors Go's
 * `RegisterErrorCodes()` pattern in `core/errors/mapper.go`).
 *
 * The map is mutable and global. Adding a new context-specific code = touch
 * the context's `errors/index.ts`, NOT this file. Core stays untouched.
 */

import type { Errors as BaseErrors } from '../errors/codes'
import { HttpStatusCode } from '../types/Http'

export type AllErrors = BaseErrors | string

const registry: Record<string, HttpStatusCode> = {
	// Framework base codes only — context codes register themselves.
	INVALID_ID: HttpStatusCode.BAD_REQUEST,
	INVALID_ID_VALUES_LENGTH: HttpStatusCode.BAD_REQUEST,
	INVALID_RANGE: HttpStatusCode.BAD_REQUEST,
	INVALID_ENTITY: HttpStatusCode.BAD_REQUEST,
	INVALID_REQUEST: HttpStatusCode.BAD_REQUEST,

	NOT_FOUND: HttpStatusCode.NOT_FOUND,

	UNAUTHORIZED: HttpStatusCode.UNAUTHORIZED,
	FORBIDDEN: HttpStatusCode.FORBIDDEN,
	VALIDATION_ERROR: HttpStatusCode.BAD_REQUEST,
	RATE_LIMITED: HttpStatusCode.TOO_MANY_REQUESTS,
	INVALID_CONTROLLER_EXAMPLES: HttpStatusCode.INTERNAL_SERVER_ERROR,
	CANNOT_CONVERT_INPUT: HttpStatusCode.BAD_REQUEST,

	MISSING_ENVIRONMENT_VARIABLE: HttpStatusCode.INTERNAL_SERVER_ERROR,
	ENTITY_NOT_FOUND_WHILE_SAVING: HttpStatusCode.INTERNAL_SERVER_ERROR,
	NOT_IMPLEMENTED: HttpStatusCode.INTERNAL_SERVER_ERROR,
	COMMAND_QUEUE_NOT_FOUND: HttpStatusCode.INTERNAL_SERVER_ERROR,
	COMMAND_HANDLER_NOT_FOUND: HttpStatusCode.INTERNAL_SERVER_ERROR,
	INVALID_OUTBOX_PAYLOAD: HttpStatusCode.INTERNAL_SERVER_ERROR,
	HANDLER_NOT_BOUND: HttpStatusCode.INTERNAL_SERVER_ERROR,
	MISSING_LOG_CONTENT: HttpStatusCode.INTERNAL_SERVER_ERROR,
	OPTIMISTIC_LOCK_CONFLICT: HttpStatusCode.CONFLICT,
	CREDENTIAL_DECRYPT_FAILED: HttpStatusCode.INTERNAL_SERVER_ERROR,
}

/**
 * Extend the registry with per-context error codes. Call at module load (in
 * each bounded context's `errors/index.ts`) so the codes are registered
 * before any controller boots.
 *
 * @example
 *   // packages/api/typescript/src/auth/errors/index.ts
 *   registerErrorCodes({
 *     WEAK_PASSWORD: HttpStatusCode.BAD_REQUEST,
 *     USER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
 *   })
 */
export function registerErrorCodes(codes: Record<string, HttpStatusCode>): void {
	Object.assign(registry, codes)
}

/** Snapshot view of the registry, used by Controller + OpenAPI emitter. */
export const GlobalErrorMapper: Readonly<Record<string, HttpStatusCode>> = registry
