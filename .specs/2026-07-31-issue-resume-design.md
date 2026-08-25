# Retomar uma issue parada — Design Spec

**Date:** 2026-07-31
**Status:** Approved (3 decisões ratificadas pelo founder via widget em chat, 31/07)
**Bounded Context:** agent (orquestrador + turno de issue) + thread (stop) + ui (console)
**Kind:** feature
**Story Points:** 8 — o transporte já existe; o que falta é gatilho, contexto no prompt e uma invariante de "issue parada continua alcançável"

## Context

Uma issue recebe trabalho **uma vez na vida**: `MailboxItemKind.WORK` é enfileirado num único lugar do repositório inteiro, `ForkIssue.ts:91`, no nascimento. Verificado por grep.

Mas o transporte para retomar **já existe e está montado**:

- O dispatcher constrói o prompt de um turno de issue a partir do **texto de um STEER** ou do goal do WORK (`DrizzleMailboxDispatcher.ts:279`) — logo **enfileirar um STEER inicia um turno**; não é preciso vocabulário novo no mailbox.
- `RunIssueTurn` tem a maquinaria completa de retomada de sessão do CLI: `AgentSession.resumeDecision`, `--resume <id>`, e o campo `session` é SEMPRE populado (`resumeId` ou um id novo, nunca nenhum). Um turno novo na mesma issue **continua a sessão** por construção.
- `SteerIssueTurnController` já está no escopo `orchestration` do MCP: o orquestrador tem a ferramenta na mão e ela aceita texto livre — o canal natural para carregar o contexto da conversa.

O que falta é o **gatilho**, não o transporte.

## Problem

1. **Resolver um stop não retoma nada.** `ResolveStop` levanta `thread.stop_resolved`, cujo ÚNICO assinante é `PublishThreadIntegrationEvents`, que apenas o republica. Ninguém reagenda trabalho. O botão do console faz o stop sumir da tela e o agente nunca volta — a UI promete continuidade que o backend não implementa.
2. **O orquestrador não sabe que há stop aberto.** A única menção a stop no prompt dele é o `outcome: STOPPED` de um turno já encerrado (`prompt.ts:369`). Ele não recebe a lista de stops abertos nem instrução de que responder a um deles significa retomar a issue — então nunca faz a ligação sozinho.
3. **Suspeita a confirmar:** o `SteerIssueTurnController` recusa a issue que não estiver no seam de issues abertas da thread (`AGENT_RUN_SCOPE_MISMATCH`, "no open issue with that id on this thread"). Se um stop tira a issue desse conjunto, a ferramenta recusa exatamente a issue que mais precisa de contexto — a candidata número um para o "estou tentando sem sucesso" do founder.

## Goal

Uma issue que parou — por stop de permissão, por pergunta sobre uma spec, ou porque o turno morreu — volta a trabalhar **continuando a sessão do CLI**, levando consigo o que o operador respondeu.

## Decisions

1. **O orquestrador decide, quando a retomada vem pela conversa** (ratificação do founder). O prompt dele passa a receber os **stops abertos** (issue, tipo, o que foi perguntado) e a instrução: se a mensagem do operador responde a um stop, resolva-o e steere a issue **com o contexto do que foi dito**. O julgamento fica no agente que já lê a conversa; nenhuma regra determinística tenta interpretar "pode seguir" ou "usa a opção 2".
2. **Resolver pelo console também retoma** (ratificação do founder): um handler de `thread.stop_resolved` reagenda a issue — **exceto em `TAKE_OVER`**, que por definição transfere o trabalho para o humano. Faz "resolvi" significar "o agente voltou ao trabalho", que é o que a UI já sugere.
3. **Issue parada continua alcançável** (ratificação do founder). Parada esperando humano é o estado que MAIS precisa receber contexto. Se o stop hoje a remove do seam de issues abertas, isso é o conserto — com teste que prova o steer chegando numa issue parada.
4. **STEER é o veículo; nenhum `MailboxItemKind` novo.** O dispatcher já monta o prompt do texto do STEER. Inventar `RESUME` criaria um segundo caminho para a mesma coisa.
5. **Retomar continua a sessão, não recomeça** — e isso é ASSERIDO, não presumido: teste prova que o turno retomado usa o id de sessão persistido pelo turno anterior. A capacidade `sessionResume` já é detectada por provider; quando o provider não a tem, o turno roda fresco (comportamento existente de `resumeDecision`, não se altera).
6. **Idempotência entre os dois caminhos.** Console e orquestrador podem disparar a retomada da mesma issue quase ao mesmo tempo. A chave de deduplicação do item enfileirado tem de tornar isso um turno só, nunca dois — e a escolha da chave é decisão explícita do plano, não acidente.
7. **Sem contrato novo** se possível: nenhum enum, nenhum evento de integração novo. Se o prompt do orquestrador precisar de um read novo (stops abertos por thread), ele é um query use case do lado do agente, não um endpoint público.

## User Stories

- **Story 1:** Como operador, quero responder no WhatsApp a uma pergunta que o agente fez e ver a issue continuar de onde parou.
  - Given uma issue parada com stop de pergunta, when respondo na conversa e o orquestrador entende que aquilo responde o stop, then o stop é resolvido, a issue recebe um turno **com o meu texto no prompt** e o CLI **retoma a sessão anterior**.
- **Story 2:** Como operador, quero que resolver o stop pelo console tenha o mesmo efeito.
  - Given uma issue parada, when resolvo o stop pelo botão com resolução que não seja `TAKE_OVER`, then a issue volta a trabalhar.
  - Given resolução `TAKE_OVER`, then nada é reagendado — o trabalho é meu.
- **Story 3:** Como operador, não quero dois agentes trabalhando na mesma issue.
  - Given retomada disparada pelos dois caminhos quase juntos, when o dispatcher drena, then roda **um** turno.

## Acceptance Criteria

- [ ] AC-1: stop resolvido (≠ `TAKE_OVER`) ⇒ item enfileirado para a issue; `TAKE_OVER` ⇒ nada enfileirado.
- [ ] AC-2: o turno retomado usa o **id de sessão persistido** pelo turno anterior (asserido no que é passado ao runner, não no docblock).
- [ ] AC-3: uma issue parada por stop está no conjunto que o `SteerIssueTurnController` aceita — steer nela é aceito, não `AGENT_RUN_SCOPE_MISMATCH`.
- [ ] AC-4: o prompt do orquestrador contém os stops abertos da thread (issue, tipo, pergunta) quando existem, e não os contém quando não existem.
- [ ] AC-5: o texto do operador chega ao prompt do turno retomado — não só o goal original.
- [ ] AC-6: retomada disparada duas vezes em janela curta produz UM turno.
- [ ] AC-7: FALSEADORES executados com números: (a) desligar o handler de `thread.stop_resolved` ⇒ teste de AC-1 vermelho; (b) remover a issue parada do seam de abertas ⇒ teste de AC-3 vermelho nomeando o refuse; (c) forçar sessão nova em vez de retomada ⇒ AC-2 vermelho; (d) remover a dedup ⇒ AC-6 vermelho com dois turnos.
