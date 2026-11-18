/**
 * Os JOBS repetíveis deste contexto — barril mecânico. Cadência no próprio job (`static repeat`).
 *
 * A varredura de loops (C25) é um JOB e não um `setInterval` pela razão que a feature inteira
 * existe: o alarme tem de sobreviver ao daemon ser fechado, e o shell de desktop o fecha toda vez
 * que o operador sai.
 */
export { FireDueLoops } from './usecases/FireDueLoops'
// Fase 2, item 6a — o roster do painel da nuvem sai e os códigos de identificação chegam (a cada 15 s).
export { PublishPanelRoster } from './usecases/PublishPanelRoster'
// Fase 3, item 1b — a pergunta entregue e sem resposta segue com o padrão 15 min depois (a cada 30 s).
export { ApplyDueQuestionDefaults } from './usecases/ApplyDueQuestionDefaults'
// Fase 3, item 2 — a rede do resumo por pessoa: sinal que passou da janela sem flush sai (a cada 30 s).
export { FlushOverdueDigests } from './usecases/FlushOverdueDigests'
