// Go backend file body templates.
// Each function returns a raw Go source string for one generated artifact.
// Informed by:
//   .claude/skills/<skill>/go/SKILL.md  (canonical patterns + bad-practice rules)
//   packages/api/go/internal/transcoding/  (live reference implementation)

import { toPascalCase } from '../helpers'
import { renderArtifact } from '../../snippet/render'
import { goBackendBindings } from './bindings'

export const goTemplates = {
	// ─── entity ─────────────────────────────────────────────────────────────────
	// ENT-GO-01: IncrementVersion inside behavior methods, NOT in repo.save
	// ENT-GO-02: Reconstruct uses ReconstructBaseEntity, not NewBaseEntity
	// ENT-GO-03: Constructor validates inputs explicitly
	// ENT-GO-04: Creation event raised in constructor
	entity: (ctx: string, name: string) => renderArtifact('entity', 'go', goBackendBindings.entity(ctx, name)),

	// ─── value-object ────────────────────────────────────────────────────────────
	// VO-GO-01: all fields private
	// VO-GO-02: constructor returns (T, error) — never panics
	// VO-GO-03: no setters — immutable
	valueObject: (ctx: string, name: string) => renderArtifact('value-object', 'go', goBackendBindings.valueObject(ctx, name)),

	// ─── enum ────────────────────────────────────────────────────────────────────
	// ENUM-GO-01: wire values are SCREAMING_SNAKE_CASE
	// ENUM-GO-02: one enum per file
	// ENUM-GO-03: doc-comment "Values: A B C" on type
	// ENUM-GO-04: struct fields use the typed enum, not string
	enum: (ctx: string, name: string) => renderArtifact('enum', 'go', goBackendBindings.enum(ctx, name)),

	// ─── errors ──────────────────────────────────────────────────────────────────
	// ERR-GO-01: const type is always errors.ErrorCode
	// ERR-GO-02: every const appears in init()
	// ERR-GO-03: anonymous import in module.go triggers init()
	// ERR-GO-04: raise via errors.NewBaseError, not fmt.Errorf
	errors: (ctx: string) => renderArtifact('errors', 'go', goBackendBindings.errors(ctx)),

	// ─── schema ──────────────────────────────────────────────────────────────────
	// In Go, request/response shapes are plain structs with validate:"..." tags
	// inside the use case or controller file — not standalone schema files.
	schema: (ctx: string, name: string) => renderArtifact('schema', 'go', goBackendBindings.schema(ctx, name)),

	// ─── usecase ─────────────────────────────────────────────────────────────────
	// UC-GO-01: Name() returns snake_case
	// UC-GO-02: all DB mutations inside uow.Execute
	// UC-GO-03: domain events saved to domainEventRepo inside the same transaction
	// UC-GO-04: external I/O after uow.Execute returns
	usecase: (ctx: string, name: string) => renderArtifact('usecase', 'go', goBackendBindings.usecase(ctx, name)),

	// ─── query ───────────────────────────────────────────────────────────────────
	// Go query use cases follow the same Handler[I,O] pattern.
	// They use *sql.DB directly for lightweight reads (no UoW needed).
	query: (ctx: string, name: string) => renderArtifact('query', 'go', goBackendBindings.query(ctx, name)),

	// ─── controller ──────────────────────────────────────────────────────────────
	// CTRL-GO-01: implements types.Controller (Metadata + Handle)
	// CTRL-GO-02: auto-registered via fx group:"controllers"
	// CTRL-GO-03: uses httputil.DecodeRequest + httputil.RespondJSON/RespondError
	controller: (ctx: string, name: string, opts: { method?: string; path?: string }) =>
		renderArtifact('controller', 'go', goBackendBindings.controller(ctx, name, opts)),

	// ─── repository ──────────────────────────────────────────────────────────────
	// REPO-GO-01: interface in its own file inside a folder named after the entity
	// REPO-GO-02: Pg impl uses *sql.DB with txOrDB helper
	// REPO-GO-03: mock uses in-memory map with sync.RWMutex
	// REPO-GO-04: Reconstruct<Entity> used in toDomain, never New<Entity>
	repositoryInterface: (ctx: string, name: string) => renderArtifact('repository', 'go', goBackendBindings.repositoryInterface(ctx, name)),

	repositoryPg: (ctx: string, name: string) => renderArtifact('repository', 'go', goBackendBindings.repositoryPg(ctx, name)),

	repositoryMock: (ctx: string, name: string) => renderArtifact('repository', 'go', goBackendBindings.repositoryMock(ctx, name)),

	// ─── service ─────────────────────────────────────────────────────────────────
	// SVC-GO-01: interface + stub implementation pattern
	service: (ctx: string, name: string) => renderArtifact('service', 'go', goBackendBindings.service(ctx, name)),

	// ─── event (domain) ──────────────────────────────────────────────────────────
	// EVT-GO-01: type alias (=) not a new type
	// EVT-GO-02: const name "<ctx>.<aggregate>.<past_verb>"
	// EVT-GO-03: payload uses plain primitives with json tags
	domainEvent: (ctx: string, name: string) => renderArtifact('event', 'go', goBackendBindings.domainEvent(ctx, name)),

	// ─── event (integration) ─────────────────────────────────────────────────────
	integrationEvent: (ctx: string, name: string) => renderArtifact('event', 'go', goBackendBindings.integrationEvent(ctx, name)),

	// ─── handler (internal — reacts to domain event) ─────────────────────────────
	// HDL-GO-01: compile-time interface check
	// HDL-GO-02: UnmarshalDomainEvent immediately in Handle
	// HDL-GO-03: registered via internal.Register in module.go
	internalHandler: (ctx: string, name: string) => renderArtifact('handler', 'go', goBackendBindings.internalHandler(ctx, name)),

	// ─── handler (external — reacts to integration event) ────────────────────────
	// HDL-GO-04: registered via ext.Register in module.go
	externalHandler: (ctx: string, name: string) => renderArtifact('handler', 'go', goBackendBindings.externalHandler(ctx, name)),

	// ─── projection ──────────────────────────────────────────────────────────────
	// PROJ-GO-01: plain struct, no base class, no invariants
	// PROJ-GO-02: no domain logic
	projection: (ctx: string, name: string) => renderArtifact('projection', 'go', goBackendBindings.projection(ctx, name)),

	// ─── projector ───────────────────────────────────────────────────────────────
	// PRJR-GO-01: one projector per projection
	// PRJR-GO-02: canonical flow: direct upsert/delete for fully-derived projections
	projector: (ctx: string, name: string) => renderArtifact('projector', 'go', goBackendBindings.projector(ctx, name)),

	// ─── projection repository ───────────────────────────────────────────────────
	projectionRepository: (ctx: string, name: string) =>
		renderArtifact('projection', 'go', goBackendBindings.projectionRepository(ctx, name)),

	projectionRepositoryMock: (ctx: string, name: string) =>
		renderArtifact('projection', 'go', goBackendBindings.projectionRepositoryMock(ctx, name)),

	projectionRepositoryPg: (ctx: string, name: string) =>
		renderArtifact('projection', 'go', goBackendBindings.projectionRepositoryPg(ctx, name)),

	// ─── middleware ──────────────────────────────────────────────────────────────
	// MDL-GO-01: func(next http.Handler) http.Handler closure pattern
	// MDL-GO-02: use httputil.RespondError for error responses
	middleware: (ctx: string, name: string) => renderArtifact('middleware', 'go', goBackendBindings.middleware(ctx, name)),

	// ─── test ────────────────────────────────────────────────────────────────────
	// Colocated <source>_test.go file with table-driven test skeleton.
	test: (ctx: string, name: string) => renderArtifact('test', 'go', goBackendBindings.test(ctx, name)),

	// ─── module.go (full context) ────────────────────────────────────────────────
	module: (ctx: string) => {
		const pascal = toPascalCase(ctx)

		return `// Package ${ctx} provides the fx.Module for the ${ctx} bounded context.
package ${ctx}

import (
	_ "template/api-go/internal/${ctx}/errors" // register HTTP statuses via init()

	// "template/api-go/internal/${ctx}/controllers"
	// "template/api-go/internal/${ctx}/handlers"
	// ${ctx}repo "template/api-go/internal/${ctx}/repositories/<entity>"
	// "template/api-go/internal/${ctx}/services"
	// "template/api-go/internal/${ctx}/usecases"
	// "template/core-go/services/mediator"
	// "template/core-go/types"

	"go.uber.org/fx"
)

// Module registers the ${ctx} bounded context with fx.
var Module = fx.Module("${ctx}",
	// Services — bind interface to concrete implementation
	// fx.Provide(func() services.${pascal}Service { return services.NewStub${pascal}Service() }),

	// Repositories — bind interface to Postgres implementation
	// fx.Provide(fx.Annotate(
	// 	${ctx}repo.NewPg${pascal}Repository,
	// 	fx.As(new(${ctx}repo.${pascal}Repository)),
	// )),

	// Use cases
	// fx.Provide(usecases.New${pascal}Handler),

	// Controllers — auto-registered via group:"controllers"
	// fx.Provide(fx.Annotate(
	// 	controllers.New${pascal}Controller,
	// 	fx.As(new(types.Controller)),
	// 	fx.ResultTags(\`group:"controllers"\`),
	// )),

	// Handlers
	// fx.Provide(handlers.New${pascal}Handler),

	// Register handlers with their mediators on startup
	// fx.Invoke(registerHandlers),
)

// func registerHandlers(
// 	ext mediator.ExternalMediator,
// 	internal mediator.InternalMediator,
// 	// myHandler *handlers.${pascal}Handler,
// ) {
// 	// ext.Register(myHandler)     // integration event from another service
// 	// internal.Register(myHandler) // domain event within ${ctx} context
// }
`
	},
}

export type GoTemplates = typeof goTemplates
