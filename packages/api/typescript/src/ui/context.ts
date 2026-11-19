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
		agent:
			'BFF Settings/AttachWizard read provider availability via the ProviderDetector service (detection probe). Vazão (fase 4): the console health (GetSystemHealth, real in S9) reads QuotaStatusReader (services surface) — the budget, the task slots with limitedBy and the queue the dispatcher last saw.',
		thread:
			'BFF Settings reads the per-owner stop-policy toggles via StopPolicyConfigRepository (repositories surface), which lives in thread/ since B4 — the policy follows the aggregate that raises stops. Since the onboarding atomic-commit (spec 2026-08-26), CompleteOnboarding also composes AttachThread (usecases surface, named PolicyException) to materialize the wizard draft — see composition/policy.ts.',
		issue:
			"Console reads of fase 1 that live in the BFF: GetIssueTimeline composes issue's `assembleIssueTimeline` (utils, shared with the panel publisher) and throws issue's ISSUE_NOT_FOUND (errors); GetThreadPanelLink reads the link the PanelPublisher service holds (services). The rotate command stays in issue. Fase 4 (S11): GetPublishRunOutput reads what one publish run printed (the terminal lines linked to its timeline item) and throws issue's ISSUE_NOT_FOUND (errors).",
		workspace:
			"CompleteOnboarding's atomic commit resolves/creates the wizard's workspace via WorkspaceRepository (repositories) and composes AddWorkspace (usecases surface, named PolicyException) — see composition/policy.ts. Fase 4 (S11): the console's read of the declared publish command (GetWorkspacePublishCommand) refuses with workspace's WORKSPACE_NOT_FOUND (errors), the code its write door answers.",
	},
	reads: {
		thread: 'BFF read models (dashboard/wizard/checklist) — query-side by design.',
		issue: 'BFF read models — GetHomeDashboard reads issues/stops for the operating-status rollup.',
		workspace: 'BFF read models (dashboard/wizard/checklist).',
		owner: 'GetSettings reads the owner row (timezone/language).',
		gateway: 'BFF wizard/dashboard read the gateway sync tables (channels/remotes/memberships).',
	},
} satisfies ContextDecl
