// Go backend scaffolder. The lang-aware dispatcher in
// `scripts/cli/backend/index.ts` picks this module when --lang=go.
//
// Generators follow the canonical shapes codified in .claude/skills/<skill>/go/SKILL.md
// and cross-validated against packages/api/go/internal/transcoding/ reference impls.

import type { GeneratedFile, Generator } from '../../types'
import { apiRoot, requireArg, toPascalCase, validateHttpMethod, validatePath } from '../helpers'
import { goTemplates } from './templates'

export { generateFullContext } from './context'

// toSnakeCase converts a PascalCase/camelCase identifier to snake_case (Go file names).
export function toSnakeCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.toLowerCase()
}

const GO_ROOT = apiRoot('go')

export const backendGenerators: Record<string, Generator> = {
	// ─── entity ─────────────────────────────────────────────────────────────────
	entity: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'entity <context> <name>')
		requireArg(name, 'entity <context> <name>')
		const snake = toSnakeCase(name)
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/entities/${snake}.go`,
				content: goTemplates.entity(ctx, name),
				exportLine: `// Register in module.go: see entity ${pascal} in internal/${ctx}/entities/${snake}.go`,
			},
		]
	},

	// ─── value-object ────────────────────────────────────────────────────────────
	'value-object': (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'value-object <context> <name>')
		requireArg(name, 'value-object <context> <name>')
		const snake = toSnakeCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/objects/${snake}.go`,
				content: goTemplates.valueObject(ctx, name),
			},
		]
	},

	// ─── enum ────────────────────────────────────────────────────────────────────
	enum: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'enum <context> <name>')
		requireArg(name, 'enum <context> <name>')
		const snake = toSnakeCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/enums/${snake}.go`,
				content: goTemplates.enum(ctx, name),
			},
		]
	},

	// ─── errors ──────────────────────────────────────────────────────────────────
	errors: (pos, _flags) => {
		const [ctx] = pos
		requireArg(ctx, 'errors <context>')
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/errors/codes.go`,
				content: goTemplates.errors(ctx),
				exportLine: `_ "template/api-go/internal/${ctx}/errors" // register HTTP statuses via init()`,
				exportTarget: `${GO_ROOT}/${ctx}/module.go`,
			},
		]
	},

	// ─── schema ──────────────────────────────────────────────────────────────────
	// In Go, schemas are plain structs with validate:"..." tags colocated in
	// the use case or controller file — no standalone schema file.
	schema: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'schema <context> <name>')
		requireArg(name, 'schema <context> <name>')
		const snake = toSnakeCase(name)
		// Emit an informational file that points to the right place.
		const files: GeneratedFile[] = [
			{
				filePath: `${GO_ROOT}/${ctx}/schemas/${snake}_schema_note.go`,
				content: goTemplates.schema(ctx, name),
			},
		]
		console.log(
			`\nNOTE (Go schema): In Go, request/response shapes are plain structs with` +
				` validate:"..." tags defined INSIDE the use case or controller file that owns them.` +
				` No standalone schema file is needed.\n` +
				`See: .claude/skills/schema/go/SKILL.md\n`,
		)
		return files
	},

	// ─── usecase ─────────────────────────────────────────────────────────────────
	usecase: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'usecase <context> <name>')
		requireArg(name, 'usecase <context> <name>')
		const snake = toSnakeCase(name)
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/usecases/${snake}.go`,
				content: goTemplates.usecase(ctx, name),
				exportLine: `fx.Provide(usecases.New${pascal}Handler),`,
				exportTarget: `${GO_ROOT}/${ctx}/module.go`,
			},
		]
	},

	// ─── query ───────────────────────────────────────────────────────────────────
	// Go query use cases follow the same Handler[I,O] pattern with direct *sql.DB access.
	query: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'query <context> <name>')
		requireArg(name, 'query <context> <name>')
		const snake = toSnakeCase(name)
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/usecases/${snake}.go`,
				content: goTemplates.query(ctx, name),
				exportLine: `fx.Provide(usecases.New${pascal}Handler),`,
				exportTarget: `${GO_ROOT}/${ctx}/module.go`,
			},
		]
	},

	// ─── controller ──────────────────────────────────────────────────────────────
	controller: (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'controller <context> <name> [--method M] [--path P]')
		requireArg(name, 'controller <context> <name> [--method M] [--path P]')
		const snake = toSnakeCase(name)
		const pascal = toPascalCase(name)
		let method = flags.method || flags.m
		let path = flags.path || flags.p
		if (method) method = validateHttpMethod(method)
		if (path) path = validatePath(path)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/controllers/${snake}.go`,
				content: goTemplates.controller(ctx, name, { method, path }),
				exportLine:
					`fx.Provide(fx.Annotate(\n` +
					`\t\tcontrollers.New${pascal}Controller,\n` +
					`\t\tfx.As(new(types.Controller)),\n` +
					`\t\tfx.ResultTags(\`group:"controllers"\`),\n` +
					`\t)),`,
				exportTarget: `${GO_ROOT}/${ctx}/module.go`,
			},
		]
	},

	// ─── repository ──────────────────────────────────────────────────────────────
	// Returns 3 files inside a folder named after the entity (snake_case).
	repository: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'repository <context> <entityName>')
		requireArg(name, 'repository <context> <entityName>')
		const snake = toSnakeCase(name)
		const pascal = toPascalCase(name)
		const folder = `${GO_ROOT}/${ctx}/repositories/${snake}`

		const exportLine = `fx.Provide(fx.Annotate(\n\t\t${snake}.NewPg${pascal}Repository,\n\t\tfx.As(new(${snake}.${pascal}Repository)),\n\t)),`

		return [
			{
				filePath: `${folder}/${snake}_repository.go`,
				content: goTemplates.repositoryInterface(ctx, name),
				exportLine,
				exportTarget: `${GO_ROOT}/${ctx}/module.go`,
			},
			{
				filePath: `${folder}/pg_${snake}_repository.go`,
				content: goTemplates.repositoryPg(ctx, name),
			},
			{
				filePath: `${folder}/mock_${snake}_repository.go`,
				content: goTemplates.repositoryMock(ctx, name),
			},
		]
	},

	// ─── service ─────────────────────────────────────────────────────────────────
	service: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'service <context> <name>')
		requireArg(name, 'service <context> <name>')
		const snake = toSnakeCase(name)
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/services/${snake}_service.go`,
				content: goTemplates.service(ctx, name),
				exportLine: `// Provide ${pascal} in module.go: fx.Provide(func() services.${pascal} { return services.NewStub${pascal}() })`,
				exportTarget: `${GO_ROOT}/${ctx}/module.go`,
			},
		]
	},

	// ─── event ───────────────────────────────────────────────────────────────────
	event: (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'event <context> <name> [--integration]')
		requireArg(name, 'event <context> <name> [--integration]')
		const snake = toSnakeCase(name)
		const isIntegration = flags.integration === 'true'
		const content = isIntegration ? goTemplates.integrationEvent(ctx, name) : goTemplates.domainEvent(ctx, name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/events/${snake}.go`,
				content,
			},
		]
	},

	// ─── handler ─────────────────────────────────────────────────────────────────
	handler: (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'handler <context> <name> [--external]')
		requireArg(name, 'handler <context> <name> [--external]')
		const snake = toSnakeCase(name)
		const pascal = toPascalCase(name)
		const isExternal = flags.external === 'true'
		const suffix = isExternal ? '_integration_handler' : '_handler'
		const content = isExternal ? goTemplates.externalHandler(ctx, name) : goTemplates.internalHandler(ctx, name)
		const mediatorCall = isExternal
			? `ext.Register(${snake}Handler)    // integration event from another service`
			: `internal.Register(${snake}Handler) // domain event within ${ctx} context`

		return [
			{
				filePath: `${GO_ROOT}/${ctx}/handlers/${snake}${suffix}.go`,
				content,
				exportLine: `// In registerHandlers: fx.Provide(handlers.New${pascal}Handler),\n` + `// Then: ${mediatorCall}`,
				exportTarget: `${GO_ROOT}/${ctx}/module.go`,
			},
		]
	},

	// ─── projection ──────────────────────────────────────────────────────────────
	projection: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'projection <context> <name>')
		requireArg(name, 'projection <context> <name>')
		const snake = toSnakeCase(name)
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/projections/${snake}.go`,
				content: goTemplates.projection(ctx, name),
			},
			{
				filePath: `${GO_ROOT}/${ctx}/projections/${snake}_projection_repository.go`,
				content: goTemplates.projectionRepository(ctx, name),
			},
			{
				filePath: `${GO_ROOT}/${ctx}/projections/mock_${snake}_projection_repository.go`,
				content: goTemplates.projectionRepositoryMock(ctx, name),
			},
			{
				filePath: `${GO_ROOT}/${ctx}/projections/pg_${snake}_projection_repository.go`,
				content: goTemplates.projectionRepositoryPg(ctx, name),
			},
		]
	},

	// ─── projector ───────────────────────────────────────────────────────────────
	projector: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'projector <context> <name>')
		requireArg(name, 'projector <context> <name>')
		const snake = toSnakeCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/projections/projectors/${snake}_projector.go`,
				content: goTemplates.projector(ctx, name),
			},
		]
	},

	// ─── middleware ──────────────────────────────────────────────────────────────
	middleware: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'middleware <context> <name>')
		requireArg(name, 'middleware <context> <name>')
		const snake = toSnakeCase(name)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/middleware/${snake}.go`,
				content: goTemplates.middleware(ctx, name),
			},
		]
	},

	// ─── test ────────────────────────────────────────────────────────────────────
	// Colocated <source>_test.go alongside an existing source file.
	test: (pos, _flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'test <context> <name>')
		requireArg(name, 'test <context> <name>')
		const snake = toSnakeCase(name)
		// Default: colocate next to the usecase (most common test target)
		return [
			{
				filePath: `${GO_ROOT}/${ctx}/usecases/${snake}_test.go`,
				content: goTemplates.test(ctx, name),
			},
		]
	},
}
