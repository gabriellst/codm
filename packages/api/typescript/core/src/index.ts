// /core-typescript — context-agnostic primitives for api-ts.
// Recipe: dev:packages/api/src/shared/index.ts (named exports, no namespace re-export).

// Types — base classes + interfaces
export * from './types/BaseEvent'
export * from './types/BaseDomainEvent'
export * from './types/BaseIntegrationEvent'
export * from './types/BaseError'
export * from './types/BoundedContext'
export * from './types/Controller'
export * from './types/EventHandler'
export * from './types/Handler'
export * from './types/Projector'
export * from './types/Http'
export * from './types/MainRouter'
export * from './types/Middleware'
export * from './types/Registry'
export * from './types/Router'
export * from './types/AgentIdentity'

// Entities
export * from './entities'

// Value objects (generic only — no domain VOs)
export * from './objects'

// Errors — BaseError + base catalog
export * from './errors'

// Services
export * from './services/Mediator'
export * from './services/OutboxDispatcher'
export * from './services/UnitOfWork'
export * from './services/CommandQueue'
export * from './services/AgentIdentityService'
export * from './services/IdempotencyGuard'
export * from './services/Logging'
export * from './services/HttpRouter'
export * from './services/MailSender'
export * from './services/CredentialVault'
export * from './services/RateLimitStore'
export * from './middlewares'

// Repositories
export * from './repositories'

// DB infrastructure (no schema definitions — those live in @codedm/contracts)
export * from './db'

// Utils
export * from './utils/Concurrency'
export * from './utils/Config'
export * from './utils/ForwardRequest'
export * from './utils/GlobalErrorMapper'
export * from './utils/McpExposure'
export * from './utils/OpenAPI'
export * from './utils/Resilience'
export * from './utils/Tracing'
export * from './utils/TryCatch'
export * from './utils/sse'
export * from './utils/schema'
