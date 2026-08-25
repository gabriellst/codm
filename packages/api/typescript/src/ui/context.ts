import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Enums da BFF entram no vocabulário nomeado. */
	exposes: { enums: true },

	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'bff',
	namespace: null,
	consumes: {
		owner: 'BFF read model: owner listing/active-owner via repositories.',
		agent: 'BFF Settings/AttachWizard read provider availability via the ProviderDetector service (detection probe).',
		thread:
			'BFF Settings reads the per-owner stop-policy toggles via StopPolicyConfigRepository (repositories surface), which lives in thread/ since B4 — the policy follows the aggregate that raises stops.',
	},
	reads: {
		thread: 'BFF read models (dashboard/wizard/checklist) — query-side by design.',
		issue: 'BFF read models — GetHomeDashboard reads issues/stops for the operating-status rollup.',
		workspace: 'BFF read models (dashboard/wizard/checklist).',
		owner: 'GetSettings reads the owner row (timezone/language).',
		gateway: 'BFF wizard/dashboard read the gateway sync tables (channels/remotes/memberships).',
	},
} satisfies ContextDecl
