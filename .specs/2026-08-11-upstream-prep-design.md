# Upstream-prep — des-marcação do core e fronteiras de stamping para o template — Design Spec

**Date:** 2026-08-11
**Status:** Draft (esboço de backlog — NÃO aprovado; aberto pela auditoria de upstreamabilidade da sessão de 2026-08-10/11, a decidir pelo founder)
**Bounded Context:** cross-cutting: core-typescript, core-go, tests/support (api-typescript), template.config.ts, create-template
**Kind:** chore
**Story Points:** 8 — ~7 correções cirúrgicas com endereço conhecido + 1 decisão estrutural (schema Go) + gates novos; nenhuma exige redesign.

## Context

As três frentes de 2026-08-10 (consolidação de testes frontend, eixo único TS, eixo de ambiente Go) construíram infra deliberadamente portável para o template — e uma auditoria de 5 agentes classificou tudo: ~90% da frente TS cherry-picka limpo, os cores das duas linguagens nasceram com gates de genericidade, e os bloqueadores restantes são pontuais. Dois já morreram durante a própria frente Go (T11: config agnóstico + rail de vocabulário do core-go). Este esboço consolida os que restam, com evidência file:line da auditoria (relatório completo: journal do workflow `upstream-audit`, sessão f118c429).

## Problem

1. Símbolos/valores de produto ou marca cimentados em mecanismos portáveis (lista na seção Decisions — cada um com endereço).
2. O schema SQLite de produto inteiro mora em `packages/api/go/core/db/sqlite` (tabelas de channel/thread/issue + queries de contexto de template consultando tabelas de produto) — o core Go não separa mecanismo (store/migração/sqlc) de conteúdo (schema do produto).
3. A relação given→contexto não existe como contrato: o catálogo `/testing` (16 givens, misto base×produto) é mantido à mão em 3 lugares (testing.ts, testing.d.ts, CATALOG do parity test) — o stamping não sabe podar.
4. O overview do CLAUDE.md ainda diz "single Postgres" enquanto o setup descreve SQLite — a decisão de persistência do template upstream precisa ser afirmada antes de classificar os picks de driver.

## Goal

Um fork/stamp do template recebe os cores + maquinário de teste sem nenhum literal de produto ou marca, com a poda de givens/contextos dirigida por manifesto — e a série de cherry-picks das três frentes documentada e executável.

## Decisions (esboço — cada item vira task; ordens de grandeza pequenas)

1. `CODM_AGENT_INACTIVITY_MS` sai do kernel schema (`core/utils/Config.ts:103`) → `ProductEnvSchema` no contexto agent; flip para `schema:'product'` no manifesto.
2. A lane de outbox do Go deixa de ser constante do core (`core/services/outbox/outbox.go:41` hardcoda `gateway`) → parâmetro declarado via `config.Service` (o mecanismo da T11 já existe — é adicionar o campo).
3. `OPERATOR_ID` default sai do maquinário portável (`tests/support/testing.ts`) → constante declarada pelo produto no stamp.
4. Erro do DataDirLock e prefixos `CODM_`/`codm-` soletrados nos mecanismos (TS: Config/harnessDataDir/LibsqlDriver; Go: registry/store/lock) → derivados do scope do manifesto, aplicados simetricamente (sed consciente com gate).
5. Schema de produto sai do core Go: `core/db/sqlite` mantém só mecanismo (store, ledger, embed, guard sqlc); schema/queries/gen de produto movem para o serviço, regenerados por fork a partir de `packages/contracts` (mesma relação que o TS já tem).
6. Manifesto ganha a relação given→contexto (tipada); testing.ts/d.ts/CATALOG derivam dela; `create-template` poda givens junto com contextos.
7. Decisão de persistência do template afirmada no CLAUDE.md upstream (SQLite embarcado vs Postgres) — pré-requisito para classificar os picks de driver.
8. A ordem de cherry-pick das três frentes documentada (a auditoria já a derivou: TS primeiro — e81af7ab→6efa392f→0ae18a42→…; Go depois do fechamento da frente) num `docs/UPSTREAM.md` ou no PR do template.

## User Stories

- Como mantenedor do template, quero stampar um fork sem grep manual de resíduos, para que a base saia limpa por construção.
  - Given o stamp de um fork sem os contextos thread/channel, when o render-manifest roda, then os givens/tipos de produto somem do catálogo derivado e os rails de vocabulário passam.

## Acceptance Criteria

- [ ] AC-1: grep de `codm|CODM_` (fora de env vars declaradas no manifesto) e de símbolos de produto nos mecanismos portáveis = 0, com rail.
- [ ] AC-2: core Go sem schema de produto; `go test` verde nos dois lados após a separação.
- [ ] AC-3: catálogo/testing.d.ts/CATALOG derivados do manifesto (redeclaração morta); stamp de teste poda corretamente.
- [ ] AC-4: a série de picks executada num clone do template como prova (dry-run documentado).
