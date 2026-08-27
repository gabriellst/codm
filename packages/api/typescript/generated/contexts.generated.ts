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
	shared: { kind: 'kernel', namespace: 'shared' },
	thread: { kind: 'domain', namespace: 'thread' },
	ui: { kind: 'bff', namespace: null },
	workspace: { kind: 'domain', namespace: 'workspace' },
} as const

/** Acoplamento de MÓDULO — quem importa quem. Montado dos `consumes`. */
export const CONTEXT_MAP: Partial<Record<ContextId, Partial<Record<ContextId, { note: string }>>>> = {
	agent: {
		artifact: {
			note: "The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
		},
		issue: {
			note: "The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case.",
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
			note: "The MailboxDispatcher resolves each turn run context — thread providers/workspaceId, and the conversation window — via BC4 read seams (ThreadRepository/OpenIssuesReader; the transcript window is the thread aggregate's own persistence surface since B4). ForkIssue slugs an issue key against the same reader (an open issue of a thread is a THREAD concept and lives there).",
		},
		workspace: { note: 'The saga-closer reads the bound workspace path (the run cwd) via WorkspaceRepository (repositories surface).' },
	},
	artifact: {
		thread: {
			note: 'RecordArtifact validates the target thread exists via ThreadRepository (the artifact catalog is a sink, not the owner). SendArtifact ("envio de artefatos pelo canal" design) extends this: ThreadRepository resolves channelId/contactExternalId for the LINK text path, ChannelSender reads capabilities.media (services surface), and the enqueue of both delivery commands (deliver_channel_message for LINK, deliver_channel_attachment for media) crosses through thread/services/ArtifactDelivery — a free-function ignition seam, same shape as beginTypingPresence, because CROSS_CONTEXT_POLICY forbids importing thread/usecases directly.',
		},
		issue: { note: 'RecordArtifact validates the optional issue exists via IssueRepository (same sink posture).' },
	},
	owner: {
		auth: {
			note: 'CLOUD-ONLY desde o ADR 0001 (W3 Task 4c): o daemon local não monta `auth` nem emite sessão — ele a LÊ, do `shared/services/CloudSession`, com o `SessionSchema` que mudou para `@shared/schemas` pela mesma razão.',
		},
	},
	thread: {
		workspace: { note: 'AttachThread validates the workspace exists via WorkspaceRepository (repositories surface).' },
		issue: {
			note: "RaiseStop's archived guard READS the issue via IssueRepository (repositories surface) when the stop carries one — the sanctioned cross-context shape. The stop control plane lives here since B4 because the Stop is a child of the Thread aggregate; it never calls an issue entity method, only reads the flag.",
		},
		agent: {
			note: 'The inbound path consumes the agent context ProviderDetector (which CLI a thread runs) and, since the orchestrator pivot, its MailboxRepository — an invocable message queues a turn in the SAME transaction as the transcript entry (§7.4). AttachThread and GetThreadSettings additionally read AgentRunnerFactory.supported (services surface, ABSTRACT TOKEN ONLY, via the leaf module): binding a thread to a provider is legal only if a runner exists for it, and the settings read flags a legacy binding for which none does. ResolveStopController adds two type-level edges for the same reason it is an MCP tool at all: it composes AgentRunIdentityCtxSchema (types) so Zod does not strip the identity AgentIdentityMiddleware stamps, and refuses with AgentInterfaceErrors (errors) so a run that targets another thread gets the SAME code every other tool door refuses with. A second copy of either in thread/ would be two spellings of one boundary.',
		},
	},
	ui: {
		owner: { note: 'BFF read model: owner listing/active-owner via repositories.' },
		agent: { note: 'BFF Settings/AttachWizard read provider availability via the ProviderDetector service (detection probe).' },
		thread: {
			note: 'BFF Settings reads the per-owner stop-policy toggles via StopPolicyConfigRepository (repositories surface), which lives in thread/ since B4 — the policy follows the aggregate that raises stops. Since the onboarding atomic-commit (spec 2026-08-26), CompleteOnboarding also composes AttachThread (usecases surface, named PolicyException) to materialize the wizard draft — see composition/policy.ts.',
		},
		workspace: {
			note: "CompleteOnboarding's atomic commit resolves/creates the wizard's workspace via WorkspaceRepository (repositories) and composes AddWorkspace (usecases surface, named PolicyException) — see composition/policy.ts.",
		},
	},
}

/** Acoplamento de TABELA — quem lê o namespace de quem. Montado dos `reads`.
 *  Canal DIFERENTE do de cima, e de propósito: o `CONTEXT_MAP` é estruturalmente cego a ele. */
export const TABLE_READ_EDGES: readonly { consumer: ContextId; schema: string; note: string }[] = [
	{
		consumer: 'agent',
		schema: 'issue',
		note: 'LibSqlStalledIssueReader (BFF-style read service, the same pattern as thread/services/OpenIssuesReader) reads the issue table directly to find WORKING issues with no work in flight — ReconcileStalledIssues needs to tell "still being worked" from "marked WORKING but abandoned," and that answer lives in the issues row this agent context does not own.',
	},
	{
		consumer: 'agent',
		schema: 'shared',
		note: 'The same reader NOT EXISTS-correlates each candidate issue against the outbox table to rule out a pending-but-not-yet-dispatched turn: an issue can be WORKING with its mailbox already drained while its outbox entry (the fact that re-enqueues the next turn) is still unprocessed, and reading only the mailbox would misclassify that issue as stalled.',
	},
	{
		consumer: 'issue',
		schema: 'thread',
		note: 'T04/T12 read models join threads + transcript entries for display fields (read-services cross-tabela, BUILD-LOG:64).',
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
		note: 'OpenIssuesReader (classifier candidate set) + GetSessionChat active stops ride the issue schema.',
	},
	{ consumer: 'thread', schema: 'workspace', note: 'GetSessionChat resolves the bound workspace display path.' },
	{
		consumer: 'thread',
		schema: 'gateway',
		note: 'ChannelConnectivity / GroupMemberReader / GetSessionChat read the Go gateway sync tables (channels/remotes — proxy pairing, BUILD-LOG:116).',
	},
	{
		consumer: 'thread',
		schema: 'artifact',
		note: 'GetSessionChat joins artifact_artifacts by the transcript entry\'s own artifactId column to render the delivered-artifact bubble ("envio de artefatos pelo canal" design, decisions 4/8) — same BFF read-services shape as the workspace/gateway joins above, addressed by a column this aggregate already owns.',
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
export const BOOT_ORDER = ['shared', 'agent', 'artifact', 'auth', 'issue', 'owner', 'thread', 'workspace', 'ui', 'external'] as const
