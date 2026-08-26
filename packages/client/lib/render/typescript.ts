/**
 * Renders the per-service TS Client class and the aggregate Client class.
 * Pure functions: take service metadata, return strings to write.
 */
import { tsPropertyIdent, tsPascalClass } from '../sanitize'
import type { ApiSource } from '../discover'

export interface ServiceMeta {
	source: ApiSource
	/** Names of generated Kubb functions in `<service>/client/`. */
	clientFunctionNames: string[]
}

export function renderServiceClient(meta: ServiceMeta): string {
	// NOME DERIVA DO `clientId`, não do serviço. Dois perfis do mesmo backend (o daemon local e o
	// deployment de nuvem, ADR 0001) são dois clients — e derivar do serviço fazia os dois se
	// chamarem `TypescriptClient`, com o agregado reprovando em `Duplicate identifier`. O `clientId`
	// já carrega o perfil (`typescript` / `typescript-cloud`), então o nome sai certo sem que este
	// arquivo aprenda que perfis existem.
	const className = tsPascalClass(meta.source.clientId)
	const fnImports = meta.clientFunctionNames.map(n => `\t${n},`).join('\n')
	const methods = meta.clientFunctionNames
		.map(
			n =>
				`\t${n}(...args: Parameters<typeof ${n}>): ReturnType<typeof ${n}> {\n\t\treturn (${n} as (...a: any[]) => ReturnType<typeof ${n}>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })\n\t}`,
		)
		.join('\n\n')
	return `// AUTO-GENERATED — do not edit.
import {
${fnImports}
} from './client'

export interface ${className}Config {
	baseUrl: string
	fetch?: typeof fetch
}

export class ${className} {
	private constructor(private readonly config: ${className}Config) {}

	static create(config: ${className}Config): ${className} {
		return new ${className}(config)
	}

${methods}
}
`
}

export function renderAggregateClient(metas: ServiceMeta[]): string {
	const imports = metas
		.map(
			m =>
				`import { ${tsPascalClass(m.source.clientId)}, type ${tsPascalClass(m.source.clientId)}Config } from './${m.source.clientId}/Client'`,
		)
		.join('\n')

	const configFields = metas.map(m => `\t${tsPropertyIdent(m.source.clientId)}: ${tsPascalClass(m.source.clientId)}Config`).join('\n')

	const fields = metas.map(m => `\treadonly ${tsPropertyIdent(m.source.clientId)}: ${tsPascalClass(m.source.clientId)}`).join('\n')

	const inits = metas
		.map(
			m =>
				`\t\tthis.${tsPropertyIdent(m.source.clientId)} = ${tsPascalClass(m.source.clientId)}.create(config.${tsPropertyIdent(m.source.clientId)})`,
		)
		.join('\n')

	return `// AUTO-GENERATED — do not edit.
${imports}

export interface ClientConfig {
${configFields}
}

export class Client {
${fields}

	private constructor(config: ClientConfig) {
${inits}
	}

	static create(config: ClientConfig): Client {
		return new Client(config)
	}
}
`
}
