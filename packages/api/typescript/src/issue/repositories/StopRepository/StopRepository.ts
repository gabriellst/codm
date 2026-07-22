import type { Transaction } from '@codedm/core-typescript'
import type { StopKind, StopResolution } from '@codedm/contracts-typescript/wire/enums'

export interface StopRow {
	stopId: string
	ownerId: string
	issueId: string
	threadId: string
	kind: StopKind
	title: string
	detail: string
	raisedAt: Date
	resolution?: StopResolution
	resolvedAt?: Date
}

export interface RaiseStopInput {
	stopId: string
	ownerId: string
	issueId: string
	threadId: string
	kind: StopKind
	title: string
	detail: string
}

/** The Stop entity store (raise → resolve). Queried across issues for the Needs-You panel (T14). */
export abstract class StopRepository {
	abstract raise(input: RaiseStopInput, tx?: Transaction): Promise<StopRow>
	abstract findById(stopId: string, tx?: Transaction): Promise<StopRow | undefined>
	abstract openByIssue(issueId: string, tx?: Transaction): Promise<StopRow[]>
	abstract openByThread(threadId: string, tx?: Transaction): Promise<StopRow[]>
	abstract resolve(stopId: string, resolution: StopResolution, tx?: Transaction): Promise<void>
}
