import { StopKind } from '@codm/contracts-typescript/wire/enums'

/**
 * Quais stops viram mensagem no canal — e o critério NÃO é a gravidade, é a VOZ.
 *
 * Notifica quando o orquestrador não conseguiria ter contado: `SERVER_ERROR` (o turno morreu),
 * `AUTH_REQUIRED` (o CLI pede login e a sessão não anda) e `BLOCKED_BY_CLASSIFICATION` (a resposta do
 * agente foi barrada, então o operador não ouviu nada).
 *
 * Não notifica quando houve fala: `HUMAN_REQUESTED` e `APPROVAL_NEEDED` nascem de um turno que rodou e
 * disse alguma coisa — `RecordStopFromExecution` inclusive usa o texto do agente COMO título nesses
 * casos. Uma notificação mecânica ali duplicaria a mensagem que o operador já recebeu.
 *
 * É uma TABELA e não uma cadeia de `if` pela mesma razão que `RESOLUTIONS_BY_KIND` ao lado: um membro
 * novo em `StopKind` quebra a compilação até alguém declarar se ele fala. Um `if` deixaria o kind novo
 * silencioso por omissão, que é o defeito que esta frente existe para corrigir.
 */
export const NOTIFIES_ON_CHANNEL: Record<StopKind, boolean> = {
	[StopKind.SERVER_ERROR]: true,
	[StopKind.AUTH_REQUIRED]: true,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: true,
	[StopKind.HUMAN_REQUESTED]: false,
	[StopKind.APPROVAL_NEEDED]: false,
}
