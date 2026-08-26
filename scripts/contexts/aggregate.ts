/**
 * O AGREGADOR (DC2/T1.3) — lê os `src/<ctx>/context.ts` e emite os dois derivados.
 *
 * ── o que mudou de fonte ─────────────────────────────────────────────────────────────────────────
 * Antes, a identidade de um contexto vivia espalhada por cinco arquivos CENTRAIS que cresciam a cada
 * contexto novo: `shared/contexts.ts` (namespace), `shared/context-map.ts` (arestas + ambient),
 * `manifest.ts` (o descritor), mais o `<ctx>/index.ts` de cada um. Acrescentar um contexto tocava
 * todos eles, e nenhum era conferido pelo compilador contra os outros.
 *
 * Agora a fonte é o `context.ts` de cada contexto, e **a pasta é o spine**: um diretório com
 * `context.ts` É um contexto. Não há lista central para esquecer de editar — esquecer o arquivo
 * significa que o contexto não existe, que é a única forma de esquecimento que se percebe.
 *
 * ── por que DOIS arquivos e não um ───────────────────────────────────────────────────────────────
 * Peso diferente. `contexts.generated.ts` é DADO INERTE: importa só tipos, e é isso que deixa um
 * rail ler o mapa de acoplamento sem instanciar container nem arrastar tsyringe.
 * `composition.generated.ts` é RUNTIME: importa os barris de todo contexto. Fundir os dois obrigaria
 * todo rail a pagar o segundo.
 *
 * ── o que este gerador NÃO faz, e por quê ────────────────────────────────────────────────────────
 * Não emite `middlewares`. Quatro contextos têm `middlewares/index.ts` no disco e NENHUM os declara
 * no descritor hoje — ligá-los porque o arquivo existe mudaria comportamento em silêncio, sob o
 * disfarce de "derivação". Derivar é escrever o que já é verdade, não decidir por conta própria.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ContextDecl } from '../../packages/contracts/src/contexts/decl'

const SRC = join(import.meta.dir, '../../packages/api/typescript/src')

/** Rank de boot a partir do `kind` — o kernel sobe o transporte que os outros consomem. */
const RANK: Record<ContextDecl['kind'], number> = { kernel: 0, domain: 1, bff: 2, edge: 3 }

export interface LoadedContext {
	readonly id: string
	readonly decl: ContextDecl
	/** namespace RESOLVIDO: `null` não persiste · declarado quando difere · a chave quando omitido. */
	readonly namespace: string | null
}

/**
 * A DESCOBERTA — a pasta é o spine.
 *
 * Ordenada por id de propósito: a ordem de leitura do diretório é do sistema de arquivos, e um
 * derivado cuja forma depende de qual máquina rodou o gerador não é derivado, é sorteio.
 */
export async function loadContexts(): Promise<LoadedContext[]> {
	const ids = readdirSync(SRC, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && existsSync(join(SRC, entry.name, 'context.ts')))
		.map(entry => entry.name)
		.sort()

	const loaded: LoadedContext[] = []
	for (const id of ids) {
		const module = (await import(join(SRC, id, 'context.ts'))) as { default: ContextDecl }
		const decl = module.default
		loaded.push({ id, decl, namespace: decl.namespace === null ? null : (decl.namespace ?? id) })
	}
	return loaded
}

/** A ordem de boot, DERIVADA: rank de `kind`, desempate alfabético. */
export const bootOrder = (contexts: readonly LoadedContext[]): string[] =>
	[...contexts].sort((a, b) => RANK[a.decl.kind] - RANK[b.decl.kind] || a.id.localeCompare(b.id)).map(c => c.id)

const lit = (value: string): string => JSON.stringify(value)

/** ─────────────────────────────── contexts.generated.ts ─────────────────────────────── */

export function renderContexts(contexts: readonly LoadedContext[]): string {
	const identity = contexts.map(
		c => `\t${c.id}: { kind: ${lit(c.decl.kind)}, namespace: ${c.namespace === null ? 'null' : lit(c.namespace)} },`,
	)

	const map = contexts
		.filter(c => c.decl.consumes !== undefined && Object.keys(c.decl.consumes).length > 0)
		.map(c => {
			const edges = Object.entries(c.decl.consumes ?? {}).map(([target, note]) => `\t\t${target}: { note: ${lit(String(note))} },`)
			return `\t${c.id}: {\n${edges.join('\n')}\n\t},`
		})

	const reads = contexts.flatMap(c =>
		Object.entries(c.decl.reads ?? {}).map(
			([namespace, note]) => `\t{ consumer: ${lit(c.id)}, schema: ${lit(namespace)}, note: ${lit(String(note))} },`,
		),
	)

	// `kind: 'kernel'` IMPLICA `'*'` — quem é kernel não declara ambient, e é aqui que a implicação
	// vira dado. Declarar os dois seria a segunda cópia da mesma decisão.
	const ambient = contexts
		.filter(c => c.decl.kind === 'kernel' || c.decl.ambient !== undefined)
		.map(c => `\t${c.id}: ${c.decl.kind === 'kernel' ? "'*'" : `[${(c.decl.ambient ?? []).map(lit).join(', ')}]`},`)

	// Os givens que cada contexto contribui ao catálogo do harness (F3/T5). Emitido como MAPA e não
	// como lista achatada de propósito: é a chave que o stamp usa para podar — ao remover um
	// contexto, os givens dele saem junto, sem ninguém manter uma segunda lista em paralelo.
	const givens = contexts
		.filter(c => c.decl.givens !== undefined && c.decl.givens.length > 0)
		.map(c => `\t${c.id}: [${(c.decl.givens ?? []).map(lit).join(', ')}],`)

	// A ALOCAÇÃO de cada contexto — onde ele monta e com que infra. Emitida como MAPA pela mesma
	// razão que os givens: é a chave que o stamp usa para podar. A tabela `PLACEMENT` central que isto
	// substitui era `satisfies Record<ContextId, …>`, e o falseador dela ("contexto novo quebra o tsc
	// até alguém dizer onde mora") não se perdeu — mudou para o alias do produto, `src/context.ts`,
	// onde `placement` é OBRIGATÓRIO. Aqui a serialização é literal e sem interpretação: o gerador
	// não sabe o que é um `deployment` nem um `db`, só copia o que o contexto declarou.
	// As CONSTANTES do catálogo, separadas dos `givens` porque a forma importa a quem escreve o
	// `testing.d.ts` à mão (`export const X: string` vs `export function x(…)`).
	const constants = contexts
		.filter(c => c.decl.constants !== undefined && c.decl.constants.length > 0)
		.map(c => `\t${c.id}: [${(c.decl.constants ?? []).map(lit).join(', ')}],`)

	const placement = contexts
		.filter(c => c.decl.placement !== undefined)
		.map(
			c =>
				`\t${c.id}: ${JSON.stringify(c.decl.placement)
					.replace(/"([^"]+)":/g, '$1: ')
					.replace(/"/g, "'")},`,
		)

	return `// GERADO por \`bun contexts:sync\` a partir dos \`src/<ctx>/context.ts\` — NÃO EDITE.
// O gate é \`bun contexts:check\`.
//
// DADO INERTE: só tipos são importados, então um rail lê o mapa de acoplamento sem instanciar
// container nem arrastar tsyringe. O gêmeo de runtime é \`composition.generated.ts\`.
import type { ContextId } from '@codm/contracts/context-ids'

/** Identidade de cada contexto: o que ele É, e qual namespace lógico possui (\`null\` = não persiste). */
export const CONTEXTS = {
${identity.join('\n')}
} as const

/** Acoplamento de MÓDULO — quem importa quem. Montado dos \`consumes\`. */
export const CONTEXT_MAP: Partial<Record<ContextId, Partial<Record<ContextId, { note: string }>>>> = {
${map.join('\n')}
}

/** Acoplamento de TABELA — quem lê o namespace de quem. Montado dos \`reads\`.
 *  Canal DIFERENTE do de cima, e de propósito: o \`CONTEXT_MAP\` é estruturalmente cego a ele. */
export const TABLE_READ_EDGES: readonly { consumer: ContextId; schema: string; note: string }[] = [
${reads.join('\n')}
]

/** Superfícies importáveis sem aresta declarada. \`kind: 'kernel'\` implica \`'*'\`. */
export const AMBIENT: Partial<Record<ContextId, readonly string[] | '*'>> = {
${ambient.join('\n')}
}

/** Os helpers \`given*\` de cada contexto — a superfície do harness de teste, DECLARADA por quem a
 *  possui. É o que deixa o stamp podar os givens de um contexto removido sem manter lista paralela;
 *  antes, os mesmos nomes viviam à mão em quatro lugares e nenhum sabia de quem eram. */
export const CONTEXT_GIVENS: Partial<Record<ContextId, readonly string[]>> = {
${givens.join('\n')}
}

/** As CONSTANTES do catálogo de teste — mesma superfície que \`CONTEXT_GIVENS\`, forma diferente.
 *  Quem monta o catálogo junta as duas; quem EMITE tipos precisa saber qual é qual. */
export const CONTEXT_CONSTANTS: Partial<Record<ContextId, readonly string[]>> = {
${constants.join('\n')}
}

/** ONDE cada contexto monta, e com que infra — DERIVADO dos \`placement\` de cada \`context.ts\`.
 *  Substitui a tabela \`PLACEMENT\` que vivia em \`shared/deployment.ts\`: uma lista central de
 *  decisões POR CONTEXTO é a forma que a DC2 já eliminou para \`consumes\`/\`reads\`/\`ambient\`, e
 *  tinha o mesmo defeito — o stamp, ao podar um contexto, não tinha como podar a linha dele. */
export const CONTEXT_PLACEMENT = {
${placement.join('\n')}
} as const

/** A ordem de boot, DERIVADA do \`kind\`: kernel → domain → bff → edge, desempate alfabético.
 *  O kernel vem primeiro porque é ele quem aplica os registries no container raiz e sobe o
 *  transporte que os demais consomem — e o LIFO do shutdown cai de graça, invertendo isto. */
export const BOOT_ORDER = [${bootOrder(contexts).map(lit).join(', ')}] as const
`
}

/** ─────────────────────────────── composition.generated.ts ─────────────────────────────── */

/** Um barril opcional: campo do descritor → arquivo que o fornece. Detectado, nunca listado. */
const BARRELS = [
	{ field: 'internalHandlers', file: 'handlers/internal.ts', path: 'handlers/internal' },
	{ field: 'externalHandlers', file: 'handlers/external.ts', path: 'handlers/external' },
	{ field: 'commandHandlers', file: 'handlers/commands.ts', path: 'handlers/commands' },
	{ field: 'projectors', file: 'projections/projectors/index.ts', path: 'projections/projectors' },
] as const

/** Os nomes exportados por um barril, lidos do TEXTO — importar arrastaria o runtime inteiro. */
const exportedNames = (file: string): string[] =>
	[...readFileSync(file, 'utf8').matchAll(/export\s*\{([^}]+)\}\s*from/g)].flatMap(match =>
		(match[1] ?? '')
			.split(',')
			.map(s => s.trim())
			.map(s => (s.includes(' as ') ? (s.split(' as ')[1] ?? '').trim() : s))
			.filter(Boolean),
	)

const hasExport = (file: string, name: string): boolean =>
	existsSync(file) && new RegExp(`export\\s+(const|async\\s+function|function)\\s+${name}\\b`).test(readFileSync(file, 'utf8'))

export function renderComposition(contexts: readonly LoadedContext[]): string {
	const imports: string[] = []
	const entries: string[] = []

	for (const { id, decl } of contexts) {
		const dir = join(SRC, id)
		const fields: string[] = [`\t\tname: ${lit(id)},`]

		// `root` é DERIVADO de `kind: 'kernel'` — ninguém mais o declara (T1.6).
		if (decl.kind === 'kernel') fields.push('\t\troot: true,')

		imports.push(`import ${id}Controllers from '@${id}/controllers'`)
		fields.push(`\t\tcontrollers: ${id}Controllers,`)

		for (const barrel of BARRELS) {
			if (!existsSync(join(dir, barrel.file))) continue
			const alias = `${id}${barrel.field[0]?.toUpperCase()}${barrel.field.slice(1)}`
			imports.push(`import * as ${alias} from '@${id}/${barrel.path}'`)
			fields.push(`\t\t${barrel.field}: ${alias},`)
		}

		if (existsSync(join(dir, 'jobs.ts'))) {
			const names = exportedNames(join(dir, 'jobs.ts'))
			imports.push(`import { ${names.join(', ')} } from '@${id}/jobs'`)
			fields.push(`\t\tjobs: [${names.map(name => `{ handler: ${name} }`).join(', ')}],`)
		}

		imports.push(`import { INSTANCE_REGISTRY as ${id}Registry } from '@${id}/registry'`)
		fields.push(`\t\tregistry: ${id}Registry,`)

		if (hasExport(join(dir, 'registry.ts'), 'INFRA_MODULES')) {
			imports.push(`import { INFRA_MODULES as ${id}Infra } from '@${id}/registry'`)
			fields.push(`\t\tinfra: ${id}Infra,`)
		}

		for (const hook of ['setup', 'start', 'shutdown'] as const) {
			if (!hasExport(join(dir, 'lifecycle.ts'), hook)) continue
			const alias = `${id}${hook[0]?.toUpperCase()}${hook.slice(1)}`
			imports.push(`import { ${hook} as ${alias} } from '@${id}/lifecycle'`)
			fields.push(`\t\t${hook}: ${alias},`)
		}

		entries.push(`\t${id}: {\n${fields.join('\n')}\n\t},`)
	}

	// O VOCABULÁRIO PÚBLICO da spec, montado dos `exposes` de cada contexto. Substitui
	// `src/openapi.ts`, que agregava quatro contextos à mão e por isso era, ele próprio, uma raiz de
	// composição escrita fora do gerador. Quem publica o quê passa a ser uma declaração do contexto,
	// verificável no diff dele, em vez de uma linha num arquivo que fala de todos.
	const enumBarrels = contexts.filter(c => c.decl.exposes?.enums).map(c => c.id)
	const objectBarrels = contexts.filter(c => c.decl.exposes?.objects).map(c => c.id)
	for (const id of enumBarrels) imports.push(`import * as ${id}Enums from '@${id}/enums'`)
	for (const id of objectBarrels) imports.push(`import * as ${id}Objects from '@${id}/objects'`)

	return `// GERADO por \`bun contexts:sync\` a partir dos \`src/<ctx>/context.ts\` — NÃO EDITE.
// O gate é \`bun contexts:check\`.
//
// RUNTIME: importa os barris de todo contexto. O gêmeo inerte é \`contexts.generated.ts\`, e a
// separação existe para um rail não pagar o tsyringe só para ler o mapa de acoplamento.
//
// \`satisfies Record<ContextId, ContextDescriptor>\` é o ponto inteiro do arquivo, e continua sendo:
// um contexto a mais ou a menos é ERRO DE COMPILAÇÃO. O que mudou é quem escreve a lista.
import type { ContextId } from '@codm/contracts/context-ids'
import type { ContextDescriptor } from '@shared/descriptor'
import { openapi } from '@codm/core-typescript'
import * as wireEnums from '@codm/contracts-typescript/wire/enums'
${imports.join('\n')}

export const MANIFEST = {
${entries.join('\n')}
} satisfies Record<ContextId, ContextDescriptor>

/**
 * O VOCABULÁRIO NOMEADO da spec — enums e value objects registrados como componentes reutilizáveis.
 *
 * DERIVADO dos \`exposes\` de cada \`context.ts\`. Antes vivia em \`src/openapi.ts\`, que importava de
 * quatro contextos e era por isso uma raiz de composição mantida à mão: acrescentar um contexto ao
 * vocabulário significava editar um arquivo que fala de todos, e PODAR um contexto deixava a linha
 * dele órfã — o mesmo defeito que moveu \`givens\` e \`PLACEMENT\` para os contextos.
 *
 * Chamado ANTES do guard de emissão: a emissão (\`EMIT_OPENAPI=true\`) é justamente quem mais precisa
 * destes nomes. O guard existe para não ABRIR INFRA durante a emissão, nunca para pular o registro.
 *
 * Sem isto, componentes de enum ganham nomes gerados como \`ReactionType2\` quando o fallback por
 * caminho colide com um irmão (cc-bp-13).
 */
export function registerOpenApiVocabulary(): void {
	openapi.registerEnums({ ...wireEnums${enumBarrels.map(id => `, ...${id}Enums`).join('')} })
	openapi.registerSchemas({ ${objectBarrels.map(id => `...${id}Objects`).join(', ')} })
}
`
}

/**
 * O TERCEIRO DERIVADO — `registries.generated.ts`, o mapa de registries por contexto (F2).
 *
 * ── POR QUE UM ARQUIVO PRÓPRIO, e não um dos dois que já existem ─────────────────────────────────
 * Não em `contexts.generated.ts`: aquele é INERTE por contrato — zero módulos de runtime
 * alcançáveis, só `import type`. `CONTEXT_REGISTRIES` é valor de runtime, e pô-lo ali destruiria a
 * única propriedade que aquele arquivo tem (um rail lê o mapa de acoplamento sem pagar o tsyringe).
 *
 * Não em `composition.generated.ts`, apesar de ele já importar os 10 registries. Medido: 428 módulos
 * de runtime alcançáveis contra 343 de um arquivo que importe só os `registry.ts`. E o delta de 85
 * não é peso, é RISCO: inclui `shared/controllers/index.ts` e `agent/controllers/index.ts`, que
 * avaliam `byEnvironment(...)` e `Config.env.EMIT_OPENAPI` no ESCOPO DE MÓDULO — é por isso que
 * `server.ts` importa a composição com `await import()`, depois do `setBoundedContextEnvironment`.
 * O `TestBed.ts` é import ESTÁTICO de quase toda a suíte: rotear o `ALL_REGISTRIES` por ali
 * congelaria a coluna de ambiente no load do módulo de teste, em silêncio.
 *
 * ── A ORDEM É SEMÂNTICA ──────────────────────────────────────────────────────────────────────────
 * Emitido em `BOOT_ORDER`, não alfabético. O merge abaixo depende da ordem de inserção — o
 * comentário que ele herda diz "shared (core) first so context bindings may override kernel
 * defaults" — e o único token declarado em mais de um contexto é `HEALTH_CHECKS` (`shared` +
 * `agent`), que é multi-inject. Alfabético inverteria a ordem dos checks no `/health`.
 */
export function renderRegistries(contexts: readonly LoadedContext[]): string {
	const ordered = bootOrder(contexts)
	const imports = ordered.map(id => `import { INSTANCE_REGISTRY as ${id}Registry } from '@${id}/registry'`)
	const entries = ordered.map(id => `\t${id}: ${id}Registry,`)

	return `// GERADO por \`bun contexts:sync\` a partir dos \`src/<ctx>/context.ts\` — NÃO EDITE.
// O gate é \`bun contexts:check\`.
//
// O mapa de registries por contexto, e o merge que o boot e o TestBed consomem. Escrito à mão até a
// F2, onde o \`satisfies Record<ContextId, InstanceRegistry>\` já garantia a COBERTURA (um contexto
// faltando era erro de compilação) mas não o PAREAMENTO: \`auth: billingRegistry\` compilava limpo.
// Aqui a chave, o alias e o especificador de módulo interpolam o MESMO binding na mesma iteração —
// o defeito deixou de poder existir, em vez de ser detectado.
//
// A ordem é BOOT_ORDER e é semântica: o merge abaixo é por ordem de inserção, e \`shared\` (o kernel)
// vem primeiro para que bindings de contexto possam sobrescrever defaults do kernel.
import type { ContextId } from '@codm/contracts/context-ids'
import type { InstanceRegistry } from '@codm/core-typescript'
${imports.join('\n')}

export const CONTEXT_REGISTRIES = {
${entries.join('\n')}
} satisfies Record<ContextId, InstanceRegistry>

const merge = (env: keyof InstanceRegistry) => Object.values(CONTEXT_REGISTRIES).flatMap(registry => registry[env])

export const ALL_REGISTRIES: InstanceRegistry = {
	mock: merge('mock'),
	integration: merge('integration'),
	real: merge('real'),
	e2e: merge('e2e'),
}
`
}
