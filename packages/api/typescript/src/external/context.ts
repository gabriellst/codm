import type { ContextDecl } from '@codm/contracts/context'

export default {
	/**
	 * NÃO PERSISTE. Medido em 2026-08-14: `external/registry.ts` tem ZERO bindings `Drizzle*`, contra 2
	 * a 17 nos outros nove. A forma anterior forçava um `db: 'libsql'` aqui porque o campo era
	 * obrigatório — um banco declarado para um contexto que não escreve em nenhum. `'none'` é a
	 * afirmação que faltava (ADR 0004).
	 */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'none' } }],

	kind: 'edge',
	namespace: null,
} satisfies ContextDecl
