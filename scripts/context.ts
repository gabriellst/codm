#!/usr/bin/env bun
/**
 * `bun context show <ctx> [--json]` e `bun context map [--json]` — a INTROSPECÇÃO (T1.10).
 *
 * ── por que ela entra na MESMA entrega da derivação, e não depois ─────────────────────────────────
 * É a lição do backlash do Nx Project Crystal, e o plano a registra como decisão: quando uma
 * ferramenta passa a DERIVAR configuração que antes estava escrita à mão, quem mantém o repo perde
 * a capacidade de ler o estado com um editor. Derivação sem introspecção não é simplificação — é
 * uma troca de "verboso e legível" por "conciso e opaco", e a reclamação chega depois, quando já
 * não há como voltar atrás.
 *
 * ── o que ela responde, e por que continua valendo depois da co-locação ─────────────────────────
 * Quando ela foi escrita, "o que é o contexto `issue`?" exigia abrir CINCO arquivos —
 * `shared/contexts.ts` (namespace), `shared/deployment.ts` (onde monta e com qual família),
 * `manifest.ts` (o descritor), `shared/context-map.ts` (o que consome e o que lê) e o
 * `<ctx>/index.ts`. Essa dispersão ERA o problema que a reforma atacava.
 *
 * A DC2 co-locou a declaração em `<ctx>/context.ts`, e três daqueles arquivos deixaram de existir.
 * A ferramenta continua valendo, e por uma razão que a co-locação não resolve: a declaração diz o
 * que um contexto DECIDE sobre si mesmo, e não diz onde ele monta (isso é a `PLACEMENT`), nem quem
 * depende dele (isso é a aresta inversa, que nenhuma tabela declara). Reunir as três é o trabalho
 * que sobra para uma ferramenta de leitura.
 *
 * A troca de fonte mudou só as linhas de import aqui: a superfície do comando ficou igual, de
 * propósito. Uma ferramenta que muda de nome junto com a refatoração ensina duas coisas ao mesmo
 * tempo e não é aprendida nenhuma vez.
 *
 * ── ACHADO DE NOME, registrado e não resolvido por conta própria ──────────────────────────────────
 * `bun cli context <nome>` JÁ EXISTE e faz o oposto disto: ele GERA um contexto novo (scaffolding,
 * `generateFullContext`). Este comando aqui INSPECIONA um que existe. Os dois entry points não
 * colidem tecnicamente — um é `bun context`, o outro é `bun cli context` — mas o verbo fica
 * sobrecarregado, e este repo tem precedente explícito de recusar isso (o gate do gerador virou
 * `contexts:check` justamente porque `sync:check` já era o trem de forks).
 *
 * O nome `bun context show` foi DECIDIDO pelo plano (§4, T1.10), então é ele que está implementado.
 * A sobrecarga fica anotada aqui e no relatório em vez de ser resolvida por conta própria, porque
 * renomear um comando que o plano nomeia é decisão de quem escreveu o plano.
 */
import type { ContextId } from '../packages/contracts/src/contexts/context-ids.generated'
import { CONTEXT_MAP, CONTEXTS, TABLE_READ_EDGES } from '../packages/api/typescript/generated/contexts.generated'
import type { Deployment } from '../packages/contracts/src/contexts/placement'
import { PLACEMENT, placementFor } from '../packages/api/typescript/src/shared/deployment'
import { NAMESPACES } from '../packages/contracts/src/contexts/namespaces'

/** Os deployments que existem — derivado da tabela, nunca listado. */
const DEPLOYMENTS: readonly Deployment[] = ['cloud', 'local']

interface MountView {
	readonly deployment: Deployment
	readonly infra: Record<string, string>
}

interface ContextView {
	readonly id: string
	readonly namespace: string | null
	readonly namespaceOwner: string | null
	readonly mounts: readonly MountView[]
	readonly consumes: readonly { readonly context: string; readonly note: string }[]
	readonly consumedBy: readonly { readonly context: string; readonly note: string }[]
	readonly reads: readonly { readonly namespace: string; readonly note: string }[]
	readonly readBy: readonly { readonly context: string; readonly note: string }[]
}

/**
 * A visão de UM contexto, montada a partir das fontes que existem hoje.
 *
 * NÃO importa o `manifest.ts`. Importá-lo traria os dez `<ctx>/index.ts` juntos — inerte, medido
 * (742 ms, sem env nem container), mas é acoplamento que esta ferramenta não precisa ter: tudo que
 * ela mostra sai de tabelas puras. Uma ferramenta de leitura que exige carregar a aplicação para
 * descrevê-la é a mesma doença que o `manifest.ts` curou quando substituiu o `routers.ts`.
 */
export function viewOf(id: ContextId): ContextView {
	const namespace = CONTEXTS[id].namespace
	const owner = namespace === null ? null : (NAMESPACES[namespace as keyof typeof NAMESPACES]?.owner ?? null)

	const mounts = DEPLOYMENTS.flatMap(deployment => {
		const placement = placementFor(id, { deployment })
		return placement === undefined ? [] : [{ deployment, infra: { ...placement.infra } as Record<string, string> }]
	})

	const consumes = Object.entries(CONTEXT_MAP[id] ?? {}).map(([context, edge]) => ({ context, note: edge?.note ?? '' }))

	// A aresta INVERSA — quem depende de mim. Derivada, e é metade do valor da ferramenta: o custo de
	// mexer num contexto está nos consumidores dele, e essa direção nenhuma das tabelas declara.
	const consumedBy = Object.entries(CONTEXT_MAP)
		.filter(([, edges]) => edges !== undefined && id in edges)
		.map(([context, edges]) => ({ context, note: edges?.[id]?.note ?? '' }))

	const reads = TABLE_READ_EDGES.filter(edge => edge.consumer === id).map(edge => ({ namespace: edge.schema, note: edge.note }))

	const readBy =
		namespace === null
			? []
			: TABLE_READ_EDGES.filter(edge => edge.schema === namespace).map(edge => ({ context: edge.consumer, note: edge.note }))

	return { id, namespace, namespaceOwner: owner === null ? null : String(owner), mounts, consumes, consumedBy, reads, readBy }
}

/** `padEnd(14)` porque o rótulo mais longo é `tabelas lidas`, com 13 — a 12 ele encostava no corpo. */
const bullet = (label: string, body: string): string => `  ${label.padEnd(14)}${body}`

function renderShow(view: ContextView): string {
	const lines = [`${view.id} — bounded context`, '']

	lines.push(bullet('namespace', view.namespace === null ? 'nenhum (não persiste)' : `${view.namespace}  (dono: ${view.namespaceOwner})`))

	lines.push(
		bullet(
			'monta em',
			view.mounts.length === 0
				? 'NENHUM deployment'
				: view.mounts
						.map(
							m =>
								`${m.deployment} [${Object.entries(m.infra)
									.map(([axis, family]) => `${axis}=${family}`)
									.join(' ')}]`,
						)
						.join(' · '),
		),
	)

	const edges = (label: string, items: readonly { note: string }[], name: (item: never) => string): void => {
		if (items.length === 0) {
			lines.push(bullet(label, '—'))
			return
		}
		lines.push(bullet(label, ''))
		for (const item of items) lines.push(`    ${name(item as never)}  ${item.note}`)
	}

	edges('consome', view.consumes, (e: { context: string }) => `→ ${e.context}`)
	edges('consumido', view.consumedBy, (e: { context: string }) => `← ${e.context}`)
	edges('lê tabelas', view.reads, (e: { namespace: string }) => `→ ${e.namespace}`)
	edges('tabelas lidas', view.readBy, (e: { context: string }) => `← ${e.context}`)

	return lines.join('\n')
}

function renderMap(): string {
	const lines = ['mapa dos bounded contexts', '']

	for (const id of Object.keys(PLACEMENT) as ContextId[]) {
		const view = viewOf(id)
		const onde = view.mounts.map(m => m.deployment).join('+') || 'nenhum'
		const ns = view.namespace ?? '—'
		const saidas = [...view.consumes.map(e => `→${e.context}`), ...view.reads.map(e => `⇢${e.namespace}`)].join(' ') || '(nenhuma)'
		lines.push(`  ${id.padEnd(11)} ns=${ns.padEnd(15)} ${onde.padEnd(12)} ${saidas}`)
	}

	lines.push('', '  →  importa módulo do contexto (CONTEXT_MAP)      ⇢  lê tabela de outro namespace (TABLE_READ_EDGES)')
	return lines.join('\n')
}

async function main(): Promise<void> {
	const [subcommand, argument] = process.argv.slice(2)
	const json = process.argv.includes('--json')

	if (subcommand === 'map') {
		console.log(json ? JSON.stringify((Object.keys(PLACEMENT) as ContextId[]).map(viewOf), null, 2) : renderMap())
		return
	}

	if (subcommand === 'show') {
		const ids = Object.keys(CONTEXTS)
		if (argument === undefined || !ids.includes(argument)) {
			// A recusa NOMEIA as opções. Um "contexto desconhecido" sem a lista obriga quem errou a ir
			// procurar num arquivo justamente a informação que este comando existe para dar.
			console.error(`context show: '${argument ?? ''}' não é um contexto. Os que existem: ${ids.join(', ')}`)
			process.exit(1)
		}
		const view = viewOf(argument as ContextId)
		console.log(json ? JSON.stringify(view, null, 2) : renderShow(view))
		return
	}

	console.error('Uso:\n  bun context show <ctx> [--json]\n  bun context map [--json]')
	process.exit(1)
}

if (import.meta.main) await main()
