// Per-artifact binding computation for Go backend generators.
// Each entry maps (ctx, name?, opts) to the placeholder/variant map that
// renderArtifact() interpolates into the artifact's go/registry.yaml snippet.
import { inferHttpMethod, toPascalCase } from '../helpers'
import { toSnakeCase } from './index'
import type { Bindings } from '../../snippet/types'

// toScreamingSnake converts PascalCase/camelCase to SCREAMING_SNAKE_CASE wire values.
function toScreamingSnake(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.toUpperCase()
}

// toDotSnake converts snake_case to dot.case (event names).
function toDotSnake(snake: string): string {
	return snake.replace(/_/g, '.')
}

export const goBackendBindings = {
	entity: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	valueObject: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		scream: toScreamingSnake(name),
		snake: toSnakeCase(name),
	}),

	enum: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	errors: (ctx: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(ctx),
		scream: toScreamingSnake(ctx),
	}),

	schema: (_ctx: string, _name: string): Bindings => ({}),

	usecase: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	query: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	controller: (ctx: string, name: string, opts: { method?: string; path?: string }): Bindings => {
		const pascal = toPascalCase(name)
		const snake = toSnakeCase(name)
		const method = (opts.method || inferHttpMethod(name)).toUpperCase()
		const path = opts.path || `/${snake.replace(/_/g, '-')}`
		const lower = name.toLowerCase()
		const isGet = lower.startsWith('get') || lower.startsWith('list') || lower.startsWith('fetch')
		const isDelete = lower.startsWith('delete') || lower.startsWith('remove')
		const statusCode = isGet ? 'http.StatusOK' : isDelete ? 'http.StatusNoContent' : 'http.StatusCreated'
		return { ctx, Pascal: pascal, snake, method, path, statusCode }
	},

	repositoryInterface: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	repositoryPg: (ctx: string, name: string): Bindings => ({
		_variant: 'pg',
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	repositoryMock: (ctx: string, name: string): Bindings => ({
		_variant: 'mock',
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	service: (_ctx: string, name: string): Bindings => ({
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	domainEvent: (ctx: string, name: string): Bindings => {
		const snake = toSnakeCase(name)
		return {
			ctx,
			Pascal: toPascalCase(name),
			eventConst: `${ctx}.${toDotSnake(snake)}`,
		}
	},

	integrationEvent: (ctx: string, name: string): Bindings => {
		const snake = toSnakeCase(name)
		return {
			_variant: 'integration',
			ctx,
			Pascal: toPascalCase(name),
			integrationEventConst: `integration.${ctx}.${toDotSnake(snake)}`,
		}
	},

	internalHandler: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	externalHandler: (ctx: string, name: string): Bindings => {
		const snake = toSnakeCase(name)
		return {
			_variant: 'external',
			ctx,
			Pascal: toPascalCase(name),
			snake,
			dotSnake: toDotSnake(snake),
		}
	},

	projection: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	projectionRepository: (ctx: string, name: string): Bindings => ({
		_variant: 'repository',
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	projectionRepositoryMock: (_ctx: string, name: string): Bindings => ({
		_variant: 'repositoryMock',
		ctx: _ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	projectionRepositoryPg: (ctx: string, name: string): Bindings => ({
		_variant: 'repositoryPg',
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	projector: (ctx: string, name: string): Bindings => {
		const snake = toSnakeCase(name)
		return {
			ctx,
			Pascal: toPascalCase(name),
			snake,
			dotSnake: toDotSnake(snake),
		}
	},

	middleware: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),

	test: (ctx: string, name: string): Bindings => ({
		ctx,
		Pascal: toPascalCase(name),
		snake: toSnakeCase(name),
	}),
}
