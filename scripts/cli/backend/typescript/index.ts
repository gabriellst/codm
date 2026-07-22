// TypeScript backend scaffolder. The lang-aware dispatcher in
// `scripts/cli/backend/index.ts` picks this module when --lang=typescript.

import type { Generator } from '../../types'
import { requireArg, toPascalCase, validateHttpMethod, validatePath } from '../helpers'
import { backendTemplates } from './templates'

export { generateFullContext } from './context'

export const backendGenerators: Record<string, Generator> = {
	entity: (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'entity <context> <name> [--aggregate]')
		requireArg(name, 'entity <context> <name> [--aggregate]')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/entities/${pascal}.ts`,
				content: backendTemplates.entity(ctx, name, { aggregate: flags.aggregate === 'true' }),
				exportLine: `export { ${pascal} } from './${pascal}'`,
				exportTarget: `packages/api/typescript/src/${ctx}/entities/index.ts`,
			},
		]
	},

	'value-object': (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'value-object <context> <name> [--primitive]')
		requireArg(name, 'value-object <context> <name> [--primitive]')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/objects/${pascal}.ts`,
				content: backendTemplates.valueObject(ctx, name, { primitive: flags.primitive === 'true' }),
				exportLine: `export { ${pascal} } from './${pascal}'`,
				exportTarget: `packages/api/typescript/src/${ctx}/objects/index.ts`,
			},
		]
	},

	usecase: (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'usecase <context> <name> [--internal]')
		requireArg(name, 'usecase <context> <name> [--internal]')
		const pascal = toPascalCase(name)
		const isInternal = flags.internal === 'true'
		const subDir = isInternal ? 'usecases/internal' : 'usecases'
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/${subDir}/${pascal}.ts`,
				content: backendTemplates.usecase(ctx, name),
				exportLine: `export { ${pascal} } from './${isInternal ? `internal/${pascal}` : pascal}'`,
				exportTarget: `packages/api/typescript/src/${ctx}/usecases/index.ts`,
			},
			{
				filePath: `packages/api/typescript/src/${ctx}/${subDir}/${pascal}.test.ts`,
				content: backendTemplates.test(ctx, name, 'usecase'),
			},
		]
	},

	controller: (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'controller <context> <name> [--internal] [--method M] [--path P] [--mock]')
		requireArg(name, 'controller <context> <name> [--internal] [--method M] [--path P] [--mock]')
		const pascal = toPascalCase(name)
		const isInternal = flags.internal === 'true'
		const isMock = flags.mock === 'true'
		let method = flags.method || flags.m
		let path = flags.path || flags.p
		if (method) method = validateHttpMethod(method)
		if (path) path = validatePath(path)
		const subDir = isInternal ? 'controllers/internal' : 'controllers'
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/${subDir}/${pascal}.ts`,
				content: backendTemplates.controller(ctx, name, { isInternal, method, path, mock: isMock }),
				exportLine: `export { ${pascal}Controller } from './${isInternal ? `internal/${pascal}` : pascal}'`,
				exportTarget: `packages/api/typescript/src/${ctx}/controllers/index.ts`,
			},
		]
	},

	handler: (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'handler <context> <name> [--external]')
		requireArg(name, 'handler <context> <name> [--external]')
		const pascal = toPascalCase(name)
		const isExternal = flags.external === 'true'
		const template = isExternal ? backendTemplates.externalHandler(ctx, name) : backendTemplates.internalHandler(ctx, name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/handlers/${pascal}Handler.ts`,
				content: template,
				exportLine: `export { ${pascal}Handler } from './${pascal}Handler'`,
				exportTarget: `packages/api/typescript/src/${ctx}/handlers/${isExternal ? 'external' : 'internal'}.ts`,
			},
			{
				filePath: `packages/api/typescript/src/${ctx}/handlers/${pascal}Handler.test.ts`,
				content: backendTemplates.test(ctx, name, 'handler'),
			},
		]
	},

	service: pos => {
		const [ctx, name] = pos
		requireArg(ctx, 'service <context> <name>')
		requireArg(name, 'service <context> <name>')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/services/${pascal}.ts`,
				content: backendTemplates.service(ctx, name),
				exportLine: `export { ${pascal} } from './${pascal}'`,
				exportTarget: `packages/api/typescript/src/${ctx}/services/index.ts`,
			},
		]
	},

	event: (pos, flags) => {
		const [ctx, name] = pos
		requireArg(ctx, 'event <context> <name> [--integration]')
		requireArg(name, 'event <context> <name> [--integration]')
		const pascal = toPascalCase(name)
		const isIntegration = flags.integration === 'true'

		if (isIntegration) {
			return [
				{
					filePath: `packages/api/typescript/src/shared/events/${pascal}Event.ts`,
					content: backendTemplates.integrationEvent(ctx, name),
					exportLine: `export * from './${pascal}Event'`,
					exportTarget: 'packages/api/typescript/src/shared/events/index.ts',
				},
			]
		}
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/events/${pascal}Event.ts`,
				content: backendTemplates.domainEvent(ctx, name),
				exportLine: `export * from './${pascal}Event'`,
				exportTarget: `packages/api/typescript/src/${ctx}/events/index.ts`,
			},
		]
	},

	middleware: pos => {
		const [ctx, name] = pos
		requireArg(ctx, 'middleware <context> <name>')
		requireArg(name, 'middleware <context> <name>')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/middlewares/${pascal}Middleware.ts`,
				content: backendTemplates.middleware(ctx, name),
				exportLine: `export { ${pascal}Middleware } from './${pascal}Middleware'`,
				exportTarget: `packages/api/typescript/src/${ctx}/middlewares/index.ts`,
			},
		]
	},

	enum: pos => {
		const [ctx, name] = pos
		requireArg(ctx, 'enum <context> <name>')
		requireArg(name, 'enum <context> <name>')
		const pascal = toPascalCase(name)
		console.log(
			`  NOTE: if ${pascal} will be a wire enum (in packages/contracts), add it to the openapi.registerEnums() call in packages/api/typescript/src/shared/index.ts`,
		)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/enums/${pascal}.ts`,
				content: backendTemplates.enum(ctx, name),
				exportLine: `export { ${pascal} } from './${pascal}'`,
				exportTarget: `packages/api/typescript/src/${ctx}/enums/index.ts`,
			},
		]
	},

	repository: pos => {
		const [ctx, name] = pos
		requireArg(ctx, 'repository <context> <entityName>')
		requireArg(name, 'repository <context> <entityName>')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/repositories/${pascal}Repository/${pascal}Repository.ts`,
				content: backendTemplates.repositoryAbstract(ctx, name),
				exportLine: `export * from './${pascal}Repository'`,
				exportTarget: `packages/api/typescript/src/${ctx}/repositories/index.ts`,
			},
			{
				filePath: `packages/api/typescript/src/${ctx}/repositories/${pascal}Repository/Drizzle${pascal}Repository.ts`,
				content: backendTemplates.repositoryDrizzle(ctx, name),
				exportLine: `// Register in context registry.ts INSTANCE_REGISTRY: { token: ${pascal}Repository, instance: Drizzle${pascal}Repository }`,
				exportTarget: `packages/api/typescript/src/${ctx}/registry.ts`,
			},
			{
				filePath: `packages/api/typescript/src/${ctx}/repositories/${pascal}Repository/${pascal}Repository.test.ts`,
				content: backendTemplates.test(ctx, name, 'repository'),
			},
		]
	},

	schema: pos => {
		const [ctx, name] = pos
		requireArg(ctx, 'schema <context> <name>')
		requireArg(name, 'schema <context> <name>')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/schemas/${pascal}Schema.ts`,
				content: backendTemplates.schema(ctx, name),
				exportLine: `export { ${pascal}Schema } from './${pascal}Schema'`,
				exportTarget: `packages/api/typescript/src/${ctx}/schemas/index.ts`,
			},
		]
	},

	errors: pos => {
		const [ctx] = pos
		requireArg(ctx, 'errors <context>')
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/errors/index.ts`,
				content: backendTemplates.errors(ctx),
			},
		]
	},

	query: pos => {
		const [name] = pos
		requireArg(name, 'query <Name>')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/ui/usecases/${pascal}.ts`,
				content: backendTemplates.query(name),
				exportLine: `export { ${pascal} } from './${pascal}'`,
				exportTarget: 'packages/api/typescript/src/ui/usecases/index.ts',
			},
			{
				filePath: `packages/api/typescript/src/ui/usecases/${pascal}.test.ts`,
				content: backendTemplates.test('ui', name, 'query'),
			},
		]
	},

	projection: pos => {
		const [ctx, name] = pos
		requireArg(ctx, 'projection <context> <Name>')
		requireArg(name, 'projection <context> <Name>')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/projections/${pascal}.ts`,
				content: backendTemplates.projection(ctx, name),
				exportLine: `export { ${pascal}Projection, type ${pascal}ProjectionEvent, type ${pascal}ProjectionProps, ${pascal}ProjectionSchema } from './${pascal}'`,
				exportTarget: `packages/api/typescript/src/${ctx}/projections/index.ts`,
			},
			{
				filePath: `packages/api/typescript/src/${ctx}/projections/${pascal}ProjectionRepository.ts`,
				content: backendTemplates.projectionRepository(ctx, name),
				exportLine: `export { ${pascal}ProjectionRepository, Drizzle${pascal}ProjectionRepository, Mock${pascal}ProjectionRepository } from './${pascal}ProjectionRepository'`,
				exportTarget: `packages/api/typescript/src/${ctx}/projections/index.ts`,
			},
		]
	},

	projector: pos => {
		const [ctx, name] = pos
		requireArg(ctx, 'projector <context> <Name>')
		requireArg(name, 'projector <context> <Name>')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/src/${ctx}/projections/projectors/${pascal}Projector.ts`,
				content: backendTemplates.projector(ctx, name),
				exportLine: `export * from './${pascal}Projector'`,
				exportTarget: `packages/api/typescript/src/${ctx}/projections/projectors/index.ts`,
			},
		]
	},

	test: pos => {
		const [kind, ctx, name] = pos
		const validKinds = ['usecase', 'repository', 'handler', 'query'] as const
		requireArg(kind, 'test <usecase|repository|handler|query> <context> <name>')
		if (!(validKinds as readonly string[]).includes(kind)) {
			console.error(`Unknown test kind: "${kind}". Valid: ${validKinds.join(', ')}`)
			process.exit(1)
		}
		requireArg(ctx, 'test <kind> <context> <name>')
		requireArg(name, 'test <kind> <context> <name>')
		const pascal = toPascalCase(name)
		let filePath: string
		if (kind === 'query') {
			filePath = `packages/api/typescript/src/ui/usecases/${pascal}.test.ts`
		} else if (kind === 'repository') {
			filePath = `packages/api/typescript/src/${ctx}/repositories/${pascal}Repository/${pascal}Repository.test.ts`
		} else if (kind === 'handler') {
			filePath = `packages/api/typescript/src/${ctx}/handlers/${pascal}Handler.test.ts`
		} else {
			filePath = `packages/api/typescript/src/${ctx}/usecases/${pascal}.test.ts`
		}
		return [{ filePath, content: backendTemplates.test(ctx, name, kind) }]
	},

	given: pos => {
		const [ctx, name] = pos
		requireArg(ctx, 'given <context> <name>')
		requireArg(name, 'given <context> <name>')
		const pascal = toPascalCase(name)
		return [
			{
				filePath: `packages/api/typescript/tests/support/given/${ctx}.ts`,
				content: backendTemplates.given(ctx, name),
				exportLine: `export { given${pascal} } from './${ctx}'`,
				exportTarget: 'packages/api/typescript/tests/support/given/index.ts',
			},
		]
	},
}
