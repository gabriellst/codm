import { AggregateRoot, BaseError, z } from '@codm/core-typescript'
import type Z from 'zod'
import { IssueStatus, ProviderKind, IssueArchiveReason } from '@codm/contracts-typescript/wire/enums'
import type { DomainErrors } from '../errors'

export const IssueSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	// Generated slug, unique within the thread (e.g. "pix-payment"). Doubles as the outbound label.
	key: z.string().trim().min(1),
	title: z.string().trim().min(1),
	status: z.enum(IssueStatus),
	provider: z.enum(ProviderKind),
	meta: z.string().optional(),
	archived: z.boolean(),
	archiveReason: z.enum(IssueArchiveReason).optional(),
	completedAt: z.date().optional(),
	/**
	 * The transcript entry that ASKED for this issue — the message the finished result will quote
	 * (§7.6, where the issue return always cites it).
	 *
	 * OPTIONAL, and it has to be: `DeclareIssueOpen` also opens issues for work an agent separated out
	 * mid-run, and `CreateIssueController` opens them from the console. Neither has an originating
	 * message. Making it required would break both, which is why §6.2 states it as nullable and
	 * mandatory only on the orchestrator path.
	 */
	originEntryId: z.uuid().optional(),
	/**
	 * What the operator actually asked for, in their words — the subagent's prompt.
	 *
	 * Before the pivot the prompt was the raw inbound text, re-read from the transcript at spawn time.
	 * Now the issue OWNS its goal, because the orchestrator may reword what it heard into a brief the
	 * transcript never literally contained.
	 */
	goal: z.string().trim().min(1).optional(),
})

export type IssueProps = Z.infer<typeof IssueSchema>

/**
 * `Issue` (BC5 Issue Execution, Core) — a unit of concurrent work with its own terminal session.
 * Invariants: `key` unique within the thread (DB-enforced); lifecycle NEEDS_INPUT → WORKING →
 * COMPLETED, plus archive (MANUAL / AUTO_24H / THREAD_DETACHED) and restore. The terminal log is a
 * separate table (own lifecycle/scale: T12 replay of a transport log, unbounded per issue).
 * Stops are NOT here any more — since B4 a Stop is a child of the `Thread` aggregate (it can exist
 * without an issue at all), so `Thread.raiseStop`/`resolveStop` own it and this line no longer covers it.
 */
export class Issue extends AggregateRoot<typeof IssueSchema> {
	static override schema = IssueSchema

	static open(data: {
		ownerId: string
		threadId: string
		key: string
		title: string
		provider: ProviderKind
		status?: IssueStatus
		originEntryId?: string
		goal?: string
	}): Issue {
		return new Issue({
			ownerId: data.ownerId,
			threadId: data.threadId,
			key: data.key,
			title: data.title,
			status: data.status ?? IssueStatus.WORKING,
			provider: data.provider,
			meta: undefined,
			archived: false,
			archiveReason: undefined,
			completedAt: undefined,
			originEntryId: data.originEntryId,
			goal: data.goal,
		})
	}

	complete(meta?: string): void {
		if (this.status === IssueStatus.COMPLETED) throw new BaseError<DomainErrors>('ISSUE_ALREADY_COMPLETED')
		this.status = IssueStatus.COMPLETED
		this.completedAt = new Date()
		if (meta !== undefined) this.meta = meta
	}

	/**
	 * COMPLETED → WORKING — o caminho de volta, e o ÚNICO.
	 *
	 * Não existe um "reabrir" que o operador aciona por si: receber trabalho é o que reabre uma issue
	 * (spec Decisão 4). Reabrir sem instrução deixaria a issue em `WORKING` sem nada enfileirado, que é
	 * um estado que ninguém consegue explicar depois. Por isso este método é chamado do caminho do
	 * steer e de lugar nenhum além dele.
	 *
	 * `completedAt` é ZERADO, e isso não é arrumação: `AutoArchiveCompletedIssues` seleciona por essa
	 * coluna. Uma issue reaberta que mantivesse o carimbo antigo seria arquivada por baixo de um agente
	 * que está trabalhando dentro dela — o pior tipo de bug, porque o sintoma aparece longe da causa.
	 */
	reopen(): void {
		this.assertNotArchived()
		if (this.status !== IssueStatus.COMPLETED) throw new BaseError<DomainErrors>('ISSUE_NOT_COMPLETED')
		this.status = IssueStatus.WORKING
		this.completedAt = undefined
	}

	archive(reason: IssueArchiveReason): void {
		if (this.archived) throw new BaseError<DomainErrors>('ISSUE_ALREADY_ARCHIVED')
		this.archived = true
		this.archiveReason = reason
	}

	restore(): void {
		if (!this.archived) throw new BaseError<DomainErrors>('ISSUE_NOT_ARCHIVED')
		this.archived = false
		this.archiveReason = undefined
	}

	/** Guard used by RaiseStop / SteerIssue — no new stops/steers on an archived issue. */
	assertNotArchived(): void {
		if (this.archived) throw new BaseError<DomainErrors>('ISSUE_ARCHIVED')
	}
}

export interface Issue extends IssueProps {}
