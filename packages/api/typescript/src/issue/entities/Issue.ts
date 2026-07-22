import { AggregateRoot, BaseError, z } from '@codedm/core-typescript'
import type Z from 'zod'
import { IssueStatus, ProviderKind, IssueArchiveReason } from '@codedm/contracts-typescript/wire/enums'
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
})

export type IssueProps = Z.infer<typeof IssueSchema>

/**
 * `Issue` (BC5 Issue Execution, Core) — a unit of concurrent work with its own terminal session.
 * Invariants: `key` unique within the thread (DB-enforced); stops only while not archived (guarded
 * by RaiseStop); lifecycle NEEDS_INPUT → WORKING → COMPLETED, plus archive (MANUAL / AUTO_24H /
 * THREAD_DETACHED) and restore. Stops + the terminal log are separate tables (own lifecycles/scale).
 */
export class Issue extends AggregateRoot<typeof IssueSchema> {
	static override schema = IssueSchema

	static open(data: { ownerId: string; threadId: string; key: string; title: string; provider: ProviderKind; status?: IssueStatus }): Issue {
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
		})
	}

	complete(meta?: string): void {
		if (this.status === IssueStatus.COMPLETED) throw new BaseError<DomainErrors>('ISSUE_ALREADY_COMPLETED')
		this.status = IssueStatus.COMPLETED
		this.completedAt = new Date()
		if (meta !== undefined) this.meta = meta
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
