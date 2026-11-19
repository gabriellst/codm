import { injectable } from 'tsyringe-neo'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { LibSqlDatabaseDriver, z } from '@codm/core-typescript'
import { agentMailbox, events } from '@codm/contracts/db'
import { MailboxClaimClass, MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ArtifactRepository } from '@artifact/repositories/ArtifactRepository'
import { IssueSpokeEvent, IssueSpokeEventSchema } from '../../events/IssueSpokeEvent'
import { IssueAttributesRepository } from '../../repositories/IssueAttributesRepository'
import { GitWorktreeProbe } from '../GitWorktreeProbe'
import { clip, HANDOFF_DIGEST_LIMITS, HandoffNotes, lastOf, type HandoffDigest, type HandoffSubject } from './HandoffNotes'

const WorkPayloadSchema = z.object({ goal: z.string() })
const TextPayloadSchema = z.object({ text: z.string() })

/** The claim classes whose consumed items are messages people sent the task (the reminder and the answers apart). */
const MESSAGE_CLASSES = [MailboxClaimClass.STEER, MailboxClaimClass.INTERRUPT] as const

/**
 * The derived notes from the store (fase 4, item 6a):
 *  - the agent's OWN queue (`agent_mailbox`, the issue's items): the brief (`WORK`), the answers the task resumed on
 *    (`DECISION_ANSWER`) and the messages it already read (`STEER` / `INTERRUPT`) — consumed ones only: a pending item
 *    reaches the session as its own turn;
 *  - the agent's OWN facts (`agent.issue_spoke`): what the task said it did;
 *  - the stops still open (`ThreadRepository.openStopsByIssue`) and the artifacts it recorded (`ArtifactRepository`),
 *    through the repository surfaces `agent` already consumes;
 *  - git, for the worktree the task registered (or the turn's cwd).
 * A payload that does not parse is skipped — the same posture the timeline takes with a malformed row.
 */
@injectable()
export class LibSqlHandoffNotes extends HandoffNotes {
	constructor(
		private readonly driver: LibSqlDatabaseDriver,
		private readonly threads: ThreadRepository,
		private readonly artifacts: ArtifactRepository,
		private readonly attributes: IssueAttributesRepository,
		private readonly git: GitWorktreeProbe,
	) {
		super()
	}

	async digest(subject: HandoffSubject): Promise<HandoffDigest> {
		const db = this.driver.db
		const [items, spoken, stops, recorded, attributes] = await Promise.all([
			db
				.select({
					kind: agentMailbox.kind,
					claimClass: agentMailbox.claimClass,
					payload: agentMailbox.payload,
					consumedAt: agentMailbox.consumedAt,
				})
				.from(agentMailbox)
				.where(
					and(
						eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
						eq(agentMailbox.targetId, subject.issueId),
						isNull(agentMailbox.deadAt),
					),
				)
				.orderBy(asc(agentMailbox.createdAt), asc(agentMailbox.id)),
			db
				.select({ payload: events.payload })
				.from(events)
				.where(and(eq(events.entityId, subject.issueId), eq(events.name, IssueSpokeEvent.name)))
				.orderBy(asc(events.occurredAt), asc(events.id)),
			this.threads.openStopsByIssue(subject.issueId),
			this.artifacts.listByThread(subject.threadId),
			this.attributes.findByIssueId(subject.issueId),
		])

		const goal = items
			.filter(item => item.kind === MailboxItemKind.WORK)
			.map(item => WorkPayloadSchema.safeParse(item.payload).data?.goal)[0]
		const consumedTexts = (classes: readonly MailboxClaimClass[]) =>
			items
				.filter(item => item.consumedAt !== null && item.kind === MailboxItemKind.STEER && classes.includes(item.claimClass))
				.flatMap(item => {
					const text = TextPayloadSchema.safeParse(item.payload).data?.text
					return text ? [clip(text)] : []
				})
		const progress = spoken.flatMap(row => {
			const text = IssueSpokeEventSchema.shape.payload.safeParse(row.payload).data?.text
			return text ? [clip(text)] : []
		})

		const treePath = attributes?.worktreePath ?? subject.cwd
		const tree = await this.git.workingState(treePath)

		return {
			title: subject.title,
			goal: goal ? clip(goal, HANDOFF_DIGEST_LIMITS.itemChars * 4) : undefined,
			answers: lastOf(consumedTexts([MailboxClaimClass.DECISION_ANSWER]), HANDOFF_DIGEST_LIMITS.answers),
			openQuestions: lastOf(
				stops.map(stop => {
					const asked = stop.ask && `asked: ${stop.ask.question} (options: ${stop.ask.options.map(option => option.label).join(' / ')})`
					return clip([stop.title, asked, stop.detail].filter(part => part).join(' — '))
				}),
				HANDOFF_DIGEST_LIMITS.openQuestions,
			),
			recentMessages: lastOf(consumedTexts(MESSAGE_CLASSES), HANDOFF_DIGEST_LIMITS.recentMessages),
			artifacts: lastOf(
				recorded
					.filter(artifact => artifact.issueId === subject.issueId)
					.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
					.map(artifact => clip(`${artifact.name} (${artifact.kind}): ${artifact.ref}`)),
				HANDOFF_DIGEST_LIMITS.artifacts,
			),
			progress: lastOf(progress, HANDOFF_DIGEST_LIMITS.progress),
			git: tree && { path: treePath, branch: tree.branch, changes: tree.changes.slice(0, HANDOFF_DIGEST_LIMITS.gitChanges) },
		}
	}
}
