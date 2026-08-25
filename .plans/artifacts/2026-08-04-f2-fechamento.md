# F2 — fechamento (o log destilou, o pai absorveu, o trem provou)

> RECONSTRUÇÃO 2026-08-06: o original foi commitado no clone `codedm` (nunca pushado) e
> perdeu-se quando o clone foi substituído por `codm`. Conteúdo restaurado verbatim do
> registro da sessão do orquestrador (autor original deste artefato).

Goal: `.plans/2026-08-03-goal-produtos-broker-e-validacao.md` §FASE 2. Template `v1.9` em
`5f328d35c` (pushado). Mira pinado em `533ff48d6`, trem clean 1657, e2e 15/15.

## O que a F2 era, e o que virou

O contrato: bootstrap-log desde o primeiro comando (fricção→causa→onde mora→status) e conserto
de template **parent-first antes do produto #2**. O log foi mantido em tempo real durante toda a
F1 — **76 fricções** — e o parent-first foi executado DURANTE a fase, não depois: 6 lotes de
template ao longo da F1 (git-birth, poda de referências, rebrand exaustivo, gitignore do stamp,
CONTEXT_DECLS, rail de DI, narrowSurfaces) + os 3 lotes finais da F2.

## Os 3 lotes finais da F2

| lote | commits | o que fechou |
|---|---|---|
| T1 — upstream da fase F | `f897f9ad1..8f8a214ee` (8) | os 8 consertos que o e2e real fez em superfície herdada — **3 deles CORRIGIDOS no pai** (CORS preflight 405 no mux Go 1.22; publish-only — o publish+dispatch do mira rodava handler 2×; padding vs slice no wrapper) + `toBaseEvent` reidratando protótipo (fecha a raiz da #64) |
| T2 — catraca + prioridades | `32eb98d05..d540ad43a` (6) | **gate-vacuity** (as 3 formas medidas em 8 ocorrências; achou 3 defeitos vivos no Dockerfile.api, 1 load-bearing) · **#48 consertada de verdade** (PGlite com DrizzleUnitOfWorkFactory real; sonda 3-fail→0) · CLI #30/31/32 · #55 untracked · **#73 re-atribuída** (emissor, não kubb; `PlanName \| null` provado ponta a ponta) |
| T3 — o rabo | `8cceb4462`+`5f328d35c` | **#25**: Go emite `x-error-codes` (SDK 73→81 códigos, 1→2 specs; `INTERNAL_ERROR` estava no fio sem registro; emit linka contextos gated; check:generated cobre o spec Go) · **#24**: `SSE bool` no metadata → `x-tpl-sse` → preprocess derruba o hook espúrio (89→51 exports no falseador) |

## O rito do trem — provado duas vezes

1º pull (pin `cb03a1032`→`4b730bada`): 32 itens reconciliados, 6 fricções da máquina do trem
(#42–47) desenterradas. 2º pull (→`533ff48d6`): 9 itens, **as correções do pai vencendo os
consertos da instância**, publish-only provado no e2e (spec 10 cross-tab, 15/15 duas vezes), e a
nullabilidade verdadeira da #73 expondo 3 bugs latentes (1 crash vivo). O trem funciona — com os
dentes #42–47 documentados como o custo conhecido de operá-lo.

## O estado do log (76 fricções)

- **fechadas parent-first**: 1, 2, 9–16, 21, 22, 24, 25, 30–32, 48, 55, 57–61, 63–65, 73 (+ as
  requalificadas 6/51)
- **doutrina/catraca**: 3, 4, 5, 8, 17, 20, 23, 29, 49, 52, 54 — a catraca gate-vacuity É a
  promoção prometida das 8 ocorrências da classe cano/`--cwd`
- **abertas com dono nomeado**: 7 (CLI thinking), 19 (modelagem §6), 26/76 (flake sob contenção —
  remédio barato: pre-warm do nx), 28 (doc×código), 33-rail (skip-with-named-message), 36, 37,
  41, 42–47 (trem), 50, 53, 62 (codegen envelope — workaround declarado adapted), 66 (contagem
  de pools), 71 (log de erro), 74 (cleanup script), 75 (deps não-hoistáveis em worktree)
- **residual honesto novo da T3**: duas derivações do vocabulário de erro no spec Go sem gate de
  concordância (o falseador as divergiu de propósito); kubb incremental não deleta órfãos;
  serviço Go 100%-SSE some do client agregado.

## O falseador da F3 (armado)

Produto #2 nasce do template em `5f328d35c`. **Fricção repetida do log = o conserto não era
real → volta para a F2.** As repetições ESPERADAS e declaradas: nenhuma — a única exceção
pré-declarada (resíduo expo da #16) foi fechada pelo re-land com narrowSurfaces.
