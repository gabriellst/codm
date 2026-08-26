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
	// O schema do deployment de nuvem está ATRASADO em relação às migrações em disco. A família `pg`
	// não aplica no boot por decisão (ADR 0005) — ela CONFERE e RECUSA. Código próprio, e não um
	// erro genérico, porque a ação corretiva é exata e nomeável: rodar `bun migrate:deploy:cloud`.
	// Um erro sem nome vira uma stack trace que alguém interpreta às três da manhã.
	| 'MIGRATIONS_PENDING'
	// A NUVEM não respondeu — e isso NÃO é "você não está autenticado". A identidade do daemon local
	// vem de `GET /session` na nuvem (ADR 0001, Emenda 1); quando essa pergunta não chega ao
	// destino, o operador não tem um problema de credencial, tem um problema de alcance. Sem este
	// código a falha caía em `UNKNOWN_ERROR`/500 e a tela dizia "Erro desconhecido" — verdadeiro e
	// inútil, porque as duas ações corretivas (refazer login × subir/apontar a nuvem) são opostas.
	| 'CLOUD_UNREACHABLE'

export type Errors = BaseApplicationErrors | BaseDomainErrors | BaseInfrastructureErrors | BaseInterfaceErrors

export type BaseErrors = Errors
