import { IssueSignalLevel, Language, StopKind } from '@codm/contracts-typescript/wire/enums'
import { defineMessages } from '@shared/i18n/messages'
import { PanelActionEcho } from '../enums/PanelActionEcho'

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
 * format of each level picks from. `code` is the ask's (`APP-12 · D1`); `options` are the labels in order;
 * `defaultLabel` is what a question goes on with; `link` is the issue on the cloud panel (absent without a
 * cloud login). Every text the issue wrote (`text`, `options`) goes VERBATIM — it is the issue's voice.
 * `text` may be empty only on a decision (it then asks the title — a `PERMISSION_DENIED` with no detail) or a
 * block notice (which then has no body); the formats never print the title twice.
 */
export interface IssueSignalParams {
	level: IssueSignalLevel
	key: string
	code?: string
	title: string
	text: string
	options: readonly string[]
	defaultLabel?: string
	decider?: string
	link?: string
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
		lines(`❓ ${p.code ?? p.key} — ${p.text || p.title}`, numbered(p.options), p.decider && `Quem decide: ${p.decider}`, p.link),
	[IssueSignalLevel.QUESTION]: p =>
		lines(
			`${p.code ?? p.key} — ${p.text || p.title}`,
			numbered(p.options),
			p.defaultLabel && `Sigo com ${p.defaultLabel} se ninguém disser o contrário em 15 min.`,
			p.link,
		),
	[IssueSignalLevel.FEEDBACK]: p => lines(`${p.key} · prévia — ${p.text}`, p.link),
	[IssueSignalLevel.CLOSING]: p => lines(`✅ ${p.key} · ${p.title} — ${p.text}`, p.link),
	[IssueSignalLevel.BLOCK_NOTICE]: p => lines(`⚠️ ${p.key} — ${p.title}.`, p.text, p.link),
	[IssueSignalLevel.PROGRESS]: p => lines(`${p.key} — ${p.text}`, p.link),
}

const SIGNAL_EN: Record<IssueSignalLevel, (p: IssueSignalParams) => string> = {
	[IssueSignalLevel.DECISION]: p =>
		lines(`❓ ${p.code ?? p.key} — ${p.text || p.title}`, numbered(p.options), p.decider && `Who decides: ${p.decider}`, p.link),
	[IssueSignalLevel.QUESTION]: p =>
		lines(
			`${p.code ?? p.key} — ${p.text || p.title}`,
			numbered(p.options),
			p.defaultLabel && `I'll go on with ${p.defaultLabel} unless someone says otherwise within 15 min.`,
			p.link,
		),
	[IssueSignalLevel.FEEDBACK]: p => lines(`${p.key} · preview — ${p.text}`, p.link),
	[IssueSignalLevel.CLOSING]: p => lines(`✅ ${p.key} · ${p.title} — ${p.text}`, p.link),
	[IssueSignalLevel.BLOCK_NOTICE]: p => lines(`⚠️ ${p.key} — ${p.title}.`, p.text, p.link),
	[IssueSignalLevel.PROGRESS]: p => lines(`${p.key} — ${p.text}`, p.link),
}

/** One ask a bare answer might be for — its code and its question (cut short in the message). */
export interface PendingAskRef {
	code: string
	question: string
}

/** The question, cut to fit one line of the disambiguation. */
function brief(question: string): string {
	const flat = question.replace(/\s+/gu, ' ').trim()
	return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat
}

function alternatives(asks: readonly PendingAskRef[], or: string): string {
	const each = asks.map(ask => `${ask.code} (${brief(ask.question)})`)
	return each.length > 1 ? `${each.slice(0, -1).join(', ')} ${or} ${each[each.length - 1]}` : (each[0] ?? '')
}

interface DefaultAppliedParams {
	/** The ask's number in its issue — the `2` of `D2`; the line already starts with the issue's key. */
	seq: number
	/** What it went on with, as people read it. */
	label: string
	/** The default applied well after the deadline — the daemon was off. */
	late: boolean
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
		`D${p.seq}: ninguém respondeu em 15 min — segui com o padrão: ${p.label}.${p.late ? ' (O codm estava desligado quando o prazo venceu.)' : ''}`,
	answerDisambiguation: (p: { asks: readonly PendingAskRef[] }) =>
		`Para qual? ${alternatives(p.asks, 'ou')} — responda citando a pergunta.`,
	/**
	 * Os rótulos das opções de uma aprovação pedida pela porta antiga (`RaiseStop APPROVAL_NEEDED`, fase 3):
	 * ela vira uma decisão sim/não, e o grupo lê as opções na língua da conversa. Os ids (`yes`/`no`) são
	 * os que as respostas soltas reconhecem.
	 */
	approvalYes: () => 'Sim',
	approvalNo: () => 'Não',
}

export const THREAD_MESSAGES = defineMessages<typeof PT_MESSAGES>({
	[Language.PT_BR]: PT_MESSAGES,
	[Language.EN_US]: {
		stopTitle: p => STOP_TITLES_EN[p.kind],
		stopChannelNotice: p => (p.detail.length > 0 ? `${STOP_TITLES_EN[p.kind]}.\n\n${p.detail}` : `${STOP_TITLES_EN[p.kind]}.`),
		providerPausedNotice: p =>
			`I hit the usage limit of the agent's provider account. Messages are queued and I'll answer again ${whenEn(p.until, p.now)}.`,
		panelCode: p => `Your codm panel code: ${p.code} — valid for 10 min.`,
		panelActionEcho: p => `${p.name} ${PANEL_ECHO_EN[p.echo]} ${p.key} from the panel`,
		issueSignal: p => SIGNAL_EN[p.level](p),
		defaultApplied: p =>
			`D${p.seq}: nobody answered within 15 min — went on with the default: ${p.label}.${p.late ? ' (codm was off when the deadline passed.)' : ''}`,
		answerDisambiguation: p => `Which one? ${alternatives(p.asks, 'or')} — reply quoting the question.`,
		approvalYes: () => 'Yes',
		approvalNo: () => 'No',
	},
})
