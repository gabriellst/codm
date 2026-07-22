// Backend file body templates. Each entry returns the raw source for one
// generated file; the surrounding generator (in ./index.ts) decides where the
// file lands and what index re-export line to emit.
//
// All bodies now live in each skill's registry.yaml `snippet` block.
// This file is a thin adapter: it computes bindings and delegates to renderArtifact.

import { renderArtifact } from '../../snippet/render'
import { backendBindings } from './bindings'

export const backendTemplates = {
	entity: (_contextName: string, name: string, opts: { aggregate?: boolean }) =>
		renderArtifact('entity', 'typescript', backendBindings.entity(_contextName, name, opts)),

	valueObject: (_contextName: string, name: string, opts: { primitive?: boolean }) =>
		renderArtifact('value-object', 'typescript', backendBindings.valueObject(_contextName, name, opts)),

	usecase: (_contextName: string, name: string) => renderArtifact('usecase', 'typescript', backendBindings.usecase(_contextName, name)),

	controller: (contextName: string, name: string, opts: { isInternal?: boolean; method?: string; path?: string; mock?: boolean }) =>
		renderArtifact('controller', 'typescript', backendBindings.controller(contextName, name, opts)),

	internalHandler: (contextName: string, name: string) =>
		renderArtifact('handler', 'typescript', backendBindings.internalHandler(contextName, name)),

	externalHandler: (contextName: string, name: string) =>
		renderArtifact('handler', 'typescript', backendBindings.externalHandler(contextName, name)),

	service: (_contextName: string, name: string) => renderArtifact('service', 'typescript', backendBindings.service(_contextName, name)),

	domainEvent: (contextName: string, name: string) => renderArtifact('event', 'typescript', backendBindings.domainEvent(contextName, name)),

	integrationEvent: (contextName: string, name: string) =>
		renderArtifact('event', 'typescript', backendBindings.integrationEvent(contextName, name)),

	middleware: (_contextName: string, name: string) =>
		renderArtifact('middleware', 'typescript', backendBindings.middleware(_contextName, name)),

	enum: (_contextName: string, name: string) => renderArtifact('enum', 'typescript', backendBindings.enum(_contextName, name)),

	repositoryAbstract: (contextName: string, entityName: string) =>
		renderArtifact('repository', 'typescript', backendBindings.repositoryAbstract(contextName, entityName)),

	repositoryDrizzle: (contextName: string, entityName: string) =>
		renderArtifact('repository', 'typescript', backendBindings.repositoryDrizzle(contextName, entityName)),

	schema: (_contextName: string, name: string) => renderArtifact('schema', 'typescript', backendBindings.schema(_contextName, name)),

	errors: (contextName: string) => renderArtifact('errors', 'typescript', backendBindings.errors(contextName)),

	projection: (contextName: string, name: string) =>
		renderArtifact('projection', 'typescript', backendBindings.projection(contextName, name)),

	projectionRepository: (contextName: string, name: string) =>
		renderArtifact('projection', 'typescript', backendBindings.projectionRepository(contextName, name)),

	projector: (_contextName: string, name: string) =>
		renderArtifact('projector', 'typescript', backendBindings.projector(_contextName, name)),

	query: (name: string) => renderArtifact('query', 'typescript', backendBindings.query(name)),

	test: (ctx: string, name: string, kind: string) => renderArtifact('test', 'typescript', backendBindings.test(ctx, name, kind)),

	given: (ctx: string, name: string) => renderArtifact('test', 'typescript', backendBindings.givenHelper(ctx, name)),
}
