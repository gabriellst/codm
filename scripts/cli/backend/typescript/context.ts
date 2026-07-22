// Full bounded-context bootstrapper. Materializes the canonical folder skeleton
// (entities / controllers / handlers / …) plus the context-level index.ts and
// registry.ts that wire DI, mediators and the Router.

import { REPO } from '../../../../template.config'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { API_SRC, toPascalCase } from '../helpers'
import { backendTemplates } from './templates'

export async function generateFullContext(contextName: string) {
	const pascalCase = toPascalCase(contextName)
	const basePath = join(API_SRC, contextName)

	console.log(`Creating context structure: ${contextName}`)

	const structure: Record<string, string> = {
		controllers: '// Export controllers using named exports\n',
		entities: '// Domain entities\n',
		errors: backendTemplates.errors(contextName),
		events: '// Domain events\n',
		middlewares: '// Middlewares\n',
		objects: '// Value objects\n',
		repositories: '// Repository interfaces and implementations\n',
		services: '// Service interfaces and implementations\n',
		usecases: '// Export use cases using named exports\n',
	}

	for (const [dir, content] of Object.entries(structure)) {
		const dirPath = join(basePath, dir)
		await mkdir(dirPath, { recursive: true })
		await writeFile(join(dirPath, 'index.ts'), content)
		console.log(`  Created ${dir}/`)
	}

	// Handlers folder
	const handlersPath = join(basePath, 'handlers')
	await mkdir(handlersPath, { recursive: true })
	await writeFile(join(handlersPath, 'internal.ts'), '// Export internal handlers here\n')
	await writeFile(join(handlersPath, 'external.ts'), '// Export external handlers here\n')
	console.log('  Created handlers/')

	// Enums folder
	const enumsPath = join(basePath, 'enums')
	await mkdir(enumsPath, { recursive: true })
	await writeFile(join(enumsPath, 'index.ts'), '// Export enums here\n')
	console.log('  Created enums/')

	// registry.ts — per-env DI bindings
	const registryTs = `// Per-env DI bindings for ${pascalCase} BC.
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import type { InstanceRegistry } from '${REPO.corePackage}'
// import { ${pascalCase}Repository, Drizzle${pascalCase}Repository, Mock${pascalCase}Repository } from './repositories/${pascalCase}Repository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [
		// { token: ${pascalCase}Repository, instance: Mock${pascalCase}Repository },
	],
	integration: [
		// { token: ${pascalCase}Repository, instance: Drizzle${pascalCase}Repository },
	],
	real: [
		// { token: ${pascalCase}Repository, instance: Drizzle${pascalCase}Repository },
	],
}
`

	await writeFile(join(basePath, 'registry.ts'), registryTs)
	console.log('  Created registry.ts')

	// Main index — BoundedContext.create({...}) pattern
	const mainIndex = `import { BoundedContext } from '${REPO.corePackage}'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'

const ctx = await BoundedContext.create({
	name: '${contextName}',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
`

	await writeFile(join(basePath, 'index.ts'), mainIndex)
	console.log(`\nContext "${contextName}" created successfully!`)
}
