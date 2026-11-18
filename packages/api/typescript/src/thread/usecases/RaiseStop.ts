import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, CommandQueue } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { OutputRouting, StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { StopAskSchema } from '@shared/objects'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { StopPolicyConfigRepository, type StopPolicy } from '../repositories/StopPolicyConfigRepository'
import { causeAlreadyTold, LEVEL_OF_STOP } from '../utils/OutputPolicy'
import { StopAsk } from '../objects/StopAsk'
import type { Stop, Thread, TranscriptEntry } from '../entities/Thread'
import { THREAD_MESSAGES } from '../i18n/messages'
import { enqueueSignalDelivery, recordIssueSignal } from '../utils/issueSignal'
import { askCode } from '../utils/askAnswer'
import type { ApplicationErrors } from '../errors'

export const RaiseStopInputSchema = z.object({
	stopId: z.uuid(),
	threadId: z.uuid(),
	/**
	 * OPTIONAL since B4 (spec decision 4) — and this single character is the feature. A stop with no
	 * issue is the orchestrator's needs-approval, raised before any issue exists; while this key was
	 * required the case was unreachable no matter what the aggregate allowed.
	 */
	issueId: z.uuid().optional(),
	kind: z.enum(StopKind),
	/**
	 * OPCIONAL desde o catálogo de canal: o título PADRÃO de cada kind agora vive em `THREAD_MESSAGES`
	 * e é resolvido aqui, onde o idioma do operador está em mãos. Quem passa um título explícito é
	 * `RecordStopFromExecution` no caso `HUMAN_REQUESTED`, onde o título É a pergunta que o agente
	 * escreveu — texto de autor, não rótulo de condição, e por isso não pertence a catálogo nenhum.
	 */
	title: z.string().optional(),
	detail: z.string(),
	/**
	 * The ASK of a `DECISION_REQUESTED` / `QUESTION_ASKED` stop (fase 3) — required for those two kinds and
	 * refused on every other (`ASKED_AS`). The `StopAsk` value object validates it and decides the kind it is
	 * raised as: any declared effect escalates a question to a decision.
	 */
	ask: StopAskSchema.optional(),
})

export const RaiseStopOutputSchema = z.object({ stopId: z.uuid() })

const POLICY_KEY: Record<StopKind, keyof StopPolicy> = {
	[StopKind.SERVER_ERROR]: 'serverErrors',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'blockedByClassification',
	[StopKind.HUMAN_REQUESTED]: 'humanRequested',
	[StopKind.APPROVAL_NEEDED]: 'approvalNeeded',
	[StopKind.AUTH_REQUIRED]: 'authRequired',
	[StopKind.PERMISSION_DENIED]: 'permissionDenied',
	// Fase 3: the issue's asks and the reconciler's stall are all "a person is needed", so they share the
	// existing criterion — no new column; turning "human requests" off still turns every one of them off.
	[StopKind.DECISION_REQUESTED]: 'humanRequested',
	[StopKind.QUESTION_ASKED]: 'humanRequested',
	[StopKind.STALLED]: 'humanRequested',
}

/**
 * C24 RaiseStop — records a Stop for the Needs-You panel, but ONLY when the criterion is enabled in
 * StopPolicyConfig (`STOP_CRITERION_DISABLED` otherwise). Driven by the terminal's stop fact via
 * `RecordStopFromExecution`; that handler swallows the disabled/archived cases as a no-op.
 *
 * ### Why this lives in `thread/` since B4
 * The Stop is a child of the `Thread` aggregate (spec decision 4), so this use case loads a `Thread`,
 * calls a method on it and saves it. `docs/BACKEND.md:170` forbids importing another context's entities
 * and `:173` restricts changing another context's state to integration events — a version of this use
 * case sitting in `issue/` would break both. It reads `IssueRepository` for the archived guard, which is
 * the sanctioned cross-context shape (a repository READ, `docs/BACKEND.md:412`).
 *
 * ### `ownerId` comes from the THREAD
 * It used to come from `issue.ownerId`, which is exactly what made a stop without an issue impossible to
 * scope. The thread always exists and always knows its owner.
 *
 * ### Por que o AVISO NO CANAL é enfileirado AQUI
 * Porque aqui existe transação. O handler acima roda fora de uma, e uma queda entre "o stop foi
 * gravado" e "o aviso foi enfileirado" perderia exatamente o aviso — a classe de falha que esta
 * feature existe para corrigir. Enfileirado dentro do mesmo `withTransaction` que salva a thread, um
 * stop que commita sempre avisou, e um que falha nunca deixa mensagem órfã no canal. É a mesma forma
 * que `RecordOrchestratorReply` usa, e nenhum agent runner participa: entrada `SYSTEM` no transcript
 * mais comando durável, que é a propriedade que torna o aviso possível justamente quando o agente não
 * pode falar.
 *
 * ### A política de saída (fase 3) decide O QUÊ e PARA ONDE
 * O stop de uma ISSUE fala pelo nível dele (`LEVEL_OF_STOP`) e pelo modo do grupo (`ROUTING_BY_MODE`),
 * no formato do nível (`recordIssueSignal`, compartilhado com `DeliverIssueSignal`): a decisão e a
 * pergunta saem com o código (`APP-12 · D1`, `seq` lido aqui dentro da transação), a entrada guarda o
 * `stop_id` e o stop guarda a entrada (`askEntryId`); um aviso de bloqueio sai UMA vez por causa enquanto
 * a causa dura (`causeAlreadyTold`), os seguintes só no painel. `HUMAN_REQUESTED` e `APPROVAL_NEEDED` não
 * têm nível: nascem de um turno que falou. O stop da CONVERSA (sem issue) mantém o aviso de hoje.
 */
@injectable()
export class RaiseStop extends Handler<typeof RaiseStopInputSchema, typeof RaiseStopOutputSchema> {
	readonly name = 'raise_stop' as const
	readonly inputSchema = RaiseStopInputSchema
	readonly outputSchema = RaiseStopOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly issues: IssueRepository,
		private readonly policy: StopPolicyConfigRepository,
		private readonly session: CloudSession,
		private readonly commands: CommandQueue,
		private readonly panel: PanelPublisher,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// IDEMPOTENT, and it is a NAMED tightening (see the Scope fence). `stopId` is decided upstream and
		// the fact that drives this is at-least-once, so a redelivery arrives with the SAME id — which used
		// to hit the primary key of `issue_stops` and THROW. The handler above only swallows three named
		// codes, so the outbox retried a constraint violation five times and dead-lettered the needs-you
		// signal: the operator never saw the card. Early return is the shape `OpenIssue` already uses for
		// exactly this ("returns early when it already exists"), and it is what makes the docstring's
		// promise — the sanctioned outcomes are a no-op, "not surfaced" — actually true.
		const existing = await this.threads.findStop(input.stopId)
		if (existing) return { stopId: existing.stopId }

		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		// The archived guard applies only when there IS an issue. A thread-level stop has no issue to be
		// archived, and demanding one back would re-close the hole decision 4 opens.
		const issue = input.issueId ? await this.issues.findById(input.issueId) : undefined
		if (input.issueId) {
			if (!issue) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
			if (issue.archived) throw new BaseError<ApplicationErrors>('ISSUE_ARCHIVED', `issue ${input.issueId} is archived`)
		}

		const policy = await this.policy.get(thread.ownerId)
		if (!policy[POLICY_KEY[input.kind]]) {
			throw new BaseError<ApplicationErrors>('STOP_CRITERION_DISABLED', `the ${input.kind} criterion is disabled`)
		}

		// The ask kinds carry an ask and only they do (fase 3): the value object refuses an ask on a kind that
		// does not ask, the aggregate refuses an ask kind raised without one.
		const ask = input.ask ? StopAsk.forKind(input.kind, input.ask) : undefined
		// The kind the stop is RAISED as: an ask's own (escalated by any effect), the fact's otherwise.
		const kind = ask?.kind ?? input.kind
		const level = LEVEL_OF_STOP[kind]

		// O IDIOMA SÓ É BUSCADO QUANDO ALGUÉM VAI USÁ-LO — e essa é a correção, não uma otimização.
		//
		// Ele alimenta exatamente dois textos: o título genérico (só quando o chamador não trouxe um) e a
		// mensagem que vai ao canal (só para os kinds que têm nível). Para `HUMAN_REQUESTED` nenhum dos dois
		// acontece: `LEVEL_OF_STOP` é null e `RecordStopFromExecution` já preenche o título com o `detail`
		// do agente. A resolução eager que existia aqui era, nesse caminho, trabalho jogado fora.
		//
		// E jogado fora de um jeito caro: ela vinha do `OwnerDirectory`, bindado pelo registry do contexto
		// `owner`, que é CLOUD-ONLY. No desktop o token não tem binding, o tsyringe construía a classe
		// ABSTRATA — um objeto sem métodos — e este método estourava `TypeError` antes de gravar coisa
		// alguma. Nenhum Stop foi gravado no desktop desde 2026-08-10 por causa disso.
		//
		// A fonte agora é `CloudSession`, que mora em `shared` e É bindada no perfil local. A direção do
		// ADR 0001 fica intacta: a nuvem continua sendo a única autoridade sobre identidade — o desktop
		// pergunta, não decide. A língua DECLARADA da conversa, quando existe, vence (fase 3).
		const needsLanguage = !thread.language && (input.title === undefined || level !== null)
		const ownerLanguage = needsLanguage ? (await this.session.identity())?.user.language : undefined
		const language = resolveThreadLanguage(thread.language, ownerLanguage)
		const title = input.title ?? THREAD_MESSAGES.stopTitle(language, { kind })

		return this.withTransaction(tx, async tx => {
			// What the stop says on the channel, recorded BEFORE the stop so the stop can point at it.
			let notice: { entry: TranscriptEntry; routing: OutputRouting } | undefined
			if (level !== null && issue) {
				// An ISSUE's stop speaks through the output policy (fase 3): the format of its level, its code,
				// the group's mode, and one notice per cause.
				const others = await this.threads.openStops(thread.id.value, tx)
				const seq = ask ? await this.threads.nextAskSeq(issue.id.value, tx) : undefined
				// A question goes out in its person's digest: the declared addressee, or whoever asked for the work.
				const requesterId =
					ask && issue.originEntryId ? (await this.threads.findEntry(issue.originEntryId, tx))?.senderExternalId : undefined
				notice = recordIssueSignal(
					thread,
					{
						issue: { issueId: issue.id.value, key: issue.key, title: issue.title },
						level,
						title,
						// The question the stop puts, or the provider's detail verbatim; empty is fine — the format of a
						// decision falls back to the title, a notice simply has no body.
						text: ask?.question ?? input.detail,
						code: seq === undefined ? undefined : askCode(issue.key, seq),
						options: ask?.options.map(option => option.label),
						defaultLabel: ask?.defaultLabel(),
						addresseeId: ask?.addresseeId,
						requesterId,
						stopId: input.stopId,
						alreadyTold: causeAlreadyTold(
							kind,
							others.map(other => other.kind),
						),
					},
					{ language, panelLink: this.panel.linkOf(thread.id.value) },
				)
				const stop = this.raise(thread, input, { title, ask, seq, askEntryId: notice.entry.entryId })
				return this.commit(thread, stop, notice, tx)
			}
			if (level !== null) {
				// A stop of the CONVERSATION (the orchestrator's, no issue) is not an issue's signal: it keeps
				// today's notice — the title and the provider's detail, verbatim.
				const entry = thread.recordEntry({
					kind: TranscriptKind.SYSTEM,
					text: THREAD_MESSAGES.stopChannelNotice(language, { kind, detail: input.detail }),
				})
				notice = { entry, routing: OutputRouting.GROUP }
			}
			const stop = this.raise(thread, input, { title, ask })
			return this.commit(thread, stop, notice, tx)
		})
	}

	private raise(thread: Thread, input: this['input'], asked: { title: string; ask?: StopAsk; seq?: number; askEntryId?: string }): Stop {
		const common = { stopId: input.stopId, issueId: input.issueId, title: asked.title, detail: input.detail }
		return asked.ask
			? thread.raiseStop({ ...common, ask: asked.ask, seq: asked.seq, askEntryId: asked.askEntryId })
			: thread.raiseStop({ ...common, kind: input.kind })
	}

	/** Save the thread with its stop (and notice) and queue the notice's delivery in the same transaction. */
	private async commit(
		thread: Thread,
		stop: Stop,
		notice: { entry: TranscriptEntry; routing: OutputRouting } | undefined,
		tx: Transaction,
	): Promise<this['output']> {
		await this.threads.save(thread, tx)
		if (notice) await enqueueSignalDelivery(this.commands, thread, notice.entry, notice.routing, tx)
		return { stopId: stop.stopId }
	}
}
