import { injectable } from 'tsyringe-neo'
import { BlockCause, IssueLifeState, IssueSignalLevel, type Language } from '@codm/contracts-typescript/wire/enums'
import { IssueBoardReader, type IssueBoardRow } from '@issue/services/IssueBoardReader'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import type { Stop, Thread } from '../../entities/Thread'
import { BulletinSection } from '../../enums'
import { THREAD_MESSAGES, type BulletinRow } from '../../i18n/messages'
import { ThreadRepository } from '../../repositories/ThreadRepository'
import { askCode } from '../../utils/askAnswer'
import { CAUSE_OF_STOP, LEVEL_OF_STOP } from '../../utils/OutputPolicy'

/** The most lines a section lists — the rest is counted ("+N no painel"). */
export const BULLETIN_SECTION_MAX = 8
/** How far back "concluídas" reaches. */
export const BULLETIN_DONE_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Which section an issue's life state puts it in when no open stop says otherwise — total over
 * `IssueLifeState`, so a new state must choose. (`WAITING_PERSON` is an open stop whose kind the output policy
 * does not level — the legacy `HUMAN_REQUESTED`/`APPROVAL_NEEDED`: still somebody's to decide.)
 */
export const SECTION_OF_LIFE: Record<IssueLifeState, BulletinSection> = {
	[IssueLifeState.WAITING_PERSON]: BulletinSection.WAITING,
	[IssueLifeState.PAUSED]: BulletinSection.STOPPED,
	[IssueLifeState.STALLED]: BulletinSection.STOPPED,
	[IssueLifeState.WAITING_PROVIDER]: BulletinSection.STOPPED,
	// Fase 4: held by the budget so the orchestrator keeps its reserve — the same section as the provider's limit.
	[IssueLifeState.WAITING_BUDGET]: BulletinSection.STOPPED,
	[IssueLifeState.RUNNING]: BulletinSection.DOING,
	[IssueLifeState.QUEUED]: BulletinSection.DOING,
	[IssueLifeState.REMINDED]: BulletinSection.DOING,
	[IssueLifeState.DONE]: BulletinSection.DONE,
}

/**
 * Which section an OPEN STOP puts its issue in, by the level the output policy gives its kind (`LEVEL_OF_STOP`)
 * — total over `IssueSignalLevel`. A decision or a question waits for the group; a block notice (a `STALLED`
 * stop, a CLI login, a provider error) is a stop. The life state alone cannot tell them apart: any open stop
 * reads `WAITING_PERSON`.
 */
export const SECTION_OF_STOP_LEVEL: Record<IssueSignalLevel, BulletinSection | null> = {
	[IssueSignalLevel.DECISION]: BulletinSection.WAITING,
	[IssueSignalLevel.QUESTION]: BulletinSection.WAITING,
	[IssueSignalLevel.BLOCK_NOTICE]: BulletinSection.STOPPED,
	[IssueSignalLevel.FEEDBACK]: null,
	[IssueSignalLevel.CLOSING]: null,
	[IssueSignalLevel.PROGRESS]: null,
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
 * provider — with when — or blocked: stopped saying nothing, a CLI login…), Fazendo, Concluídas nas últimas
 * 24 h. One line per issue (key + title), at most `BULLETIN_SECTION_MAX` per section, the group's panel link
 * at the end (none without a cloud login). Sections keep the board's order inside them.
 *
 * The section comes from the issue's OPEN STOPS first (`SECTION_OF_STOP_LEVEL`; the earliest section in the
 * order wins — an open question on a queued issue is still waiting for the group), then from its life state.
 * Reads only — the board through the issue context's door (`IssueBoardReader`: its life-state rule is not
 * another context's to import), the open stops from this context's own.
 */
@injectable()
export class BoardBulletin {
	constructor(
		private readonly board: IssueBoardReader,
		private readonly threads: ThreadRepository,
		private readonly panel: PanelPublisher,
	) {}

	async compose(thread: Thread, language: Language, now: Date): Promise<string> {
		const doneSince = new Date(now.getTime() - BULLETIN_DONE_WINDOW_MS)
		const [rows, open] = await Promise.all([this.board.boardOf(thread.id.value, doneSince), this.threads.openStops(thread.id.value)])
		const stopsByIssue = new Map<string, Stop[]>()
		for (const stop of open) {
			if (stop.issueId) stopsByIssue.set(stop.issueId, [...(stopsByIssue.get(stop.issueId) ?? []), stop])
		}

		const bySection = new Map<BulletinSection, BulletinRow[]>()
		for (const row of rows) {
			if (row.lifeState === IssueLifeState.DONE && !(row.completedAt && row.completedAt >= doneSince)) continue
			const stops = stopsByIssue.get(row.issueId) ?? []
			const section = sectionOf(row, stops)
			bySection.set(section, [...(bySection.get(section) ?? []), this.line(thread, row, stops)])
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

	private line(thread: Thread, row: IssueBoardRow, stops: readonly Stop[]): BulletinRow {
		const asks = stops.filter(stop => stop.ask)
		const deciders = asks.flatMap(stop => {
			// A roster NAME or nothing — never the raw address.
			const name = stop.ask?.addresseeId ? thread.rosterNameOf(stop.ask.addresseeId) : undefined
			return name ? [name] : []
		})
		return {
			key: row.key,
			title: row.title,
			lifeState: row.lifeState,
			codes: asks.map(stop => askCode(row.key, stop.seq)),
			decider: [...new Set(deciders)].join(', ') || undefined,
			causes: [...new Set(stops.map(stop => CAUSE_OF_STOP[stop.kind]).filter((cause): cause is BlockCause => cause !== null))],
			until: row.waitingForProviderUntil,
		}
	}
}

/** The open stops' section when any of them names one (the earliest in the order), else the life state's. */
function sectionOf(row: IssueBoardRow, stops: readonly Stop[]): BulletinSection {
	const named = stops.flatMap(stop => {
		const level = LEVEL_OF_STOP[stop.kind]
		const section = level ? SECTION_OF_STOP_LEVEL[level] : null
		return section ? [section] : []
	})
	return SECTION_ORDER.find(section => named.includes(section)) ?? SECTION_OF_LIFE[row.lifeState]
}
