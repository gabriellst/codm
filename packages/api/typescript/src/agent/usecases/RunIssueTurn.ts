import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z, BaseError, LoggingService } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { AgentModelId, MailboxItemKind, MailboxTargetKind, ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_PARTICIPANT_ID } from '@thread/objects'
import { IssueWorkAgent } from '../agents/IssueWorkAgent'
import { AgentRunnerFactory } from '../services/AgentRunnerFactory'
import type { AgentRunner } from '../services/AgentRunner'
import { ProviderDetector, type DetectedProvider, type ProviderDetection } from '../services/ProviderDetector'
import { AgentStreamRegistry } from '../services/AgentStreamRegistry'
import { TerminalOutputAccumulator, type TerminalOutcome } from '../services/TerminalOutputAccumulator'
import { AgentSessionRepository } from '../repositories/AgentSessionRepository'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { AgentSession } from '../entities/AgentSession'
import { AgentRunStartedEvent } from '../events/AgentRunStartedEvent'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import type { AgentApplicationErrors } from '../errors'
import { ResumeInvalidationReason, AgentRunOutcome, FactSource, MessageVia } from '../enums'
import { isTransportStopKind } from '../enums/TransportStopKind'

export const RunIssueTurnInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	key: z.string().trim().min(1),
	title: z.string().trim().min(1),
	provider: z.enum(ProviderKind),
	workspacePath: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	/**
	 * WHICH KIND of message this turn is carrying — the original ask, or an amendment to work already in
	 * flight. `WORK` and `STEER`, reusing the mailbox's own discriminant.
	 *
	 * The two used to arrive as the SAME raw string and the agent could not tell them apart: a steer read
	 * as a fresh brief, so a turn resumed mid-work was as likely to restart as to continue. It is
	 * declared here rather than inferred from `priorMessageId` or from session state, because the
	 * producer knows it exactly (`MailboxDispatcher` reads `item.kind`) and nobody downstream can
	 * reconstruct it.
	 *
	 * REQUIRED, with no default. `execute` takes the schema's OUTPUT, so a `.default()` here would not
	 * spare a caller one keystroke — it would only make "nobody decided" silently mean `WORK`, which is
	 * the wrong half of the guess to make silently: reading an amendment as a brief restarts work.
	 */
	turnKind: z.union([z.literal(MailboxItemKind.WORK), z.literal(MailboxItemKind.STEER)]),
	/**
	 * The LABEL of the loop whose tick produced this steer — absent ⟺ a human is on the other end.
	 *
	 * Same fact `SteerThread` writes onto the transcript entry, carried through so the working agent's
	 * prompt can say `de="loop:<label>"`. Without it a scheduled nudge reads as the operator standing
	 * over the issue, and the turn answers a timer as if somebody were waiting.
	 */
	firedByLoop: z.string().trim().min(1).optional(),
	/** A instrução permanente da thread — repassada ao prompt do agente. */
	customPrompt: z.string().trim().min(1).optional(),
	/** The transcript entry being fed — becomes the session's cursor once the turn commits. */
	messageId: z.uuid(),
	/**
	 * The conversation position this turn continues FROM: the issue transcript's latest entry BEFORE
	 * `messageId`. Absent on a brand-new issue. Compared against the persisted cursor to catch a
	 * conversation that advanced past what the CLI session actually consumed.
	 */
	priorMessageId: z.uuid().optional(),
	/** Which model to ask the provider CLI for. Omitted ⇒ `DEFAULT` ⇒ the CLI's own choice. */
	model: z.enum(AgentModelId).optional(),
	/**
	 * The transcript entry that ASKED for this issue (§7.6) — carried from the `WORK` mailbox item.
	 *
	 * Optional because an issue can also be born from the console or from work an agent separated out
	 * mid-run, and neither has an originating message. When present it rides onto the `ISSUE_RESULT`
	 * item, which is what lets the composed answer quote the request instead of arriving unanchored.
	 */
	originEntryId: z.uuid().optional(),
})

export const RunIssueTurnOutputSchema = z.object({
	issueId: z.uuid(),
	outcome: z.enum(AgentRunOutcome),
	replyText: z.string().optional(),
	stopId: z.string().optional(),
	/**
	 * Whether this turn already told the operator something — the dispatcher's retry gate
	 * (`TurnReport.spoke`). False only for a TRANSPORT stop: `persistOutcome` skips `enqueueResult` for
	 * it, so nothing was queued and nothing was said.
	 */
	spoke: z.boolean(),
	/** Present only for a TRANSPORT stop kind — the dispatcher's cue to retry via `fail()` instead of consuming the item with `complete()`. */
	transportStop: z.object({ detail: z.string() }).optional(),
})

/** What the drain loop observed beyond transport — the run's conclusion and its session identity. */
interface RunObservations {
	outcome: TerminalOutcome
	agentSessionId: string | null
}

/**
 * How this turn will address the provider's session: continue the persisted one (`--resume <id>`) or
 * open a new one under an id we mint (`--session-id <id>`). Never neither — a turn with no session
 * identity at all is a turn whose successor cannot resume it.
 */
interface SessionPlan {
	resumed: boolean
	id: string
}

/**
 * Runs ONE agent turn for an issue end to end — the write-side entry point, invoked by the 6b saga on
 * `integration.message.classified`. It consumes the ONE-METHOD seam (§4.1): `AgentRunner.run()` over
 * bidirectional stream-json on plain pipes, and its three-category event union (§4.3).
 *
 *   TRANSPORT — every `frame` event becomes at most one SSE line pushed to the observer via
 *               `AgentStreamRegistry.send`, streamed STRICTLY OUTSIDE any transaction.
 *   FACTS     — the run's conclusion is persisted as context-private domain events; the internal
 *               bridge maps them to the FROZEN integration events (issue.opened
 *               / issue.completed / issue.stop_raised).
 *
 * ### The one conclusion that does NOT always become a fact here
 * `persistOutcome` is otherwise the place a conclusion always becomes fact — but a TRANSPORT stop
 * (`AUTH_REQUIRED` / `SERVER_ERROR`) is the exception: it returns before `enqueueResult` and before
 * minting `AgentRunStopRaisedEvent`, and `handle` reports it as `transportStop` with `spoke: false`
 * instead. The dispatcher decides what happens next — `fail()` and a retry, or, once attempts are
 * exhausted, `raiseStopForPoisoned` — so a transport stop becomes a RETRY in the dispatcher rather
 * than a fact minted on the first miss.
 *
 * ### What this use case STOPPED doing in Fase 3, and why each removal is structural
 * - **No `resumed` / `killed` lifecycle facts.** Both were PTY vocabulary: "the live REPL was reused"
 *   and "the pseudo-terminal died". Neither is observable over pipes, where every turn is its own
 *   process and a dead child is simply a run that ended. Native `--resume` makes resumption observable
 *   again on its own terms in Fase 4, which is the phase §5.3 assigns those two event classes to.
 *
 * ### What Fase 4 ADDED: multi-turn context, and the four guards on it
 * A second turn on the same issue does NOT re-render the transcript into the prompt. It hands the CLI
 * the session id the previous turn persisted (`--resume`), which is the whole reason the durable row
 * exists. That is only safe while the premises the row was written under still hold, so every turn
 * asks `AgentSession.resumeDecision` first and, when the answer is no, runs FRESH under a minted
 * `--session-id` and LOGS the named reason (`logResumeInvalidated`). No silent reset — AC-4.4. The
 * goal permits either a structured log or an `AGENT_RESUME_INVALIDATED` error code (§5.1) and the log
 * is the honest one: an invalidated resume is not a failure, the turn runs perfectly well.
 *
 * The `session` field is ALWAYS populated — `resumeId` or a freshly minted `newId`, never neither.
 * Letting the CLI mint its own id would leave the row's identity dependent on the stream reporting
 * one (the CLI reporting its session id in the stream), i.e. on a provider capability, for a value the
 * next turn's resume depends on. We mint; a CLI that reports a different id back still wins, because
 * `--resume` must be given whatever the CLI actually stored.
 * - **No outcome inference.** The conclusion arrives as ONE `finished` event; the accumulator
 *   translates it rather than re-deriving it from the frames.
 * - **`fact` events are not persisted here** — they arrive unstamped, by seam design (AC-1.11), and
 *   the layer that holds identity is the base `Agent` of Fase 5. Said out loud in the accumulator too.
 *
 * The two-transaction discipline is PRESERVED verbatim: the opened fact commits before the stream
 * starts (so `issue.opened` fires at spawn time), the stream runs outside any transaction, and the
 * conclusion + session row commit together afterwards.
 *
 * A exclusão "um run por issue" NÃO mora aqui: é o lease por alvo do dispatcher (`claimNext` recusa um
 * alvo com lease vivo, renovado por heartbeat enquanto o turno roda). Um segundo item para a mesma
 * issue espera o lease em vez de disputar — mesma regra que `RunOrchestratorTurn` já seguia do lado
 * thread.
 */
@injectable()
export class RunIssueTurn extends Handler<typeof RunIssueTurnInputSchema, typeof RunIssueTurnOutputSchema> {
	readonly name = 'run_issue_turn' as const
	readonly inputSchema = RunIssueTurnInputSchema
	readonly outputSchema = RunIssueTurnOutputSchema

	constructor(
		private readonly agent: IssueWorkAgent,
		private readonly runners: AgentRunnerFactory,
		private readonly providerDetector: ProviderDetector,
		private readonly registry: AgentStreamRegistry,
		private readonly sessions: AgentSessionRepository,
		private readonly mailbox: MailboxRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const { detection, runner } = await this.resolveProvider(input.provider)
		// Decided BEFORE the opened fact commits: it is a read of durable state, and the argv it
		// produces has to exist by the time the stream starts.
		const session = await this.resolveSession(input, detection)

		// FACT — spawn/opened, persisted before streaming so issue.opened fires at spawn time.
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(
				new AgentRunStartedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: { issueId: input.issueId, threadId: input.threadId, key: input.key, title: input.title, provider: input.provider },
				}),
				tx,
			)
		})

		// TRANSPORT — stream the run's frames to the SSE observer, strictly outside any tx.
		const observed = await this.drainRun(input, runner, detection, session)

		// FACT — the run's conclusion.
		const stopId = observed.outcome.kind === 'STOPPED' ? uuidv7() : undefined
		await this.withTransaction(tx, async tx => {
			await this.persistOutcome(input, observed.outcome, stopId, tx)
			await this.upsertSessionRecord(input, observed.agentSessionId ?? session.id, tx)
		})

		const transportStop =
			observed.outcome.kind === 'STOPPED' && isTransportStopKind(observed.outcome.stopKind)
				? { detail: observed.outcome.detail }
				: undefined

		return {
			issueId: input.issueId,
			outcome: observed.outcome.kind === 'COMPLETED' ? AgentRunOutcome.COMPLETED : AgentRunOutcome.STOPPED,
			replyText: observed.outcome.kind === 'COMPLETED' ? observed.outcome.replyText : undefined,
			stopId,
			spoke: !transportStop,
			transportStop,
		}
	}

	/**
	 * Resolve the binary, its probed capabilities AND the runner that will drive it, in one call.
	 *
	 * `caps` is threaded to `run()` beside `binaryPath` rather than read from an ambient map, which is
	 * the whole point of §4.7: `ClaudeAgentRunner.buildArgs` stays a pure function of its arguments, so
	 * the argv can never depend on whether detection happened to have run yet.
	 *
	 * ### Two DIFFERENT questions, asked in this order and of different layers
	 * `ProviderDetector` answers "is the binary INSTALLED" — nothing more. `PROVIDER_BINARIES` declares
	 * real `bin` names for codex/opencode so they show up correctly in `DetectProviders`, even though
	 * neither has a runner yet (they are DETECT-ONLY), and `AttachThread` only checks installation. So
	 * a thread on a machine with the codex CLI on PATH can declare `providers: ['CODEX']` and pass
	 * detection cleanly.
	 *
	 * "Can we DRIVE it" is a wiring question, and `AgentRunnerFactory.for()` is where it is asked and
	 * where the named `NOT_IMPLEMENTED` is raised. It used to be an `includes()` here against a flat
	 * `RUNNER_SUPPORTED_PROVIDERS` const declared beside the `AgentRunner` binding — two statements of
	 * one fact, and the const had no way of noticing a second runner being bound. AC-4.5.3 is
	 * unchanged: the resolution belongs to the wiring layer, and no class under `services/AgentRunner`
	 * names a `ProviderKind`.
	 *
	 * The order matters and is preserved: NOT-INSTALLED is reported before CANNOT-DRIVE, so an
	 * operator missing the binary is told to install it rather than told the product does not support
	 * their CLI.
	 */
	private async resolveProvider(provider: ProviderKind): Promise<{ detection: DetectedProvider; runner: AgentRunner }> {
		const detection = await this.providerDetector.resolve(provider)
		if (!detection || detection.status !== ProviderStatus.DETECTED) {
			throw new BaseError<AgentApplicationErrors>('PROVIDER_NOT_DETECTED', `provider ${provider} is not installed`)
		}
		return { detection, runner: this.runners.for(provider) }
	}

	private async drainRun(
		input: this['input'],
		runner: AgentRunner,
		detection: DetectedProvider,
		session: SessionPlan,
	): Promise<RunObservations> {
		const accumulator = new TerminalOutputAccumulator({ issueId: input.issueId })

		// The AGENT, not the runner (Fase 5, §4.8): `IssueWorkAgent.buildRequest` is the one place allowed
		// to assemble an `AgentRunRequest`, and the base's template-method `run()` is what stamps the
		// agent identity onto it (and, from Fase 6, mints the run token and attaches `mcp`). What this use
		// case resolved — the detected binary + its probed caps, and the session plan — travels IN the
		// agent's input, because detection (§4.7, incl. the `AgentRunnerFactory.for` misrouting guard)
		// and the resume decision (§4.10) are use-case concerns by contract. The RUNNER travels as a
		// separate parameter rather than inside that input: it is not data the agent reasons about, it
		// is the transport the agent is pointed at.
		for await (const event of this.agent.run(runner, {
			ownerId: input.ownerId,
			issueId: input.issueId,
			threadId: input.threadId,
			cwd: input.workspacePath,
			prompt: input.prompt,
			turnKind: input.turnKind,
			// WHO is asking, in the grammar's own terms. A steer fired by a schedule is not the operator
			// leaning over the issue, and the prompt says so instead of flattening both to `operator`.
			speaker: input.firedByLoop ? `${MessageVia.LOOP}:${input.firedByLoop}` : OPERATOR_PARTICIPANT_ID,
			via: input.firedByLoop ? MessageVia.LOOP : input.turnKind === MailboxItemKind.STEER ? MessageVia.STEER : undefined,
			// The turn's own instant, read once — same discipline as `RunOrchestratorTurn`, and the reason
			// the prompt builder is a pure renderer with no clock of its own.
			now: new Date(),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			key: input.key,
			title: input.title,
			customPrompt: input.customPrompt,
			model: input.model ?? AgentModelId.DEFAULT,
			// EXACTLY ONE of the two is set. `buildArgs` treats them as mutually exclusive by
			// construction, so handing it both would make the argv version-dependent.
			session: session.resumed ? { resumeId: session.id } : { newId: session.id },
			binaryPath: detection.binaryPath,
			caps: detection.caps,
		})) {
			const frame = accumulator.feed(event)
			if (frame) await this.registry.send(input.issueId, frame)
		}

		return { outcome: accumulator.outcome(), agentSessionId: accumulator.sessionId }
	}

	/**
	 * Persist the run's conclusion — and this is where §4.3 rule 7 (ONE producer per fact) is enforced.
	 *
	 * ### The predicate is the agent's TOOL SCOPE, and it cannot be `request.mcp`
	 * `AgentRunRequest` is assembled INSIDE the agent (§4.2/§4.5): this use case injects the agent and
	 * calls `agent.run(input)`, so it never sees the request and `if (request.mcp)` would be literally
	 * unreachable from here. The equivalent predicate it CAN see is `agent.tools.length`, and the
	 * equivalence is exact rather than approximate, because the two rules that sustain it are closed:
	 * §4.2 ("empty `tools` ⇒ no `mcp` is built at all") and §4.7 (an agent that REQUIRES tools against a
	 * provider with no `mcpConfigFlag` fails named with `AGENT_TOOLS_UNSUPPORTED`, never degrades
	 * silently). There is no third case, so `request.mcp` present ⟺ `agent.tools.length > 0`.
	 *
	 * ### What that buys, concretely
	 * With a non-empty scope the agent DECLARES its conclusion through `TransitionIssueStatus` /
	 * `RaiseStop`, which already raise these exact event classes with `FactSource.DECLARED`. Minting a
	 * second one from the terminal outcome would publish the frozen `integration.issue.completed`
	 * TWICE — the double-publish AC-6.4 measures, and the reason the degenerate case ("declared AND
	 * also ended normally") is a named test rather than a footnote.
	 *
	 * ### The one thing that is minted unconditionally
	 * A TRANSPORT stop (`AUTH_REQUIRED` / `SERVER_ERROR`) never depended on a tool — the runner
	 * observes it on the process/stream — so it is minted whatever the scope is, always `INFERRED`.
	 * The accumulator can only ever report a transport kind (`TerminalOutputAccumulator.outcome()`
	 * narrows to the transport half by construction), which is what makes "a run without tools cannot
	 * manufacture a DOMAIN stop" true by type rather than by discipline.
	 *
	 * An `if` on `agent.tools.length` is legitimate here: it is fact-origin POLICY, not a provider
	 * branch (§8 rule 4 forbids `if (provider === 'x')`, not this).
	 */
	private async persistOutcome(input: this['input'], outcome: TerminalOutcome, stopId: string | undefined, tx: Transaction): Promise<void> {
		// A TRANSPORT stop is not a fact YET. Enqueueing the ISSUE_RESULT here would announce a failure
		// the dispatcher's retry is about to contradict, and persisting the Stop would give the operator
		// two signals for one event — the alarm now, the answer a minute later. `handle` reports this
		// case as `transportStop` with `spoke: false` instead, and the dispatcher decides what happens
		// next: `fail()` and retry, or — once attempts are exhausted — `raiseStopForPoisoned`.
		if (outcome.kind === 'STOPPED' && isTransportStopKind(outcome.stopKind)) return

		// THE RESULT GOES BACK TO THE CONVERSATION (§6.3, B1) — in THIS transaction, beside the outcome
		// facts. Transactional ⇒ exactly-once: an outcome that commits always has a result queued, and
		// one that rolls back queues nothing, so "the summary had no source" cannot happen by
		// construction.
		//
		// This REPLACES `AgentRunReplyDraftedEvent`, which used to carry the same text to
		// the old raw-delivery handler and out to the channel UNEDITED. Keeping both would put the worker's
		// unedited voice on the wire in a race with the orchestrator's composed answer — two messages
		// per conclusion, which is the hole the design review found (§5). The text is the same; what
		// changed is who says it.
		await this.enqueueResult(input, outcome, tx)

		if (outcome.kind === 'COMPLETED') {
			if (this.agent.tools.length > 0) return
			await this.domainEventRepository.save(
				new AgentRunCompletedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						issueId: input.issueId,
						threadId: input.threadId,
						key: input.key,
						completedAt: new Date(),
						source: FactSource.INFERRED,
					},
				}),
				tx,
			)
			return
		}

		// Transport stops are ALWAYS minted (see the docblock); a domain stop can only reach this
		// branch if the accumulator's type narrowing were broken, and gating it costs nothing.
		if (!isTransportStopKind(outcome.stopKind) && this.agent.tools.length > 0) return
		await this.domainEventRepository.save(
			new AgentRunStopRaisedEvent({
				entityId: input.issueId,
				ownerId: input.ownerId,
				payload: {
					stopId: stopId ?? uuidv7(),
					issueId: input.issueId,
					threadId: input.threadId,
					kind: outcome.stopKind,
					detail: outcome.detail,
					source: FactSource.INFERRED,
				},
			}),
			tx,
		)
	}

	/**
	 * Decide, BEFORE the spawn, whether this turn continues the issue's existing CLI session or opens
	 * a new one — and, when it opens a new one, say why in a structured log.
	 *
	 * The id is minted here in both branches (see the class docblock): the row's identity must not
	 * depend on the provider reporting one back.
	 */
	private async resolveSession(input: this['input'], detection: ProviderDetection): Promise<SessionPlan> {
		const existing = await this.sessions.findByIssueId(input.issueId)
		if (!existing) return { resumed: false, id: uuidv7() }

		// Gate on the PROVIDER's own capability BEFORE ever asking the row to resume — a CLI that
		// cannot natively resume a session (`caps.sessionResume` unset) must never be handed
		// `--resume`, no matter what the row says. Read from `ProviderDetection.caps` — the
		// RUNTIME-PROBED shape (§4.7) — rather than a static per-provider flag, which is exactly why
		// this line survived Fase 4.5 untouched: the per-CLI data literal and its registry died, their static
		// fields moved onto the concrete runner, while `ProviderDetector` stayed and kept returning
		// `caps: ProviderCapabilities` unchanged (AC-5.9).
		if (!detection.caps?.sessionResume) {
			this.logging.warn({
				content: {
					message: 'provider has no native session resume capability — starting a fresh provider session',
					issueId: input.issueId,
					threadId: input.threadId,
					provider: input.provider,
					abandonedSessionId: existing.agentSessionId,
				},
			})
			return { resumed: false, id: uuidv7() }
		}

		const decision = existing.resumeDecision({
			model: input.model ?? AgentModelId.DEFAULT,
			cwd: input.workspacePath,
			cursor: input.priorMessageId,
		})
		if (decision.resume) return { resumed: true, id: decision.id }

		this.logResumeInvalidated(input, existing.agentSessionId, decision.reason)
		return { resumed: false, id: uuidv7() }
	}

	/**
	 * AC-4.4 — the ONE place a resume is dropped, and it is never silent.
	 *
	 * `warn`, not `info`: an invalidated resume means the next turn starts without the conversation
	 * the operator believes it has, which is exactly the class of thing someone reads logs to find
	 * out about after the fact. It is not an error — the turn runs — which is why it is not a
	 * `BaseError` and why §5.1's `AGENT_RESUME_INVALIDATED` code is deliberately NOT created.
	 */
	private logResumeInvalidated(input: this['input'], abandonedSessionId: string, reason: ResumeInvalidationReason): void {
		this.logging.warn({
			content: {
				message: 'agent session resume invalidated — starting a fresh provider session',
				reason,
				issueId: input.issueId,
				threadId: input.threadId,
				provider: input.provider,
				model: input.model ?? AgentModelId.DEFAULT,
				cwd: input.workspacePath,
				abandonedSessionId,
			},
		})
	}

	/**
	 * Durable per-issue session record: resume identity, the premises it holds, and last-turn recency.
	 *
	 * `agentSessionId` is `string`, not `string | null` — the ONE call site passes
	 * `observed.agentSessionId ?? session.id`, and `session.id` is always minted (see the class
	 * docblock), so the fallback never actually falls through to nothing. Typing it as always-present
	 * says so instead of guarding against a case that cannot occur here.
	 */
	private async upsertSessionRecord(input: this['input'], agentSessionId: string, tx: Transaction): Promise<void> {
		const model = input.model ?? AgentModelId.DEFAULT
		const existing = await this.sessions.findByIssueId(input.issueId, tx)
		if (existing) {
			existing.recordTurn({ agentSessionId, model, cwd: input.workspacePath, lastMessageId: input.messageId })
			await this.sessions.save(existing, tx)
			return
		}
		await this.sessions.save(
			AgentSession.create({
				ownerId: input.ownerId,
				issueId: input.issueId,
				threadId: input.threadId,
				provider: input.provider,
				cwd: input.workspacePath,
				agentSessionId,
				model,
				lastMessageId: input.messageId,
			}),
			tx,
		)
	}

	/**
	 * Queue the conversational turn that will TELL the operator what happened.
	 *
	 * The payload is shaped for `OrchestratorInputSchema`'s `ISSUE_RESULT` member, plus `originEntryId`,
	 * which the schema deliberately does NOT expose to the model: the issue return always quotes it
	 * (§7.6), so `RunOrchestratorTurn` sets `replyToEntryId` itself rather than trusting a sentinel.
	 * Carrying it on the item and withholding it from the agent's view is what makes that structural.
	 *
	 * `dedupKey` is the issue AND THE TURN, and the second half is not decoration.
	 *
	 * It used to be the issue alone, under the premise that "an issue concludes once". A reopened
	 * issue concludes again, and the key made every conclusion after the first vanish: `enqueue` hit
	 * `onConflictDoNothing`, returned `false`, and nobody reads that boolean. Measured 2026-08-05 —
	 * the dashboard issue concluded at 23:57 (announced) and again at 00:38 (silence), and the
	 * operator asked "deu certo? você não me avisou nada"; the loops issue burnt its slot on a STOP at
	 * 21:23 and had no way to speak when it actually completed at 02:38.
	 *
	 * What the key must still block is a REDELIVERED outcome scheduling a second announcement of the
	 * SAME turn — and a redelivery carries the same `messageId` (the mailbox item that drove it), so
	 * keying on the pair keeps that protection exactly while letting a NEW turn speak.
	 */
	private async enqueueResult(input: this['input'], outcome: TerminalOutcome, tx: Transaction): Promise<void> {
		await this.mailbox.enqueue(
			{
				ownerId: input.ownerId,
				targetKind: MailboxTargetKind.THREAD,
				targetId: input.threadId,
				kind: MailboxItemKind.ISSUE_RESULT,
				payload: {
					kind: MailboxItemKind.ISSUE_RESULT,
					issueKey: input.key,
					outcome:
						outcome.kind === 'COMPLETED'
							? { kind: AgentRunOutcome.COMPLETED, replyText: outcome.replyText }
							: { kind: AgentRunOutcome.STOPPED, stopKind: outcome.stopKind, detail: outcome.detail },
					originEntryId: input.originEntryId,
				},
				dedupKey: `result:${input.issueId}:${input.messageId}`,
			},
			tx,
		)
	}
}
