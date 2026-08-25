import type { ContextDecl } from '@codm/contracts/context'

export default {
	/**
	 * CLOUD-ONLY, pelo mesmo motivo que `auth` (ADR 0001, W3 Task 4c): tenancy emitida na máquina é
	 * tenancy editável por quem tem o disco.
	 */
	placement: [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],

	kind: 'domain',
	ambient: ['middlewares'],
	consumes: {
		auth: 'CLOUD-ONLY desde o ADR 0001 (W3 Task 4c): o daemon local não monta `auth` nem emite sessão — ele a LÊ, do `shared/services/CloudSession`, com o `SessionSchema` que mudou para `@shared/schemas` pela mesma razão.',
	},
	reads: {
		authentication: 'SetActiveOwner targeted single-column session update (better-auth hook pattern; no aggregate).',
	},
	givens: ['givenOwner', 'givenOwnerWithResponsible'],
} satisfies ContextDecl
