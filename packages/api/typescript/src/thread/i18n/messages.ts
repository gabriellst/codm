import {
	PublishRunOutcome,
	BatchItemDestinationKind,
	BlockCause,
	IssueLifeState,
	IssueSignalLevel,
	Language,
	StopKind,
} from '@codm/contracts-typescript/wire/enums'
import { defineMessages } from '@shared/i18n/messages'
import { PanelActionEcho } from '../enums/PanelActionEcho'
import { BulletinSection } from '../enums/ThreadCommand'

/**
 * O vocabulário que o contexto `thread` diz NO CANAL — a superfície que o frontend nunca traduz,
 * porque quem renderiza é o WhatsApp e nenhum `t()` roda ali.
 *
 * Tudo que o APP renderiza continua no padrão da casa: o backend emite código/estrutura e
 * `packages/app/react/src/locales/*` traduz. Este catálogo é a exceção nomeada, não uma segunda via.
 *
 * O mecanismo vive em `@shared/i18n` e não tem vocabulário de domínio; o conteúdo vive aqui, com o
 * contexto que o emite.
 */

const STOP_TITLES_PT: Record<StopKind, string> = {
	[StopKind.SERVER_ERROR]: 'Erro do provedor — o agente esbarrou num limite ou numa indisponibilidade',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'Resposta barrada pela classificação',
	[StopKind.HUMAN_REQUESTED]: 'Alguém pediu para falar com uma pessoa',
	[StopKind.APPROVAL_NEEDED]: 'Uma ação precisa da sua aprovação',
	[StopKind.AUTH_REQUIRED]: 'O CLI do agente precisa que você entre de novo',
	[StopKind.PERMISSION_DENIED]: 'Uma ação foi barrada pelo filtro de permissões — ela precisa da sua aprovação',
	// Fase 3: o título genérico das perguntas da issue. O cartão mostra a PERGUNTA (o `ask`), e o aviso no
	// grupo sai pelo formato do nível — este título só aparece onde nenhum dos dois cabe.
	[StopKind.DECISION_REQUESTED]: 'Uma tarefa precisa de uma decisão',
	[StopKind.QUESTION_ASKED]: 'Uma tarefa fez uma pergunta',
	[StopKind.STALLED]: 'Uma tarefa parou sem dizer o que falta',
}

/**
 * As frases inglesas são as MESMAS que viviam hardcoded em `RecordStopFromExecution` — este catálogo
 * as adota em vez de inventar copy nova, e só acrescenta o par em português.
 */
const STOP_TITLES_EN: Record<StopKind, string> = {
	[StopKind.SERVER_ERROR]: 'Server error — the agent hit an API limit or outage',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'Reply blocked by classification',
	[StopKind.HUMAN_REQUESTED]: 'A participant asked for a human',
	[StopKind.APPROVAL_NEEDED]: 'An action needs your approval',
	[StopKind.AUTH_REQUIRED]: 'The agent CLI needs you to sign in again',
	[StopKind.PERMISSION_DENIED]: 'An action was blocked by the permission filter — it needs your approval',
	[StopKind.DECISION_REQUESTED]: 'A task needs a decision',
	[StopKind.QUESTION_ASKED]: 'A task asked a question',
	[StopKind.STALLED]: 'A task stopped without saying what it needs',
}

/** O verbo do eco de uma ação feita pelo painel (fase 2, item 6b). */
const PANEL_ECHO_PT: Record<PanelActionEcho, string> = {
	[PanelActionEcho.PAUSED]: 'pausou',
	[PanelActionEcho.RESUMED]: 'retomou',
	[PanelActionEcho.STEERED]: 'orientou',
	[PanelActionEcho.APPROVED]: 'aprovou',
	[PanelActionEcho.DENIED]: 'recusou',
	[PanelActionEcho.ANSWERED]: 'respondeu',
}

const PANEL_ECHO_EN: Record<PanelActionEcho, string> = {
	[PanelActionEcho.PAUSED]: 'paused',
	[PanelActionEcho.RESUMED]: 'resumed',
	[PanelActionEcho.STEERED]: 'steered',
	[PanelActionEcho.APPROVED]: 'approved',
	[PanelActionEcho.DENIED]: 'denied',
	[PanelActionEcho.ANSWERED]: 'answered',
}

interface PanelEchoParams {
	name: string
	key: string
	echo: PanelActionEcho
}

/** Hora e minuto no fuso desta máquina — o daemon roda no computador do operador. */
function clock(locale: string, at: Date): string {
	return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(at)
}

/** Dia e mês no fuso desta máquina. */
function day(locale: string, at: Date): string {
	return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(at)
}

/**
 * Quando a fila volta, dito de um jeito que não engana: só a hora quando é hoje, dia e hora quando não é.
 *
 * Medido em 2026-11-11: uma janela SEMANAL virou "eu volto a responder às 00:00" — e o grupo leu meia-noite
 * daquele dia, quando era dali a seis dias.
 */
function whenPt(at: Date, now: Date): string {
	return day('pt-BR', at) === day('pt-BR', now) ? `às ${clock('pt-BR', at)}` : `em ${day('pt-BR', at)} às ${clock('pt-BR', at)}`
}

function whenEn(at: Date, now: Date): string {
	return day('en-US', at) === day('en-US', now) ? `at ${clock('en-US', at)}` : `on ${day('en-US', at)} at ${clock('en-US', at)}`
}

/**
 * What an issue says to the group, already decided by the output policy (fase 3) — the structured parts the
 * format of each level picks from. `options` are the labels in order; `defaultLabel` is what a question goes
 * on with. Every text the issue wrote (`text`, `options`) goes VERBATIM — it is the issue's voice.
 *
 * NO CODE AND NO LINK (voz do grupo, 25/11): the group read `APP-12 · D1 —` prefixes and a panel link on every
 * message as noise ("cheio de código"). The task is named by its key only — a readable slug since P2 — the ask
 * codes are still ACCEPTED when typed (`parseAskCode`) but never printed, and the panel link lives in the
 * bulletin alone.
 * `text` may be empty only on a decision (it then asks the title — a `PERMISSION_DENIED` with no detail), a
 * block notice (which then has no body) or a closing (an INFERRED completion said nothing: it reads
 * "concluída"); the formats never print the title twice.
 */
export interface IssueSignalParams {
	level: IssueSignalLevel
	key: string
	title: string
	text: string
	options: readonly string[]
	defaultLabel?: string
	decider?: string
}

/** The lines that appear only when their part exists — the format never renders an empty line or a hole. */
function lines(...parts: (string | false | undefined)[]): string {
	return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join('\n')
}

function numbered(options: readonly string[]): string {
	return options.map((label, index) => `${index + 1}) ${label}`).join('\n')
}

/** The format of each level — total over `IssueSignalLevel`, so a level added to the contract needs its words here. */
const SIGNAL_PT: Record<IssueSignalLevel, (p: IssueSignalParams) => string> = {
	[IssueSignalLevel.DECISION]: p =>
		lines(
			`❓ ${p.key} — ${p.text || p.title}`,
			numbered(p.options),
			p.decider && `Quem decide: ${p.decider}`,
			p.options.length > 0 && 'Responda com o número ou citando esta mensagem.',
		),
	[IssueSignalLevel.QUESTION]: p =>
		lines(`${p.key} — ${p.text || p.title}`, numbered(p.options), p.defaultLabel && `Se ninguém responder em 15 min: ${p.defaultLabel}.`),
	[IssueSignalLevel.FEEDBACK]: p => `👀 ${p.key} — ${p.text}`,
	[IssueSignalLevel.CLOSING]: p => `✅ ${p.key} — ${p.text || `${p.title}: concluída`}`,
	[IssueSignalLevel.BLOCK_NOTICE]: p => lines(`⚠️ ${p.key} parou — ${p.title}.`, p.text),
	[IssueSignalLevel.PROGRESS]: p => `${p.key} — ${p.text}`,
}

const SIGNAL_EN: Record<IssueSignalLevel, (p: IssueSignalParams) => string> = {
	[IssueSignalLevel.DECISION]: p =>
		lines(
			`❓ ${p.key} — ${p.text || p.title}`,
			numbered(p.options),
			p.decider && `Who decides: ${p.decider}`,
			p.options.length > 0 && 'Reply with the number or by quoting this message.',
		),
	[IssueSignalLevel.QUESTION]: p =>
		lines(`${p.key} — ${p.text || p.title}`, numbered(p.options), p.defaultLabel && `If nobody answers within 15 min: ${p.defaultLabel}.`),
	[IssueSignalLevel.FEEDBACK]: p => `👀 ${p.key} — ${p.text}`,
	[IssueSignalLevel.CLOSING]: p => `✅ ${p.key} — ${p.text || `${p.title}: done`}`,
	[IssueSignalLevel.BLOCK_NOTICE]: p => lines(`⚠️ ${p.key} stopped — ${p.title}.`, p.text),
	[IssueSignalLevel.PROGRESS]: p => `${p.key} — ${p.text}`,
}

/**
 * Several signals for one person, folded into ONE message (fase 3, item 2) — each item is the signal's own
 * text without its link; the group's panel link closes the message once. No attachment: the previews stay
 * behind the link.
 */
export interface SignalDigestParams {
	/** The person's roster name — absent when the signals have no person, or the roster does not know them. */
	name?: string
	items: readonly string[]
	link?: string
}

/** One item of a digest — its first line bulleted, the following ones (options, the default) indented under it. */
function bullet(item: string): string {
	return item
		.split('\n')
		.map((line, index) => (index === 0 ? `• ${line}` : `  ${line}`))
		.join('\n')
}

/** One ask a bare answer might be for — its task's key and its question (cut short in the message). */
export interface PendingAskRef {
	key: string
	question: string
}

/** The question, cut to fit one line of the disambiguation. */
function brief(question: string): string {
	const flat = question.replace(/\s+/gu, ' ').trim()
	return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat
}

function alternatives(asks: readonly PendingAskRef[], or: string): string {
	const each = asks.map(ask => `${ask.key} (${brief(ask.question)})`)
	return each.length > 1 ? `${each.slice(0, -1).join(', ')} ${or} ${each[each.length - 1]}` : (each[0] ?? '')
}

interface DefaultAppliedParams {
	/** What it went on with, as people read it. */
	label: string
	/** The default applied well after the deadline — the daemon was off. */
	late: boolean
}

/** One issue line of the board bulletin (fase 3, item 4) — what its section needs to say about it. */
export interface BulletinRow {
	key: string
	title: string
	lifeState: IssueLifeState
	/** The codes of its open asks (`APP-12 · D1`) and who decides, when the issue declared it. */
	codes: readonly string[]
	decider?: string
	/** What its open blocking stops are about (`CAUSE_OF_STOP`) — "parou sem dizer o que falta", a CLI login. */
	causes: readonly BlockCause[]
	/** STOPPED while waiting for the provider: when it runs again. */
	until?: Date
}

/** The bulletin, its sections in order — each with its lines (at most the cap) and how many more stay behind the link. */
export interface BoardBulletinParams {
	sections: readonly { section: BulletinSection; rows: readonly BulletinRow[]; more: number }[]
	link?: string
	now: Date
}

const SECTION_PT: Record<BulletinSection, string> = {
	[BulletinSection.WAITING]: 'Esperando decisão',
	[BulletinSection.STOPPED]: 'Paradas',
	[BulletinSection.DOING]: 'Fazendo',
	[BulletinSection.DONE]: 'Concluídas nas últimas 24 h',
}
const SECTION_EN: Record<BulletinSection, string> = {
	[BulletinSection.WAITING]: 'Waiting for a decision',
	[BulletinSection.STOPPED]: 'Stopped',
	[BulletinSection.DOING]: 'In progress',
	[BulletinSection.DONE]: 'Done in the last 24 h',
}

/** What a line says about a blocking stop's cause — total over `BlockCause`. */
const CAUSE_PT: Record<BlockCause, string> = {
	[BlockCause.PROVIDER_LIMIT]: 'limite do provedor',
	[BlockCause.PROVIDER_ERROR]: 'erro do provedor',
	[BlockCause.CLI_LOGIN]: 'o CLI precisa de login',
	[BlockCause.STALLED]: 'parou sem dizer o que falta',
	[BlockCause.CLASSIFICATION]: 'barrada pela classificação',
	[BlockCause.BUDGET_HELD]: 'segurada para não estourar a cota',
}
const CAUSE_EN: Record<BlockCause, string> = {
	[BlockCause.PROVIDER_LIMIT]: 'provider limit',
	[BlockCause.PROVIDER_ERROR]: 'provider error',
	[BlockCause.CLI_LOGIN]: 'the CLI needs a login',
	[BlockCause.STALLED]: 'stopped without saying what it needs',
	[BlockCause.CLASSIFICATION]: 'blocked by the classification',
	[BlockCause.BUDGET_HELD]: 'held so the quota is not exhausted',
}

/** What a line adds about where the issue's work stands — total over `IssueLifeState` (the asks speak for WAITING_PERSON). */
const ROW_DETAIL_PT: Record<IssueLifeState, (row: BulletinRow, now: Date) => string | undefined> = {
	[IssueLifeState.WAITING_PERSON]: () => undefined,
	[IssueLifeState.PAUSED]: () => 'pausada',
	[IssueLifeState.STALLED]: () => 'parou sem dizer o que falta',
	[IssueLifeState.WAITING_PROVIDER]: (row, now) => (row.until ? `volta ${whenPt(row.until, now)}` : 'esperando o provedor'),
	// Fase 5: a failed turn waiting for its next attempt.
	[IssueLifeState.WAITING_RETRY]: () => 'tentando de novo',
	// Fase 4: held by the quota budget (only while it is enforced) — the estimated return is the S3 notice's, not the row's.
	[IssueLifeState.WAITING_BUDGET]: () => 'esperando cota',
	[IssueLifeState.RUNNING]: () => undefined,
	[IssueLifeState.QUEUED]: () => 'na fila',
	[IssueLifeState.REMINDED]: () => undefined,
	[IssueLifeState.DONE]: () => undefined,
}
const ROW_DETAIL_EN: Record<IssueLifeState, (row: BulletinRow, now: Date) => string | undefined> = {
	[IssueLifeState.WAITING_PERSON]: () => undefined,
	[IssueLifeState.PAUSED]: () => 'paused',
	[IssueLifeState.STALLED]: () => 'stopped without saying what it needs',
	[IssueLifeState.WAITING_PROVIDER]: (row, now) => (row.until ? `back ${whenEn(row.until, now)}` : 'waiting for the provider'),
	[IssueLifeState.WAITING_RETRY]: () => 'trying again',
	[IssueLifeState.WAITING_BUDGET]: () => 'waiting for quota',
	[IssueLifeState.RUNNING]: () => undefined,
	[IssueLifeState.QUEUED]: () => 'queued',
	[IssueLifeState.REMINDED]: () => undefined,
	[IssueLifeState.DONE]: () => undefined,
}

/** The parts that exist, on one line — `undefined` when none does. */
function inline(...parts: (string | false | undefined)[]): string | undefined {
	const present = parts.filter((part): part is string => typeof part === 'string' && part.length > 0)
	return present.length > 0 ? present.join(' · ') : undefined
}

function bulletin(
	p: BoardBulletinParams,
	words: { heading: string; empty: string; decides: string; more: (n: number, linked: boolean) => string },
	section: Record<BulletinSection, string>,
	cause: Record<BlockCause, string>,
	life: Record<IssueLifeState, (row: BulletinRow, now: Date) => string | undefined>,
): string {
	const filled = p.sections.filter(s => s.rows.length > 0)
	if (filled.length === 0) return lines(`📋 ${words.heading}`, words.empty, p.link)
	const body = filled.map(s =>
		lines(
			`*${section[s.section]}* (${s.rows.length + s.more})`,
			...s.rows.map(row => {
				const extra = inline(
					row.codes.join(', '),
					row.decider && `${words.decides}: ${row.decider}`,
					...row.causes.map(c => cause[c]),
					life[row.lifeState](row, p.now),
				)
				return `• ${row.key} · ${row.title}${extra ? ` — ${extra}` : ''}`
			}),
			s.more > 0 && words.more(s.more, p.link !== undefined),
		),
	)
	return [`📋 ${words.heading}`, ...body, p.link].filter((part): part is string => typeof part === 'string' && part.length > 0).join('\n\n')
}

/**
 * The batch receipt's parts (fase 4, item 5): the code, how many items, how many went to each destination and the
 * reasons the declined/deferred ones carry. The order of the parts is `BATCH_RECEIPT_ORDER`.
 */
export interface BatchReceiptParams {
	code: string
	total: number
	counts: Readonly<Record<BatchItemDestinationKind, number>>
	/** The reasons of the items whose destination carries one (declined, deferred) — already bounded by the batch. */
	reasons: Readonly<Record<BatchItemDestinationKind, { readonly shown: readonly string[]; readonly more: number }>>
	link?: string
}

/** The order the receipt names the destinations in — where the work went first, what did not go anywhere last. */
export const BATCH_RECEIPT_ORDER: readonly BatchItemDestinationKind[] = [
	BatchItemDestinationKind.NEW_ISSUE,
	BatchItemDestinationKind.ATTACHED,
	BatchItemDestinationKind.ALREADY_LIVE,
	BatchItemDestinationKind.NEEDS_DECISION,
	BatchItemDestinationKind.DEFERRED,
	BatchItemDestinationKind.DECLINED,
]

const BATCH_PART_PT: Record<BatchItemDestinationKind, (n: number) => string> = {
	[BatchItemDestinationKind.NEW_ISSUE]: n => `${n} ${n === 1 ? 'tarefa nova' : 'tarefas novas'}`,
	[BatchItemDestinationKind.ATTACHED]: n => `${n} em ${n === 1 ? 'tarefa existente' : 'tarefas existentes'}`,
	[BatchItemDestinationKind.ALREADY_LIVE]: n => `${n} já no ar`,
	[BatchItemDestinationKind.NEEDS_DECISION]: n => `${n} esperando decisão`,
	[BatchItemDestinationKind.DEFERRED]: n => `${n} ${n === 1 ? 'adiado' : 'adiados'}`,
	[BatchItemDestinationKind.DECLINED]: n => `${n} ${n === 1 ? 'recusado' : 'recusados'}`,
}

const BATCH_PART_EN: Record<BatchItemDestinationKind, (n: number) => string> = {
	[BatchItemDestinationKind.NEW_ISSUE]: n => `${n} new ${n === 1 ? 'task' : 'tasks'}`,
	[BatchItemDestinationKind.ATTACHED]: n => `${n} in existing ${n === 1 ? 'task' : 'tasks'}`,
	[BatchItemDestinationKind.ALREADY_LIVE]: n => `${n} already live`,
	[BatchItemDestinationKind.NEEDS_DECISION]: n => `${n} waiting on a decision`,
	[BatchItemDestinationKind.DEFERRED]: n => `${n} deferred`,
	[BatchItemDestinationKind.DECLINED]: n => `${n} declined`,
}

function batchReceipt(p: BatchReceiptParams, heading: string, part: Record<BatchItemDestinationKind, (n: number) => string>): string {
	const parts = BATCH_RECEIPT_ORDER.filter(kind => p.counts[kind] > 0).map(kind => {
		const { shown, more } = p.reasons[kind]
		const said = [...shown, ...(more > 0 ? [`+${more}`] : [])]
		return `${part[kind](p.counts[kind])}${said.length > 0 ? ` (${said.join('; ')})` : ''}`
	})
	return `${heading} ${p.code}: ${p.total} → ${parts.join(', ')}.`
}

/**
 * The group's line after the workspace's publish command ran for a task (fase 4, item 6c) — total over
 * `PublishRunOutcome`. A cancelled run says nothing in the group (the session wakes and speaks), so its line is the
 * empty string and the caller never sends it. Never the command, never its output: those are the console's.
 */
const PUBLISH_RAN_PT: Record<PublishRunOutcome, (key: string) => string> = {
	[PublishRunOutcome.SUCCEEDED]: key => `${key}: publicado.`,
	[PublishRunOutcome.FAILED]: key => `${key}: a publicação falhou — a tarefa vai ver o erro e corrigir.`,
	[PublishRunOutcome.TIMED_OUT]: key => `${key}: a publicação passou do tempo e foi interrompida — a tarefa vai ver o que aconteceu.`,
	[PublishRunOutcome.CANCELLED_BY_STEER]: () => '',
	[PublishRunOutcome.CANCELLED_BY_PAUSE]: () => '',
	[PublishRunOutcome.UNKNOWN]: key =>
		`${key}: a publicação foi interrompida (o codm parou no meio) e o resultado é desconhecido — ela não foi repetida. É preciso conferir se foi ao ar; a tarefa vai verificar.`,
}
const PUBLISH_RAN_EN: Record<PublishRunOutcome, (key: string) => string> = {
	[PublishRunOutcome.SUCCEEDED]: key => `${key}: published.`,
	[PublishRunOutcome.FAILED]: key => `${key}: publishing failed — the task will look at the error and fix it.`,
	[PublishRunOutcome.TIMED_OUT]: key => `${key}: publishing ran past its time and was stopped — the task will look at what happened.`,
	[PublishRunOutcome.CANCELLED_BY_STEER]: () => '',
	[PublishRunOutcome.CANCELLED_BY_PAUSE]: () => '',
	[PublishRunOutcome.UNKNOWN]: key =>
		`${key}: publishing was interrupted (codm stopped midway) and its result is unknown — it was not run again. It must be checked whether it went live; the task will verify.`,
}

interface ProviderPausedParams {
	until: Date
	now: Date
}

const PT_MESSAGES = {
	stopTitle: (p: { kind: StopKind }) => STOP_TITLES_PT[p.kind],
	/**
	 * O aviso que chega no celular. Duas metades com donos diferentes: a nossa frase, que traduz porque
	 * o `StopKind` é vocabulário nosso; e o `detail`, escrito pelo provider, que vai VERBATIM.
	 *
	 * Traduzir o detail exigiria classificar string de erro de terceiro — frágil por natureza e quebra
	 * em silêncio quando o provider muda o texto. E é justamente ali que mora a informação acionável:
	 * no episódio que originou esta feature, o horário em que o limite resetava estava no detail.
	 */
	stopChannelNotice: (p: { kind: StopKind; detail: string }) =>
		p.detail.length > 0 ? `${STOP_TITLES_PT[p.kind]}.\n\n${p.detail}` : `${STOP_TITLES_PT[p.kind]}.`,
	/**
	 * O aviso de que a fila parou porque a conta do provedor bateu o limite de uso. Diferente de um stop:
	 * não há nada para o operador resolver — só esperar. O horário vem do instante ESTRUTURADO que o CLI
	 * informou (`rate_limit_info.resetsAt`), no fuso desta máquina, que é a do operador.
	 */
	providerPausedNotice: (p: ProviderPausedParams) =>
		`Atingi o limite de uso da conta do provedor do agente. As mensagens estão na fila e eu volto a responder ${whenPt(p.until, p.now)}.`,
	/**
	 * O aviso de que o orçamento de cota segurou as tarefas novas (fase 4, `BlockCause.BUDGET_HELD`) — um por
	 * conversa enquanto a pista de tarefas está segurada, só com o orçamento LIGADO (em observação nada é dito). O
	 * orquestrador continua respondendo: é isso que a reserva compra. A hora é a estimativa de volta do orçamento.
	 */
	budgetHeldNotice: (p: { until?: Date; now: Date }) =>
		p.until
			? `Segurei as tarefas novas para não estourar a cota da conta — continuo respondendo aqui, e elas voltam a rodar ${whenPt(p.until, p.now)}.`
			: 'Segurei as tarefas novas para não estourar a cota da conta — continuo respondendo aqui, e elas voltam a rodar quando a cota folgar.',
	/**
	 * O código que confirma, no painel da nuvem, quem a pessoa é (fase 2, item 6a). Vai por DM só para
	 * ela; nunca entra no transcript nem na fila de comandos.
	 */
	panelCode: (p: { code: string }) => `Seu código do painel do codm: ${p.code} — vale 10 min.`,
	/**
	 * O eco no grupo de uma ação feita pelo painel (fase 2, item 6b, decisão do dono): uma linha curta,
	 * quem e o quê — nunca o texto de uma orientação, que foi para a sessão da issue e não para a sala.
	 */
	panelActionEcho: (p: PanelEchoParams) => `${p.name} ${PANEL_ECHO_PT[p.echo]} ${p.key} pelo painel`,
	/**
	 * O que uma issue diz ao grupo depois da política de saída (fase 3) — o formato do NÍVEL, curto, com o
	 * código da pergunta e o link da issue no painel.
	 */
	issueSignal: (p: IssueSignalParams) => SIGNAL_PT[p.level](p),
	/**
	 * Um "sim" solto com várias perguntas abertas que a pessoa pode responder (fase 3, item 3): UMA pergunta de
	 * volta, curta, com os códigos — nunca um palpite.
	 */
	/**
	 * A pergunta seguiu sozinha com o padrão (fase 3, item 1b) — o corpo de uma linha de PROGRESSO da issue
	 * (a política decide: só o painel no modo padrão). Quando o prazo foi aplicado atrasado, diz por quê.
	 */
	defaultApplied: (p: DefaultAppliedParams) =>
		`Ninguém respondeu em 15 min — segui com o padrão: ${p.label}.${p.late ? ' (O codm estava desligado quando o prazo venceu.)' : ''}`,
	answerDisambiguation: (p: { asks: readonly PendingAskRef[] }) =>
		`Tenho ${p.asks.length} perguntas abertas: ${alternatives(p.asks, 'e')}. Responda citando a que for.`,
	/** Perguntas e prévias para a mesma pessoa em 60 s, numa mensagem só (fase 3, item 2). */
	signalDigest: (p: SignalDigestParams) => lines(`${p.name ? `${p.name}, ` : ''}${p.items.length} coisas:`, ...p.items.map(bullet), p.link),
	/**
	 * Os rótulos das opções de uma aprovação pedida pela porta antiga (`RaiseStop APPROVAL_NEEDED`, fase 3):
	 * ela vira uma decisão sim/não, e o grupo lê as opções na língua da conversa. Os ids (`yes`/`no`) são
	 * os que as respostas soltas reconhecem.
	 */
	approvalYes: () => 'Sim',
	approvalNo: () => 'Não',
	/**
	 * O boletim do grupo (fase 3, item 4) — a resposta ao `boletim`, sem turno de modelo: o que espera
	 * decisão, o que parou, o que está andando e o que terminou nas últimas 24 h; uma linha por tarefa, no
	 * máximo 8 por seção, e o link do painel no fim.
	 */
	/**
	 * O recibo do lote (fase 4, item 5) — determinístico, sem modelo, uma vez por lote, só quando todo item tem
	 * destino: quantos itens foram para cada destino, os motivos dos recusados/adiados e o link do lote no painel.
	 */
	batchReceipt: (p: BatchReceiptParams) => batchReceipt(p, 'Lote', BATCH_PART_PT),
	/**
	 * O lembrete ao orquestrador de um lote que ficou sem destino (fase 4, item 5) — linha só para os agentes
	 * (sussurro), nunca no grupo. O como registrar vem na dica do lote que o item leva (o nome da ferramenta é do
	 * prompt, derivado da classe).
	 */
	/** O aviso STALLED da conversa quando o lote seguiu sem destino depois do lembrete (fase 4, item 5). */
	batchStalled: (p: { code: string; total: number }) =>
		`O lote ${p.code} (${p.total} itens) seguiu sem destino registrado depois do lembrete.`,
	batchReminder: (p: { code: string; total: number }) => `O lote ${p.code} (${p.total} itens) ainda não tem destino registrado.`,
	/** A linha no grupo depois do comando de publicação do workspace (fase 4, item 6c), por desfecho. */
	publishRan: (p: { outcome: PublishRunOutcome; key: string }) => PUBLISH_RAN_PT[p.outcome](p.key),
	boardBulletin: (p: BoardBulletinParams) =>
		bulletin(
			p,
			{ heading: 'Boletim', empty: 'Nada em andamento.', decides: 'decide', more: (n, linked) => `+${n}${linked ? ' no painel' : ''}` },
			SECTION_PT,
			CAUSE_PT,
			ROW_DETAIL_PT,
		),
}

export const THREAD_MESSAGES = defineMessages<typeof PT_MESSAGES>({
	[Language.PT_BR]: PT_MESSAGES,
	[Language.EN_US]: {
		stopTitle: p => STOP_TITLES_EN[p.kind],
		stopChannelNotice: p => (p.detail.length > 0 ? `${STOP_TITLES_EN[p.kind]}.\n\n${p.detail}` : `${STOP_TITLES_EN[p.kind]}.`),
		providerPausedNotice: p =>
			`I hit the usage limit of the agent's provider account. Messages are queued and I'll answer again ${whenEn(p.until, p.now)}.`,
		budgetHeldNotice: p =>
			p.until
				? `I held new tasks so the account's quota is not exhausted — I keep answering here, and they run again ${whenEn(p.until, p.now)}.`
				: "I held new tasks so the account's quota is not exhausted — I keep answering here, and they run again when the quota frees up.",
		panelCode: p => `Your codm panel code: ${p.code} — valid for 10 min.`,
		panelActionEcho: p => `${p.name} ${PANEL_ECHO_EN[p.echo]} ${p.key} from the panel`,
		issueSignal: p => SIGNAL_EN[p.level](p),
		defaultApplied: p =>
			`Nobody answered within 15 min — went on with the default: ${p.label}.${p.late ? ' (codm was off when the deadline passed.)' : ''}`,
		answerDisambiguation: p => `I have ${p.asks.length} open questions: ${alternatives(p.asks, 'and')}. Reply quoting the one you mean.`,
		signalDigest: p => lines(`${p.name ? `${p.name}, ` : ''}${p.items.length} things:`, ...p.items.map(bullet), p.link),
		approvalYes: () => 'Yes',
		approvalNo: () => 'No',
		batchReceipt: p => batchReceipt(p, 'Batch', BATCH_PART_EN),
		batchStalled: p => `Batch ${p.code} (${p.total} items) still has no destinations recorded after the reminder.`,
		batchReminder: p => `Batch ${p.code} (${p.total} items) still has no destinations recorded.`,
		publishRan: p => PUBLISH_RAN_EN[p.outcome](p.key),
		boardBulletin: p =>
			bulletin(
				p,
				{
					heading: 'Bulletin',
					empty: 'Nothing in progress.',
					decides: 'decides',
					more: (n, linked) => `+${n}${linked ? ' on the panel' : ''}`,
				},
				SECTION_EN,
				CAUSE_EN,
				ROW_DETAIL_EN,
			),
	},
})
