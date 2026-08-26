import type { ContextDecl } from '@codm/contracts/context'

export default {
	/**
	 * O único contexto que publica OBJECTS, e o docblock do `openapi.ts` que isto substitui chamava
	 * isso de FRONTEIRA DE SEGURANÇA: `registerSchemas` emite o conjunto completo de campos e o
	 * `.refine()` verbatim no openapi.json público. `shared/objects` são value objects de contrato,
	 * já no fio; os de um contexto de domínio não são, e continuam sem declarar isto.
	 */
	exposes: { enums: true, objects: true },

	/**
	 * O ÚNICO contexto dual POR DESENHO: é a raiz de infra dos dois deployments, então declara os dois
	 * e cada um traz o seu banco.
	 */
	placement: [
		{ when: { deployment: 'cloud' }, infra: { db: 'pg' } },
		{ when: { deployment: 'local' }, infra: { db: 'libsql' } },
	],

	kind: 'kernel',
	reads: {
		gateway: 'TestIngressController seeds a connected channel — `e2e`-column-gated hermetic seam, never mounted in production.',
	},
	givens: ['givenDomainEvent', 'givenChannel', 'givenRemote', 'givenRemoteMembership', 'givenConnectedGatewayChannel'],
} satisfies ContextDecl
