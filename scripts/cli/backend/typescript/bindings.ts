// Per-artifact binding computation: the *logic* half of the former templates.ts.
// Each entry maps (contextName, name, opts) to the placeholder/variant map the
// renderer interpolates into that artifact's registry snippet.
import { inferHttpMethod, inferPath, toCamelCase, toPascalCase, toVerbEntityFormat } from '../helpers'
import type { Bindings } from '../../snippet/types'

export const backendBindings = {
	entity: (_ctx: string, name: string, opts: { aggregate?: boolean }): Bindings => ({
		Name: toPascalCase(name),
		base: opts.aggregate ? 'AggregateRoot' : 'BaseEntity',
	}),

	valueObject: (_ctx: string, name: string, opts: { primitive?: boolean }): Bindings =>
		opts.primitive
			? {
					_variant: 'primitive',
					Name: toPascalCase(name),
					NAME_ERR: `INVALID_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`,
				}
			: { Name: toPascalCase(name) },

	usecase: (_ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
		verbEntity: toVerbEntityFormat(name),
	}),

	controller: (ctx: string, name: string, opts: { isInternal?: boolean; method?: string; path?: string; mock?: boolean }): Bindings => {
		const lower = name.toLowerCase()
		const verb =
			lower.startsWith('list') || lower.startsWith('fetch')
				? 'list'
				: lower.startsWith('get')
					? 'get'
					: lower.startsWith('create')
						? 'create'
						: lower.startsWith('update')
							? 'update'
							: lower.startsWith('delete') || lower.startsWith('remove')
								? 'delete'
								: undefined
		const destructuring =
			verb === 'list'
				? 'const { query } = request'
				: verb === 'get' || verb === 'delete'
					? 'const { params } = request'
					: verb === 'create'
						? 'const { body } = request'
						: verb === 'update'
							? 'const { params, body } = request'
							: 'const {} = request'
		// literal bindings BEFORE the fragment-ref so the fragment can read {{destructuring}}
		return {
			...(verb ? { _variant: verb } : {}),
			Name: toPascalCase(name),
			path: opts.path || inferPath(name, ctx, opts.isInternal ?? false),
			method: opts.method || inferHttpMethod(name),
			destructuring,
			classBody: { fragment: opts.mock ? 'mock' : 'handle' },
		}
	},

	// internal handler: no _variant (default skeleton)
	internalHandler: (ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
		contextName: ctx,
	}),

	// external handler: _variant='external'
	externalHandler: (_ctx: string, name: string): Bindings => ({
		_variant: 'external',
		Name: toPascalCase(name),
		contextName: _ctx,
	}),

	service: (_ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
	}),

	// domain event: no _variant (default skeleton)
	domainEvent: (ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
		contextName: ctx,
		camelName: toCamelCase(name),
	}),

	// integration event: _variant='integration'
	integrationEvent: (_ctx: string, name: string): Bindings => ({
		_variant: 'integration',
		Name: toPascalCase(name),
		contextName: _ctx,
		camelName: toCamelCase(name),
	}),

	middleware: (_ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
	}),

	enum: (_ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
	}),

	// abstract repository port: no _variant (default skeleton)
	repositoryAbstract: (ctx: string, entityName: string): Bindings => ({
		Name: toPascalCase(entityName),
		contextName: ctx,
		camelName: toCamelCase(entityName),
	}),

	// drizzle repository impl: _variant='drizzle'
	repositoryDrizzle: (ctx: string, entityName: string): Bindings => ({
		_variant: 'drizzle',
		Name: toPascalCase(entityName),
		contextName: ctx,
		camelName: toCamelCase(entityName),
	}),

	schema: (_ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
	}),

	errors: (ctx: string): Bindings => ({
		Name: toPascalCase(ctx),
	}),

	// projection class: no _variant (default skeleton)
	projection: (ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
		contextName: ctx,
		camelName: toCamelCase(name),
	}),

	// projection repository file: _variant='repository'
	projectionRepository: (_ctx: string, name: string): Bindings => ({
		_variant: 'repository',
		Name: toPascalCase(name),
		contextName: _ctx,
		camelName: toCamelCase(name),
	}),

	projector: (_ctx: string, name: string): Bindings => ({
		Name: toPascalCase(name),
	}),

	query: (name: string): Bindings => ({
		Name: toPascalCase(name),
		verbEntity: toVerbEntityFormat(name),
	}),

	// Test scaffold: pick the skeleton variant by test kind.
	test: (ctx: string, name: string, kind: string): Bindings => ({
		_variant: kind, // 'usecase' | 'repository' | 'handler' | 'query'
		Name: toPascalCase(name),
		contextName: ctx,
		camelName: toCamelCase(name),
	}),

	givenHelper: (ctx: string, name: string): Bindings => ({
		_variant: 'given',
		Name: toPascalCase(name),
		contextName: ctx,
		camelName: toCamelCase(name),
	}),
}
