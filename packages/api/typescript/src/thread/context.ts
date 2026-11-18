import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	consumes: {
		workspace: 'AttachThread validates the workspace exists via WorkspaceRepository (repositories surface).',
		issue:
			"RaiseStop's archived guard READS the issue via IssueRepository (repositories surface) when the stop carries one — the sanctioned cross-context shape. The stop control plane lives here since B4 because the Stop is a child of the Thread aggregate; it never calls an issue entity method, only reads the flag. Pausa como comando (fase 2, item 2): SendDirectMessage refuses a held issue's run through IssueHold (services surface), and IngestChannelMessage runs PauseIssue/ResumeIssue (usecases surface, NAMED policy exception) inside the ingest transaction when a control word targets an issue. Política de saída (fase 3): RaiseStop and DeliverIssueSignal read the issue (key, title) through IssueRepository to format what an issue says to the group, and PanelPublisher.linkOf (services surface) for the link to the issue on the group's panel page. Agir pelo painel (fase 2, item 6b): ExecutePanelAction runs the same PauseIssue/ResumeIssue (source PANEL) and ReopenIssue before a steer (usecases surface, its own NAMED policy exception), and reads the issue through IssueRepository to confirm it belongs to the conversation. Padrão de 15 min (fase 3, item 1b): ApplyDueQuestionDefaults asks the same IssueHold (services surface) whether a due question's issue is held before applying its default, and reads the issue (key, title) through IssueRepository for the progress line.",
		agent:
			'The inbound path consumes the agent context ProviderDetector (which CLI a thread runs) and, since the orchestrator pivot, its MailboxRepository — an invocable message queues a turn in the SAME transaction as the transcript entry (§7.4). AttachThread and GetThreadSettings additionally read AgentRunnerFactory.supported (services surface, ABSTRACT TOKEN ONLY, via the leaf module): binding a thread to a provider is legal only if a runner exists for it, and the settings read flags a legacy binding for which none does. ResolveStopController adds two type-level edges for the same reason it is an MCP tool at all: it composes AgentRunIdentityCtxSchema (types) so Zod does not strip the identity AgentIdentityMiddleware stamps, and refuses with AgentInterfaceErrors (errors) so a run that targets another thread gets the SAME code every other tool door refuses with. A second copy of either in thread/ would be two spellings of one boundary. Agir pelo painel (fase 2, item 6b): ExecutePanelAction queues a panel steer through the same MailboxRepository the routed steer uses. Steer imediato (fase 2, item 4): InterruptIssueTurnOnSteer, reacting to the thread-owned "agora" fact, cuts the issue\'s running turn through IssueTurnAborter (services surface) — the shape issue/handlers/AbortIssueTurnOnPause already has. Triagem paralela (fase 2): IngestChannelMessage asks InboundTriage (services surface) whether this env triages and queues the orchestrator item HELD by TRIAGE_HOLDER; TriageChannelMessage asks the same service for the verdict and settles the hold through MailboxRepository.settleHold, reading TriageDecision (enums surface) to choose the path.',
	},
	reads: {
		issue:
			'OpenIssuesReader (classifier candidate set) + GetSessionChat active stops ride the issue schema. PublishPanelRoster (fase 2, item 6a) selects the conversations that have issues — the ones with a cloud panel board.',
		workspace: 'GetSessionChat resolves the bound workspace display path.',
		gateway:
			"ChannelConnectivity / GroupMemberReader / GetSessionChat read the Go gateway sync tables (channels/remotes — proxy pairing, BUILD-LOG:116). PublishPanelRoster (fase 2, item 6a) reads contact names (remotes) and the account's own address (channels.owner_remote_id) to build the cloud panel roster. ChannelConnectivity.connectedSince (fase 3, item 1b) reads the channel row's `updated_at` while CONNECTED — the instant the gateway saved the (re)connection — for the grace before a question's default.",
		artifact:
			'GetSessionChat joins artifact_artifacts by the transcript entry\'s own artifactId column to render the delivered-artifact bubble ("envio de artefatos pelo canal" design, decisions 4/8) — same BFF read-services shape as the workspace/gateway joins above, addressed by a column this aggregate already owns.',
	},
	givens: ['givenThread', 'givenStop'],
	constants: ['GIVEN_MENTION_TAG'],
} satisfies ContextDecl
