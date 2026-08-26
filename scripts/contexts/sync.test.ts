// O gate do gerador de contextos (DC1 + DC2 + DC4-T1.7).
//
// A testemunha que importa é a PROVA DIFF-ZERO: o gerador reproduz o que está em disco, byte a byte,
// para os QUATRO derivados. É a condição que o goal exige antes de um derivado virar fonte — se o
// gerador não consegue reproduzir o estado atual, ele não é o gerador daquele estado.
//
// Tudo compara contra a saída FORMATADA, nunca contra o render cru: a saída passa pelo biome antes
// de ir a disco. Sem isso, o `--write` do lint-staged reformatava os arquivos no pre-commit e o
// diff-zero ficava vermelho em TODO commit — medido, não suposto.
import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NAMESPACES, foreignNamespaces } from '../../packages/contracts/src/contexts/namespaces'
import { bootOrder, loadContexts, renderComposition, renderContexts, renderRegistries } from './aggregate'
import { contextIds, formatted, renderIds, renderIdsFormatted } from './sync'

const API_SRC = join(import.meta.dir, '../../packages/api/typescript/src')
/** Os derivados saíram de `src/` (passo 5): `src/` volta a ser só `index.ts`, `context.ts` e os
 *  contextos, e um agregado gerado não é nenhuma dessas coisas. */
const API_GENERATED = join(import.meta.dir, '../../packages/api/typescript/generated')
const IDS_OUT = join(import.meta.dir, '../../packages/contracts/src/contexts/context-ids.generated.ts')
const CONTEXTS_OUT = join(API_GENERATED, 'contexts.generated.ts')
const COMPOSITION_OUT = join(API_GENERATED, 'composition.generated.ts')
const REGISTRIES_OUT = join(API_GENERATED, 'registries.generated.ts')

const contexts = await loadContexts()

describe('contexts:sync — o gerador dos derivados', () => {
	it('CTX-01: PROVA DIFF-ZERO — os QUATRO derivados batem byte a byte com o disco', async () => {
		expect(await renderIdsFormatted(contextIds(contexts)), 'as uniões').toBe(readFileSync(IDS_OUT, 'utf8'))
		expect(await formatted(renderContexts(contexts), 'contexts.generated.ts'), 'o dado inerte').toBe(readFileSync(CONTEXTS_OUT, 'utf8'))
		expect(await formatted(renderComposition(contexts), 'composition.generated.ts'), 'a composição').toBe(
			readFileSync(COMPOSITION_OUT, 'utf8'),
		)
		expect(await formatted(renderRegistries(contexts), 'registries.generated.ts'), 'os registries').toBe(
			readFileSync(REGISTRIES_OUT, 'utf8'),
		)
	})

	it('CTX-06: O PAREAMENTO CHAVE↔REGISTRY NÃO PODE DIVERGIR — e é por isso que o rail saiu (F2)', () => {
		// A PROVA DE VACUIDADE que a aposentadoria do SCW-03/registry exige. O detector procurava um
		// pareamento trocado (`auth: billingRegistry`) — defeito real enquanto o mapa era escrito à
		// mão, porque o `satisfies` só confere COBERTURA, nunca o par.
		//
		// No gerador esse defeito deixou de PODER existir: a chave, o alias e o especificador de
		// módulo saem todos do MESMO binding `id`, na MESMA iteração. Este caso não testa que o
		// gerador acertou desta vez — testa que os três lados concordam para TODO contexto do repo,
		// que é a forma observável de "não há como divergir".
		const emitido = renderRegistries(contexts)
		for (const { id } of contexts) {
			expect(emitido, `${id}: o import`).toContain(`import { INSTANCE_REGISTRY as ${id}Registry } from '@${id}/registry'`)
			expect(emitido, `${id}: a chave sob o próprio alias`).toContain(`\t${id}: ${id}Registry,`)
		}
	})

	it('CTX-07: os registries saem em BOOT_ORDER, e a ordem é SEMÂNTICA', () => {
		// O merge é por ordem de inserção, e o comentário que ele herda diz "shared (core) first so
		// context bindings may override kernel defaults". O único token declarado em mais de um
		// contexto é `HEALTH_CHECKS` (shared + agent), que é multi-inject: alfabético inverteria a
		// ordem dos checks no /health.
		const emitido = renderRegistries(contexts)
		const posicoes = bootOrder(contexts).map(id => emitido.indexOf(`\t${id}: ${id}Registry,`))
		expect(
			posicoes.every(p => p >= 0),
			'todo contexto aparece',
		).toBe(true)
		expect(
			[...posicoes].sort((a, b) => a - b),
			'a ordem emitida é a de boot',
		).toEqual(posicoes)
	})

	it('CTX-02: A PASTA É O SPINE — todo contexto tem `context.ts`, e todo `context.ts` é um contexto', () => {
		// A garantia que substituiu a lista central. Não há onde esquecer de registrar um contexto: o
		// esquecimento possível é não criar o arquivo, e aí o contexto simplesmente não existe — que é
		// a única forma de esquecimento que se percebe no mesmo dia.
		expect(contexts.length, 'o repo tem contextos').toBeGreaterThan(0)
		for (const { id } of contexts) expect(existsSync(join(API_SRC, id, 'context.ts')), `${id} declara-se`).toBe(true)
	})

	it('CTX-03: o arquivo de ids não importa NADA — é o topo da pilha', async () => {
		const emitido = await renderIdsFormatted(contextIds(contexts))

		expect(emitido).not.toMatch(/^import /m)
		expect(emitido).not.toMatch(/^export \* from/m)
	})

	it('CTX-04: a união é LITERAL, não derivada de `keyof typeof` — senão a inferência é circular', async () => {
		// Olha a DECLARAÇÃO, não o arquivo: o docblock cita `keyof typeof CONTEXTS` de propósito, para
		// explicar por que NÃO usa isso. Asserção sobre o arquivo inteiro pegaria a prosa.
		const declaracao = (await renderIdsFormatted(contextIds(contexts))).split('export type ContextId =')[1] ?? ''

		expect(declaracao).not.toContain('keyof typeof')
		expect(declaracao).toContain("'shared'")
	})

	it('CTX-05: a saída é ESTÁVEL sob o formatador — formatar de novo não muda nada', async () => {
		const umaVez = await renderIdsFormatted(contextIds(contexts))

		expect(umaVez).not.toBe(renderIds(contextIds(contexts)))
		expect(await renderIdsFormatted(contextIds(contexts)), 'idempotente').toBe(umaVez)
	})
})

describe('o agregado — o que o gerador DERIVA das declarações', () => {
	it('AGG-01: a ORDEM DE BOOT sai do `kind` — kernel primeiro, borda por último', () => {
		const ordem = bootOrder(contexts)
		const kindOf = new Map<string, 'kernel' | 'domain' | 'bff' | 'edge'>(contexts.map(c => [c.id, c.decl.kind]))

		expect(kindOf.get(ordem[0] ?? ''), 'quem sobe o transporte vem primeiro').toBe('kernel')
		expect(ordem.length, 'a ordem cobre TODO contexto — nenhum fica de fora do boot').toBe(contexts.length)

		// A monotonia é a asserção de verdade: nenhum contexto de rank menor aparece depois de um maior.
		const RANK = { kernel: 0, domain: 1, bff: 2, edge: 3 } as const
		const ranks = ordem.map(id => RANK[kindOf.get(id) ?? 'domain'])
		expect(ranks, 'a ordem é monótona no rank do kind').toEqual([...ranks].sort((a, b) => a - b))
	})

	it('AGG-02: `kind: kernel` IMPLICA ambient `*` — a implicação vira dado, não segunda declaração', () => {
		const kernel = contexts.filter(c => c.decl.kind === 'kernel')
		const emitido = renderContexts(contexts)

		expect(kernel.length, 'existe exatamente um kernel').toBe(1)
		for (const c of kernel) {
			expect(c.decl.ambient, 'o kernel NÃO declara ambient — declarar seria a segunda cópia').toBeUndefined()
			expect(emitido, 'e mesmo assim o agregado emite `*` para ele').toContain(`${c.id}: '*',`)
		}
	})

	it('AGG-03: o namespace resolve por CONVENÇÃO, e `null` é diferente de omitido', () => {
		for (const { id, decl, namespace } of contexts) {
			if (decl.namespace === null) expect(namespace, `${id} não persiste`).toBeNull()
			else if (decl.namespace === undefined) expect(namespace, `${id} usa a convenção`).toBe(id)
			else expect(namespace, `${id} declara um namespace diferente da chave`).toBe(decl.namespace)
		}

		// O caso que separa id de namespace, e a razão de o campo existir.
		expect(contexts.find(c => c.id === 'auth')?.namespace).toBe('authentication')
		// E os que dizem `null` DE PROPÓSITO — dizer null é diferente de esquecer.
		expect(
			contexts
				.filter(c => c.namespace === null)
				.map(c => c.id)
				.sort(),
		).toEqual(['external', 'ui'])
	})

	it('AGG-04: as arestas do agregado são EXATAMENTE as declaradas — não inventa nem perde', async () => {
		// SEMÂNTICO, não textual. A primeira versão casava strings na saída, e quebrou assim que o
		// biome quebrou uma nota longa em duas linhas — um teste que falha por causa da largura da
		// coluna está medindo o formatador, não o gerador. Aqui o agregado é IMPORTADO e comparado
		// contra as declarações, que é a afirmação que interessa.
		const { CONTEXT_MAP, TABLE_READ_EDGES } = (await import('../../packages/api/typescript/generated/contexts.generated')) as {
			CONTEXT_MAP: Record<string, Record<string, { note: string }> | undefined>
			TABLE_READ_EDGES: readonly { consumer: string; schema: string; note: string }[]
		}

		const declaradas = contexts
			.flatMap(c => Object.entries(c.decl.consumes ?? {}).map(([alvo, nota]) => `${c.id}→${alvo}:${String(nota)}`))
			.sort()
		const agregadas = Object.entries(CONTEXT_MAP)
			.flatMap(([id, arestas]) => Object.entries(arestas ?? {}).map(([alvo, aresta]) => `${id}→${alvo}:${aresta.note}`))
			.sort()

		const lidasDeclaradas = contexts
			.flatMap(c => Object.entries(c.decl.reads ?? {}).map(([ns, nota]) => `${c.id}⇢${ns}:${String(nota)}`))
			.sort()
		const lidasAgregadas = TABLE_READ_EDGES.map(e => `${e.consumer}⇢${e.schema}:${e.note}`).sort()

		expect(declaradas.length, 'há arestas de módulo declaradas — senão o teste passaria vazio').toBeGreaterThan(0)
		expect(lidasDeclaradas.length, 'há leituras cross-namespace declaradas').toBeGreaterThan(0)
		expect(agregadas, 'o CONTEXT_MAP gerado tem de ser a soma exata dos `consumes`').toEqual(declaradas)
		expect(lidasAgregadas, 'o TABLE_READ_EDGES gerado tem de ser a soma exata dos `reads`').toEqual(lidasDeclaradas)
	})
})

describe('namespaces — a única lista que sobra', () => {
	it('NS-01: os namespaces DECLARADOS pelos contextos estão todos em `NAMESPACES`', () => {
		const declarados = contexts.flatMap(c => (c.namespace === null ? [] : [c.namespace])).sort()

		for (const ns of declarados) expect(Object.keys(NAMESPACES), `${ns} tem de ter dono declarado`).toContain(ns)
	})

	it('NS-02: e cada um aponta de volta para o contexto que o declara', () => {
		for (const { id, namespace } of contexts) {
			if (namespace === null) continue
			expect(String(NAMESPACES[namespace as keyof typeof NAMESPACES]?.owner), `dono de ${namespace}`).toBe(id)
		}
	})

	it('NS-03: os namespaces de dono NÃO-TS são DERIVADOS, não listados à parte', () => {
		// Isto substituiu um `readonly string[]` (`FOREIGN_PGSCHEMAS`) que não dizia QUEM era o dono.
		const foreign = foreignNamespaces(contexts.map(c => c.id)).map(String)

		expect(foreign.length, 'o Go possui pelo menos um namespace').toBeGreaterThan(0)
		for (const ns of foreign) expect(contexts.map(c => c.namespace)).not.toContain(ns)
	})

	it('NS-04: um contexto sem persistência não aparece — dizer `null` é diferente de esquecer', () => {
		const semPersistencia = contexts.filter(c => c.namespace === null).map(c => c.id)

		expect(semPersistencia.length, 'o repo tem contextos sem persistência hoje').toBeGreaterThan(0)
		for (const id of semPersistencia) expect(Object.keys(NAMESPACES)).not.toContain(id)
	})
})
