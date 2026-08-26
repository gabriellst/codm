import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	consumes: {
		workspace: 'AttachThread validates the workspace exists via WorkspaceRepository (repositories surface).',
		issue:
			"RaiseStop's archived guard READS the issue via IssueRepository (repositories surface) when the stop carries one — the sanctioned cross-context shape. The stop control plane lives here since B4 because the Stop is a child of the Thread aggregate; it never calls an issue entity method, only reads the flag.",
		agent:
			'The inbound path consumes the agent context ProviderDetector (which CLI a thread runs) and, since the orchestrator pivot, its MailboxRepository — an invocable message queues a turn in the SAME transaction as the transcript entry (§7.4). AttachThread and GetThreadSettings additionally read AgentRunnerFactory.supported (services surface, ABSTRACT TOKEN ONLY, via the leaf module): binding a thread to a provider is legal only if a runner exists for it, and the settings read flags a legacy binding for which none does. ResolveStopController adds two type-level edges for the same reason it is an MCP tool at all: it composes AgentRunIdentityCtxSchema (types) so Zod does not strip the identity AgentIdentityMiddleware stamps, and refuses with AgentInterfaceErrors (errors) so a run that targets another thread gets the SAME code every other tool door refuses with. A second copy of either in thread/ would be two spellings of one boundary.',
	},
	reads: {
		issue: 'OpenIssuesReader (classifier candidate set) + GetSessionChat active stops ride the issue schema.',
		workspace: 'GetSessionChat resolves the bound workspace display path.',
		gateway:
			'ChannelConnectivity / GroupMemberReader / GetSessionChat read the Go gateway sync tables (channels/remotes — proxy pairing, BUILD-LOG:116).',
		artifact:
			'GetSessionChat joins artifact_artifacts by the transcript entry\'s own artifactId column to render the delivered-artifact bubble ("envio de artefatos pelo canal" design, decisions 4/8) — same BFF read-services shape as the workspace/gateway joins above, addressed by a column this aggregate already owns.',
	},
	givens: ['givenThread', 'givenStop'],
	constants: ['GIVEN_MENTION_TAG'],
} satisfies ContextDecl
