# Loops da thread acionáveis via MCP do orquestrador — Design Spec

**Date:** 2026-08-05
**Status:** Draft
**Bounded Context:** `thread` (as cinco portas já existem) + `agent` (exposição, uma seção de prompt e um campo de entrada)
**Kind:** feature
**Story Points:** 3 — nenhuma entidade, nenhum use case, nenhum schema de operação, nenhuma migração e nenhum endpoint novo; cinco declarações de escopo, uma seção de prompt, UM campo novo na entrada do orquestrador e os rails que provam que a porta abriu confinada

## Context

Um **Loop** (`packages/api/typescript/src/thread/entities/Loop.ts`) é o operador falando no timer: um prompt que a CODM sussurra sozinha dentro de UMA conversa, na cadência que o `LoopSchedule` (`thread/objects/LoopSchedule.ts`) descreve. Desde `.specs/2026-08-04-loops-por-intervalo-design.md` esse VO é uma **união discriminada** por `LoopScheduleKind`: `DAILY` (`timeOfDay` + `weekdays` + `timezone` IANA) e `INTERVAL` (`everyMinutes`, inteiro em `[1, 1440]`).

As cinco portas HTTP vivem juntas em `thread/controllers/ThreadLoops.ts` e chamam use cases que já existem de ponta a ponta: `ListThreadLoops` (leitura, `thread/usecases/ListThreadLoops.ts`) e as quatro escritas de `thread/usecases/ManageThreadLoops.ts` — `CreateThreadLoop` (C21), `UpdateThreadLoop` (C22), `SetThreadLoopEnabled` (C23) e `DeleteThreadLoop` (C24). Hoje a única superfície que as aciona é o console: a seção `LoopsSection` dentro do `ThreadSettingsDialog` (`packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/LoopsSection.tsx`).

Do lado MCP, a exposição é declarada na própria classe (`static mcpScopes`) e descoberta por varredura em `agent/mcp/exposure.ts`. Das cinco portas de loop, **uma** declara escopo: `ListThreadLoopsController` está em `McpScope.system`, e o comentário na classe registra a decisão inteira — *"Reachable as an MCP tool: an agent asked 'o que está agendado nesta conversa?' should be able to answer without the operator opening the dialog. READ only — the writes below stay off the door."* As quatro escritas não declaram nada e portanto não existem para nenhum agente.

Este spec é o irmão de `.specs/2026-08-04-custom-prompt-acionavel-via-mcp-design.md`, que fez exatamente esta manobra para o Custom Prompt: nenhum endpoint novo, uma declaração de escopo, uma seção de prompt (`OrchestratorPromptBuilder.standingInstructions`, `agent/agents/OrchestratorAgent/prompt.ts:284`) e a asserção nomeada em `tests/architecture/mcp-exposure.test.ts`. A forma de teste do controller já está escrita e é o molde a copiar: `thread/controllers/ConfigurePrompt.test.ts`.

## Problem

O loop é a configuração da conversa cujo pedido mais obviamente nasce **dentro** da conversa — *"todo dia de manhã me pergunta como está o deploy"*, *"de 15 em 15 minutos verifica o build"* — e é a única que o operador não consegue registrar falando. O orquestrador tem três saídas, e são as mesmas três já medidas neste repositório para o steer e para o custom prompt:

1. **Prometer se lembrar.** Não existe timer nenhum na janela de contexto. O operador acha que agendou e não agendou nada.
2. **Mandar abrir o console.** É a mesma falha que as duas specs anteriores corrigiram: a instrução chega a quem não pode executá-la, e o operador sai da conversa para configurar a conversa que está tendo.
3. **Afirmar que agendou.** Modo de falha medido em 2026-08-04: dois turnos com **zero** blocos `tool_use` e uma resposta afirmando que o pedido tinha sido repassado. Ferramenta ausente não produz silêncio, produz narração.

E o problema tem um segundo lado que o custom prompt não tinha: um loop tem **ciclo de vida**. Depois de criado, o operador vai querer mudar o horário, pausar por uns dias, retomar e eventualmente apagar — e cada uma dessas é endereçada por um `loopId` que ninguém na conversa conhece. Abrir só a criação produziria uma conversa capaz de criar alarmes e incapaz de desligá-los.

## Goal

O operador agenda, edita, pausa, retoma e remove os prompts recorrentes de uma conversa **falando nela** — e o que ele acabou de ditar é a mesma linha que ele vê no `LoopsSection` do console e o mesmo loop que a varredura `FireDueLoops` vai disparar de minuto em minuto.

## Decisions

1. **As CINCO portas entram em `orchestration`, e a leitura é o que torna as outras quatro alcançáveis.** `ListThreadLoopsController` ganha `orchestration` **somando** ao `system` que já tem — mesma forma de `ConfigurePrompt` e `RaiseStop`, que já vivem em duas superfícies. Sem ela o modelo não tem como aprender um `loopId`: a identidade não carrega loop nenhum e o prompt não renderiza a lista (Decisão 3). Expor só a criação seria dar ao operador a capacidade de criar alarmes e não a de desligá-los.

2. **As quatro ESCRITAS entram SÓ em `orchestration`, e a postura `system` READ-only de hoje fica intacta.** A ausência das escritas em `system` não é um esquecimento — está escrita na classe (*"READ only — the writes below stay off the door"*) e continua verdadeira: `system` é o cliente MCP externo, que não corre atrás de um run token e portanto não tem thread própria para ser confinado. `orchestration` tem. Ampliar `system` é uma segunda decisão de exposição que ninguém pediu; fica registrada como follow-up.

3. **A lista é uma FERRAMENTA, não uma seção de prompt.** A alternativa era renderizar os loops da thread a cada turno, como `openStops` faz. Recusada: `openStops` são urgentes por natureza (trabalho parado esperando resposta) e loops não são — pagar uma query por turno para um fato que importa numa fração pequena dos turnos infla todo turno para servir poucos. E a porta de leitura já existe, já está exposta e já devolve a forma exata que as escritas aceitam.

4. **O confinamento é o genérico, e desta vez ele tem DUAS metades, ambas já construídas.** (a) Todos os cinco paths começam em `/threads/:threadId/loops`, a identidade `orchestration` carrega `threadId`, e o `AgentIdentityMiddleware` — auto-aplicado justamente porque a classe declara `mcpScopes` — recusa com `FORBIDDEN` qualquer thread que não seja a do run. (b) As três portas por-loop carregam também um `loopId`, que a identidade **não** carrega, então `compareIdentity` não tem o que dizer sobre ele — e não precisa: `loadLoop()` em `ManageThreadLoops.ts` já verifica `loop.ownerId === ownerId && loop.threadId === threadId` e levanta `LOOP_NOT_FOUND`, guard escrito para o console pela razão idêntica (*"Loop ids are addressable from the console, so 'delete loop X' with a stolen id must not delete somebody's loop just because the id is real"*). **Nenhuma linha de guard nova em lugar nenhum** — ao contrário de `ResolveStop` e `SteerIssueTurn`, que tiveram que se defender sozinhos.

5. **O orquestrador ganha o FUSO da máquina como um campo de entrada, porque sem ele o membro `DAILY` é inalcançável.** `DailyLoopSchedule` exige uma timezone IANA e o modelo não tem de onde tirá-la — adivinhar pelo idioma da conversa é escrever um horário errado com cara de certo. `OrchestratorInputSchema` ganha `timezone`, preenchido por `RunOrchestratorTurn` com `Intl.DateTimeFormat().resolvedOptions().timeZone`, que é literalmente o que o console faz (`localTimezone()`, `LoopsSection.tsx:99`) e o que o repositório já ratificou como sendo o fuso do operador: a seção de Settings registra que operador e fuso saíram da tela porque *"the timezone is the machine's"* (`settings/-components/GeneralSection/index.tsx:10-12`). O daemon roda na mesma máquina que o console. O modelo recebe o valor e o reenvia; ele nunca inventa um.

6. **Nada de "now" no prompt.** O modelo não precisa saber que horas são para escrever `09:00` nem `everyMinutes: 15`. "Me lembra daqui a duas horas" é um lembrete de uma vez só — outro artefato (`.claude/skills/scheduler/SKILL.md`), não um loop — e continua fora daqui.

7. **PAUSAR é o default para "para com isso"; APAGAR só quando o operador pede para remover.** As duas portas existem e a diferença é real: `SetThreadLoopEnabled(false)` é reversível e mantém a linha no console, `DeleteThreadLoop` não tem desfazer. O prompt diz qual é qual, porque um modelo que lê "não me manda mais isso" e apaga destruiu uma configuração que o operador achava que estava só pausando.

8. **A mesma regra de "nunca inferir" que governa issues e instruções permanentes.** Loop é algo que o operador pede em voz alta. Uma reclamação de passagem (*"eu sempre esqueço de olhar o build"*) não vira um alarme de 15 em 15 minutos — e a assimetria importa: um loop inferido não é uma frase errada, é uma conversa que passa a ser interrompida sozinha até alguém desligar.

9. **A união discriminada chega ao prompt COMO união.** O modelo escolhe um dos dois membros e manda os campos daquele membro — nunca um corpo que mistura `timeOfDay` com `everyMinutes`. É o Não-Negociável #3 do repositório aplicado à outra ponta do fio: o backend modela a operação como discriminada, então quem a aciona reflete os casos.

10. **`issue-handling` fica de fora.** O agente que executa uma issue lê texto de terceiros na entrada, e programar sussurros recorrentes numa conversa não é trabalho de issue. A asserção de `IssueWorkAgent.test.ts` que proíbe overlap com `system` permanece verdadeira e intocada.

11. **Nada no frontend muda.** `LoopsSection` continua sendo a superfície de leitura e escrita do operador, e é ela que torna a mudança auditável: o que o modelo agendou é uma linha que o operador abre, vê, edita e apaga.

## User Stories

- **Story 1:** Como operador, quero agendar na conversa um prompt recorrente por horário, para não abrir o console só para pedir uma coisa que estou pedindo em voz alta.
  - Given uma thread minha, when eu digo "todo dia de manhã às 9 me pergunta como está o deploy", then o orquestrador cria o loop com `kind: DAILY`, `09:00` e o fuso da máquina, e me diz em uma linha o que agendou.
  - Given que ele agendou, when eu abro o `ThreadSettingsDialog` daquela thread, then vejo a linha do loop com esse prompt e esse horário.

- **Story 2:** Como operador, quero agendar por intervalo, para acompanhar algo que muda o tempo todo.
  - Given uma thread minha, when eu digo "de 15 em 15 minutos verifica se o build quebrou", then o loop nasce com `kind: INTERVAL` e `everyMinutes: 15`, e a primeira rodada é daqui a 15 minutos.

- **Story 3:** Como operador, quero mexer num loop que já existe sem saber id nenhum, para poder mudar de ideia falando.
  - Given uma thread com loops, when eu digo "muda aquele do deploy para as 8", then o orquestrador lista os loops, encontra o do deploy e o edita.
  - Given uma thread com loops, when eu digo "para de me mandar aquilo por uns dias", then ele pausa o loop em vez de apagá-lo.
  - Given uma thread com loops, when eu digo "pode apagar aquele loop", then ele o remove.

- **Story 4:** Como operador, quero que o orquestrador de uma conversa não alcance os loops de outra, para que uma frase escrita num grupo não desligue o alarme de outra thread.
  - Given um run da thread A, when a chamada mira a thread B, then é recusada e os loops de B ficam intactos.
  - Given um run da thread A, when a chamada mira um `loopId` real que pertence à thread B, then é recusada e aquele loop continua existindo.

## Acceptance Criteria

- [ ] AC-1: As cinco operações de loop aparecem na superfície `orchestration`, e `ListThreadLoops` permanece **também** em `system` — nas duas direções da comparação classe↔spec emitida (`mcpExposure().scopesFor(...)`, o snapshot dourado e o `x-mcp-scopes` do `openapi.json`).
- [ ] AC-2: As quatro escritas **não** entram em `system` — a postura READ-only daquela superfície para loops fica byte a byte o que era.
- [ ] AC-3: O servidor MCP gerado do escopo `orchestration` lista as cinco ferramentas em runtime (não apenas o `tsc` verde).
- [ ] AC-4: Um run `orchestration` da **própria** thread, pela cadeia real (`AgentIdentityMiddleware` → controller), cria um loop `DAILY` e um loop `INTERVAL`; ambos são lidos de volta pelo `LoopRepository` com a agenda que foi enviada.
- [ ] AC-5: O mesmo run edita, pausa, retoma e apaga um loop da própria thread, e cada efeito é lido de volta do repositório (agenda nova; `nextRunAt` ausente quando pausado; presente de novo quando retomado; ausente da lista quando apagado).
- [ ] AC-6: Um run da thread A mirando a thread B é recusado com `FORBIDDEN` **pelo middleware** — sem guard novo no `handle()` — e os loops de B permanecem intactos.
- [ ] AC-7: Um run da thread A mirando um `loopId` real da thread B é recusado com `LOOP_NOT_FOUND` **pelo guard que já existe** no use case, e aquele loop continua existindo.
- [ ] AC-8: Um run com token revogado é recusado e nada é escrito.
- [ ] AC-9: O caminho do console (sem run token) continua criando, editando, pausando e apagando — a porta nova não fecha a velha.
- [ ] AC-10: O system prompt do orquestrador contém a situação "prompt recorrente nesta conversa" nomeando as cinco ferramentas pelo símbolo derivado (`toolNameOf(...)`), nunca por literal digitado.
- [ ] AC-11: O prompt apresenta as duas formas de agenda como alternativas exclusivas, com os limites de `everyMinutes` ditos, e manda listar antes de editar/pausar/apagar porque o modelo não conhece ids.
- [ ] AC-12: O prompt distingue pausar de apagar, e diz que pausar é o que fazer quando o operador só quer que pare.
- [ ] AC-13: `OrchestratorInputSchema` carrega `timezone`, `RunOrchestratorTurn` a preenche com o fuso da máquina, e o prompt a renderiza como o valor a enviar num loop `DAILY`.
- [ ] AC-14: O prompt mantém a regra de nunca inferir e a de nunca afirmar ação não executada.
- [ ] AC-15: `IssueWorkAgent` continua sem nenhuma ferramenta de `system` e sem nenhuma das cinco ferramentas de loop.

## Riscos

- **Um loop inferido interrompe a conversa sozinho.** É o risco assimétrico desta frente e o que a distingue do custom prompt: um texto errado é uma frase, um alarme errado é uma conversa que passa a ser cutucada até alguém notar. Três coisas seguram: a regra de nunca inferir (Decisão 8), o recibo em uma linha no turno em que agenda, e a linha visível no console com o switch ao lado. Não é eliminado — é a mesma classe de risco que `issues()` já aceita para abrir issues.
- **Apagar não tem desfazer.** Mitigado pela Decisão 7 (pausar é o default para "para com isso"), não eliminado. A alternativa — soft delete em loops — é uma mudança de agregado que esta spec deliberadamente não toca.
- **Injeção por terceiro em thread de grupo.** Uma mensagem de outra pessoa no grupo pedindo "agenda X" é texto de autoria alheia chegando a um modelo que agora tem as ferramentas. Vale aqui o mesmo que a spec do custom prompt aceitou e registrou: a seção `THE ROOM` já diz que só a mensagem sob `THIS TURN` é para ele e quem é dono da conversa; os loops são visíveis e desligáveis no console; e um eixo de autoria por participante no mailbox é um contexto novo, não um efeito colateral desta spec.
- **Sem trilha de auditoria.** Não há evento de domínio para "um loop foi criado/apagado" — nem havia antes, para a escrita do console. Criar um só para esta borda deixaria a escrita do console sem ele ou obrigaria a mexer numa operação que esta spec não toca.

## Follow-ups (fora de escopo)

- Levar as quatro escritas de loop também para `system`, se e quando o cliente MCP externo precisar delas (Decisão 2).
- Renderizar os loops da thread no prompt quando/se a medição mostrar que o modelo lista em uma fração grande dos turnos (Decisão 3).
