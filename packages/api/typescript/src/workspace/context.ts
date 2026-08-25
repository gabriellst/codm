import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	reads: {
		thread: 'ListWorkspaces + WorkspaceUsageQuery count attached threads per workspace (BUILD-LOG:64).',
		issue: 'WorkspaceUsageQuery counts working issues per workspace (BUILD-LOG:64).',
	},
	givens: ['givenWorkspace'],
} satisfies ContextDecl
