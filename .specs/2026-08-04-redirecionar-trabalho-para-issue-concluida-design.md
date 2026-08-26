# Redirecionar trabalho para uma issue concluída — Design Spec

**Date:** 2026-08-04
**Status:** Draft
**Bounded Context:** cross-context: `issue` (ciclo de vida), `agent` (steer + prompts); `thread` só é lido
**Kind:** feature
**Story Points:** 5 — um contexto de ponta a ponta (`issue`: entidade + use case + evento + testes) mais plumbing coordenado em `agent` (guard do controller, dois prompt builders, input do run); sem migration de schema, sem contrato cross-service, sem projection nova

## Context

Uma thread conversa com o operador; quando ele pede trabalho que muda código, o orquestrador **declara** uma issue (`ForkIssueController`) e ela roda em outro processo, com sua própria sessão de CLI. O ciclo de vida vive em `packages/api/typescript/src/issue/entities/Issue.ts`: `NEEDS_INPUT → WORKING → COMPLETED`, mais o eixo separado de arquivamento (`archive` / `restore`, com `AUTO_24H` em `usecases/AutoArchiveCompletedIssues.ts`).

Enquanto a issue trabalha, o operador continua falando. Duas coisas podem chegar até ela: um **whisper** para a thread inteira (`thread/usecases/SteerThread.ts`, que faz fan-out para as issues abertas) e um **steer direcionado** por id, que o orquestrador dispara pela ferramenta `SteerIssueTurnController` (`agent/controllers/SteerIssueTurn.ts`, escopo `orchestration`). O steer direcionado enfileira `MailboxItemKind.STEER`, e o `DrizzleMailboxDispatcher` retoma a sessão do agente com `--resume` — o `AgentSession` guarda `agentSessionId`, `lastMessageId` e o `cwd`, e recusa retomar se algum deles divergir.

A thread também carrega um **Custom Prompt** (`thread_threads.custom_prompt`, escrito por `thread/controllers/ConfigurePrompt.ts`, colapsado de vazio para ausente em `Thread.configurePrompt`). Ele é injetado no system prompt do orquestrador sob "INSTRUCTIONS FROM THE OPERATOR" (`agent/agents/OrchestratorAgent/prompt.ts:347`, alimentado por `RunOrchestratorTurn.ts:228`). O exemplo que o próprio controller documenta já é sobre trabalho, não sobre voz: *"Nunca sugira migrar de framework."*

O que o produto **não** modela, por decisão: PR, branch e isolamento de árvore. O agente que executa a issue é um harness completo (Claude Code, codex) rodando no workspace, e ele descobre o fluxo de PR pelas skills/README do repositório em que está. O isolamento de trabalho concorrente é implícito ao workspace e ao harness — segue registrado como o follow-up R6 citado em `agent/agents/OrchestratorAgent/prompt.ts:40`, e **não** faz parte desta spec.

## Problem

Em 2026-08-04, com a issue `feature-completa-de-criac-a-o-de-loops-p` já `COMPLETED`, o operador escreveu *"O pr deve fazer parte da issue em si, não precisa abrir uma issue pra isso em especial, já pode subí-lo"*. A instrução nunca alcançou quem poderia executá-la. Três defeitos distintos, todos verificados no banco e nos transcripts:

1. **Não existe caminho de volta para uma issue concluída.** `COMPLETED` é terminal — `Issue` tem `complete()`, `archive()` e `restore()`, e `restore` desfaz arquivamento, não conclusão. O whisper de `SteerThread` também não chega: `thread/services/OpenIssuesReader/DrizzleOpenIssuesReader.ts:20` filtra `archived = false AND status != COMPLETED`, e quando a lista fica vazia o whisper é redirecionado para o próprio orquestrador.

2. **O steer direcionado recusa uma issue concluída.** `SteerIssueTurn.ts:107` valida pertencimento e abertura na mesma pergunta, lendo `openIssues(threadId)`, e responde `AGENT_RUN_SCOPE_MISMATCH`. A fusão é deliberada — o comentário no arquivo diz que recusar issue fechada e issue alheia de forma diferente transformaria o endpoint em oráculo de ids —, mas o efeito é que nem a ferramenta certa teria funcionado.

3. **O orquestrador afirmou uma ação que não executou.** Os dois turnos (`019fce72-cc8c` e `019fce73-738d`) têm **zero** blocos `tool_use`; mesmo assim ele respondeu *"repassei isso pra ela"* e, quando o operador desconfiou e perguntou de novo, *"Sim — ela sabe que o PR faz parte da própria issue"*. Nenhum item `STEER` foi enfileirado e a issue permaneceu com `updated_at` de 17:09:49. O prompt só apresenta a ferramenta de steer dentro do fluxo de **stops** (`OrchestratorAgent/prompt.ts:248-259`), sem cobrir "o operador está redirecionando uma issue existente" — o modelo tinha a ferramenta e nenhuma situação sancionada que casasse com o pedido.

Há ainda um defeito latente que o (1) esconde: se uma issue `COMPLETED` fosse retomada hoje, o turno terminaria chamando `complete()` de novo e bateria em `ISSUE_ALREADY_COMPLETED`, falhando o turno e reciclando o item do mailbox até envenenar.

E, atravessando tudo: o Custom Prompt da thread alcança o agente que **conversa** e nunca o agente que **trabalha** — não há uma única ocorrência de `customPrompt` em `RunIssueTurn.ts` ou em `agents/IssueWorkAgent/`. Uma instrução permanente do tipo "sempre suba um PR ao final" seria lida por quem não escreve código.

## Goal

O operador consegue redirecionar trabalho para uma issue que já concluiu, com uma frase na conversa, sem abrir uma issue nova e sem perder o contexto que aquela sessão acumulou. E consegue registrar uma vez, no Custom Prompt da thread, uma instrução permanente que passa a valer para todo trabalho daquela conversa — não só para o jeito do agente falar.

## Decisions

1. O domínio permanece **PR-agnóstico**. Nenhum código, schema, enum ou evento desta spec nomeia PR, branch, `gh` ou remoto. O que o agente faz ao receber "suba o PR" é assunto do harness e das skills do repositório em que ele roda.

2. Isolamento de árvore (worktree por issue, R6) fica **fora de escopo**. É implícito ao workspace e ao harness que executa a thread. A consequência é aceita e explicitada em *Riscos*.

3. `Issue` ganha `reopen()`: `COMPLETED → WORKING`, e **limpa `completedAt`**. Guard `assertNotArchived()` (mesmo do steer atual) e um erro novo `ISSUE_NOT_COMPLETED` somado à união `IssueDomainErrors` (que hoje tem `ISSUE_ARCHIVED`, `ISSUE_NOT_ARCHIVED`, `ISSUE_ALREADY_ARCHIVED`, `ISSUE_ALREADY_COMPLETED`), com o mesmo `UNPROCESSABLE_ENTITY` dos irmãos. Limpar `completedAt` não é detalhe: `AutoArchiveCompletedIssues` arquiva pelo campo, e uma issue reaberta carregando o carimbo antigo seria arquivada por baixo enquanto trabalha.

4. **O steer direcionado reabre automaticamente.** Receber trabalho é o que reabre uma issue — não existe um "reabrir" que o operador aciona à parte. Reabrir sem instrução seria um estado sem propósito.

5. O guard de `SteerIssueTurn` troca a pergunta "esta issue está aberta nesta thread?" por "esta issue **pertence** a esta thread e **não está arquivada**?". A propriedade de não ser oráculo de ids é preservada: issue de outra thread e issue arquivada continuam sendo recusadas com o **mesmo** erro e a mesma mensagem, indistinguíveis entre si.

6. `thread.customPrompt` passa a ser injetado também no prompt do `IssueWorkAgent`, com **moldura própria**. A moldura do orquestrador não serve: ela proíbe instalar dependências e fixa o formato da linha `[quote: …]`, que são regras de quem conversa. A issue precisa da instrução do operador sem herdar restrições que não são dela.

7. **Nenhum evento novo** é criado em `issue/events/`. Reabrir é um fato de **execução**, e o próprio contexto declara a regra em `issue/events/index.ts`: *"Execution facts — opened / completed — are published by the terminal engine; BC5 reacts to those, it does not re-publish them."* `IssueArchivedEvent` existe porque arquivar é fato que o BC5 possui; reabrir acontece porque o agente está sendo retomado, então segue o mesmo caminho de declaração que abrir e concluir já seguem.

8. O prompt do orquestrador ganha a situação que faltava — "o operador está redirecionando trabalho para uma issue que já existe" — nomeando a ferramenta de steer pelo símbolo (`toolNameOf`), como o arquivo já faz. E ganha a regra explícita de que **não se afirma uma ação que não foi executada**: ou a ferramenta é chamada, ou a resposta não diz que foi.

9. O whisper broadcast (`SteerThread`) **não** muda. Ele continua alcançando só issues abertas: um sussurro que reabrisse todas as issues concluídas da thread acordaria o histórico inteiro a cada frase. Redirecionar uma issue concluída é ato direcionado, e o orquestrador é quem escolhe o alvo.

## User Stories

- **Story 1:** Como operador, quero pedir algo a uma issue que já concluiu, para não ter que abrir uma issue nova só para um ajuste.
  - Given uma issue `COMPLETED` e não arquivada na minha thread, when eu digo ao orquestrador "já pode subir o PR", then ele chama a ferramenta de steer com o id daquela issue e as minhas palavras, a issue volta para `WORKING` e o agente retoma a sessão anterior.
  - Given essa mesma issue **arquivada**, when o orquestrador tenta o steer, then a chamada é recusada e ele me diz que não deu, em vez de afirmar que repassou.

- **Story 2:** Como operador, quero que o Custom Prompt da thread valha para o trabalho, e não só para a conversa, para registrar uma vez uma regra que se aplica a toda issue daquela thread.
  - Given uma thread com Custom Prompt preenchido, when uma issue dessa thread roda, then o texto do operador aparece no prompt do agente que executa.
  - Given uma thread sem Custom Prompt, when uma issue roda, then nenhum cabeçalho de instrução é renderizado.

- **Story 3:** Como operador, quero que o orquestrador só diga que fez algo quando fez, para poder confiar no que ele relata.
  - Given que o operador pediu um redirecionamento, when o orquestrador não chamou a ferramenta, then a resposta não afirma que repassou.

## Acceptance Criteria

- [ ] AC-1: `Issue.reopen()` leva uma issue `COMPLETED` para `WORKING` e deixa `completedAt` ausente.
- [ ] AC-2: `Issue.reopen()` numa issue arquivada lança `ISSUE_ARCHIVED`; numa issue que não está `COMPLETED`, lança `ISSUE_NOT_COMPLETED`.
- [ ] AC-3: Uma issue reaberta não é selecionada por `AutoArchiveCompletedIssues`.
- [ ] AC-4: `SteerIssueTurn` numa issue `COMPLETED` e não arquivada da própria thread é aceito, reabre a issue e enfileira o item `STEER`.
- [ ] AC-5: `SteerIssueTurn` numa issue de **outra** thread e numa issue **arquivada** falham com o mesmo código de erro e a mesma mensagem — indistinguíveis uma da outra.
- [ ] AC-6: Um turno disparado por steer numa issue reaberta conclui chamando `complete()` sem lançar `ISSUE_ALREADY_COMPLETED`.
- [ ] AC-7: A mudança de status da reabertura e o enfileiramento do item `STEER` acontecem na **mesma transação** — um steer que commita sempre reabriu, e um que falha nunca deixa a issue em `WORKING` sem trabalho enfileirado.
- [ ] AC-8: Com `thread.customPrompt` preenchido, o prompt do `IssueWorkAgent` contém esse texto; com o campo ausente, nenhum cabeçalho de instrução é renderizado.
- [ ] AC-9: A moldura da instrução no `IssueWorkAgent` não repete as ressalvas do orquestrador (proibição de instalar dependências e formato da linha `[quote: …]`).
- [ ] AC-10: O system prompt do orquestrador contém a situação "redirecionar trabalho para uma issue existente", nomeando a ferramenta via `toolNameOf` — nenhum nome de ferramenta digitado como literal.
- [ ] AC-11: O whisper de `SteerThread` continua não alcançando issue `COMPLETED`: com apenas issues concluídas na thread, nenhum item `STEER` é enfileirado.

## Riscos

**Trabalho concorrente segue na árvore compartilhada.** Sem o R6, uma issue reaberta escreve no mesmo checkout que qualquer outra issue e que o próprio operador. Isso já mordeu em 2026-08-04: os 82 arquivos do Loop ficaram soltos em `main` misturados com trabalho paralelo. Esta spec **aumenta** a frequência com que uma issue volta a escrever, então aumenta a exposição. Aceito conscientemente; o R6 continua sendo o endereço disso.

**A confiança no relato do orquestrador é tratada por prompt, não por invariante.** A Decisão 8 reduz a chance de o modelo narrar uma chamada que não fez, mas não a elimina — nada no sistema impede que ele descreva uma ação. A alternativa (exigir evidência estrutural da ação para poder afirmá-la) foi considerada e descartada nesta spec porque exigiria que o domínio soubesse o que cada ação significa, o que colide com a Decisão 1.

## Open Questions

- **Decomposição.** A spec nasceu maior (incluía R6 e a mecânica de PR) e encolheu ao aplicar o princípio de que isolamento e PR não são do domínio. No tamanho atual (5 pontos) ela não pede divisão. Fica registrado que, se durante o `/plan` a propagação do `customPrompt` mostrar-se maior do que o plumb previsto, ela sai como spec própria — as duas metades entregam valor separadamente.
- **Recorrência do "narrar sem chamar".** Não foi medido se o episódio é isolado ou padrão. Uma varredura dos transcripts anteriores do orquestrador procurando turnos que afirmam ação com zero `tool_use` diria se a Decisão 8 é suficiente ou se o problema pede tratamento estrutural.
