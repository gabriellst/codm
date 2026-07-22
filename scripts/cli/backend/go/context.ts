// Full bounded-context bootstrapper for the Go backend.
// Materialises the canonical folder skeleton under packages/api/go/internal/<ctx>/
// and emits a placeholder module.go that wires the fx.Module.
//
// Reference shape: packages/api/go/internal/transcoding/module.go

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { apiRoot, toPascalCase } from '../helpers'
import { goTemplates } from './templates'

const GO_ROOT = apiRoot('go')

export async function generateFullContext(contextName: string): Promise<void> {
	const pascal = toPascalCase(contextName)
	const basePath = join(GO_ROOT, contextName)

	console.log(`\nCreating Go context structure: ${contextName}`)

	// ─── Sub-packages (each becomes a Go package with a placeholder .go file) ─────
	const subPackages: Record<string, string> = {
		controllers: goControllerPlaceholder(contextName),
		entities: goEntityPlaceholder(contextName),
		enums: goEnumPlaceholder(contextName),
		errors: goTemplates.errors(contextName),
		events: goEventPlaceholder(contextName),
		handlers: goHandlerPlaceholder(contextName),
		middleware: goMiddlewarePlaceholder(contextName),
		objects: goObjectPlaceholder(contextName),
		services: goServicePlaceholder(contextName),
		usecases: goUsecasePlaceholder(contextName),
		repositories: goRepositoryPlaceholder(contextName),
		projections: goProjectionPlaceholder(contextName),
	}

	for (const [pkg, content] of Object.entries(subPackages)) {
		const pkgPath = join(basePath, pkg)
		await mkdir(pkgPath, { recursive: true })
		await writeFile(join(pkgPath, 'doc.go'), content)
		console.log(`  Created ${pkg}/`)
	}

	// projections/projectors sub-folder
	const projectorPath = join(basePath, 'projections', 'projectors')
	await mkdir(projectorPath, { recursive: true })
	await writeFile(join(projectorPath, 'doc.go'), goProjectorPlaceholder(contextName))
	console.log('  Created projections/projectors/')

	// ─── Top-level module.go ─────────────────────────────────────────────────────
	const moduleContent = goTemplates.module(contextName)
	await writeFile(join(basePath, 'module.go'), moduleContent)
	console.log('  Created module.go')

	console.log(`\nContext "${contextName}" created successfully!`)
	console.log(`
Next steps:
  1. Add the context errors to errors/codes.go (bun cli errors ${contextName} --lang=go)
  2. Create your first entity  (bun cli entity ${contextName} ${pascal} --lang=go)
  3. Create a repository       (bun cli repository ${contextName} ${pascal} --lang=go)
  4. Create use cases          (bun cli usecase ${contextName} Create${pascal} --lang=go)
  5. Create a controller       (bun cli controller ${contextName} Create${pascal} --lang=go)
  6. Wire everything in module.go and add Module to cmd/api/main.go
`)
}

// ─── Package-level placeholder file bodies ───────────────────────────────────

function goControllerPlaceholder(ctx: string): string {
	return `// Package controllers exposes HTTP endpoints for the ${ctx} bounded context.
// Each controller struct implements types.Controller (Metadata + Handle).
// Registered in module.go via fx.Annotate with group:"controllers".
//
// Generate: bun cli controller ${ctx} <Name> --lang=go
package controllers
`
}

function goEntityPlaceholder(ctx: string): string {
	return `// Package entities contains domain entities for the ${ctx} bounded context.
// Entities embed entities.BaseEntity, expose New<Name>(...) (*T, error) constructors,
// Reconstruct<Name>(...) rehydration functions, and behavior methods that call
// _ = e.IncrementVersion() after every state mutation.
//
// Generate: bun cli entity ${ctx} <Name> --lang=go
package entities
`
}

function goEnumPlaceholder(ctx: string): string {
	return `// Package enums defines closed vocabularies for the ${ctx} bounded context.
// Each enum is a named string type with SCREAMING_SNAKE_CASE wire values.
//
// Generate: bun cli enum ${ctx} <Name> --lang=go
package enums
`
}

function goEventPlaceholder(ctx: string): string {
	return `// Package events defines domain and integration events for the ${ctx} bounded context.
// Domain events use types.DomainEvent[T] (type alias, not new type).
// Integration events use types.IntegrationEvent[T].
//
// Generate: bun cli event ${ctx} <Name> --lang=go
//           bun cli event ${ctx} <Name> --integration --lang=go
package events
`
}

function goHandlerPlaceholder(ctx: string): string {
	return `// Package handlers contains event handlers for the ${ctx} bounded context.
// Internal handlers (mediator.DomainEventHandler) react to domain events.
// External handlers (mediator.IntegrationEventHandler) react to integration events.
// All handlers are registered in module.go via fx.Invoke(registerHandlers).
//
// Generate: bun cli handler ${ctx} <Name> --lang=go           (internal)
//           bun cli handler ${ctx} <Name> --external --lang=go (external)
package handlers
`
}

function goMiddlewarePlaceholder(ctx: string): string {
	return `// Package middleware contains HTTP middlewares for the ${ctx} bounded context.
// Middlewares are func(next http.Handler) http.Handler closures.
// Attach them to a controller via ControllerMetadata.Middlewares.
//
// Generate: bun cli middleware ${ctx} <Name> --lang=go
package middleware
`
}

function goObjectPlaceholder(ctx: string): string {
	return `// Package objects contains value objects for the ${ctx} bounded context.
// Value objects have all private fields, a New<Name>(...) (T, error) constructor,
// and Value(), String(), Equals(), IsZero() accessors.
//
// Generate: bun cli value-object ${ctx} <Name> --lang=go
package objects
`
}

function goServicePlaceholder(ctx: string): string {
	return `// Package services defines domain/application service interfaces and stub
// implementations for the ${ctx} bounded context.
// Use cases depend on the interface, not the concrete implementation.
//
// Generate: bun cli service ${ctx} <Name> --lang=go
package services
`
}

function goUsecasePlaceholder(ctx: string): string {
	return `// Package usecases contains application use cases for the ${ctx} bounded context.
// Each use case is a plain struct with Name() string and
// Execute(ctx, input) (output, error). All DB mutations run inside
// h.uow.Execute; domain events are saved to domainEventRepo in the same transaction.
//
// Generate: bun cli usecase ${ctx} <Name> --lang=go
//           bun cli query   ${ctx} <Name> --lang=go   (read-only BFF query)
package usecases
`
}

function goRepositoryPlaceholder(ctx: string): string {
	return `// Package repositories contains persistence interfaces and implementations
// for the ${ctx} bounded context. Each entity has its own sub-package:
// repositories/<entity>/<entity>_repository.go       — interface
// repositories/<entity>/pg_<entity>_repository.go    — Postgres impl
// repositories/<entity>/mock_<entity>_repository.go  — in-memory mock
//
// Generate: bun cli repository ${ctx} <EntityName> --lang=go
package repositories
`
}

function goProjectionPlaceholder(ctx: string): string {
	return `// Package projections provides read-model projections for the ${ctx} bounded context.
// Projections are plain structs (no base class, no invariants) with an interface
// for the projection repository.
//
// Generate: bun cli projection ${ctx} <Name> --lang=go
//           bun cli projector  ${ctx} <Name> --lang=go
package projections
`
}

function goProjectorPlaceholder(ctx: string): string {
	return `// Package projectors provides projectors for the ${ctx} bounded context.
// Each projector struct implements an EventName() + Handle(...) pair and is
// registered with a mediator in module.go.
//
// Generate: bun cli projector ${ctx} <Name> --lang=go
package projectors
`
}
