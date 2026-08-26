/**
 * O LAÇO DE COMPOSIÇÃO — monta os contextos que a tabela de alocação disser, sob os critérios
 * deste processo, e devolve os routers na ordem em que foram montados.
 *
 * Substitui duas coisas ao mesmo tempo:
 *
 *   1. o efeito colateral de import (`routers.ts` importava dez `<ctx>/index.ts` e cada um chamava
 *      `await BoundedContext.create` no topo do módulo), e
 *   2. o FILTRO (`filterRoutersForCloudProfile`), que existia PORQUE não havia composição: sem
 *      poder escolher o que montar, o perfil da nuvem montava os dez e escondia sete depois.
 *
 * "Não montado" e "não carregado" passam a ser a mesma coisa, que é o que torna o filtro
 * desnecessário em vez de apenas redundante.
 *
 * Vive em `src/` raiz pela mesma razão que o manifesto: importa a raiz de composição e não pertence
 * a contexto nenhum.
 */
import { BoundedContext, type BoundedContextEnvironment, type InstanceRegistry, registerAll, type Router } from '@codm/core-typescript'
import { container as rootContainer } from 'tsyringe-neo'
import type { ContextId } from '@codm/contracts/context-ids'
import { BOOT_ORDER } from '@generated/contexts.generated'
import { registerOpenApiVocabulary } from '@generated/composition.generated'
import type { ContextDescriptor } from '@shared/descriptor'
import type { Criteria } from '@codm/contracts/placement'
import { keysOf } from '@codm/core-typescript'
import { mountedContexts, placementFor } from '@shared/deployment'

/**
 * A AMARRA BIDIRECIONAL (decisão 12). A tabela diz qual família cada contexto usa; o descritor diz
 * quais bindings cada família traz. As duas metades têm de concordar, e discordar LANÇA no boot —
 * nunca cai em default silencioso, que faria um deployment montar com o banco errado achando que
 * estava certo.
 *
 * Duas direções são verificadas hoje:
 *
 *   descritor declara o eixo, o plano não escolhe (ou escolhe `none`)
 *       → o contexto traz bindings de família que ninguém pediu
 *   o plano escolhe a família F, o descritor declara o eixo mas não tem módulo para F
 *       → a composição não tem o que resolver
 *
 * A TERCEIRA direção — o plano escolhe uma família e o descritor não declara eixo nenhum — chegou o
 * dia dela (2026-08-14, família `pg`), e a resposta NÃO é "todo contexto passa a declarar `infra`".
 *
 * Medido: só o contexto RAIZ liga driver, repositório de eventos, outbox, idempotência e fila. Os
 * outros usam o que a raiz ligou. Um contexto como `auth` diz `db: 'pg'` no sentido de *"minhas
 * tabelas moram no Postgres"*, não de *"eu trago os bindings do Postgres"* — e obrigá-lo a declarar
 * `infra` produziria uma segunda cópia dos mesmos módulos em cada descritor, que é exatamente o
 * oposto do que este desenho quer.
 *
 * A checagem que a terceira direção vira, então, é DE COMPOSIÇÃO e não por contexto:
 * `assertFamiliesProvided` — toda família que a tabela escolher sob estes critérios TEM de ser
 * fornecida por ALGUÉM que monta. É isso que impede o `db: 'pg'` de ser decorativo.
 */
export function assertInfraAgreement(context: ContextId, descriptor: ContextDescriptor, criteria: Criteria): void {
	const placement = placementFor(context, criteria)
	if (placement === undefined) return

	for (const axis of keysOf(descriptor.infra ?? {})) {
		const chosen = placement.infra[axis]
		if (chosen === 'none') {
			throw new Error(
				`${context}: declara o eixo '${String(axis)}' mas a tabela de alocação escolheu 'none' para ele sob ` +
					`${JSON.stringify(criteria)} — bindings de família que ninguém pediu. Ou o eixo sai do descritor, ou a ` +
					`tabela escolhe uma família.`,
			)
		}
		const modules = descriptor.infra?.[axis]
		if (modules?.[chosen] === undefined) {
			throw new Error(
				`${context}: a tabela escolheu '${String(chosen)}' para o eixo '${String(axis)}' sob ${JSON.stringify(criteria)}, ` +
					`e o descritor não tem módulo para essa família. A composição não tem o que resolver.`,
			)
		}
	}
}

/**
 * TODA família escolhida pela tabela sob estes critérios é FORNECIDA por algum contexto que monta.
 *
 * É a terceira direção da amarra, na forma que a medição justifica (ver o docblock acima). Sem ela,
 * `db: 'pg'` na `PLACEMENT` seria uma frase sobre um mundo que ninguém constrói: a composição subiria
 * com os bindings da outra família, ou sem binding nenhum, e o defeito apareceria três camadas
 * adiante como "token não registrado" no primeiro `resolve`.
 *
 * Lança no BOOT, com o eixo, a família e os critérios nomeados — porque a alternativa é descobrir em
 * produção.
 */
export function assertFamiliesProvided(manifest: Record<ContextId, ContextDescriptor>, criteria: Criteria): void {
	const mounted = mountedContexts(criteria)

	for (const context of mounted) {
		const placement = placementFor(context, criteria)
		if (placement === undefined) continue

		for (const axis of keysOf(placement.infra)) {
			const chosen = placement.infra[axis]
			if (chosen === 'none') continue

			const provided = mounted.some(other => manifest[other].infra?.[axis]?.[chosen] !== undefined)
			if (!provided) {
				throw new Error(
					`${context}: a tabela escolheu '${String(chosen)}' para o eixo '${String(axis)}' sob ${JSON.stringify(criteria)}, ` +
						`e NENHUM contexto montado fornece o módulo dessa família. A escolha é decorativa — a composição subiria ` +
						`sem os bindings, e o defeito apareceria três camadas adiante como token não registrado.`,
				)
			}
		}
	}
}

/** Concatena por ambiente. O módulo da família entra DEPOIS, então pode sobrepor um default do kernel. */
const mergeRegistries = (base: InstanceRegistry | undefined, module: InstanceRegistry): InstanceRegistry => ({
	mock: [...(base?.mock ?? []), ...module.mock],
	integration: [...(base?.integration ?? []), ...module.integration],
	real: [...(base?.real ?? []), ...module.real],
	e2e: [...(base?.e2e ?? []), ...module.e2e],
})

/**
 * Os módulos de família que os critérios escolhem, achatados num registry só.
 *
 * ── por que isto existe SEPARADO do laço de composição ───────────────────────────────────────────
 * Porque INFRA PRECEDE COMPOSIÇÃO, e a ordem não é preferência — é medida. Montar um contexto pode
 * ESCREVER no banco: `BoundedContext.create` chama `registerJobs`, que enfileira os jobs repetíveis
 * em `shared_scheduled_commands`. Se as migrações rodassem depois da composição, o primeiro contexto
 * com `jobs` morreria com *no such table* — foi exatamente o que aconteceu quando tentei essa ordem.
 *
 * Depois do ADR 0007 esta é a ÚNICA aplicação dos módulos de família: o laço de composição não
 * registra mais nada. Antes havia uma segunda, por contexto, dentro do `create` — e era justamente
 * essa segunda passada que descartava a instância do driver já cacheada pela migração.
 */
export function infraRegistryFor(manifest: Record<ContextId, ContextDescriptor>, criteria: Criteria): InstanceRegistry {
	let merged: InstanceRegistry = { mock: [], integration: [], real: [], e2e: [] }

	for (const context of mountedContexts(criteria)) {
		const placement = placementFor(context, criteria)
		const modules = manifest[context].infra
		if (placement === undefined || modules === undefined) continue

		for (const axis of keysOf(modules)) {
			const chosen = placement.infra[axis]
			if (chosen === 'none') continue
			const module = modules[axis]?.[chosen]
			if (module !== undefined) merged = mergeRegistries(merged, module)
		}
	}

	return merged
}

/**
 * A ORDEM DE MONTAGEM, derivada do `kind` (T1.6) — kernel → domain → bff → edge.
 *
 * Isto era `rootFirst`, um comparador que lia `descriptor.root`. A substituição não é cosmética: o
 * `root` era um booleano que respondia UMA pergunta ("este é o primeiro?"), e a ordem real tem
 * quatro camadas. O kernel sobe o transporte que os outros consomem; o BFF lê os contextos de
 * domínio; a borda é a porta para fora. Com `kind`, a ordem é consequência do que cada contexto É,
 * e ninguém precisa declarar posição — o `root: true` que sobra no descritor é EMITIDO pelo gerador
 * a partir de `kind: 'kernel'`, não escrito por um autor.
 *
 * `BOOT_ORDER` já vem ordenado e cobre todos os contextos; filtrar por ele ORDENA e SELECIONA de uma
 * vez, sem comparador. E o LIFO do `shutdownAll` cai de graça invertendo isto: quem sobe o
 * transporte é o último a devolvê-lo.
 */
const inBootOrder = (mounted: readonly ContextId[]): ContextId[] => BOOT_ORDER.filter(id => mounted.includes(id))

/**
 * FASE A — liga TODOS os bindings, e não monta nada (ADR 0007).
 *
 * Separada de `composeContexts` por uma razão de ORDEM que o boot impõe: a migração precisa rodar
 * entre as duas fases. Ela resolve o driver (e portanto CACHEIA a instância), e enquanto o registro
 * acontecia contexto a contexto durante a montagem, esse cache era descartado logo em seguida — era
 * daí que vinha o pin do driver. Com tudo ligado ANTES da migração, nada re-registra depois, e o
 * pin deixou de ter função.
 *
 * Aplica os módulos de FAMÍLIA primeiro e os registries de contexto depois, que é a mesma precedência
 * de antes: o módulo da família entra no registry do contexto que o declara, então vir antes o deixa
 * ser sobreposto por quem o declara — e é `shared` quem declara.
 */
export function bindContexts(manifest: Record<ContextId, ContextDescriptor>, criteria: Criteria, env: BoundedContextEnvironment): void {
	assertFamiliesProvided(manifest, criteria)

	const mounted = inBootOrder(mountedContexts(criteria))
	for (const context of mounted) assertInfraAgreement(context, manifest[context], criteria)

	registerAll(rootContainer, infraRegistryFor(manifest, criteria)[env])
	BoundedContext.bindAll(mounted.map(context => manifest[context]))
}

/**
 * FASE B — monta, na ordem, os contextos que os critérios selecionam. Cada `BoundedContext.create`
 * só acontece AQUI, e nenhum deles registra binding: quem liga é o `bindContexts` acima.
 */
export async function composeContexts(
	manifest: Record<ContextId, ContextDescriptor>,
	criteria: Criteria,
): Promise<{ mounted: ContextId[]; routers: Router[]; contexts: BoundedContext[] }> {
	// O VOCABULÁRIO NOMEADO, antes de montar qualquer contexto — os componentes de enum e os value
	// objects compartilhados precisam existir com nome antes de o primeiro controller ser lido. Morava
	// no `setup` do `shared`; subiu para cá na DC2 porque agrega TODO contexto (ver `openapi.ts`).
	registerOpenApiVocabulary()

	const mounted = inBootOrder(mountedContexts(criteria))
	const routers: Router[] = []
	// ADITIVO (DC0 T3): `contexts` existe porque `BoundedContext.shutdownAll` precisa das
	// INSTÂNCIAS, não dos routers. Antes desta linha a composição criava cada contexto e descartava
	// tudo menos `.router` — e a devolução do que cada um adquire tinha de morar na raiz, sabendo o
	// que cada contexto ligou. A ORDEM aqui é a de composição, e é ela que o LIFO do `shutdownAll`
	// inverte: quem nasce primeiro (a raiz, que sobe a infra) morre por último.
	const contexts: BoundedContext[] = []

	for (const context of mounted) {
		// SEM `withInfraModules` (ADR 0007). Ele existia para injetar o módulo da família no `registry`
		// do descritor pouco antes de o `create` registrá-lo — e `create` não registra mais. O mesmo
		// conjunto de bindings entra agora pelo `infraRegistryFor` da fase A, que cobre exatamente os
		// mesmos eixos dos mesmos contextos montados. Duas passagens pelo mesmo conjunto viraram uma.
		const ctx = await BoundedContext.create(manifest[context])
		routers.push(ctx.router)
		contexts.push(ctx)
	}

	return { mounted, routers, contexts }
}
