import { Language, MailboxTargetKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { defineMessages } from '@shared/i18n/messages'

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

interface ProviderPausedParams {
	until: Date
	now: Date
	lane: MailboxTargetKind
	probeEveryMinutes: number
}

/**
 * O que parou depende da PISTA que o provedor recusou, e o aviso diz isso — é uma relação declarada por
 * pista, não um `if`. Pausar as tarefas não cala a conversa (e vice-versa): o grupo precisa saber que
 * pode continuar falando.
 */
const PROVIDER_PAUSED_PT: Record<MailboxTargetKind, (p: ProviderPausedParams) => string> = {
	[MailboxTargetKind.THREAD]: p =>
		`Atingi o limite de uso da conta do provedor do agente. As mensagens estão na fila e eu volto a responder ${whenPt(p.until, p.now)}. Antes disso, tento de novo a cada ${p.probeEveryMinutes} minutos.`,
	[MailboxTargetKind.ISSUE]: p =>
		`As tarefas pararam: a conta do provedor atingiu o limite de uso para esse trabalho. Elas voltam sozinhas ${whenPt(p.until, p.now)}, e eu tento de novo a cada ${p.probeEveryMinutes} minutos. Aqui na conversa eu continuo respondendo.`,
}

const PROVIDER_PAUSED_EN: Record<MailboxTargetKind, (p: ProviderPausedParams) => string> = {
	[MailboxTargetKind.THREAD]: p =>
		`I hit the usage limit of the agent's provider account. Messages are queued and I'll answer again ${whenEn(p.until, p.now)}. Until then, I'll retry every ${p.probeEveryMinutes} minutes.`,
	[MailboxTargetKind.ISSUE]: p =>
		`Tasks are paused: the provider account hit its usage limit for this work. They resume on their own ${whenEn(p.until, p.now)}, and I'll retry every ${p.probeEveryMinutes} minutes. I'm still answering here.`,
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
	providerPausedNotice: (p: ProviderPausedParams) => PROVIDER_PAUSED_PT[p.lane](p),
}

export const THREAD_MESSAGES = defineMessages<typeof PT_MESSAGES>({
	[Language.PT_BR]: PT_MESSAGES,
	[Language.EN_US]: {
		stopTitle: p => STOP_TITLES_EN[p.kind],
		stopChannelNotice: p => (p.detail.length > 0 ? `${STOP_TITLES_EN[p.kind]}.\n\n${p.detail}` : `${STOP_TITLES_EN[p.kind]}.`),
		providerPausedNotice: p => PROVIDER_PAUSED_EN[p.lane](p),
	},
})
