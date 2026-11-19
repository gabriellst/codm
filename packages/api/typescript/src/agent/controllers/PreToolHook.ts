import { injectable } from 'tsyringe-neo'
import { AgentIdentityService, BaseError, Controller, readAgentRunToken, z } from '@codm/core-typescript'
import { RegretWindowOutcome } from '@codm/contracts-typescript/wire/enums'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import type { AgentInterfaceErrors } from '../errors'
import { OpenRegretWindow } from '../usecases/OpenRegretWindow'
import { WorktreeSightings } from '../services/WorktreeSightings'
import { REGRET_WINDOW_REASON_PREFIX } from '../utils/irreversibleActions'

import { PRE_TOOL_HOOK_PATH } from '../mcp/route'

/**
 * What the provider CLI posts before a shell tool call (its `PreToolUse` hook input). Read: `tool_input.command`
 * and, since fase 4 (item 1), the declared `cwd` — where the command runs, which registers the task's worktree.
 * Every other key (`session_id`, `tool_name`, the tool's own `description`/`timeout`…) is tolerated and ignored.
 * LOOSE on purpose, and the reason is the failure mode: a body this schema rejected answers 400, and the CLI treats
 * a non-2xx as "the hook failed — run the tool anyway". A strict schema would silently turn the window off at the
 * CLI's next added field — which is also why `cwd` is OPTIONAL: a CLI that stops sending it loses the registration,
 * never the window.
 */
const HookInputSchema = z.looseObject({ tool_input: z.looseObject({ command: z.string() }), cwd: z.string().min(1).optional() })

export const PreToolHookControllerInputSchema = z.object({ body: HookInputSchema })
export const PreToolHookControllerOutputSchema = z.any()

/**
 * The refusal the MODEL reads, per outcome that refuses — a closed map over the enum, so a new outcome
 * fails compilation here until it says what the session is told. `PROCEEDED` refuses nothing.
 */
const REFUSAL: Readonly<Record<Exclude<RegretWindowOutcome, typeof RegretWindowOutcome.PROCEEDED>, string>> = {
	[RegretWindowOutcome.CANCELLED_BY_STEER]: `${REGRET_WINDOW_REASON_PREFIX} o operador mandou um recado novo para esta issue que você ainda não leu. A ação irreversível foi cancelada. Não tente de novo agora: encerre este passo dizendo o que ia fazer; o recado chega no próximo turno — leia e confirme antes de repetir a ação.`,
	[RegretWindowOutcome.CANCELLED_BY_PAUSE]: `${REGRET_WINDOW_REASON_PREFIX} esta issue foi pausada. A ação irreversível foi cancelada. Pare aqui e não tente de novo; o trabalho continua quando a issue for retomada.`,
}

/** The CLI's own decision JSON — `deny` blocks the call and hands the reason to the model as the tool's result. */
function deny(reason: string): Response {
	return Response.json({
		hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
	})
}

/**
 * "Nothing to say" — an EMPTY object, never `permissionDecision: "allow"`: an allow would SKIP the CLI's
 * own permission check for that call, and this door only ever narrows what a session may do.
 */
const goAhead = (): Response => Response.json({})

/**
 * THE REGRET WINDOW'S DOOR (fase 2, item 3) — what an issue session's `PreToolUse` hook calls before a
 * shell command (attached per run by the Claude runner as a session-only plugin; see the spec).
 *
 * NOT in the emitted spec, mounted beside the MCP door for the same reason it is: its only client is the
 * provider CLI, and a hook endpoint rendered into the SDK would be hooks with no consumer. Its wire is
 * the CLI's hook contract, not ours — the response body is that contract's JSON, raw (`rawResponse`),
 * because the CLI reads the body as a decision and anything else is a non-blocking error.
 *
 * Identity: the same opaque run token as the MCP door (`Authorization: Bearer`), resolved per call. The
 * issue comes from the token, never from the body — a model cannot open (or dodge) another issue's window.
 * A run with no issue (none is attached today) has no mailbox to check and goes ahead.
 */
@injectable()
export class PreToolHookController extends Controller<typeof PreToolHookControllerInputSchema, typeof PreToolHookControllerOutputSchema> {
	readonly path = PRE_TOOL_HOOK_PATH
	readonly method = 'post' as const
	readonly description = 'Pre-tool hook of an issue session — the regret window (not emitted to the OpenAPI/SDK)'
	readonly inputSchema = PreToolHookControllerInputSchema
	readonly outputSchema = PreToolHookControllerOutputSchema

	constructor(
		private readonly identities: AgentIdentityService<AgentRunIdentity>,
		private readonly window: OpenRegretWindow,
		private readonly sightings: WorktreeSightings,
	) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const headers: Record<string, string> = {}
		request.raw.headers.forEach((value, key) => {
			headers[key] = value
		})
		const token = readAgentRunToken(headers)
		const identity = token ? this.identities.resolve(token) : null
		if (!identity) throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', 'missing, unknown, expired or revoked run token')

		if (!identity.issueId) return this.rawResponse(goAhead())

		// THE TASK'S WORKTREE (fase 4, item 1) — scheduled, never awaited: the registration runs on a later tick, off
		// this response, and git can neither delay nor decide what the CLI is told (revisão 2).
		if (request.body.cwd) this.sightings.schedule({ issueId: identity.issueId, threadId: identity.threadId, cwd: request.body.cwd })

		const closed = await this.window.execute({
			ownerId: identity.ownerId,
			threadId: identity.threadId,
			issueId: identity.issueId,
			command: request.body.tool_input.command,
		})
		if (!closed || closed.outcome === RegretWindowOutcome.PROCEEDED) return this.rawResponse(goAhead())
		return this.rawResponse(deny(REFUSAL[closed.outcome]))
	}
}
