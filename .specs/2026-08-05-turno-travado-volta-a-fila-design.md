# Um turno travado volta à fila, e o watchdog mede avanço — Design Spec

**Date:** 2026-08-05
**Status:** Approved
**Bounded Context:** agent
**Kind:** bug
**Story Points:** 5 — um bounded context, sem migração e sem mudança de contrato de fio, mas a semântica de desfecho muda ao longo da cadeia runner → use case → dispatcher, em três arquivos coordenados mais os testes.

## Context

Quando o operador manda uma mensagem, ela vira um item no `agent_mailbox` e o `DrizzleMailboxDispatcher` reclama esse item com um lease por alvo. O turno roda, e ao voltar o dispatcher chama `complete()` — a linha 294 de `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts`, logo depois de `runThreadTurn` ou `runIssueWork`, que hoje devolvem `Promise<void>`. O dispatcher não vê o desfecho: para ele, "o turno retornou" e "o turno deu certo" são a mesma coisa.

Quem roda o turno é o `ClaudeAgentRunner` (`packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts`). Ele tem um **watchdog de inatividade** — `DEFAULT_INACTIVITY_MS = 180_000`, três minutos, sobrescrevível por `CODM_AGENT_INACTIVITY_MS` e não sobrescrito hoje. O laço de drenagem corre um `Promise.race` entre o próximo chunk de stdout e um `setTimeout`; qualquer chunk que chegue reinicia o relógio. O docstring da classe é explícito de que ele *"fires on INACTIVITY, not on total duration — a long tool call is not a hang"*.

Uma morte por watchdog **não é exceção**: o contrato documentado do runner diz que *"a structured-output failure, a dead process, a watchdog kill: all three become the terminal `finished` event"*. O `classifyStop` transforma o kill num stop de transporte, e `TransportStopKind` (`packages/api/typescript/src/agent/enums/TransportStopKind.ts`) já existe como o subconjunto `{ AUTH_REQUIRED, SERVER_ERROR }`, com o predicado `isTransportStopKind` pronto para uso. `RunIssueTurn.persistOutcome` então cunha um `stopId` e persiste o Stop, que vira card no painel Needs-you e — desde o PR #5 — aviso no canal.

Do lado da fila, `MailboxRepository.fail(id, error, maxAttempts)` já faz exatamente o que um retry precisa: grava `last_error`, libera o lease e, passando de `MAX_ATTEMPTS = 3`, envenena a linha. E o `raiseStopForPoisoned` do PR #8 já transforma esse envenenamento num Stop que chega ao operador. Nada disso precisa ser construído — só ligado.

## Problem

**Incidente medido em 2026-08-05.** A mensagem do operador entrou na fila às 14:59:21 e só foi respondida às 15:30:08 — **30m47s**. A decomposição, tirada do JSONL de transcript do CLI e da tabela `agent_mailbox`:

| Trecho | Duração | O que foi |
|---|---|---|
| Fila → turno | 2s | o mailbox não atrasou nada |
| Turno 1 (sessão `019fd314`) | 8m39s | duas chamadas `gh` rápidas, depois **8m12s travado** numa terceira |
| Vazio | **20m19s** | ninguém tentando nada |
| Turno 2 (sessão `019fd32e`) | 1m46s | rodou e respondeu |

O `tool_result` que voltou às 15:08:02 foi `"claude-sonnet-5[1m] is temporarily unavailable, so auto mode cannot determine the safety of Bash right now"` — o classificador de permissão fora do ar, causa **externa**, seguido de `[Request interrupted by user]`. A indisponibilidade custou 8 minutos; o mecanismo de recuperação do codm custou 20.

Três defeitos, e o terceiro é consequência dos dois primeiros:

1. **O watchdog mede tagarelice, não avanço.** O relógio reinicia a cada chunk de stdout. Um run que emite bytes enquanto não progride — retries do classificador, mensagens parciais — sobrevive indefinidamente a um watchdog de três minutos. O turno ficou 8m12s em silêncio aparente e **2,7× o orçamento** sem ser morto.

2. **O dispatcher não distingue "terminou" de "deu certo".** `runIssueWork` devolve `void`, então o `complete()` da linha 294 roda igual para um turno que respondeu e para um que morreu no transporte. Um item cujo turno falhou por indisponibilidade externa é consumido como se tivesse sido atendido.

3. **A única recuperação é o relógio do lease.** No incidente, `last_error` ficou **vazio** e `attempts` chegou a **2**: `fail()` nunca rodou, então o item só voltou à fila quando o lease expirou. O operador ficou 20 minutos sem resposta e sem nenhum sinal de que algo estava sendo retentado.

## Goal

Uma indisponibilidade externa passa a custar o tempo dela, não o tempo dela mais o relógio do lease. Um turno que trava é morto pelo watchdog em até três minutos, e um turno que morre por transporte devolve seu item à fila em vez de consumi-lo — de modo que a próxima tentativa começa em segundos. Quando as tentativas acabam, o operador recebe **um** aviso, no fim, em vez de um alarme na primeira falha seguido da resposta.

## Decisions

1. **O watchdog reinicia mediante frame decodificado, não mediante chunk de stdout.** O relógio de inatividade só é renovado quando o codec entrega ao menos um frame. Bytes que não fecham um frame deixam de contar como sinal de vida. O valor de 180s e a variável `CODM_AGENT_INACTIVITY_MS` ficam como estão — o que muda é o que reinicia a contagem, não quanto ela conta.

2. **`runThreadTurn` e `runIssueWork` param de devolver `void`** e reportam ao `runTurn` se o desfecho foi uma falha de transporte. É essa a costura que falta hoje: sem ela o dispatcher não tem como decidir entre consumir e devolver.

3. **Desfecho com stop de transporte chama `fail()`, não `complete()` — desde que o turno ainda não tenha falado.** A pertinência do stop é decidida pelo predicado que já existe, `isTransportStopKind` — nada de lista nova de códigos. `fail()` já grava `last_error`, libera o lease e envenena passando de `MAX_ATTEMPTS`; o item volta a ser reclamável no poll seguinte (250ms).

   **A condição de "ainda não falou" não é cautela, é a preservação de uma decisão anterior.** `RunOrchestratorTurn` transmite por cortes progressivos (`await streamed.cut(...)`), e o próprio arquivo documenta por que um turno de thread nunca foi retentado: *"the dispatcher would treat a throw as a failed turn and retry it, and re-running a conversational turn produces a SECOND message in a real group"*. Um turno que já entregou um corte e só então morreu já falou no grupo real do operador — retentá-lo produz a duplicata que o operador reclamou em 2026-08-05. No incidente medido o turno **não** falou (quatro chamadas Bash, nenhum texto entregue), então a regra estreita resolve o caso sem reabrir aquele. Só a combinação **transporte + mudo** devolve o item à fila.

4. **Um stop de transporte deixa de levantar Stop na hora.** Hoje `persistOutcome` cunha o `stopId` e publica o fato, o que com retry produziria dois sinais para um fato só — "falhou" e, um minuto depois, a resposta. Com a mudança, o Stop de uma falha de transporte vem exclusivamente do `raiseStopForPoisoned`, quando as tentativas se esgotam. Stops **não** transportados (decisão do agente: `HUMAN_REQUESTED`, `APPROVAL_NEEDED`, `BLOCKED_BY_CLASSIFICATION`) seguem sendo persistidos na hora, sem retry — eles são resposta, não falha.

5. **`last_error` passa a carregar o detalhe do transporte.** Foi a ausência disso que obrigou a reconstruir este incidente a partir do JSONL do CLI; o daemon não persiste log.

6. **O heartbeat sensível a progresso fica FORA deste spec.** Com as decisões acima um turno travado no stream resolve em ≤180s, então o caminho medido nunca chega a ter heartbeat renovando turno morto. A camada só protegeria um travamento invisível ao watchdog — dentro do use case, num round trip de MCP ou numa consulta de banco —, que é outro modo de falha, exige uma costura runner→dispatcher que não existe, e não foi o que aconteceu. Registrado em Open Questions.

## User Stories

- **Story 1:** Como operador, quero que uma indisponibilidade momentânea do provider não me deixe sem resposta, para não precisar reenviar a mensagem nem descobrir sozinho que nada está acontecendo.
  - Dado um turno que morre com stop de transporte, quando o dispatcher processa o desfecho, então o item volta à fila e a próxima tentativa começa em segundos (AC-2, AC-3).
  - Dado que as tentativas se esgotam, quando a última falha, então um Stop chega ao operador — uma vez, no fim (AC-4).

- **Story 2:** Como operador, quero que um turno que parou de progredir seja morto no orçamento de três minutos, para que a fila volte a andar mesmo quando o processo do provider continua falando.
  - Dado um run que emite bytes sem fechar frame algum, quando passam 180s sem um frame, então o watchdog mata o run (AC-1).

- **Story 3:** Como desenvolvedor investigando uma demora, quero que a causa fique gravada na linha do mailbox, para não ter que reconstruir o incidente a partir do transcript do CLI.
  - Dado um item devolvido à fila por transporte, quando eu consulto `agent_mailbox`, então `last_error` traz o detalhe do stop (AC-5).

## Acceptance Criteria

- [ ] AC-1: Um run que emite chunks de stdout sem nunca completar um frame é morto pelo watchdog dentro do orçamento de inatividade. Falsificador: com o reset por chunk, o mesmo run sobrevive indefinidamente.
- [ ] AC-2: Um turno **mudo** cujo desfecho carrega um stop de transporte NÃO consome o item — `consumed_at` segue nulo, `attempts` subiu e o lease foi liberado.
- [ ] AC-2b: Um turno que **já falou** e só então morre no transporte É consumido, não devolvido. Falsificador: remover a condição de mudez faz este caso ficar vermelho enquanto AC-2 segue verde.
- [ ] AC-3: Esse item é reclamável imediatamente após a devolução, sem esperar o lease expirar.
- [ ] AC-4: Um stop de transporte não persiste Stop na primeira falha; o Stop aparece só quando `attempts` atinge `MAX_ATTEMPTS`, pela via do `raiseStopForPoisoned`. Um stop NÃO transportado continua persistindo Stop na hora e consumindo o item.
- [ ] AC-5: Depois de uma devolução por transporte, `last_error` da linha contém o detalhe do stop.
- [ ] AC-6: `bun tsc` limpo, `bun lint` limpo, e a suíte do `packages/api/typescript` verde.

## Risks & Migration

**Risco: uma indisponibilidade longa gera até três turnos em vez de um.** É o custo aceito da Decisão 3, e é limitado por `MAX_ATTEMPTS = 3`. O `raiseStopForPoisoned` garante que o terceiro fracasso vira sinal em vez de silêncio.

**Risco: `AUTH_REQUIRED` é retentado sem chance de sucesso.** Um provider pedindo login interativo não se resolve sozinho, então as três tentativas são desperdício. Foi uma escolha deliberada de simplicidade sobre precisão — a alternativa (decidir retry pela causa do stop) foi levantada e recusada, porque faz a classificação de stop virar política de retry e erra em qualquer caso novo. O desperdício é limitado a duas tentativas extras e termina num Stop correto.

**Risco: o watchdog mais estrito mata um run legítimo.** Um run que passa mais de 180s sem produzir um único frame passa a morrer. É o comportamento pretendido — o valor não muda, só deixa de ser burlável por bytes que não são progresso —, mas se aparecer um caso legítimo, `CODM_AGENT_INACTIVITY_MS` já existe para afrouxá-lo sem tocar em código.

**Colisão com trabalho pendente.** O branch `build/trava-unica-para-um-run-por-issue` (3 commits, pronto e não mergeado) reescreve o mesmo `runTurn` do `DrizzleMailboxDispatcher` — ele remove o ramo de contenção e o `defer`. Este spec toca o `catch`/`complete` desse mesmo método. **Mergear a trava única primeiro** e implementar isto por cima; a ordem inversa gera conflito num método pequeno e muito editado.

**Migração:** nenhuma. Sem mudança de schema, de contrato de fio ou de SDK.

## Open Questions

- **O heartbeat continua provando a coisa errada.** Ele atesta que o intervalo dispara, não que o turno avança — o mesmo erro conceitual que a Decisão 1 corrige uma camada abaixo. Este spec não o toca porque o caminho medido deixa de alcançá-lo, mas um travamento dentro do use case (MCP, banco) ainda faria o lease ser renovado indefinidamente. Se isso aparecer, a pergunta a responder primeiro é qual sinal de progresso viaja do runner até o dispatcher, que hoje só enxerga uma promise.
- **Não ficou determinado se o watchdog chegou a disparar no incidente.** A hipótese que o código sustenta é que não — o reset por chunk explica a sobrevivência —, mas o daemon não persiste log e a distinção não está nos dados. A Decisão 5 existe para que a próxima ocorrência seja diagnosticável sem essa dúvida.
