import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Enums de auth entram no vocabulário nomeado; os `objects/` deste contexto NÃO. */
	exposes: { enums: true },

	/**
	 * CLOUD-ONLY (ADR 0001, W3 Task 4c). Montava nos dois até 2026-08-14; não monta mais localmente, e
	 * é isso que fecha o buraco que originou o ADR: enquanto `auth` subisse na máquina, o daemon podia
	 * EMITIR sessão — e um `ownerId` emitido localmente é editável por quem tem o disco. O desktop
	 * agora LÊ a sessão (`shared/services/CloudSession`, cache em disco) e não a emite.
	 */
	placement: [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],

	kind: 'domain',
	namespace: 'authentication',
	ambient: ['middlewares'],
	givens: ['givenUser', 'givenAccount', 'givenUserWithAccount', 'givenActiveSession', 'givenUserProfile'],
} satisfies ContextDecl
