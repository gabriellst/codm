# Morte no outbox — Design Spec

**Date:** 2026-08-27
**Status:** Approved
**Bounded Context:** cross-service: `core` (TypeScript) + `core` (Go), tabela compartilhada `shared_outbox`
**Kind:** bug
**Story Points:** 8 — a mesma correção em DOIS backends sobre uma tabela compartilhada, mais uma migração com espelho `//go:embed`; um teste Go afirma hoje o comportamento a mudar.

## Context

O `shared_outbox` é a fila durável por onde todo domain event passa antes de virar side-effect. Duas lanes a consomem, cada uma com seu despachante: `LibSqlOutboxDispatcher` (TypeScript, `packages/api/typescript/core/src/services/OutboxDispatcher/`) e `sqlite_outbox_dispatcher.go` (Go, `packages/api/go/core/services/outbox/`). Ambos reivindicam por lease, cobram tentativa na reivindicação e desistem após `MAX_ATTEMPTS`.

Um evento sai da fila quando `processed_at` deixa de ser nulo — é essa a cláusula que os dois despachantes usam para decidir o que ainda é reivindicável (`LibSqlOutboxDispatcher.ts:204,214` e `sqlite_outbox_dispatcher.go:180`).

A tabela irmã `agent_mailbox` (`packages/contracts/src/db/sqlite/agent.ts:126-130`) resolve o mesmo problema com **dois** campos: `consumed_at` para o item entregue e `dead_at` para o que morreu. `MailboxRepository.claimNext` exclui os dois, e por isso "o que morreu na mailbox?" é uma consulta direta.

## Problem

1. **`processed_at` carrega dois significados incompatíveis: "deu certo" e "desisti".** Nos dois backends, o dead-letter carimba o mesmo campo do sucesso. No TypeScript (`LibSqlOutboxDispatcher.finalize`) o código **já sabe** qual é o caso — a variável se chama `deadLettered` e vai para o log como `maxReached` — e a informação é descartada na hora de persistir, porque não há coluna para ela. No Go (`sqlite_outbox_dispatcher.go:257`) o comentário ao lado é explícito sobre a intenção: *"processed_at set → stops being claimed; last_error kept for audit"*.

2. **Não existe consulta que responda "há falhas silenciosas?".** Medido no banco de produção em 2026-08-27: **55.082 eventos, 55.082 marcados como processados, zero pendentes** — e dois deles na verdade morreram, com `attempts = 5` e `TypeError` em `last_error`. Quem abre esse banco procurando problema filtra por `processed_at IS NULL`, não encontra nada e conclui que está tudo certo.

3. **O custo disso foi medido, e não é hipotético.** Os dois eventos mortos são os stops de 19:19 e 19:22 de 26/08. Nenhum Stop foi gravado no desktop entre 10/08 e 27/08 por causa deles, e a causa raiz esteve disponível em `last_error` esse tempo todo. Na investigação que abriu esta sessão, a primeira análise filtrou por `processed_at IS NULL`, não achou nada e concluiu — erradamente — que os eventos tinham sido processados sem erro.

4. **`last_error` não é confiável como proxy de morte.** O caminho de sucesso não o limpa, então um evento que falhou duas vezes e teve sucesso na terceira fica com `last_error` preenchido e `processed_at` carimbado — indistinguível de um morto, olhando só esses dois campos.

5. **Há DOIS caminhos de morte no TypeScript, e ambos carimbam `processed_at`:** o dead-letter do `finalize`, e o *poison sweep* (`LibSqlOutboxDispatcher.ts:200`) que recolhe linhas cujo worker morreu sem finalizar, escrevendo `last_error = 'poison: exceeded attempts without finalize'`.

## Goal

"Há falhas silenciosas no sistema?" deixa de ser arqueologia sobre um campo de texto e vira uma consulta direta, nos dois backends, com o mesmo vocabulário que a `agent_mailbox` já usa. Um evento que morreu para de ser indistinguível de um que deu certo.

## Decisions

1. **`shared_outbox` ganha `dead_at`**, nullable, timestamp em ms — o mesmo tipo e a mesma semântica que `agent_mailbox.dead_at`. Não é campo novo no vocabulário do repo: é o campo que a tabela irmã já tem, aplicado à tabela que não tem.

2. **`processed_at` volta a significar UMA coisa: entregue com sucesso.** Os caminhos de morte param de carimbá-lo e passam a carimbar `dead_at`. A escolha é entre isso e manter os dois preenchidos por segurança; manter seria preservar a ambiguidade que esta spec existe para remover.

3. **A cláusula de reivindicação passa a excluir os dois estados** (`processed_at IS NULL AND dead_at IS NULL`), nos dois despachantes. É o que torna a Decisão 2 segura: sem isso, um evento morto que não tem mais `processed_at` voltaria a ser reivindicado para sempre. É também exatamente o que `MailboxRepository.claimNext` já faz com `consumed_at`/`dead_at`.

4. **Os TRÊS caminhos de morte carimbam `dead_at`:** o dead-letter do `finalize` (TS), o poison sweep (TS) e o dead-letter do Go. Deixar um de fora recria a ambiguidade por uma porta só.

5. **Sem backfill das linhas históricas.** Não há como distinguir com confiança um evento morto de um que falhou e depois teve sucesso, porque o caminho de sucesso não limpa `last_error` (Problema 4). Um backfill por heurística plantaria dados errados numa coluna cuja razão de existir é ser confiável. As linhas antigas ficam com `dead_at` nulo e a resposta correta sobre elas é "não dá para saber" — que é a verdade.

6. **A pergunta ganha um lugar declarado.** Um health check no vocabulário que o repo já usa (`HEALTH_CHECKS` / `PollingHealthCheck`, `shared/registry.ts`) reporta a contagem de linhas com `dead_at` preenchido. Sem isso a coluna resolve a arqueologia mas não avisa ninguém — e o incidente que originou esta spec durou duas semanas exatamente porque ninguém foi olhar.

## User Stories

- **Story 1:** Como desenvolvedor investigando um comportamento que sumiu, quero perguntar ao banco se algum evento morreu, para não precisar suspeitar de algo antes de conseguir encontrá-lo.
  - Dado um evento que esgotou as tentativas, quando eu consulto `dead_at IS NOT NULL`, então ele aparece.
  - Dado um evento entregue com sucesso após duas falhas, quando eu faço a mesma consulta, então ele NÃO aparece — mesmo tendo `last_error` preenchido.

- **Story 2:** Como operador, quero ser avisado quando eventos começam a morrer, em vez de descobrir semanas depois pelo efeito.
  - Dado um sistema sem mortes, quando o health check roda, então ele reporta zero.
  - Dado um evento morto, quando o health check roda, então a contagem sai do zero.

- **Story 3:** Como desenvolvedor do gateway Go, quero que a lane Go e a lane TypeScript concordem sobre o que significa cada campo, para que uma consulta escrita contra a tabela valha para as duas.
  - Dado um evento morto na lane Go, quando eu consulto `dead_at IS NOT NULL`, então ele aparece do mesmo jeito que um morto na lane TypeScript.

## Acceptance Criteria

- [ ] AC-1: A migração adiciona `dead_at` a `shared_outbox`, e a cópia `//go:embed` do gateway fica byte-a-byte igual (`bun run --cwd packages/contracts db:check-go` passa).
- [ ] AC-2: Um evento que esgota `MAX_ATTEMPTS` no `finalize` do despachante TypeScript termina com `dead_at` preenchido e `processed_at` nulo.
- [ ] AC-3: Um evento recolhido pelo poison sweep termina com `dead_at` preenchido e `processed_at` nulo.
- [ ] AC-4: Um evento que esgota tentativas no despachante Go termina com `dead_at` preenchido e `processed_at` nulo.
- [ ] AC-5: Um evento morto (por qualquer um dos três caminhos) NÃO é reivindicado de novo por nenhum dos dois despachantes.
- [ ] AC-6: Um evento entregue com sucesso continua com `processed_at` preenchido e `dead_at` nulo — inclusive quando falhou antes e tem `last_error` preenchido.
- [ ] AC-7: O health check reporta a contagem de `dead_at IS NOT NULL`, e a contagem sai do zero quando um evento morre.
- [ ] AC-8: O teste Go que hoje afirma *"dead-lettered row must have processed_at set to stop being claimed"* passa a afirmar o novo contrato, sem perder a cobertura de que a linha para de ser reivindicada.

## Fora de escopo

**Limpar `last_error` no sucesso.** É o Problema 4 e é real, mas mexer nisso é mudar o que o campo significa para quem já o consulta em log/auditoria. Com `dead_at`, a pergunta que importa deixa de depender dele — e a limpeza vira uma decisão separada, sem urgência.

**Reprocessar os dois eventos mortos.** Eles são os stops de 26/08, cujo efeito já foi obtido por outro caminho (a issue foi arquivada à mão e o `RaiseStop` foi corrigido no PR #31). Ressuscitar evento de outbox é operação com risco próprio e não pertence a esta spec.

**Alarme/notificação a partir do health check.** Esta spec dá o número; para onde ele vai (dock, canal, dashboard) é decisão de produto.

## Riscos & Migração

**A migração é aditiva** — coluna nullable, sem backfill, sem reescrita de linha. O boot aplica sozinho, e as linhas existentes seguem válidas: quem tem `processed_at` continua fora da fila pela primeira metade da cláusula nova.

**A mudança é simultânea nos dois backends, sobre a MESMA tabela.** Um daemon com a lane TS atualizada e o gateway Go antigo (ou o inverso) continua correto durante a janela: o Go antigo carimba `processed_at` na morte, o que o mantém fora da fila em qualquer das duas versões da cláusula. Nenhuma ordem de deploy é obrigatória — mas o inverso vale registrar: um morto pelo Go antigo não terá `dead_at`, e portanto não aparecerá na consulta até o gateway atualizar.

**Um teste Go afirma hoje o comportamento antigo** (`sqlite_outbox_dispatcher_test.go:193`). Ele não é um obstáculo, é o lugar certo para ancorar o contrato novo — AC-8 existe para que ele seja reescrito em vez de deletado.
