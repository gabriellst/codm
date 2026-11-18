import { injectable } from 'tsyringe-neo'
import { IssueLifeState, StopKind, type Language } from '@codm/contracts-typescript/wire/enums'
import { IssueBoardReader, type IssueBoardRow } from '@issue/services/IssueBoardReader'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import type { Stop, Thread } from '../../entities/Thread'
import { BulletinSection } from '../../enums'
import { THREAD_MESSAGES, type BulletinRow } from '../../i18n/messages'
import { ThreadRepository } from '../../repositories/ThreadRepository'
import { askCode } from '../../utils/askAnswer'

/** The most lines a section lists — the rest is counted ("+N no painel"). */
export const BULLETIN_SECTION_MAX = 8
/** How far back "concluídas" reaches. */
export const BULLETIN_DONE_WINDOW_MS = 24 * 60 * 60 * 1000

/** Which section an issue's life state puts it in — total over `IssueLifeState`, so a new state must choose. */
export const SECTION_OF_LIFE: Record<IssueLifeState, BulletinSection> = {
	[IssueLifeState.WAITING_PERSON]: BulletinSection.WAITING,
	[IssueLifeState.PAUSED]: BulletinSection.STOPPED,
	[IssueLifeState.STALLED]: BulletinSection.STOPPED,
	[IssueLifeState.WAITING_PROVIDER]: BulletinSection.STOPPED,
	[IssueLifeState.RUNNING]: BulletinSection.DOING,
	[IssueLifeState.QUEUED]: BulletinSection.DOING,
	[IssueLifeState.REMINDED]: BulletinSection.DOING,
	[IssueLifeState.DONE]: BulletinSection.DONE,
}

/** The asks a group decides — the stops that carry a code in the bulletin. Total over `StopKind`. */
const DECIDED_BY_THE_GROUP: Record<StopKind, boolean> = {
	[StopKind.DECISION_REQUESTED]: true,
	[StopKind.QUESTION_ASKED]: true,
	[StopKind.HUMAN_REQUESTED]: false,
	[StopKind.APPROVAL_NEEDED]: false,
	[StopKind.PERMISSION_DENIED]: false,
	[StopKind.SERVER_ERROR]: false,
	[StopKind.AUTH_REQUIRED]: false,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: false,
	[StopKind.STALLED]: false,
}

const SECTION_ORDER: readonly BulletinSection[] = [
	BulletinSection.WAITING,
	BulletinSection.STOPPED,
	BulletinSection.DOING,
	BulletinSection.DONE,
]

/**
 * THE GROUP'S BULLETIN (fase 3, item 4) — the answer to `relatorio`, composed from the board with no model:
 * Esperando decisão (with the codes of the open asks and who decides), Paradas (paused, waiting for the
 * provider — with when — or stopped saying nothing), Fazendo, Concluídas nas últimas 24 h. One line per
 * issue (key + title), at most `BULLETIN_SECTION_MAX` per section, the group's panel link at the end (none
 * without a cloud login). Sections keep the board's order inside them.
 *
 * Reads only — the board through the issue context's door (`IssueBoardReader`: its life-state rule is not
 * another context's to import), the open asks from this context's own stops.
 */
@injectable()
export class BoardBulletin {
	constructor(
		private readonly board: IssueBoardReader,
		private readonly threads: ThreadRepository,
		private readonly panel: PanelPublisher,
	) {}

	async compose(thread: Thread, language: Language, now: Date): Promise<string> {
		const [rows, open] = await Promise.all([
			this.board.boardOf(thread.id.value, new Date(now.getTime() - BULLETIN_DONE_WINDOW_MS)),
			this.threads.openStops(thread.id.value),
		])
		const asksByIssue = new Map<string, Stop[]>()
		for (const stop of open) {
			if (!stop.issueId || !DECIDED_BY_THE_GROUP[stop.kind]) continue
			asksByIssue.set(stop.issueId, [...(asksByIssue.get(stop.issueId) ?? []), stop])
		}

		const bySection = new Map<BulletinSection, BulletinRow[]>()
		for (const row of rows) {
			if (
				row.lifeState === IssueLifeState.DONE &&
				!(row.completedAt && row.completedAt.getTime() >= now.getTime() - BULLETIN_DONE_WINDOW_MS)
			)
				continue
			const section = SECTION_OF_LIFE[row.lifeState]
			bySection.set(section, [...(bySection.get(section) ?? []), this.line(thread, row, asksByIssue.get(row.issueId) ?? [])])
		}

		return THREAD_MESSAGES.boardBulletin(language, {
			sections: SECTION_ORDER.map(section => {
				const all = bySection.get(section) ?? []
				return { section, rows: all.slice(0, BULLETIN_SECTION_MAX), more: Math.max(0, all.length - BULLETIN_SECTION_MAX) }
			}),
			link: this.panel.linkOf(thread.id.value),
			now,
		})
	}

	private line(thread: Thread, row: IssueBoardRow, asks: readonly Stop[]): BulletinRow {
		const deciders = [...new Set(asks.flatMap(stop => (stop.ask?.addresseeId ? [thread.rosterNameOf(stop.ask.addresseeId)] : [])))]
		return {
			key: row.key,
			title: row.title,
			lifeState: row.lifeState,
			codes: asks.map(stop => askCode(row.key, stop.seq)),
			// A roster NAME or nothing — never the raw address.
			decider: deciders.filter((name): name is string => name !== undefined).join(', ') || undefined,
			until: row.waitingForProviderUntil,
		}
	}
}
