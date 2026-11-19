import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	consumes: {
		agent:
			'Pausa como comando (fase 2, item 2): the issue owns the pause fact and its two in-context handlers command the agent turn runtime — AbortIssueTurnOnPause kills the running turn through IssueTurnAborter (services surface), ReleaseIssueWorkOnResume releases the held items through MailboxRepository (repositories surface; the mailbox is a queue, the stance thread/handlers/ResumeIssueOnStopResolved already takes). The pause itself is the issues.paused flag; these only make it immediate. Vazão (fase 4, S3): the life state reads QuotaStatusReader (services surface) — whether the quota budget holds the task lane FOR REAL (enforced) — so queued work under a hold is WAITING_BUDGET on the board, the console and the panel; in observation it answers false and nothing changes.',
	},
	reads: {
		thread: 'T04/T12 read models join threads + transcript entries for display fields (read-services cross-tabela, BUILD-LOG:64).',
		agent:
			"T04/T12 read models read agent_mailbox to show when an issue's next turn is deferred by the provider's usage limit (`providerWaitByIssue`, fase 0 item 2), its steers and its life state (`issueLifeState`, fase 1) — a read-only display of facts only the queue holds; nothing in `issue` decides on it.",
		artifact:
			"assembleIssueTimeline (fase 1; console timeline in ui + panel publisher) lists the artifacts an issue recorded (artifact_artifacts by issue_id) — the same BFF read-services shape as thread's GetSessionChat join; read-only.",
		shared:
			'assembleIssueTimeline (fase 1) reads the recorded domain facts of the issue (shared_events by entity_id: forked, turn started, completed, archived, paused/resumed, regret window closed — the last parsed through the shared RegretWindowSchema) — the timeline is assembled from facts that already exist, so no new table.',
	},
	givens: ['givenIssue'],
} satisfies ContextDecl
