import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	reads: {
		thread: 'T04/T12 read models join threads + transcript entries for display fields (read-services cross-tabela, BUILD-LOG:64).',
		agent:
			"T04/T12 read models read agent_mailbox to show when an issue's next turn is deferred by the provider's usage limit (`providerWaitByIssue`, fase 0 item 2) — a read-only display of a fact only the queue holds; nothing in `issue` decides on it.",
	},
	givens: ['givenIssue'],
} satisfies ContextDecl
