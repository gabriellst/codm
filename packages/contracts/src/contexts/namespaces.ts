import type { WorkspaceId } from '../../../../template.config'
import type { ContextId } from './context-ids.generated'

/**
 * NAMESPACE LÓGICO → DONO. A única lista que sobra.
 *
 * Colapsa TRÊS listas que hoje vivem em `api/typescript/src/shared/contexts.ts`:
 *   · `CONTEXTS[x].pgSchema`  — o namespace de cada contexto TS
 *   · `FOREIGN_PGSCHEMAS`     — os de dono NÃO-TS, hoje um `readonly string[]` que não diz QUEM
 *   · `PENDING_PGSCHEMAS`     — os declarados pelo contract lock antes do contexto existir
 *
 * ── por que aqui, e não em `src/` ────────────────────────────────────────────────────────────────
 * Duas razões, e as duas são estruturais. É LÍNGUA-NEUTRA: o `gateway` é do Go, e uma lista que
 * mora no backend TS não pode ser a fonte de verdade de um namespace que o TS não possui. E um
 * namespace pode existir ANTES do seu contexto — é exatamente o contract lock da Fase 0, que é o
 * caso que obrigou o fork a inventar o `PENDING_PGSCHEMAS`. Aqui esse estado é natural: um
 * namespace cujo dono ainda não tem pasta simplesmente não tem pasta.
 *
 * ── por que `namespace` e não `pgSchema` ─────────────────────────────────────────────────────────
 * Porque o conceito é o namespace LÓGICO do contexto, e o mecanismo FÍSICO difere por dialeto:
 * `pgSchema('x').table('y')` onde o dialeto tem namespace nativo, prefixo `x_y` onde não tem. O
 * campo antigo nomeava o mecanismo de UM dialeto dentro de um registro de identidade de domínio —
 * e neste repo isso é mentira dupla, porque nenhum dos dois troncos usa `pgSchema()` hoje.
 *
 * ── o falseador ──────────────────────────────────────────────────────────────────────────────────
 * `owner` é `ContextId | WorkspaceId`. Um dono que não seja nem contexto existente nem workspace
 * declarado NÃO COMPILA — mesmo mecanismo do `assertUnionSlotOwners` dos union slots do TypeSpec,
 * que já roda em produção. É o que o `FOREIGN_PGSCHEMAS` não tem hoje: ele é `readonly string[]`,
 * então nada impede mover `'billing'` para lá e os rails seguirem verdes.
 */
export interface NamespaceDecl {
	/** Quem possui este namespace: um contexto TS, ou um workspace quando o dono não fala TS. */
	owner: ContextId | WorkspaceId
}

export const NAMESPACES = {
	// ── contextos TS ────────────────────────────────────────────────────────────────────────────
	// `authentication` é o único caso em que o namespace difere da chave do módulo — e é a prova de
	// que os dois eixos são distintos, não sinônimos com nome comprido.
	authentication: { owner: 'auth' },
	owner: { owner: 'owner' },
	shared: { owner: 'shared' },
	agent: { owner: 'agent' },
	workspace: { owner: 'workspace' },
	thread: { owner: 'thread' },
	issue: { owner: 'issue' },
	artifact: { owner: 'artifact' },

	// ── dono NÃO-TS ─────────────────────────────────────────────────────────────────────────────
	// O que o `FOREIGN_PGSCHEMAS` dizia em prosa, agora dito no tipo: o `gateway` é do workspace Go
	// (`internal/channel`), e o compilador recusa um dono inventado.
	gateway: { owner: 'apiGo' },
} as const satisfies Record<string, NamespaceDecl>

/** O universo de namespaces. É esta união que tipa as chaves de `reads` num `context.ts`. */
export type Namespace = keyof typeof NAMESPACES

/**
 * Os namespaces de dono NÃO-TS, derivados — não redigitados.
 *
 * Substitui o `FOREIGN_PGSCHEMAS` do backend TS, que era um `readonly string[]` sem dono declarado.
 * Aqui a pergunta "de quem é este namespace?" tem resposta no tipo, e a lista sai de graça.
 */
export const foreignNamespaces = (tsContexts: readonly string[]): Namespace[] =>
	(Object.keys(NAMESPACES) as Namespace[]).filter(ns => !tsContexts.includes(NAMESPACES[ns].owner))
