// GERADO por `bun contexts:sync` a partir dos `src/<ctx>/context.ts` — NÃO EDITE.
// O gate é `bun contexts:check`.
//
// DADO INERTE: só tipos são importados, então um rail lê o mapa de acoplamento sem instanciar
// container nem arrastar tsyringe. O gêmeo de runtime é `composition.generated.ts`.
import type { ContextId } from '@codm/contracts/context-ids'

/** Identidade de cada contexto: o que ele É, e qual namespace lógico possui (`null` = não persiste). */
export const CONTEXTS = {
	agent: { kind: 'domain', namespace: 'agent' },
	artifact: { kind: 'domain', namespace: 'artifact' },
	auth: { kind: 'domain', namespace: 'authentication' },
	external: { kind: 'edge', namespace: null },
	issue: { kind: 'domain', namespace: 'issue' },
	owner: { kind: 'domain', namespace: 'owner' },
	panel: { kind: 'domain', namespace: 'panel' },
	shared: { kind: 'kernel', namespace: 'shared' },
	thread: { kind: 'domain', namespace: 'thread' },
	ui: { kind: 'bff', namespace: null },
	workspace: { kind: 'domain', namespace: 'workspace' },
} as const

/** Acoplamento de MÓDULO — quem importa quem. Montado dos `consumes`. */
export const CONTEXT_MAP: Partial<Record<ContextId, Partial<Record<ContextId, { note: string }>>>> = {
	agent: {
		artifact: {
			note: "As ferramentas da issue (fase 3, item 1): RequestFeedback reads the cited artifacts through ArtifactRepository (repositories surface) — each must be THIS issue's — and refuses a main preview the channel cannot carry through ArtifactSendability (services surface), the same checks SendArtifact makes, so the refusal reaches the session on the tool call instead of failing a delivery later. Troca de sessão (fase 4, S6): the derived handoff notes (LibSqlHandoffNotes) list what the task recorded through the same ArtifactRepository (listByThread, filtered to the issue) — read-only. Also: The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		},
		issue: {
			note: "Pausa como comando (fase 2, item 2): the MailboxDispatcher asks IssueHold (services surface) whether an issue's work is held before running its turn, and the RaiseStop/AskOperator doors refuse a held issue's run through the same check. Janela de arrependimento (fase 2, item 3): OpenRegretWindow asks the same IssueHold whether the issue is held before letting an irreversible shell command through (the rule now lives in RegretWindowGate, which the publish command waits on too). Comando de publicação (fase 4, S11): RunPublishCommand writes the run's captured output to the task's local terminal log through TerminalLineRepository.appendOfTimelineItem (repositories surface), linked to the run's own fact — the console reads it by that id; the MCP-exposed issue detail skips those lines. Empurrão até 2 vezes (fase 5, S3): LibSqlStalledIssueReader asks the same IssueHold before nudging an issue — a paused CONVERSATION holds its issues too (PauseThread writes only threads.paused), and a group that asked for silence is never nudged nor told of a stall. O supervisor (fase 5, S4): LibSqlSuspectIssueReader asks the same IssueHold and never suspects a held issue; SuperviseSuspectIssues reads a suspect task's last moments through IssueTimelineReader (services surface — the timeline assembly lives in issue/utils, a surface other contexts may not import) and its life state through IssueBoardReader (services surface), to hand the small model names and texts only. Also: The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		},
		ui: {
			note: "The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		},
		owner: {
			note: "The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		},
		auth: {
			note: 'LibSqlMailboxDispatcher reads CloudSession (services surface) BEFORE claimNext — the login gate (SP2 Task T7, AC-4/AC-5): no live device-token session, no turn starts; items wait, no attempts spent. The daemon-local login policy lives in auth (the mirror image of BetterAuth, its cloud-profile counterpart — see auth/registry.ts), and the dispatcher is the sole write-side consumer of the gate it exposes.',
		},
		thread: {
			note: "The MailboxDispatcher resolves each turn run context — thread providers/workspaceId, and the conversation window — via BC4 read seams (ThreadRepository/OpenIssuesReader; the transcript window is the thread aggregate's own persistence surface since B4). ForkIssue slugs an issue key against the same reader (an open issue of a thread is a THREAD concept and lives there). As perguntas da issue (fase 3, item 1): the issue's tools (AskDecision, AskQuestion and the legacy doors that alias to them) build the ask through the thread's StopAsk value object (objects surface) ON the tool call, so a malformed ask is refused to the model instead of dead-lettered by the consumer; the legacy doors read the conversation's language (ThreadRepository) for the few words they write themselves (THREAD_MESSAGES, i18n surface: an approval's yes/no labels, the question of a NEEDS_INPUT declared without a summary). Entregue/lido no WhatsApp (fase 2, item 5): the dispatcher hangs ☑️/✅ on the channel message a STEER was routed from through cueRoutedSteer (services surface) — it is the one place that knows when an item is first handed over and when it is consumed, while the command, payload and emojis stay thread's. Troca de sessão (fase 4, S6): the derived handoff notes (LibSqlHandoffNotes) list the task's still-open questions through ThreadRepository.openStopsByIssue (repositories surface) — read-only. Vazão (fase 4, S3): when the quota budget holds the task lane for real, the dispatcher tells each conversation with a held task through NotifyBudgetHeld (usecases surface, the sibling of NotifyProviderPaused) — the BUDGET_HELD block notice, its text and its routing stay thread's. Comando de publicação (fase 4, S11): the dispatcher parses the resume item it claims with ResumeIssuePayloadSchema (objects surface — the stop and the resolution are DECLARED there, never read back from the dedup key), and RunPublishCommand reads the stop (ThreadRepository.findStop) for its ask and answer and says the outcome in the group's language through THREAD_MESSAGES.publishRan (i18n surface).",
		},
		workspace: {
			note: "The saga-closer reads the bound workspace path (the run cwd) via WorkspaceRepository (repositories surface). Comando de publicação (fase 4, S11): RunPublishCommand reads the workspace's declared publish command off the same aggregate (WorkspaceRepository) — never through a tool, never into a DTO.",
		},
	},
	artifact: {
		thread: {
			note: 'RecordArtifact validates the target thread exists via ThreadRepository (the artifact catalog is a sink, not the owner). SendArtifact ("envio de artefatos pelo canal" design) extends this: ThreadRepository resolves channelId/contactExternalId for the LINK text path, ChannelSender reads capabilities.media (services surface), and the enqueue of both delivery commands (deliver_channel_message for LINK, deliver_channel_attachment for media) crosses through thread/services/ArtifactDelivery — a free-function ignition seam, same shape as beginTypingPresence, because CROSS_CONTEXT_POLICY forbids importing thread/usecases directly.',
		},
		issue: {
			note: 'RecordArtifact validates the optional issue exists via IssueRepository (same sink posture). SendArtifact refuses to deliver the artifact of a HELD issue through IssueHold (services surface; fase 2, item 2 — pausa como comando).',
		},
	},
	issue: {
		agent: {
			note: 'Pausa como comando (fase 2, item 2): the issue owns the pause fact and its two in-context handlers command the agent turn runtime — AbortIssueTurnOnPause kills the running turn through IssueTurnAborter (services surface), ReleaseIssueWorkOnResume releases the held items through MailboxRepository (repositories surface; the mailbox is a queue, the stance thread/handlers/ResumeIssueOnStopResolved already takes). The pause itself is the issues.paused flag; these only make it immediate. Vazão (fase 4, S3): the life state reads QuotaStatusReader (services surface) — whether the quota budget holds the task lane FOR REAL (enforced) — so queued work under a hold is WAITING_BUDGET on the board, the console and the panel; in observation it answers false and nothing changes. Espera declarada (fase 5, S3): the life state asks DeclaredWaitReader (services surface) which issues asked for feedback in their last turn — WAITING_PERSON before STALLED, the same answer the reconciler excludes them by, so the board and the sweep never disagree.',
		},
	},
	owner: {
		auth: {
			note: 'CLOUD-ONLY desde o ADR 0001 (W3 Task 4c): o daemon local não monta `auth` nem emite sessão — ele a LÊ, do `shared/services/CloudSession`, com o `SessionSchema` que mudou para `@shared/schemas` pela mesma razão.',
		},
	},
	panel: {
		auth: {
			note: 'PUT /panel/sync, PUT /panel/roster and the link rotation are authenticated with the user session bearer the daemon already holds (AuthAccountMiddleware); the public reads and the identification endpoints (fase 2, item 6a — the group token plus a WhatsApp code) are not.',
		},
	},
	thread: {
		workspace: { note: 'AttachThread validates the workspace exists via WorkspaceRepository (repositories surface).' },
		issue: {
			note: "RaiseStop's archived guard READS the issue via IssueRepository (repositories surface) when the stop carries one — the sanctioned cross-context shape. The stop control plane lives here since B4 because the Stop is a child of the Thread aggregate; it never calls an issue entity method, only reads the flag. Pausa como comando (fase 2, item 2): SendDirectMessage refuses a held issue's run through IssueHold (services surface), and IngestChannelMessage runs PauseIssue/ResumeIssue (usecases surface, NAMED policy exception) inside the ingest transaction when a control word targets an issue. Política de saída (fase 3): RaiseStop and DeliverIssueSignal read the issue (key, title) through IssueRepository to format what an issue says to the group, and CloseIssueOnChannel reads its status and completedAt (the completion cycle the closing is said once per), and PanelPublisher.linkOf (services surface) for the link to the issue on the group's panel page. Agir pelo painel (fase 2, item 6b): ExecutePanelAction runs the same PauseIssue/ResumeIssue (source PANEL) and ReopenIssue before a steer (usecases surface, its own NAMED policy exception), and reads the issue through IssueRepository to confirm it belongs to the conversation. Padrão de 15 min (fase 3, item 1b): ApplyDueQuestionDefaults asks the same IssueHold (services surface) whether a due question's issue is held before applying its default, and reads the issue (key, title) through IssueRepository for the progress line. Relatório como consulta (fase 3, item 4): BoardBulletin reads the group's board through IssueBoardReader (services surface — key, title, status and life state; the life-state rule lives in issue/utils, a surface this context may not import) and PanelPublisher.linkOf for the link at its end. Recibo de lote (fase 4, item 5): RecordBatch reopens a finished task before steering an ATTACHED item to it through ReopenIssue (usecases surface, its own NAMED policy exception) and links the receipt to the batch on the panel through PanelPublisher.linkOf.",
		},
		agent: {
			note: 'The inbound path consumes the agent context ProviderDetector (which CLI a thread runs) and, since the orchestrator pivot, its MailboxRepository — an invocable message queues a turn in the SAME transaction as the transcript entry (§7.4). AttachThread and GetThreadSettings additionally read AgentRunnerFactory.supported (services surface, ABSTRACT TOKEN ONLY, via the leaf module): binding a thread to a provider is legal only if a runner exists for it, and the settings read flags a legacy binding for which none does. ResolveStopController adds two type-level edges for the same reason it is an MCP tool at all: it composes AgentRunIdentityCtxSchema (types) so Zod does not strip the identity AgentIdentityMiddleware stamps, and refuses with AgentInterfaceErrors (errors) so a run that targets another thread gets the SAME code every other tool door refuses with. A second copy of either in thread/ would be two spellings of one boundary. Agir pelo painel (fase 2, item 6b): ExecutePanelAction queues a panel steer through the same MailboxRepository the routed steer uses. Steer imediato (fase 2, item 4): InterruptIssueTurnOnSteer, reacting to the thread-owned "agora" fact, cuts the issue\'s running turn through IssueTurnAborter (services surface) — the shape issue/handlers/AbortIssueTurnOnPause already has. Triagem paralela (fase 2): IngestChannelMessage asks InboundTriage (services surface) whether this env triages and queues the orchestrator item HELD by TRIAGE_HOLDER; TriageChannelMessage asks the same service for the verdict and settles the hold through MailboxRepository.settleHold, reading TriageDecision (enums surface) to choose the path. Vazão (fase 4, S0c): every item a thread producer queues declares its MailboxClaimClass; ResumeIssueOnStopResolved queues a resolution that authorizes publishing even with work pending, by the agent PUBLISH_AUTHORIZED_BY table (objects surface — the agent dispatcher reads the same table in S11); and the batch receipt (S8) confirms an issue is of this conversation through ForkedIssueReader (services surface), which reads the agent attributes table written in the fork transaction itself.',
		},
	},
	ui: {
		owner: { note: 'BFF read model: owner listing/active-owner via repositories.' },
		agent: {
			note: 'BFF Settings/AttachWizard read provider availability via the ProviderDetector service (detection probe). Vazão (fase 4): the console health (GetSystemHealth, real in S9) reads QuotaStatusReader (services surface) — the budget, the task slots with limitedBy and the queue the dispatcher last saw.',
		},
		thread: {
			note: 'BFF Settings reads the per-owner stop-policy toggles via StopPolicyConfigRepository (repositories surface), which lives in thread/ since B4 — the policy follows the aggregate that raises stops. Since the onboarding atomic-commit (spec 2026-08-26), CompleteOnboarding also composes AttachThread (usecases surface, named PolicyException) to materialize the wizard draft — see composition/policy.ts.',
		},
		issue: {
			note: "Console reads of fase 1 that live in the BFF: GetIssueTimeline composes issue's `assembleIssueTimeline` (utils, shared with the panel publisher) and throws issue's ISSUE_NOT_FOUND (errors); GetThreadPanelLink reads the link the PanelPublisher service holds (services). The rotate command stays in issue. Fase 4 (S11): GetPublishRunOutput reads what one publish run printed (the terminal lines linked to its timeline item) and throws issue's ISSUE_NOT_FOUND (errors).",
		},
		workspace: {
			note: "CompleteOnboarding's atomic commit resolves/creates the wizard's workspace via WorkspaceRepository (repositories) and composes AddWorkspace (usecases surface, named PolicyException) — see composition/policy.ts. Fase 4 (S11): the console's read of the declared publish command (GetWorkspacePublishCommand) refuses with workspace's WORKSPACE_NOT_FOUND (errors), the code its write door answers.",
		},
	},
}

/** Acoplamento de TABELA — quem lê o namespace de quem. Montado dos `reads`.
 *  Canal DIFERENTE do de cima, e de propósito: o `CONTEXT_MAP` é estruturalmente cego a ele. */
export const TABLE_READ_EDGES: readonly { consumer: ContextId; schema: string; note: string }[] = [
	{
		consumer: 'agent',
		schema: 'issue',
		note: 'LibSqlStalledIssueReader (BFF-style read service, the same pattern as thread/services/OpenIssuesReader) reads the issue table directly to find WORKING issues with no work in flight — ReconcileStalledIssues needs to tell "still being worked" from "marked WORKING but abandoned," and that answer lives in the issues row this agent context does not own. O supervisor (fase 5, S4): LibSqlSuspectIssueReader reads the same issues table (open, not archived) and the last issue_terminal_lines.at of the issues with a live turn — a turn held 30 min with nothing printed for 20 is SILENT_TURN, only ever flagged. It also reads issue_stops (open stops by issue, kind and raised_at; the table lives in the issue namespace) — a STALLED or SERVER_ERROR stop nobody answered for 30 min is suspect, and any other open kind is a stop waiting on a person, which excludes the task. Nothing in agent writes either table.',
	},
	{
		consumer: 'agent',
		schema: 'shared',
		note: 'The same reader NOT EXISTS-correlates each candidate issue against the outbox table to rule out a pending-but-not-yet-dispatched turn: an issue can be WORKING with its mailbox already drained while its outbox entry (the fact that re-enqueues the next turn) is still unprocessed, and reading only the mailbox would misclassify that issue as stalled. Vazão (fase 4, S2): LibSqlQuotaLedgerReader reads the agent OWN facts back from the events table (agent.turn.usage with a role, agent.provider.limit_observed, agent.run.started, agent.quota.held/released) by name and instant — the store every producer wrote them to; the quota budget is derived from them, nothing is stored apart. Troca de sessão (fase 4, S6): LibSqlHandoffNotes reads the agent.issue_spoke facts of the issue back (by entity and name) — what the task said it did — for the notes a fresh session starts from. Espera declarada (fase 5, S3): LibSqlDeclaredWaitReader reads the same agent.issue_spoke facts (by entity, name and level) to tell whether the last turn of the issue asked for feedback — a wait without a deadline the reconciler never nudges and the life state shows as WAITING_PERSON. O supervisor (fase 5, S4): LibSqlSuspectIssueReader reads the agent own agent.issue.nudged facts (first nudges in 24 h — NUDGE_LOOP) and agent.supervisor.reviewed facts (the cooldown and the per-task daily ceilings) by name, entity and instant.',
	},
	{
		consumer: 'issue',
		schema: 'thread',
		note: 'T04/T12 read models join threads + transcript entries for display fields (read-services cross-tabela, BUILD-LOG:64).',
	},
	{
		consumer: 'issue',
		schema: 'agent',
		note: "T04/T12 read models read agent_mailbox to show when an issue's next turn is deferred by the provider's usage limit (`providerWaitByIssue`, fase 0 item 2), its steers and its life state (`issueLifeState`, fase 1) — a read-only display of facts only the queue holds; nothing in `issue` decides on it.",
	},
	{
		consumer: 'issue',
		schema: 'artifact',
		note: "assembleIssueTimeline (fase 1; console timeline in ui + panel publisher) lists the artifacts an issue recorded (artifact_artifacts by issue_id) — the same BFF read-services shape as thread's GetSessionChat join; read-only.",
	},
	{
		consumer: 'issue',
		schema: 'shared',
		note: 'assembleIssueTimeline (fase 1) reads the recorded domain facts of the issue (shared_events by entity_id: forked, turn started, completed, archived, paused/resumed, regret window closed — the last parsed through the shared RegretWindowSchema) — the timeline is assembled from facts that already exist, so no new table.',
	},
	{
		consumer: 'owner',
		schema: 'authentication',
		note: 'SetActiveOwner targeted single-column session update (better-auth hook pattern; no aggregate).',
	},
	{
		consumer: 'shared',
		schema: 'gateway',
		note: 'TestIngressController seeds a connected channel — `e2e`-column-gated hermetic seam, never mounted in production.',
	},
	{
		consumer: 'thread',
		schema: 'issue',
		note: 'OpenIssuesReader (classifier candidate set) + GetSessionChat active stops ride the issue schema. PublishPanelRoster (fase 2, item 6a) selects the conversations that have issues — the ones with a cloud panel board.',
	},
	{ consumer: 'thread', schema: 'workspace', note: 'GetSessionChat resolves the bound workspace display path.' },
	{
		consumer: 'thread',
		schema: 'gateway',
		note: "ChannelConnectivity / GroupMemberReader / GetSessionChat read the Go gateway sync tables (channels/remotes — proxy pairing, BUILD-LOG:116). PublishPanelRoster (fase 2, item 6a) reads contact names (remotes) and the account's own address (channels.owner_remote_id) to build the cloud panel roster. ChannelConnectivity.connectedSince (fase 3, item 1b) reads the channel row's `updated_at` while CONNECTED — the instant the gateway saved the (re)connection — for the grace before a question's default.",
	},
	{
		consumer: 'thread',
		schema: 'artifact',
		note: 'GetSessionChat joins artifact_artifacts by the transcript entry\'s own artifactId column to render the delivered-artifact bubble ("envio de artefatos pelo canal" design, decisions 4/8) — same BFF read-services shape as the workspace/gateway joins above, addressed by a column this aggregate already owns. O feedback da issue (fase 3, item 2): IssueArtifactReader reads the row of the artifact a FEEDBACK previews (kind and ref) so DeliverIssuePreview can send it when the output policy says so — the signal carries only ids by design.',
	},
	{ consumer: 'ui', schema: 'thread', note: 'BFF read models (dashboard/wizard/checklist) — query-side by design.' },
	{ consumer: 'ui', schema: 'issue', note: 'BFF read models — GetHomeDashboard reads issues/stops for the operating-status rollup.' },
	{ consumer: 'ui', schema: 'workspace', note: 'BFF read models (dashboard/wizard/checklist).' },
	{ consumer: 'ui', schema: 'owner', note: 'GetSettings reads the owner row (timezone/language).' },
	{ consumer: 'ui', schema: 'gateway', note: 'BFF wizard/dashboard read the gateway sync tables (channels/remotes/memberships).' },
	{
		consumer: 'workspace',
		schema: 'thread',
		note: 'ListWorkspaces + WorkspaceUsageQuery count attached threads per workspace (BUILD-LOG:64).',
	},
	{ consumer: 'workspace', schema: 'issue', note: 'WorkspaceUsageQuery counts working issues per workspace (BUILD-LOG:64).' },
]

/** Superfícies importáveis sem aresta declarada. `kind: 'kernel'` implica `'*'`. */
export const AMBIENT: Partial<Record<ContextId, readonly string[] | '*'>> = {
	auth: ['middlewares'],
	owner: ['middlewares'],
	panel: ['middlewares'],
	shared: '*',
}

/** Os helpers `given*` de cada contexto — a superfície do harness de teste, DECLARADA por quem a
 *  possui. É o que deixa o stamp podar os givens de um contexto removido sem manter lista paralela;
 *  antes, os mesmos nomes viviam à mão em quatro lugares e nenhum sabia de quem eram. */
export const CONTEXT_GIVENS: Partial<Record<ContextId, readonly string[]>> = {
	auth: ['givenUser', 'givenAccount', 'givenUserWithAccount', 'givenActiveSession', 'givenUserProfile'],
	issue: ['givenIssue'],
	owner: ['givenOwner', 'givenOwnerWithResponsible'],
	shared: ['givenDomainEvent', 'givenChannel', 'givenRemote', 'givenRemoteMembership', 'givenConnectedGatewayChannel'],
	thread: ['givenThread', 'givenStop'],
	workspace: ['givenWorkspace'],
}

/** As CONSTANTES do catálogo de teste — mesma superfície que `CONTEXT_GIVENS`, forma diferente.
 *  Quem monta o catálogo junta as duas; quem EMITE tipos precisa saber qual é qual. */
export const CONTEXT_CONSTANTS: Partial<Record<ContextId, readonly string[]>> = {
	thread: ['GIVEN_MENTION_TAG'],
}

/** ONDE cada contexto monta, e com que infra — DERIVADO dos `placement` de cada `context.ts`.
 *  Substitui a tabela `PLACEMENT` que vivia em `shared/deployment.ts`: uma lista central de
 *  decisões POR CONTEXTO é a forma que a DC2 já eliminou para `consumes`/`reads`/`ambient`, e
 *  tinha o mesmo defeito — o stamp, ao podar um contexto, não tinha como podar a linha dele. */
export const CONTEXT_PLACEMENT = {
	agent: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],
	artifact: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],
	auth: [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],
	external: [{ when: { deployment: 'local' }, infra: { db: 'none' } }],
	issue: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],
	owner: [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],
	panel: [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],
	shared: [
		{ when: { deployment: 'cloud' }, infra: { db: 'pg' } },
		{ when: { deployment: 'local' }, infra: { db: 'libsql' } },
	],
	thread: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],
	ui: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],
	workspace: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],
} as const

/** A ordem de boot, DERIVADA do `kind`: kernel → domain → bff → edge, desempate alfabético.
 *  O kernel vem primeiro porque é ele quem aplica os registries no container raiz e sobe o
 *  transporte que os demais consomem — e o LIFO do shutdown cai de graça, invertendo isto. */
export const BOOT_ORDER = [
	'shared',
	'agent',
	'artifact',
	'auth',
	'issue',
	'owner',
	'panel',
	'thread',
	'workspace',
	'ui',
	'external',
] as const
