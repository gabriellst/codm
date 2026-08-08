# F4 — fechamento do goal (dois produtos, um template mais duro, o método provado)

Goal: `.plans/2026-08-03-goal-produtos-broker-e-validacao.md`. Este é o artefato final —
o relatório produto #1 vs produto #2, as baterias citadas, e onde cada entregável vive.

## O veredito em uma linha

O método do BOOTSTRAP funciona e **melhora a si mesmo**: o produto #2 atravessou o mesmo fluxo
com metade das fricções, um quarto das rodadas de gosto, nascimento 10/10 verde — e as cinco
costuras de infraestrutura que morderam o #1 **não reapareceram**, porque foram consertadas no
pai antes do #2 nascer (parent-first executado DURANTE as fases, não depois).

## Produto #1 vs Produto #2 (medido nos dois repos)

| régua | Mira (broker chart + IA) | Ronda (observabilidade + agente de plantão) |
|---|---|---|
| fricções no bootstrap-log | **79** | **~39** (zero repetidas — o falseador da F3) |
| rodadas de gosto do founder (G3) | 4 | **1** (leis pré-aprovadas pagaram) |
| nascimento (stamp) | ~20 fricções de nascença | **10/10 verde**; 1 repetida-parcial fechada nas 2 pontas no ato |
| fase F (infra real) | 5 costuras reveladas (#61–65) | 5 costuras — **classe NOVA** (fronteira entre processos #30–34); as 5 do #1 não voltaram |
| commits no produto | 107 | 57 |
| dias de parede | 2 | 3 (2 de construção) |
| testes api-ts | 1351+ | 1374 |
| testes Go | 135 | 135 (empate exato) |
| e2e | 16 specs | 15 specs, 15/15 ×2 |
| tooling | 803+ | 808 |
| ACs | **15/15, zero vermelhas** | **15/15, zero vermelhas** |

Detalhe por produto: `artifacts/2026-08-04-f1-fechamento.md` e `artifacts/2026-08-06-f3-fechamento.md`.

## O template no fim do goal

`template-fullstack` v1.9: a F0 o fechou (stamp com git-birth + sync.yaml de nascença,
falseador que mordeu), e o goal inteiro o endureceu em **~50 consertos parent-first** ao longo
de 6+ lotes — os finais: o lote F4 de 11 upstreams (EventHandler multi-evento, patch Kubb `.js`,
mcp-exposure por valor-de-fio + stand-down nomeado, `real` mediator fora do processo, runner e2e
com recusa sem DATABASE_URL, nx-run-guarded para todo alvo, logger do shell Tauri, docs
alinhados ao código, mensagem do NewIntegrationEvent, check:generated com pré-voo de raiz morta,
`PROJECT` derivado no emit Go) + o runbook das doutrinas no `docs/BOOTSTRAP.md` (17 regras com proveniência, `8fcc0dd23`). Push final: `e8f653042..8fcc0dd23` em v1.9.

Catracas novas que nasceram do goal: **gate-vacuity** (a promoção prometida após 8 ocorrências
da classe cano/`--cwd` — achou 3 defeitos vivos no próprio template ao nascer), o rail de DI
por resolução (di-resolution), o pré-voo do check:generated, o guard de alvo do nx.

Pendências declaradas com dono (não escondidas): `.env.example` brand-derivado no rebrand
(12º item estrutural, proposto e não emendado em fim de lote); fricções do trem de sync
mira#42–47 (o custo conhecido de operá-lo — a mais sistêmica: pull apaga dado do filho);
`cargo fmt` pré-existente do crate tauri; M1(b) do Ronda aberto-declarado (cobertura por tipo
indecidível com stub content-blind); fricção ronda#29 (DutyProfile sem leitura na SDK).

## O que cada fase custou e ensinou (índice)

- **F0** — `artifacts/2026-08-03-f0-fechamento.md`: o falseador da fase mordeu (git-birth).
- **F1** — `artifacts/2026-08-04-f1-fechamento.md`: 15/15; o motor provado por POC virou
  fixture; K3 requalificado por medição (política de oclusão do WebKit, não defeito).
- **F2** — `artifacts/2026-08-04-f2-fechamento.md`: 76 fricções destiladas; o trem provado 2×
  com as correções do pai vencendo os consertos de instância.
- **F3** — `artifacts/2026-08-06-f3-fechamento.md`: 15/15 com zero fricções repetidas; o
  falseador do goal mordeu UMA vez (grafia casada do rebrand) e a volta à F2 foi executada
  no ato, nas duas pontas.

## Nota de integridade

O clone `codedm` original (contrato + F0–F2 commitados, nunca pushados) perdeu-se na troca por
`codm` em 2026-08-06; F0/F2 foram restaurados verbatim do registro da sessão, F1 e o contrato
reconstruídos e marcados. O pin de exemplar `codedm@8cf9003` morreu com o clone — adendos de
proveniência commitados nos dois produtos (`mira@6f123bf`, `ronda@841e6c2`). A lição virou
regra do runbook: **pin de exemplar só em sha pushado; artefato de goal se pusha no ato**.

## Onde tudo vive

- Produtos: `~/Desktop/Projetos/pessoal/mira` (main) · `~/Desktop/Projetos/pessoal/ronda`
  (main) — ambos locais por ordem do goal, ambos com infra compose própria isolada.
- Template: `~/Desktop/Projetos/pessoal/template-fullstack` branch `v1.9` (pushado).
- Design: projetos permanentes no Claude Design — "Mira — design system" (`c05137f1…`),
  "Ronda — design system" (`3b09f0c7…`), template (`1f1cd82a…`).
- Logs de fricção: `research/bootstrap-log.md` em cada produto (79 + ~39 entradas).
