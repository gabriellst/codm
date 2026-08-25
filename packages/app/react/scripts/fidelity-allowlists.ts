// packages/app/react/scripts/fidelity-allowlists.ts — os RATCHETS da régua, separados do motor.
//
// Doutrina (portada de bk-products docs/UI-FIDELITY.md, "Pista 2" regra 5 + técnicas):
// toda entrada aqui é um RATCHET — entra RARO, só depois de esgotar as alavancas legítimas de
// implementação, sempre com `why` gravado verbatim (ele aparece no scoreboard.json e no
// report.html — nada é varrido para baixo do tapete), e SAI quando o resíduo desaparecer
// (alvo re-exportado, mudança de fonte, wave dedicada). Baixar threshold exige why; subir não.
//
// As três listas nascem VAZIAS no codm: nenhuma dívida foi medida ainda (F0 é o motor inerte).
// A primeira entrada real só existe depois de uma wave de F3 iterar de verdade sobre um item.

/** Threshold por item ABAIXO do default (components 0.90 / screens 0.85) — só components. */
export const ITEM_THRESHOLD_OVERRIDES: Record<string, { threshold: number; why: string }> = {}

/** Tiles individuais aceitos por conteúdo LEGITIMAMENTE dinâmico/indisponível — nunca estilo errado. */
export const ITEM_TILE_ALLOWLIST: Record<string, { x: number; y: number; why: string }[]> = {}

/** Aceite INTEGRAL da pista de região de uma tela — decisão explícita do founder, why datado. */
export const ITEM_REGION_LANE_ACCEPTED: Record<string, { why: string }> = {}

/**
 * PASS até segunda ordem — congelamento EXPLÍCITO do founder: a tela não deve ser alterada
 * por nenhuma wave (nem story, nem estilo) enquanto a entrada existir. A tela CONTINUA sendo
 * medida a cada `bun fidelity` (score e tiles seguem no scoreboard/report com o selo de
 * congelada — nada some do radar); o gate a considera passing. Entrada exige why com data;
 * remover a entrada descongela na medição seguinte. Só o founder adiciona/remove.
 */
export const ITEM_PASS: Record<string, { why: string }> = {
	'screen-02-configuracoes-da-conversa': { why: 'congelada pelo founder ate segunda ordem — adicao de 2026-08-24 (apos o downstream)' },
	'canais-group': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'canais-pareamento-aguardando-gateway-group': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'canais-pareamento-codigo-expirado-group': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'canais-pareamento-conectado-group': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'canais-pareamento-qr-ativo-group': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'configuracoes-wrapper': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'login-wrapper': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'minha-conta-wrapper': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'projetos-adicionar-group': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'projetos-group': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'projetos-vazio-e-remover-group': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'screen-01-detalhe-da-tarefa': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'screen-03-loops': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'screen-04-apagar-conversa': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'screen-3-inicio-carregando': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'screen-chat-pausada-sussurro': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'screen-chat-resposta-direta': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'screen-tarefas-da-conversa': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'tarefas-arquivadas-wrapper': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'tarefas-vazio-wrapper': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
	'tarefas-wrapper': { why: 'congelada pelo founder ate segunda ordem — lista de 2026-08-24 (14 ativas nomeadas, resto PASS)' },
}
