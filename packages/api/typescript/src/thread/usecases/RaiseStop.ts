import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, CommandQueue } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MessageAuthor, StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { StopPolicyConfigRepository, type StopPolicy } from '../repositories/StopPolicyConfigRepository'
import { NOTIFIES_ON_CHANNEL } from '../utils/StopChannelNotice'
import { THREAD_MESSAGES } from '../i18n/messages'
import type { DeliverChannelMessage } from './DeliverChannelMessage'
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
})

export const RaiseStopOutputSchema = z.object({ stopId: z.uuid() })

const POLICY_KEY: Record<StopKind, keyof StopPolicy> = {
	[StopKind.SERVER_ERROR]: 'serverErrors',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'blockedByClassification',
	[StopKind.HUMAN_REQUESTED]: 'humanRequested',
	[StopKind.APPROVAL_NEEDED]: 'approvalNeeded',
	[StopKind.AUTH_REQUIRED]: 'authRequired',
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
		if (input.issueId) {
			const issue = await this.issues.findById(input.issueId)
			if (!issue) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
			if (issue.archived) throw new BaseError<ApplicationErrors>('ISSUE_ARCHIVED', `issue ${input.issueId} is archived`)
		}

		const policy = await this.policy.get(thread.ownerId)
		if (!policy[POLICY_KEY[input.kind]]) {
			throw new BaseError<ApplicationErrors>('STOP_CRITERION_DISABLED', `the ${input.kind} criterion is disabled`)
		}

		// O IDIOMA SÓ É BUSCADO QUANDO ALGUÉM VAI USÁ-LO — e essa é a correção, não uma otimização.
		//
		// Ele alimenta exatamente dois textos: o título genérico (só quando o chamador não trouxe um) e o
		// aviso que vai ao canal (só para os kinds que notificam). Para `HUMAN_REQUESTED` nenhum dos dois
		// acontece: `NOTIFIES_ON_CHANNEL` é false e `RecordStopFromExecution` já preenche o título com o
		// `detail` do agente. A resolução eager que existia aqui era, nesse caminho, trabalho jogado fora.
		//
		// E jogado fora de um jeito caro: ela vinha do `OwnerDirectory`, bindado pelo registry do contexto
		// `owner`, que é CLOUD-ONLY. No desktop o token não tem binding, o tsyringe construía a classe
		// ABSTRATA — um objeto sem métodos — e este método estourava `TypeError` antes de gravar coisa
		// alguma. Nenhum Stop foi gravado no desktop desde 2026-08-10 por causa disso.
		//
		// A fonte agora é `CloudSession`, que mora em `shared` e É bindada no perfil local. A direção do
		// ADR 0001 fica intacta: a nuvem continua sendo a única autoridade sobre identidade — o desktop
		// pergunta, não decide.
		const needsLanguage = input.title === undefined || NOTIFIES_ON_CHANNEL[input.kind]
		const language = needsLanguage ? (await this.session.identity())?.user.language : undefined

		return this.withTransaction(tx, async tx => {
			const stop = thread.raiseStop({
				stopId: input.stopId,
				issueId: input.issueId,
				kind: input.kind,
				title: input.title ?? THREAD_MESSAGES.stopTitle(language, { kind: input.kind }),
				detail: input.detail,
			})

			if (NOTIFIES_ON_CHANNEL[input.kind]) {
				const entry = thread.recordEntry({
					kind: TranscriptKind.SYSTEM,
					text: THREAD_MESSAGES.stopChannelNotice(language, { kind: input.kind, detail: input.detail }),
				})
				await this.threads.save(thread, tx)

				// `jobId` é o id da entrada: a fila dedup nele, então uma redelivery que já commitou não
				// agenda um segundo envio do mesmo aviso.
				await this.commands.enqueueCommand<DeliverChannelMessage>(
					'deliver_channel_message',
					{
						ownerId: thread.ownerId,
						channelId: thread.channelId,
						contactExternalId: thread.contactRef.externalId,
						text: entry.text,
						author: MessageAuthor.SYSTEM,
						replyEntryId: entry.entryId,
						replyThreadId: thread.id.value,
						// This SYSTEM notice rides the SAME `recordOutbound` cue gate as an orchestrator reply
						// (reactions/streaming spec) — passed through for the identical reason
						// `RecordOrchestratorReply` does: the aggregate is already in hand here.
						reactionsEnabled: thread.reactionsEnabled,
					},
					{ jobId: entry.entryId },
					tx,
				)
				return { stopId: stop.stopId }
			}

			await this.threads.save(thread, tx)
			return { stopId: stop.stopId }
		})
	}
}
