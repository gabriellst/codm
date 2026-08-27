import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	consumes: {
		artifact:
			"The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		issue:
			"The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		ui: "The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		owner:
			"The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		auth: 'LibSqlMailboxDispatcher reads CloudSession (services surface) BEFORE claimNext — the login gate (SP2 Task T7, AC-4/AC-5): no live device-token session, no turn starts; items wait, no attempts spent. The daemon-local login policy lives in auth (the mirror image of BetterAuth, its cloud-profile counterpart — see auth/registry.ts), and the dispatcher is the sole write-side consumer of the gate it exposes.',
		thread:
			"The MailboxDispatcher resolves each turn run context — thread providers/workspaceId, and the conversation window — via BC4 read seams (ThreadRepository/OpenIssuesReader; the transcript window is the thread aggregate's own persistence surface since B4). ForkIssue slugs an issue key against the same reader (an open issue of a thread is a THREAD concept and lives there).",
		workspace: 'The saga-closer reads the bound workspace path (the run cwd) via WorkspaceRepository (repositories surface).',
	},
	reads: {
		issue:
			'LibSqlStalledIssueReader (BFF-style read service, the same pattern as thread/services/OpenIssuesReader) reads the issue table directly to find WORKING issues with no work in flight — ReconcileStalledIssues needs to tell "still being worked" from "marked WORKING but abandoned," and that answer lives in the issues row this agent context does not own.',
		shared:
			'The same reader NOT EXISTS-correlates each candidate issue against the outbox table to rule out a pending-but-not-yet-dispatched turn: an issue can be WORKING with its mailbox already drained while its outbox entry (the fact that re-enqueues the next turn) is still unprocessed, and reading only the mailbox would misclassify that issue as stalled.',
	},
} satisfies ContextDecl
