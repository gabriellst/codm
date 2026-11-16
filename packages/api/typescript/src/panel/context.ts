import type { ContextDecl } from '@codm/contracts/context'

export default {
	/**
	 * CLOUD-ONLY: the per-group web panel (fase 1, `.specs/2026-11-13-painel-na-nuvem-design.md`). The
	 * daemon owns issues on the user's machine and PUSHES a read snapshot here; the people in a group read
	 * it by link without the desktop app. Nothing here decides anything about an issue.
	 */
	placement: [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],

	kind: 'domain',
	ambient: ['middlewares'],
	consumes: {
		auth: 'PUT /panel/sync and the link rotation are authenticated with the user session bearer the daemon already holds (AuthAccountMiddleware); the public reads are not.',
	},
	givens: [],
} satisfies ContextDecl
