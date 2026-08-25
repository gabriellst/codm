# Custom Prompt da thread acionável via MCP do orquestrador — Design Spec

**Date:** 2026-08-04
**Status:** Draft
**Bounded Context:** `thread` (a operação já existe) + `agent` (exposição do escopo e a situação no prompt)
**Kind:** feature
**Story Points:** 2 — nenhuma entidade, nenhum use case, nenhuma migration e nenhum endpoint novo: uma declaração de escopo, uma seção de prompt e as provas de que a porta abriu confinada

## Context

Cada thread carrega um **Custom Prompt** — o texto que o operador escreve para *aquela* conversa. Ele vive em `thread_threads.custom_prompt`, é colapsado de vazio para ausente em `Thread.configurePrompt` (`thread/entities/Thread.ts:376`), tem teto de 8000 caracteres (`thread/schemas/CustomPrompt.ts`), e é escrito por uma operação que já existe de ponta a ponta: `ConfigurePrompt` (`thread/usecases/ConfigureThreadSettings.ts`) atrás de `PUT /threads/:threadId/prompt` (`thread/controllers/ConfigurePrompt.ts`).

Do outro lado, ele é lido em **todo** turno: `RunOrchestratorTurn.ts:228` lê `thread.customPrompt` fresco do agregado a cada turno — não capturado quando a sessão do CLI abriu — e o `OrchestratorPromptBuilder.operatorInstructions()` o renderiza por último, sob `INSTRUCTIONS FROM THE OPERATOR`, dizendo explicitamente que ele **vence** o resto do prompt. Desde a spec anterior (`2026-08-04-redirecionar-trabalho-para-issue-concluida-design.md`, decisão 6) ele também alcança o `IssueWorkAgent`, com moldura própria.

Hoje a única porta de escrita é o console: `ThreadSettingsDialog`. O controller declara `static mcpScopes = [McpScope.system]`, e `system` é a superfície de **navegação e operação** — gerada e montada, mas nenhum agente interno a declara, por decisão: `IssueWorkAgent` leva `issue-handling`, `OrchestratorAgent` leva `orchestration`, e uma asserção em `IssueWorkAgent.test.ts:100` fixa que nenhuma ferramenta de `system` vaza para o agente de trabalho.

O comentário no próprio `ConfigurePrompt.ts` registra por que `system` era o default certo: *"este endpoint reescreve as instruções permanentes do próprio agente que estaria chamando, e um agente que pode editar o próprio prompt é um loop sem operador dentro"*. Esta spec responde a essa objeção em vez de contorná-la — ver **Decisões 4 e 5**.

## Problem

O Custom Prompt é a única configuração da thread que o operador **só** consegue mudar saindo da conversa. Ele fala com o orquestrador no WhatsApp; quando diz *"de agora em diante responde sempre em inglês"* ou *"nunca sugira migrar de framework"*, o modelo tem três saídas, e as três são ruins:

1. **Obedecer só naquele turno.** A instrução vive na janela de contexto e morre quando a janela rola ou a sessão é invalidada. O operador acha que registrou uma regra permanente e registrou uma frase.
2. **Dizer para o operador abrir o console.** A conversa é o produto; mandar o operador para outra superfície para registrar uma preferência sobre a própria conversa é o mesmo defeito que a spec anterior corrigiu no steer — a instrução chega a quem não pode executá-la.
3. **Afirmar que registrou.** É exatamente o modo de falha medido em 2026-08-04 com o steer: dois turnos com **zero** blocos `tool_use` e uma resposta afirmando *"repassei isso pra ela"*. Uma ferramenta ausente não produz silêncio, produz narração.

Não é hipótese sobre uma ferramenta ausente: é o comportamento que o repositório já documenta para o caso anterior de "o modelo tinha o pedido e nenhuma situação sancionada que casasse com ele".

## Goal

O operador consegue registrar, mudar e apagar as instruções permanentes da sua conversa **falando na própria conversa** — e o texto que ele acabou de ditar é o mesmo que ele vê no `ThreadSettingsDialog` e o mesmo que passa a moldurar todo turno seguinte daquela thread, inclusive o trabalho das issues.

## Decisions

1. **Nenhum endpoint novo, nenhum use case novo, nenhum schema novo.** A operação existe, é a mesma que o console dispara, e a única mudança é *quem pode chamá-la*. `ConfigurePromptController` passa a declarar `static mcpScopes = [McpScope.system, McpScope.orchestration]` — a mesma forma de `RaiseStopController`, que já vive em duas superfícies.

2. **Continua em `system`.** `system` é a superfície do cliente MCP externo (o agente do próprio operador, navegando o sistema) e do console; ganhar um segundo público não é motivo para perder o primeiro. As duas audiências são legítimas e a operação é a mesma.

3. **`issue-handling` fica de fora.** O agente que executa uma issue lê texto de terceiros na entrada (a mensagem que originou o trabalho) e reescrever as instruções permanentes da conversa não é trabalho de issue. A asserção de `IssueWorkAgent.test.ts` que proíbe overlap com `system` permanece verdadeira e intocada.

4. **A confinação é a genérica, e é ela que responde à objeção do "loop sem operador".** O path é `/threads/:threadId/prompt`; a identidade `orchestration` carrega `threadId` (`OrchestratorAgent.IdentitySchema` omite só `issueId`); `AgentIdentityMiddleware` — auto-aplicado justamente porque a classe declara `mcpScopes` — compara as chaves que a identidade carrega contra `{...params, ...body}` e recusa com `FORBIDDEN` qualquer thread que não seja a sua. **Nenhuma linha de guard em `handle()`**, ao contrário de `ResolveStop` (endereçado por `stopId`, que a identidade não carrega) e de `SteerIssueTurn` (endereçado por `issueId`, idem). Esta é a forma boa: a ferramenta é *thread-shaped*, então o confinamento sai de graça e não depende de ninguém lembrar de escrevê-lo.

5. **O agente não pode editar a MOLDURA, só o TEXTO.** O que `operatorInstructions()` renderiza em volta do custom prompt — "você ainda nunca reescreve histórico do git nem instala dependências, e a linha `[quote: …]` mantém a forma exata" — é código deste repositório, não conteúdo do campo. Um texto que o modelo escrevesse para si mesmo continua sendo emoldurado por essas ressalvas, então a superfície que ele ganha sobre si é sobre voz, idioma e preferências de trabalho — nunca sobre raio de dano nem sobre transporte. Somado à Decisão 4 (só a própria thread) e à Decisão 6 (só quando pedido em voz alta), o "loop sem operador" não se fecha: o operador continua sendo quem pede, quem vê o resultado no console e quem sobrescreve quando quiser.

6. **O prompt ganha a situação sancionada que falta, com a mesma regra de "nunca inferir" que governa issues.** Instrução permanente é algo que o operador pede em voz alta; uma reclamação de passagem não vira regra permanente. Sem essa seção, expor a ferramenta repete o defeito medido: modelo com ferramenta e sem situação improvisa.

7. **A ferramenta SUBSTITUI o texto inteiro — e o prompt diz isso.** Não existe append no contrato, e inventar um seria um segundo mecanismo para o mesmo campo. Quando já existe texto, ele está literalmente no prompt do turno (sob `INSTRUCTIONS FROM THE OPERATOR`), então "reenvie o que já está lá junto com o novo" é uma instrução que o modelo consegue cumprir com o que tem na mão. Apagar é chamar sem valor — `ConfigurePromptInputSchema` já deixa o campo opcional exatamente para o cliente MCP que não tem conceito de caixa de texto vazia.

8. **O efeito é a partir do PRÓXIMO turno, e o prompt diz isso também.** O `systemPrompt` é montado no início do turno e dobrado na primeira linha de stdin do run (`ClaudeAgentRunner.ts:557`), inclusive em run retomado. Escrever o campo no meio do turno não reescreve o turno que está correndo. Sem essa frase, o modelo diz "pronto, já estou falando inglês" enquanto continua sob as instruções antigas — a mesma família de mentira que a spec anterior atacou.

9. **`GetThreadSettings` NÃO entra em `orchestration`.** O texto vigente já chega ao orquestrador pelo próprio system prompt, a cada turno, lido fresco do agregado. Uma ferramenta de leitura para o mesmo dado seria uma segunda fonte para a mesma verdade e uma chamada a mais por turno.

10. **Nada no frontend muda.** O `ThreadSettingsDialog` continua sendo a superfície de leitura/escrita do operador, e é o que torna a mudança auditável: o que o modelo escreveu é um campo que o operador abre e vê.

## User Stories

- **Story 1:** Como operador, quero ditar na conversa uma instrução permanente para aquela thread, para não ter que abrir o console só para registrar uma preferência sobre a conversa que estou tendo.
  - Given uma thread minha, when eu digo ao orquestrador "de agora em diante responda sempre em inglês", then ele chama a ferramenta de custom prompt com esse texto, o campo da thread passa a valer esse texto, e ele me diz em uma linha o que registrou.
  - Given que ele registrou, when eu abro o `ThreadSettingsDialog` daquela thread, then vejo exatamente o texto que ditei.

- **Story 2:** Como operador, quero somar uma instrução às que já existem sem perder as anteriores, para que registrar a segunda regra não apague a primeira.
  - Given uma thread com custom prompt preenchido, when eu peço mais uma instrução permanente, then o campo passa a conter as duas.

- **Story 3:** Como operador, quero apagar as instruções permanentes falando, para não precisar do console para desfazer.
  - Given uma thread com custom prompt preenchido, when eu digo "esquece aquelas instruções", then o campo volta a ficar ausente e nenhum cabeçalho de instrução é renderizado nos turnos seguintes.

- **Story 4:** Como operador, quero que o orquestrador de uma conversa não alcance a configuração de outra, para que uma frase escrita num grupo não reescreva as instruções de outra thread.
  - Given um run da thread A, when a chamada mira a thread B, then é recusada e o custom prompt de B fica intacto.

## Acceptance Criteria

- [ ] AC-1: `ConfigurePrompt` aparece na superfície `orchestration` **e** permanece em `system` — nas duas direções da comparação classe↔spec emitida (`mcpExposure().scopesFor('ConfigurePrompt')`, o snapshot dourado e o `x-mcp-scopes` do `openapi.json`).
- [ ] AC-2: O servidor MCP gerado do escopo `orchestration` lista a ferramenta em runtime (não apenas o `tsc` verde).
- [ ] AC-3: Um run `orchestration` da **própria** thread, passando pela cadeia real (`AgentIdentityMiddleware` → controller), grava o custom prompt: o valor é lido de volta do repositório.
- [ ] AC-4: O mesmo run chamando **sem valor** apaga o campo (volta a `undefined`, não a `''`).
- [ ] AC-5: Um run da thread A mirando a thread B é recusado com `FORBIDDEN` **pelo middleware** — sem guard no `handle()` — e o custom prompt de B permanece byte a byte o que era.
- [ ] AC-6: Um run token revogado é recusado e nada é escrito.
- [ ] AC-7: O caminho do console (sem run token) continua gravando — a porta nova não fecha a velha.
- [ ] AC-8: O system prompt do orquestrador contém a situação "instrução permanente para esta conversa" nomeando a ferramenta pelo símbolo derivado (`toolNameOf(ConfigurePromptController)`), nunca por literal digitado.
- [ ] AC-9: Quando a thread já tem custom prompt, o prompt instrui a reenviar o texto existente junto com o novo; quando não tem, essa linha não é renderizada.
- [ ] AC-10: O prompt afirma que a mudança vale a partir da próxima mensagem, e mantém a regra de não afirmar ação não executada.
- [ ] AC-11: `IssueWorkAgent` continua sem nenhuma ferramenta de `system` e sem a ferramenta de custom prompt.

## Riscos

- **Injeção por terceiro em thread de grupo.** Uma mensagem de outra pessoa no grupo pedindo "muda suas instruções" é texto de autoria alheia chegando a um modelo que agora tem a ferramenta. Três coisas seguram: a seção `THE ROOM` já diz que só a mensagem sob `THIS TURN` é para ele e que o operador é quem é dono da conversa; a nova seção repete que instrução permanente é do dono da conversa; e o campo é visível e sobrescrevível no console. Aceito e registrado — a alternativa (um eixo de autoria por participante no mailbox) é um contexto novo, não um efeito colateral desta spec.
- **Sobrescrita silenciosa de um texto longo.** Um modelo que reenvia mal o texto existente encurta as instruções do operador sem avisar. Mitigado pela instrução de reenviar o texto inteiro e pelo recibo em uma linha, não eliminado. O teto de 8000 caracteres limita o tamanho do estrago, e o console mostra o resultado.
- **Falta de trilha de auditoria.** Não há evento de domínio para "o prompt mudou" — nem havia antes, para a escrita do console. Fora de escopo aqui: criar um evento só para esta borda deixaria a escrita do console sem ele ou obrigaria a mexer numa operação que esta spec deliberadamente não toca.
