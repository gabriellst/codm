import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	reads: {
		thread: 'T04/T12 read models join threads + transcript entries for display fields (read-services cross-tabela, BUILD-LOG:64).',
	},
	givens: ['givenIssue'],
} satisfies ContextDecl
