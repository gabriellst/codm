# Uma trava só para "um run por issue" — Design Spec

**Date:** 2026-08-05
**Status:** Approved
**Bounded Context:** agent (com toque em shared/errors, locales do app-react e o SDK gerado)
**Kind:** bug
**Story Points:** 3 — um bounded context, sem migração e sem artefato novo além do rail; o peso está na remoção coordenada em quatro arquivos, no regen do SDK e no rail com fixture negativa.

## Context

Quando o operador manda uma mensagem que vira trabalho, o item entra no mailbox (`agent_mailbox`) e o `DrizzleMailboxDispatcher` o reclama com um **lease por alvo**. O `claimNext` de `packages/api/typescript/src/agent/repositories/MailboxRepository/DrizzleMailboxRepository.ts` expressa isso como um `NOT EXISTS` correlacionado: *nenhum item runnable do mesmo `(targetKind, targetId)` pode estar com lease vivo*. Desde o PR #4 esse lease é renovado por heartbeat enquanto o turno roda, então um turno longo não perde mais a posse no meio do caminho. Essa é uma trava **durável**: ela é uma linha em SQLite, sobrevive a restart, e dá para inspecioná-la depois de um incidente.

Existe uma segunda trava para a mesma coisa. `AgentStreamRegistry` (`packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.ts`) é o canal SSE do painel de terminal — writers, buffer de replay, `MAX_HISTORY_ISSUES`. Ele também carrega um `Set<string>` em memória de processo chamado `activeSessions`, com `beginSession`/`endSession`/`isActive`, que levanta `TERMINAL_ALREADY_RUNNING`. O próprio arquivo diz de onde isso veio: *"absorbed from the superseded interim session registry"*. `RunIssueTurn` (`packages/api/typescript/src/agent/usecases/RunIssueTurn.ts:138`) reserva a sessão antes do `try` e a solta no `finally` da linha 175.

O repositório **já decidiu** qual das duas é a certa, e aplicou a decisão só de um lado. `RunOrchestratorTurn` — o turno de thread, mesmo dispatcher — documenta verbatim: *"No single-active guard (`AgentStreamRegistry.beginSession`). `RunIssueTurn` needs one because two runs could target one issue; here the DISPATCHER's per-target lease is the mutex, and adding a second one keyed by thread would be a second source of truth about whether a turn is in flight."*

A justificativa que sustentava a exceção do lado da issue não é mais verdade. `packages/api/typescript/src/agent/handlers/external.ts` é **só prosa** — descreve um handler que consumiria `integration.message.classified` e chamaria `RunIssueTurn`, mas não há handler registrado ali. O único chamador de produção hoje é `DrizzleMailboxDispatcher.runIssueWork`, que passa `issueId: item.targetId` para itens `targetKind: ISSUE`. Ou seja: o lease exclui em `(ISSUE, issueId)` e o `Set` exclui em `issueId` — **mesma chave, mesma invariante, dois mecanismos**. O único outro caminho até `RunIssueTurn` é `TestRunIssueTurnController` (`POST /_test/agent/run-turn`), montado só sob `CODM_E2E`.

`TERMINAL_ALREADY_RUNNING` não é privado: está em `agent/errors/index.ts` (código + `HttpStatusCode.CONFLICT`), no `openapi.json` publicado, no SDK gerado (`packages/client/dist/typescript/src/typescript/zod/apiErrorsSchema.ts`, `types/ApiErrors.ts`, `errors/index.ts`) e nos dois locales do app-react (`pt.json:459`, `en.json:459`).

O diretório `packages/api/typescript/tests/architecture/` já hospeda rails mecânicos, uma invariante por arquivo (`enum-placement`, `event-placement`, `tx-discipline`, `i18n-coherence`). `pty-isolation.test.ts` é exatamente o formato que este spec precisa: confina quem pode importar o quê, por prefixo de diretório, com contagem esperada de violações.

## Problem

1. **Duas travas guardam uma invariante, e elas divergiram.** Em 2026-08-05 a issue `019fcf42` ficou `WORKING` por 2h38. O STEER de 23:42:43 rodou 16 minutos e foi consumido às 23:59:02 — o heartbeat funcionou, `attempts=1`. O turno terminou em stop `SERVER_ERROR` às 23:59:03. Os dois steers seguintes (23:59:49 e 00:16:28) morreram com `attempts=3` em `already has an active terminal session`: a entrada em memória sobreviveu a um turno que retornou. O lease estava limpo; o `Set` não.

2. **O mecanismo do vazamento não é explicável.** `beginSession` está na linha 138, o `try` na 139 e o `endSession` no `finally` da 175, com um único `return` dentro do bloco. O pareamento está correto. Nem a leitura do código nem os dados do incidente explicam como a entrada persistiu. **Este spec não corrige esse mecanismo** — ver Goal.

3. **A trava volátil não deixa evidência e não se reconcilia.** Um `Set` em memória não sobrevive a restart, não dá para consultar, não dá para conciliar com o estado durável. A única forma conhecida de destravar a issue foi reiniciar o processo.

4. **A trava mora na classe errada.** `AgentStreamRegistry` é o canal de streaming; o guard é um enxerto que o próprio comentário do arquivo assume como herança de um registry superseded.

## Goal

O sistema passa a ter **uma** exclusão para "um run por issue": o lease por alvo do mailbox. Um turno que termina libera a issue de um jeito só, num lugar só, e esse lugar é uma linha que dá para inspecionar depois. O modo de falha que exigia restart do processo deixa de existir — não porque o vazamento foi consertado, mas porque **a estrutura que vazava deixa de existir**. Estar sem explicação para o vazamento é exatamente o argumento para remover o carrier em vez de repará-lo: não se conserta o que não se consegue explicar, mas dá para apagar e passar a depender do mecanismo que se consegue inspecionar.

## Decisions

1. `RunIssueTurn` para de chamar `beginSession`/`endSession`. O `try/finally` que existia só para soltar a claim vai junto; o corpo do `handle` volta a ser linear. O lease por alvo `(ISSUE, issueId)` — renovado por heartbeat — passa a ser a única exclusão, exatamente como já acontece do lado thread em `RunOrchestratorTurn`.

2. `AgentStreamRegistry` perde `activeSessions`, `beginSession`, `endSession` e `isActive`, e o bloco de docstring "SINGLE-ACTIVE-RUN guard" / "absorbed from the superseded interim session registry". Volta a ser só canal SSE + buffer de replay.

3. `TERMINAL_ALREADY_RUNNING` é removido de `agent/errors/index.ts` (union e mapa de status). Como o código cruza o fio, a remoção exige `bun sdk` (regen de `openapi.json` + SDK) e a remoção da chave em `packages/app/react/src/locales/pt.json` e `en.json`.

4. Nasce o rail `packages/api/typescript/tests/architecture/single-run-entry.test.ts`, no molde de `pty-isolation.test.ts`: apenas `agent/services/MailboxDispatcher/` e `agent/controllers/TestRunIssueTurn.ts` podem importar `usecases/RunIssueTurn`. Com fixture negativa. Arquivo próprio, seguindo a convenção dominante do diretório (uma invariante por arquivo) — `pty-isolation` adverte contra duplicar *o mesmo* rail, não contra rails nomeados distintos.

5. **O ramo de contenção do dispatcher morre junto.** O `catch` de `TERMINAL_ALREADY_RUNNING` → `mailbox.defer(...)` (PR #8) só é alcançável enquanto o guard existir. Com o guard removido, o ramo vira código morto e `MailboxRepository.defer` fica sem consumidor. O spec remove o ramo **e** `defer` das três implementações (abstrata, `DrizzleMailboxRepository`, `MockMailboxRepository`), mais os testes que os falsificavam. Trocar uma trava zumbi por um método zumbi seria o mesmo erro em outra roupa.

6. **Ordem de merge: PR #8 primeiro, este spec depois.** A mitigação (contenção não gasta tentativa; item envenenado levanta Stop) e a raiz ficam registradas como dois movimentos separados, em vez de fingir que o #8 nunca precisou existir. O `raiseStopForPoisoned` do #8 **permanece** — ele cobre envenenamento por qualquer causa, não só por contenção.

7. A porta E2E `POST /_test/agent/run-turn` fica **sem guard de concorrência**, conscientemente. Duas chamadas simultâneas para a mesma issue passariam a rodar as duas. Nenhum spec faz isso hoje, e o rail da Decisão 4 impede que um terceiro caminho apareça.

## User Stories

- **Story 1:** Como operador, quero que um steer numa issue cujo turno anterior terminou seja executado, para não precisar reiniciar o app para destravar meu trabalho.
  - Dado um turno que rodou e retornou para a issue X, quando um novo item ISSUE para X é reclamado, então o turno roda (AC-1).
  - Dado um turno de X ainda em voo, quando outro item ISSUE para X é elegível, então ele não é reclamado enquanto o lease de X estiver vivo — espera, não falha (AC-2).

- **Story 2:** Como desenvolvedor mexendo no runtime do agente, quero que exista um único lugar que decide "há turno em voo para esta issue", para que uma segunda trava não possa divergir dele de novo.
  - Dado o código-fonte do pacote, quando o rail roda, então nenhum símbolo de sessão-única sobrevive em `AgentStreamRegistry` (AC-3).
  - Dado um arquivo novo que importe `usecases/RunIssueTurn` fora dos dois prefixos permitidos, quando o rail roda, então ele falha (AC-5).

## Acceptance Criteria

- [ ] AC-1: Um item ISSUE para uma issue cujo turno anterior já retornou é reclamado e executado — sem `TERMINAL_ALREADY_RUNNING`, sem consumo de tentativa. Teste em `DrizzleMailboxDispatcher.test.ts` que hoje falha por contenção e passa depois.
- [ ] AC-2: Com um turno em voo para a issue X, um segundo item ISSUE para X **não** é reclamado enquanto o lease vive, e é reclamado depois que o primeiro conclui — a exclusão continua valendo, só que pelo lease.
- [ ] AC-3: `AgentStreamRegistry` não exporta mais `beginSession`, `endSession` nem `isActive`, e não contém `activeSessions`. `AgentStreamRegistry.test.ts` perde os casos do guard e mantém verdes os de observer + replay.
- [ ] AC-4: `TERMINAL_ALREADY_RUNNING` não aparece em nenhum arquivo do repo fora de `.specs/`/`.plans/` — incluindo `agent/errors/index.ts`, `openapi.json`, o SDK gerado e os dois locales. `i18n-coherence.test.ts` verde.
- [ ] AC-5: `single-run-entry.test.ts` existe, passa, e sua fixture negativa (um import simulado fora dos prefixos permitidos) faz o rail falhar.
- [ ] AC-6: O `catch` de contenção do `DrizzleMailboxDispatcher` e `MailboxRepository.defer` (abstrata + Drizzle + Mock) não existem mais; nenhum teste referencia `defer`.
- [ ] AC-7: `bun tsc` limpo, `bun lint` limpo, e a suíte do `packages/api/typescript` verde com contagem ≥ a baseline do branch (1136 no momento do PR #8, menos os casos deliberadamente removidos por AC-3/AC-6, que o plano deve enumerar nominalmente).

## Risks & Migration

**Risco: a exclusão fica dependendo inteiramente do lease.** Se o `claimNext` tiver um furo, agora não há segunda rede. Mitigação: o furo seria o mesmo que já existe hoje para todo turno de thread (`RunOrchestratorTurn` roda assim desde sempre), e AC-2 falsifica a exclusão pelo lease explicitamente.

**Risco: o vazamento tinha outra causa que continua viva.** Se algo além do `Set` estiver segurando a issue, remover o `Set` não resolve — só muda o sintoma. Mitigação: AC-1 e AC-2 medem o comportamento observável (item reclamado e executado), não a ausência do símbolo; e o Stop por envenenamento do PR #8 continua sendo a rede que torna qualquer recorrência audível em vez de silenciosa.

**Migração:** nenhuma — não há mudança de schema. O `agent_mailbox` já carrega tudo que a trava única precisa.

## Open Questions

- O mecanismo do vazamento de `activeSessions` segue **sem explicação**. Este spec o torna irrelevante ao remover o carrier, mas não o explica. Se o sintoma recorrer depois deste trabalho, a hipótese "havia um segundo detentor" volta à mesa com muito menos superfície para investigar.
