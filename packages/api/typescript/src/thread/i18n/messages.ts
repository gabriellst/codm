import { Language, StopKind } from '@codm/contracts-typescript/wire/enums'
import { defineMessages } from '@shared/i18n'

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
}

export const THREAD_MESSAGES = defineMessages<typeof PT_MESSAGES>({
	[Language.PT_BR]: PT_MESSAGES,
	[Language.EN_US]: {
		stopTitle: p => STOP_TITLES_EN[p.kind],
		stopChannelNotice: p => (p.detail.length > 0 ? `${STOP_TITLES_EN[p.kind]}.\n\n${p.detail}` : `${STOP_TITLES_EN[p.kind]}.`),
	},
})
