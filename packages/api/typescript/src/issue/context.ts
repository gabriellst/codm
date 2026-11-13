import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	reads: {
		thread: 'T04/T12 read models join threads + transcript entries for display fields (read-services cross-tabela, BUILD-LOG:64).',
		agent:
			"T04/T12 read models read agent_mailbox to show when an issue's next turn is deferred by the provider's usage limit (`providerWaitByIssue`, fase 0 item 2), its steers and its life state (`issueLifeState`, fase 1) — a read-only display of facts only the queue holds; nothing in `issue` decides on it.",
		artifact:
			"GetIssueTimeline (fase 1) lists the artifacts an issue recorded (artifact_artifacts by issue_id) — the same BFF read-services shape as thread's GetSessionChat join; read-only.",
		shared:
			'GetIssueTimeline (fase 1) reads the recorded domain facts of the issue (shared_events by entity_id: forked, turn started, completed, archived) — the timeline is assembled from facts that already exist, so no new table.',
	},
	givens: ['givenIssue'],
} satisfies ContextDecl
