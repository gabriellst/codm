/**
 * Framework error codes. Generic only — context-specific codes (auth, billing,
 * video, …) live in their own context's `errors/index.ts` and are registered
 * via `registerErrorCodes()` at module load time.
 *
 * Core never imports from contexts. Adding a new domain code = touch the
 * context, not this file.
 */

export type BaseDomainErrors = 'INVALID_ID' | 'INVALID_ID_VALUES_LENGTH' | 'INVALID_RANGE' | 'INVALID_ENTITY' | 'INVALID_REQUEST'

export type BaseApplicationErrors = 'NOT_FOUND'

export type BaseInterfaceErrors =
	| 'UNAUTHORIZED'
	| 'FORBIDDEN'
	| 'VALIDATION_ERROR'
	| 'INVALID_CONTROLLER_EXAMPLES'
	| 'CANNOT_CONVERT_INPUT'
	| 'RATE_LIMITED'

export type BaseInfrastructureErrors =
	| 'MISSING_ENVIRONMENT_VARIABLE'
	| 'ENTITY_NOT_FOUND_WHILE_SAVING'
	| 'NOT_IMPLEMENTED'
	| 'COMMAND_QUEUE_NOT_FOUND'
	| 'COMMAND_HANDLER_NOT_FOUND'
	| 'INVALID_OUTBOX_PAYLOAD'
	| 'HANDLER_NOT_BOUND'
	| 'MISSING_LOG_CONTENT'
	| 'OPTIMISTIC_LOCK_CONFLICT'
	| 'CREDENTIAL_DECRYPT_FAILED'
	| 'DATA_DIR_LOCKED'

export type Errors = BaseApplicationErrors | BaseDomainErrors | BaseInfrastructureErrors | BaseInterfaceErrors

export type BaseErrors = Errors
