# Modelo padrão da thread, por provider — Design Spec

**Date:** 2026-08-06
**Status:** Draft
**Bounded Context:** `thread` (a escolha e quem a guarda) + `agent` (o catálogo, o despacho do turno e a exposição MCP)
**Kind:** feature
**Story Points:** 5 — um catálogo declarado em contracts, uma coluna nova (0012), um método de agregado com duas invariantes, um comando irmão do `ConfigurePrompt`, o campo no read DTO, o select no diálogo, e a fiação do turno que hoje não pede modelo nenhum

## Context

Uma thread declara **quais CLIs** ela roda: `thread_threads.providers` é um array de `ProviderKind`, com no mínimo um elemento (`NO_PROVIDER_SELECTED` é invariante de `Thread.create`/`revive`). O que ela **não** declara é qual modelo pedir a esse CLI.

O eixo do modelo já existe inteiro, do enum até o argv, e está desligado nas duas pontas:

- `AgentModelId` (contracts, `wire/enums/agent-model-id.tsp`) — `DEFAULT | SONNET | OPUS | HAIKU`. `DEFAULT` não é "nenhum": é a instrução de **omitir** `--model` e deixar o CLI escolher, e é por isso que é membro do enum em vez de `undefined`.
- `RunOrchestratorTurn` e `RunIssueTurn` aceitam `model: z.enum(AgentModelId).optional()` e colapsam ausência em `AgentModelId.DEFAULT` (`RunOrchestratorTurn.ts:247`, `RunIssueTurn.ts:255`).
- `ClaudeAgentRunner` traduz o membro para o apelido do binário por um **mapa**, não por switch (`CLAUDE_MODEL_ALIASES`), e `DEFAULT` está deliberadamente ausente do mapa — é o que faz `buildArgs` não empurrar `--model`.
- `AgentSession.model` guarda sob qual modelo a sessão do CLI nasceu, e `resumeDecision` recusa retomar quando o turno pede outro: `ResumeInvalidationReason.MODEL_CHANGED`, com a razão escrita por extenso no enum ("o CLI fixa o modelo na sessão que retoma, então o modelo pedido seria ignorado").

O que falta é **quem escolhe**. O único despachante de turnos, `DrizzleMailboxDispatcher`, resolve o provider e não resolve modelo:

```ts
// runThreadTurn — DrizzleMailboxDispatcher.ts:360
const provider = thread.providers[0]
...
await this.handlerFor(RunOrchestratorTurn).execute({ ownerId, threadId, workspacePath, provider, ... })
//                                                    ↑ nenhum `model` — cai em DEFAULT
```

`runIssueWork` faz o mesmo (`thread.providers[0] ?? payload.provider`). Não há terceiro call site: `ForkIssue` só enfileira, e a resolução é sempre no despacho, de propósito — "é propriedade da thread AGORA e o item pode ter sido enfileirado minutos atrás".

Do lado do operador, o `ThreadSettingsDialog` já tem a seção **"Agentes desta conversa"**, que lista `data.providers` com o selo `Em breve` para quem a engine não sabe dirigir (`comingSoon`, derivado de `AgentRunnerFactory.supported`). É a linha que já existe por provider — e é onde falta um controle.

E do lado da conversa, `ConfigurePrompt` já provou o formato desta feature: um comando de configuração da thread que vive nas **duas** superfícies (`McpScope.system` para o console/cliente externo, `McpScope.orchestration` para o próprio orquestrador), confinado à própria thread pelo `AgentIdentityMiddleware` sem uma linha de guard no `handle()`, e com uma seção de prompt que dá ao modelo a **situação sancionada** — porque um modelo com ferramenta e sem situação improvisa (medido neste repositório: dois turnos com zero `tool_use` e uma resposta afirmando trabalho que não fez).

## Problem

Toda conversa deste produto roda no modelo que o CLI escolher, e o operador não tem onde dizer outra coisa.

Isso não é uma preferência estética. As conversas deste produto **não são iguais**: uma thread de triagem responde dezenas de mensagens curtas por dia e paga Opus por cada uma; uma thread onde o operador arquiteta um refactor quer o modelo mais capaz e não se importa com o custo; um grupo com terceiros falando quer o mais barato porque a maior parte do tráfego nem é para o agente. Hoje as três rodam idênticas, e a única maneira de mudar isso seria uma variável de ambiente global — que muda as três juntas, o que é o oposto do pedido.

E o eixo não é "modelo": é **modelo por provider**. Cada CLI tem a própria lista — `opus`/`sonnet`/`haiku` é vocabulário do claude e de mais nada, como o próprio `CLAUDE_MODEL_ALIASES` diz em cima do mapa. Uma thread pode declarar mais de um provider (`providers` é array), então guardar UM modelo na thread guardaria um valor que só faz sentido para um dos CLIs e seria silenciosamente errado para os outros. O que a thread precisa guardar é a **relação**: para cada provider, o modelo escolhido nele.

Existe ainda um problema de forma, e é ele que decide onde a mudança mora. `AgentModelId` hoje é um enum com cara de Claude: `SONNET | OPUS | HAIKU` não é um conjunto de modelos, é o conjunto de modelos de **um** provider. Ampliá-lo com modelos do codex sem declarar a quem cada um pertence produziria exatamente o modelo de dados que a regra 5 do CLAUDE.md proíbe — a resposta para "quais modelos este provider oferece?" viraria um prefixo de string, um regex ou um `if (provider === …)` em algum call site.

## Goal

O operador abre os ajustes de uma conversa, vê **cada agente que aquela conversa roda** com um seletor dos modelos daquele agente, escolhe, e todo turno seguinte daquela thread — orquestrador e issues — roda no modelo escolhido. Ele consegue fazer a mesma coisa falando na conversa. E ele lê, ali no diálogo, que trocar o modelo faz a conversa recomeçar do zero no CLI — porque isso é verdade e sem estar escrito parece bug.

## Decisions

1. **O catálogo é uma RELAÇÃO DECLARADA em `packages/contracts`, nunca um prefixo, regex ou `if` por provider.** Nasce um módulo tipado — `packages/contracts/catalog/agent-models.ts`, exportado como `@codm/contracts/catalog` — cujo conteúdo é uma constante:

   ```ts
   export const PROVIDER_MODELS: Readonly<Record<ProviderKind, readonly AgentModelId[]>> = { … }
   ```

   `Record<ProviderKind, …>` é **exaustivo**: um `ProviderKind` novo faz o `tsc` exigir a entrada, que é a propriedade que substitui o `if` de edge case. Quem responde "quais modelos este provider oferece?" faz **lookup**, em qualquer camada.

   **Por que hand-authored em contracts e não emitido do TypeSpec.** O pipeline TypeSpec→OpenAPI→(ts/go/rust) do repositório emite três coisas — enums, unions e eventos (`codegen/lib/parse-openapi.ts`) — e nenhuma delas é uma relação com **valores**. Emitir uma exigiria um quarto eixo de parsing e três emissores novos para um dado que só o daemon TS lê (o gateway Go não despacha turno; o shell Rust também não). E `packages/contracts` já tem uma camada hand-authored tipada com exatamente este formato: `db/schema/*.ts` importa os enums gerados e os amarra a colunas via `enumCheck`. O catálogo é o mesmo movimento — compõe enums gerados numa relação — e mora ao lado deles.

2. **A redeclaração inevitável ganha um GATE, como o CLAUDE.md manda.** O enum vive no `.tsp` e o catálogo num `.ts`, então "adicionei um modelo e esqueci de dizer de quem ele é" é um estado alcançável. `packages/contracts/catalog/agent-models.test.ts` fecha: todo membro de `AgentModelId` exceto `DEFAULT` aparece em **exatamente uma** lista, `DEFAULT` aparece em **todas** as listas não-vazias, e nenhuma lista tem repetido. Com fixture negativa. O script `test` do pacote passa a incluir o diretório.

3. **`DEFAULT` continua sendo o membro compartilhado, e continua significando "omita `--model`".** Não vira um `CLAUDE_DEFAULT` por provider: o significado é o mesmo em todo CLI ("deixe o binário escolher") e duplicá-lo por provider seria N grafias de um fato. É por isso que a regra do gate acima o trata à parte.

4. **Provider sem runner tem lista VAZIA, e vazio quer dizer "não há o que escolher".** `CLAUDE_CODE → [DEFAULT, OPUS, SONNET, HAIKU]`; `CODEX → []`; `OPENCODE → []`. Ninguém nunca dirigiu esses binários daqui, então este build não sabe quais apelidos eles aceitam, e inventar uma lista seria oferecer ao operador uma escolha que não podemos honrar. O console renderiza o seletor **iff** a lista é não-vazia — mesmo eixo que a linha do provider já renderiza com `Em breve`, mas **declarado à parte**: "consigo dirigir este CLI?" (`AgentRunnerFactory.supported`) e "o que dá para pedir a ele?" (catálogo) são duas perguntas, e hoje elas concordam por acidente do estado do produto, não por definição.

5. **A thread guarda um MAPA `provider → modelo`, parcial, e ausência é a única grafia de `DEFAULT`.** Coluna nova `model_by_provider` (json, `NOT NULL DEFAULT '{}'`), prop `modelByProvider: Partial<Record<ProviderKind, AgentModelId>>` no agregado. `Thread.configureModel(provider, DEFAULT)` **apaga a chave** em vez de gravar `DEFAULT`, exatamente como `configurePrompt('')` vira ausência: "nunca escolhi" e "escolhi deixar o CLI decidir" são o mesmo fato, e duas grafias do mesmo fato é o defeito que o `customPrompt` documenta em três lugares. A leitura colapsa no sentido inverso: `Thread.modelFor(provider)` devolve `modelByProvider[provider] ?? AgentModelId.DEFAULT` — sempre um `AgentModelId`, nunca `undefined`.

   O nome da coluna diz a relação (`model_by_provider`) em vez de só o tipo (`models`), porque ao lado de `providers` um `models` plural lê como "os modelos da thread", que é precisamente o que ele não é.

6. **Duas invariantes, e as duas moram na entidade.** `Thread.configureModel(provider, model)` recusa:
   - `PROVIDER_NOT_BOUND` — o provider não está em `this.providers`. Escolher modelo de um CLI que a conversa não roda é configuração órfã: ninguém nunca a leria e ela reapareceria no diálogo como se valesse.
   - `MODEL_NOT_AVAILABLE` — o modelo não está no catálogo daquele provider. É a invariante que impede pedir `opus` ao codex, e é **domínio** (não aplicação) porque a pergunta é sobre a relação declarada em contracts, que o agregado enxerga inteira, e não sobre a fiação deste deployment (essa é `PROVIDER_COMING_SOON`, que já existe e é application por esse motivo exato).

   Ler `PROVIDER_MODELS` dentro da entidade é legítimo: é uma constante declarada, sem I/O, da mesma família do `import { ProviderKind }` que a entidade já faz. O subpath `@codm/contracts/catalog` é distinto de `@codm/contracts/db` justamente para que o import não pareça persistência entrando no domínio.

7. **Um comando `ConfigureModel`, irmão do `ConfigurePrompt` e do `ConfigureContextBuffer`, no MESMO arquivo.** `ConfigureThreadSettings.ts` já é a casa dos quatro comandos de configuração da thread (C12–C15); este é o C16. Controller `PUT /threads/:threadId/model`, body `{ provider, model }`, `OperatorMiddleware`, 204.

8. **`ConfigureModel` nasce nas DUAS superfícies MCP — `[McpScope.system, McpScope.orchestration]` — pela mesma razão e com a mesma confinação do `ConfigurePrompt`.** O path carrega `threadId`, a identidade `orchestration` carrega `threadId`, e o `AgentIdentityMiddleware` (auto-aplicado porque a classe declara `mcpScopes`) recusa com `FORBIDDEN` qualquer thread que não seja a sua — **sem guard no `handle()`**, que é a propriedade que vale a pena ter e que um check redundante esconderia. `issue-handling` fica de fora, como no irmão: o agente que executa uma issue lê texto de terceiros e trocar o modelo da conversa não é trabalho de issue.

9. **A seção de prompt LISTA os modelos disponíveis, e não deixa o modelo adivinhar.** `RunOrchestratorTurn` já sabe o provider do turno (é input) e a thread já está carregada, então passar `models` (o catálogo daquele provider) e `model` (o efetivo agora) para o `OrchestratorInput` custa duas linhas. Sem isso, a ferramenta existe e o modelo chuta um membro do enum que o domínio recusa — uma ferramenta que só erra é pior que nenhuma. A seção também repete a regra "só quando pedido em voz alta" (mesma de issues e do custom prompt) e diz as duas consequências reais: **vale a partir da próxima mensagem** e **a conversa recomeça do zero no CLI**.

10. **Trocar o modelo invalida o resume, isso já está implementado, e a mudança é ESCREVER isso na tela.** `AgentSession.resumeDecision` já recusa retomar quando o modelo difere (`MODEL_CHANGED`), então a partir do momento em que o despachante passa um modelo escolhido, a primeira troca derruba a sessão do CLI daquela thread e o turno seguinte roda fresco. É o comportamento correto — o CLI fixa o modelo na sessão que retoma — mas sem estar escrito no diálogo e no prompt, o operador vê o agente "esquecer" a conversa e conclui que quebrou. Nenhuma linha de código de invalidação é escrita nesta spec; o que é escrito é o aviso.

11. **O despachante passa `thread.modelFor(provider)` nos DOIS caminhos.** `runThreadTurn` (orquestrador) e `runIssueWork` (subagente da issue) resolvem o modelo no mesmo ponto onde já resolvem provider e workspace, pela razão que o comentário do método já dá: é propriedade da thread AGORA, e o item pode ter sido enfileirado minutos atrás. Uma issue herda o modelo da conversa que a abriu, e não guarda o seu — a issue não tem esse eixo de configuração e inventar um seria uma segunda superfície para a mesma escolha.

12. **`GetThreadSettings` ganha os dois campos DENTRO da entrada de provider que já existe.** Cada item de `providers` passa a ser `{ provider, comingSoon, model, models }` — `model` é o efetivo (nunca `undefined`, ver decisão 5) e `models` é o catálogo daquele provider. O console não importa `@codm/contracts/catalog`: a lista de opções viaja no DTO, pelo mesmo motivo que `customPromptMaxLength` viaja — um cliente que redigita o catálogo é um cliente que discorda dele.

13. **O seletor é a linha do provider que já existe, e salva sozinho.** Nada de seção nova: a seção "Agentes desta conversa" já lista um provider por linha com glifo e nome, e o `Select` (modo enum do primitivo, `values={models}`, `i18nPrefix="enums.AgentModelId"`) entra nessa linha. Salva no `onValueChange` como as pilhas de buffer, e não com botão como o prompt — é escolha de um clique, não texto escrito aos poucos. O aviso de que a conversa recomeça é uma linha `text-muted-foreground` sob a seção, renderizada só quando há pelo menos um seletor.

14. **`AgentModelId` NÃO ganha membros nesta spec.** A tentação é somar os modelos do codex agora que o catálogo aceita. Mas nenhum runner dirige codex, então a lista dele é vazia (decisão 4) e os membros ficariam órfãos — reprovados pelo próprio gate da decisão 2. O trabalho desta spec é tornar somar um modelo uma edição de duas linhas declaradas; somá-los é a próxima.

## User Stories

- **Story 1:** Como operador, quero escolher o modelo que uma conversa usa, para não pagar o modelo mais caro numa thread de triagem nem rodar a thread de arquitetura no mais fraco.
  - Given uma thread rodando CLAUDE_CODE, when eu abro os ajustes, then vejo na linha do agente um seletor com os modelos daquele agente e a opção padrão marcada.
  - Given que eu escolho `OPUS`, when o próximo turno daquela thread roda, then o CLI é invocado com `--model opus`.
  - Given que eu escolho a opção padrão de volta, when o próximo turno roda, then nenhum `--model` é passado.

- **Story 2:** Como operador com mais de um agente na conversa, quero que a escolha seja por agente, para que o modelo que escolhi num CLI não vaze para outro que nem tem esse modelo.
  - Given uma thread que declara dois providers, when eu escolho um modelo no primeiro, then o segundo continua no padrão dele.
  - Given um provider sem runner, when eu abro os ajustes, then aquela linha não oferece seletor nenhum — continua só com `Em breve`.

- **Story 3:** Como operador, quero saber que trocar o modelo faz a conversa recomeçar, para não achar que o agente teve amnésia.
  - Given a seção de agentes com pelo menos um seletor, when eu olho a tela, then leio que trocar o modelo recomeça a sessão daquela conversa.

- **Story 4:** Como operador, quero trocar o modelo falando na conversa, para não ter que abrir o console no meio de um assunto.
  - Given uma thread minha, when eu digo "passa pro opus", then o orquestrador chama a ferramenta, o campo passa a valer, e ele me diz em uma linha o que registrou — sem afirmar que já está no modelo novo.
  - Given um run da thread A, when a chamada mira a thread B, then é recusada e a configuração de B fica intacta.

- **Story 5:** Como operador, quero que uma issue aberta numa conversa rode no modelo daquela conversa, para não configurar a mesma coisa duas vezes.
  - Given uma thread configurada em `OPUS`, when uma issue dela roda um turno, then o turno da issue também pede `opus`.

## Acceptance Criteria

- [ ] AC-1: `PROVIDER_MODELS` existe em `packages/contracts`, é tipado `Record<ProviderKind, readonly AgentModelId[]>`, e o gate da decisão 2 passa — com fixture negativa provando que um membro de `AgentModelId` não atribuído a nenhum provider **falha** o teste.
- [ ] AC-2: A migração 0012 adiciona `model_by_provider` a `thread_threads` com `NOT NULL DEFAULT '{}'`, aplica sobre um banco que já tem threads, e a cópia `//go:embed` do gateway fica byte-a-byte igual (`db:check-go` verde).
- [ ] AC-3: `Thread.configureModel(CLAUDE_CODE, OPUS)` grava; `modelFor(CLAUDE_CODE)` devolve `OPUS`; um round-trip pelo repositório (save → findById) preserva o mapa.
- [ ] AC-4: `Thread.configureModel(CLAUDE_CODE, DEFAULT)` **remove a chave** — o mapa persistido volta a `{}`, não a `{"CLAUDE_CODE":"DEFAULT"}` — e `modelFor` volta a devolver `DEFAULT`.
- [ ] AC-5: `Thread.configureModel` recusa com `PROVIDER_NOT_BOUND` um provider que a thread não declara, e com `MODEL_NOT_AVAILABLE` um modelo fora do catálogo daquele provider. Nenhum dos dois deixa o mapa alterado.
- [ ] AC-6: `PUT /threads/:threadId/model` grava pelo caminho do console (sem run token) e responde 204.
- [ ] AC-7: `ConfigureModel` aparece em `system` **e** em `orchestration` nas duas direções da comparação classe↔spec (`mcpExposure().scopesFor(...)`, o snapshot dourado e o `x-mcp-scopes` do `openapi.json`), e **não** aparece em `issue-handling`.
- [ ] AC-8: Um run `orchestration` da própria thread, pela cadeia real (`AgentIdentityMiddleware` → controller), grava o modelo; um run da thread A mirando a thread B é recusado com `FORBIDDEN` **pelo middleware** (sem guard no `handle()`) e a configuração de B fica intacta.
- [ ] AC-9: O despachante passa `thread.modelFor(provider)` para `RunOrchestratorTurn` **e** para `RunIssueTurn` — provado no nível do despachante, com uma thread configurada, não só por leitura de código.
- [ ] AC-10: Com a thread em `OPUS`, o argv construído pelo `ClaudeAgentRunner` contém `--model opus`; com a thread no padrão, o argv **não** contém `--model`.
- [ ] AC-11: `GetThreadSettings` devolve, por provider, `model` (efetivo, nunca ausente) e `models` (o catálogo daquele provider — vazio para provider sem runner).
- [ ] AC-12: O `ThreadSettingsDialog` renderiza um `Select` na linha de um provider com catálogo, nenhum na linha de um provider com catálogo vazio, e dispara a mutação com o valor escolhido; o aviso de reinício da sessão aparece só quando há ao menos um seletor.
- [ ] AC-13: O system prompt do orquestrador nomeia a ferramenta pelo símbolo derivado (`toolNameOf(ConfigureModelController)`), lista os modelos do provider do turno, diz que vale a partir da próxima mensagem e que a conversa recomeça no CLI, e mantém a regra de não afirmar ação não executada.
- [ ] AC-14: `IssueWorkAgent` continua sem nenhuma ferramenta de `system` e sem a ferramenta de modelo.
- [ ] AC-15: `bun tsc`, `bun lint` e `bun run test` verdes; `enum-placement` e as demais rails de arquitetura intocadas.

## Riscos

- **A primeira troca derruba a sessão do CLI.** É o comportamento correto e já implementado (`MODEL_CHANGED`), mas é uma perda de contexto real e visível: o agente responde a próxima mensagem sem lembrar da conversa no CLI. Mitigado por escrita — no diálogo (decisão 13) e no prompt (decisão 9) — nunca por código: suprimir a invalidação faria o CLI ignorar o modelo pedido em silêncio, que é estritamente pior.
- **Catálogo desatualizado em relação ao binário.** `PROVIDER_MODELS` é uma declaração deste repositório sobre o que o `claude` aceita; se o CLI aposentar um apelido, o operador escolhe um modelo que o binário recusa e o turno morre. Aceito: é o mesmo risco que `CLAUDE_MODEL_ALIASES` já carrega hoje, e a alternativa (probar o binário por modelos) é uma detecção nova, com cache e modo degradado, para um conjunto que muda em meses.
- **Escolha por terceiro em thread de grupo.** Uma mensagem de outra pessoa pedindo "usa o opus" é texto de autoria alheia chegando a um modelo que agora tem a ferramenta. Seguram as mesmas três coisas do `ConfigurePrompt`: a seção `THE ROOM` diz de quem é a conversa, a seção nova repete "só quando pedido em voz alta", e o valor é visível e sobrescrevível no console. O eixo de autoria por participante segue fora de escopo — é um contexto novo, não um efeito colateral desta spec.
- **Sem trilha de auditoria.** Não há evento de domínio para "o modelo mudou", como não há para o custom prompt. Fora de escopo pelo mesmo motivo: criar um só para esta borda deixaria o irmão sem ele.
