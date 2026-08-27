/**
 * Os JOBS repetíveis deste contexto — barril mecânico. A cadência mora na própria classe
 * (`static repeat`), ao lado do predicado que ela agenda.
 *
 * `ReconcileStalledIssues` é o produtor único do fato "esta issue travou". Ele vive AQUI, e não no
 * contexto `issue`, porque quem sabe o que é um run vivo é o dono da mailbox — e porque
 * `AgentRunStopRaisedEvent` já tem exatamente um publicador, que é este contexto.
 */
export { ReconcileStalledIssues } from './usecases/ReconcileStalledIssues'
