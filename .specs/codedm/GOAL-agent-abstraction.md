# GOAL — Agent Abstraction: uma interface só, stream-json sobre pipes, agents como cidadãos

> Este documento é o **CONTRATO** do goal (founder, 2026-07-26). Ele **SUBSTITUI**
> `.specs/codedm/OVERNIGHT-GOAL-2026-07-24-go-domain-port.md`, que fica em disco apenas como
> histórico. Em divergência entre qualquer resumo de sessão e este doc, **este doc vence**.
>
> Fontes da verdade a LER antes de agir: `.specs/codedm/2026-07-26-agent-driving-stream-json.md`
> (o mecanismo, já ratificado), `.specs/codedm/2026-07-24-fundamentals-and-upstream.md` (o handoff),
> `CLAUDE.md` (a constituição), e o contexto `agent` do medscall
> (`/Users/work/Desktop/Projetos/medscall/software/monorepo/packages/api/src/agent/`) como shape de
> referência para agents internos.

---

## 1. Contexto e o que mudou

### O que foi abandonado

O goal de 2026-07-24 tinha uma tese única: *"Reescrever o **domínio** (hoje em
`packages/api/typescript/src`) como **novos contextos Go** sobre o kernel `template/core-go`,
colapsando **2 sidecars + 2 bancos + Redis → UM sidecar Go + UM SQLite (WAL)**"*
(`OVERNIGHT-GOAL-2026-07-24-go-domain-port.md:8-10`). Esse port **morreu**. Três razões, nesta ordem:

1. **O terminal era o gate, e o gate caiu por outro motivo.** A decisão (e) do goal antigo
   (`:62-66`) reconhecia o terminal como *"o contexto de MAIOR risco"* e exigia um spike de paridade
   `Bun.Terminal` ↔ Go (`creack/pty` + ConPTY) **antes** de portar. Sem paridade, o alvo "só Go"
   já nascia como "um sidecar Go + o runner de PTY TS interino" (`:129-131`) — ou seja, **o payoff
   inteiro do port dependia de um spike de PTY**. O estudo do open-design
   (`2026-07-26-agent-driving-stream-json.md`) desmontou a premissa por baixo: *"O terminal engine
   foi julgado 'resists a Go port' **por causa do acoplamento PTY/TUI/JSONL**. Esse raciocínio não
   sobrevive a este achado"* (`:77-80`). Não porque devamos portar — mas porque **o engine não
   precisa de PTY nenhum**, e portanto a justificativa "o terminal prende o domínio em TS"
   evaporou junto com a justificativa oposta. O port perdeu o seu contexto crítico como argumento.

2. **A economia de memória não paga a reescrita.** Colapsar 2 sidecars → 1 binário economiza
   **~1 runtime Bun**. O footprint real do produto é de ~500MB–1GB, **dominado pela WebView do
   Tauri e pelos subprocessos dos agent CLIs** (cada `claude` em execução é o item caro, e eles são
   N por issue ativa). Reescrever ~10 contextos TS em Go para economizar single-digit por cento de
   RSS é troca ruim.

3. **O problema real que o port ia resolver é o split-DB, e o substrato SQLite resolve sozinho.**
   O sintoma documentado é a lista de channels aparecendo **DISCONNECTED** porque o daemon lê PGlite
   e o gateway Go escreve Postgres (`2026-07-24-fundamentals-and-upstream.md:112-120`). O goal
   antigo resolvia isso *de lambuja*, movendo o `ui` para Go (`:39`). O commit `469eed5b`
   ("feat(sqlite): salvage the SQLite substrate from the abandoned go-domain port") separou as duas
   coisas: o substrato sobreviveu, a tese não.

O branch `go-domain-port` foi arquivado em `archive/go-domain-port-2026-07-26`.

### O que sobrevive (e está em voo AGORA)

- **O substrato SQLite como implementação concreta**, exatamente com as regras da decisão (a) e da
  regra 5 do goal antigo (`:48-52`, `:80-83`): dialeto SQLite único, namespaces viram prefixo de
  tabela, `uuid→text`, `timestamptz→integer{timestamp_ms}`, `jsonb→text{json}`, enums `text + CHECK`;
  `modernc.org/sqlite` puro-Go, WAL, `//go:embed migrations`, **data-dir encapsulado no construtor
  do store, zero `CODEDM_DATA_DIR` vazando pelas camadas**. Já em disco:
  `packages/contracts/db/schema-sqlite/` (11 arquivos + `migrations/`) e
  `packages/api/go/core/db/sqlite/`.
- **A decisão (c) — sem consumer groups** (`:56-59`): single-operator, um consumidor por direção,
  dedup por `UNIQUE` no destino + `ON CONFLICT DO NOTHING`, claim de outbox sob txn IMMEDIATE.
- **A decisão (d) — fresh start** (`:60-61`): não há migração de dados PGlite→SQLite.
- **A disciplina de processo inteira** (`:68-91`) — reproduzida na §7 deste doc.
- **O branch `sqlite-shared-store`**, com 16 arquivos Go não-commitados (repositórios sqlite de
  channel/message/remote + testes). É ele que mata o split-DB. Ver Fase 0.

### O que muda agora

Com 2 sidecars aceitos permanentemente, o **E2** do handoff vira a linha viva, não o E1: se um split
existe, a ponte cross-service tem de ser **padrão documentado**, não lacuna implícita
(`2026-07-24-fundamentals-and-upstream.md:196-199`). Aqui a ponte é literal: **um SQLite
compartilhado pelos dois sidecars**. O Go fica com **apenas** o contexto `channel`/gateway — a mesma
divisão do medscall. O daemon TS mantém o domínio inteiro. E é dentro do daemon TS que este goal
acontece.

---

## 2. Objetivo

Substituir o engine de terminal baseado em PTY por **uma única abstração de agent** no daemon TS:
um seam com **um método** que dirige qualquer coding-agent CLI externo via `child_process.spawn`
com **pipes** e **stream-json bidirecional**, e sobre o qual vivem **agents internos como cidadãos
de domínio de primeira classe** (o classificador de mensagem inbound, e os que vierem). Classificar
uma mensagem e executar trabalho num repositório passam a ser **a mesma chamada com requests
diferentes** — a distinção one-shot/interativo, que hoje é um vazamento de *transporte* dentro do
domínio, deixa de existir. O contrato OpenAPI/SDK continua sendo o invariante; o e2e roda verde a
cada fase.

---

## 3. As decisões fechadas

Estas **não** se reabrem durante a execução. Decisão nova genuína → `OVERNIGHT-BLOCKED.md`, pular só
aquela fatia, continuar.

**(D1) 2 sidecars, aceitos como permanentes.** Go mantém **apenas** `internal/channel` +
`internal/shared` (padrão medscall). O daemon TS mantém o domínio. O shell Tauri supervisiona dois
processos. Os dois sidecars compartilham **UM SQLite** — é isso que mata o split-DB, não um colapso
de binários.

**(D2) stream-json sobre pipes; ZERO PTY no caminho do agent.** A invocação canônica é a do spec
(`2026-07-26-agent-driving-stream-json.md:14-25`):

```
claude -p --input-format stream-json --output-format stream-json --verbose \
       [--include-partial-messages] [--model X] [--add-dir …] \
       [--session-id <uuid> | --resume <id>] \
       --permission-mode bypassPermissions
```

`stdio: ['pipe','pipe','pipe']`, `shell: false`, `detached: true` (não-Windows). O prompt entra como
**uma linha JSONL no stdin** e **o stdin não fecha** enquanto o turno vive. A resposta é
reconstruída **exclusivamente do stdout JSONL parseado** — nunca de stdout cru, nunca de
`~/.claude/projects`. Fim de turno é **estrutural** (`stop_reason`, com as duas guardas:
`parent_tool_use_id == null` e `stopReason !== 'tool_use'`), nunca marcador de TUI. O
`--permission-mode bypassPermissions` substitui o auto-accept do trust prompt — **é uma troca de
autoridade, aceita conscientemente aqui** (`:53-56`): o produto roda agents nos repositórios reais
do usuário e já rodava com trust auto-aceito via injeção de teclas na PTY; a mudança é de mecanismo,
não de postura.

**(D3) UMA interface de agent, para classificação E para execução.** Hoje o seam é
`TerminalLLMRunner` com **cinco** membros abstratos (`TerminalLLMRunner.ts:66-86`): `generate`,
`stream`, `getSession`, `killSession`, `prewarm`. O `generate` documenta o vazamento com todas as
letras: *"The runner invokes the provider CLI in non-interactive 'print' mode (e.g. `claude -p
<prompt> --output-format json`), parses the JSON … **No streaming, no terminal session** — the pure
`generate()` half of the seam, used by `IssueClassifier`"* (`types.ts:54-59`). E a prova de que a
diferença é **só transporte** está no argv builder compartilhado: `buildCommand(provider, binaryPath,
mode: 'generate' | 'stream', …)` cujo único delta para claude é
`if (mode === 'generate') base.push('--output-format', 'json')` (`oneshot.ts:65-85`). **Uma flag.**
Isso vira **um** método `run(request)`; o que distingue classificação de trabalho é **o request**
(`outputSchema` presente ou ausente), nunca a interface.

**(D4) CLIs externos são literais de dado, um por CLI — nunca uma classe.** Vem do open-design:
*"Each CLI is a **data literal** (`RuntimeAgentDef`), not a class — one pipeline, 26 agents"*
(`2026-07-26-agent-driving-stream-json.md:39`). Substitui o `switch (provider)` escrito à mão em
`buildCommand` e `defaultBinary` (`oneshot.ts:73-96`).

**(D5) Agents internos são cidadãos de domínio, no shape do medscall.** Classe `@injectable()` por
propósito, com `inputSchema`/`outputSchema` declarativos, prompt builder irmão, identidade em
`AgentName`, registrada como **token DI de classe** — sem factory, sem mapa nome→agent
(`medscall .../agent/registry.ts:19-60`; `.../agent/types/Agent.ts:83-127`).

**(D6) PTY só para um painel de shell voltado ao usuário — e ele não existe hoje.** O spec fixa a
fronteira: *"`node-pty` IS a dependency — used **only** for a user-facing shell pane, **never** for
an agent. That is the boundary to copy"* (`:37-38`). Como esse painel **não está especificado**, o
subtree PTY é **deletado** nesta reestruturação (4028 LOC em
`services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/`, ~54% das 7504 LOC do contexto `terminal`).
A opção fica preservada em `git log`, não em código morto. Se o painel for especificado, ele nasce
como preocupação do **shell desktop**, não como parte do runtime de agent.

**(D7) Processo por turno; sem REPL vivo entre turnos.** É a decisão de maior alavancagem e ela é
fechada aqui. O REPL longo só existia para amortizar o custo de boot da PTY (boot settle, trust
banner, priming turn) — por isso existem `SessionPrewarmService`, `SessionMap`, `queue.ts`, o timer
de idle-evict e o `prewarm()` no seam. Com `-p` headless **não há boot sequence**, logo não há custo
a esconder. Continuidade multi-turno passa a ser o `--session-id`/`--resume` nativo do claude,
persistido na linha durável (`:33-36`). Consequência aceita: `prewarm`/`getSession`/`killSession`
saem da interface e o cancelamento vira process-group kill.

---

## 4. A abstração

### 4.1 O seam: `AgentRunner`, um método

```ts
// agent/services/AgentRunner/AgentRunner.ts
export abstract class AgentRunner {
	abstract run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent>
}
```

**Por que exatamente este método, e por que só ele.** O medscall mantém dois (`LlmRunner.generate`
+ `LlmRunner.stream`, `medscall .../services/LlmRunner/LlmRunner.ts:83-89`) e isso é **legítimo lá**:
são dois caminhos de runtime de verdade sobre o mesmo backend — *"single Mastra call vs. AG-UI
subscriber drain"*. **Aqui não são.** Depois de (D2), classificar e executar são: o mesmo `spawn`,
o mesmo formato de stdin, o mesmo parser de stdout, o mesmo sinal de fim de turno. Um segundo método
codificaria **zero** informação de domínio e reintroduziria exatamente o que o founder rejeitou.
**Divergimos do medscall aqui, conscientemente.**

`AsyncIterable` (e não `Promise`) porque o caso streaming é o caso geral e o estruturado é o
degenerado — a inversa não é verdadeira. A ergonomia de "só me dê o objeto" é resolvida por um
helper **sobre a mesma iteração** (§4.4), não por um segundo método.

### 4.2 O request — onde a diferença de fato mora

```ts
export interface AgentRunRequest<OutputSchema extends ZodType | undefined = undefined> {
	agentName: AgentName              // identidade p/ telemetria + logs (medscall AgentName)
	provider: ProviderKind            // wire enum já existente (provider-kind.tsp)
	cwd: string                       // workspace absoluto da thread
	systemPrompt?: string
	messages: AgentMessage[]          // o turno; múltiplas mensagens = mesmo turno vivo
	outputSchema?: OutputSchema       // ← O ÚNICO botão que faz disto "classificação"
	model?: string
	session?: { resumeId?: string; newId?: string }
	binaryPath?: string               // resolvido pelo ProviderDetector
	signal?: AbortSignal              // cancelamento → process-group kill
}
```

- **Classificação** = `run({ …, outputSchema: LlmDecisionSchema, messages: [oneUserMessage] })`.
- **Trabalho real** = `run({ …, messages: [inbound], session: { resumeId } })`, sem `outputSchema`.

Nada mais difere. `extractJson` (o scan de janela `{...}` encolhendo, `oneshot.ts:103-124`) **morre**:
com stream-json o texto final do assistant vem já delimitado por frame, e a validação é
`outputSchema.safeParse` sobre ele.

### 4.3 O RUN — request → frames estruturados → resultado

```ts
export type AgentRuntimeEvent =
	| { type: 'frame'; frame: AgentFrame }            // TRANSPORTE — SSE; nunca vai ao outbox
	| { type: 'fact'; fact: AgentTurnFact }           // FATO de domínio, cunhado mid-turn
	| { type: 'finished'; result: AgentRunResult }    // exatamente UM, sempre o último

export type AgentFrame =
	| { kind: 'system_init'; sessionId: string; model: string }
	| { kind: 'assistant_text'; messageId: string; text: string }
	| { kind: 'text_delta'; messageId: string; delta: string }
	| { kind: 'thinking_delta'; delta: string }
	| { kind: 'tool_use'; toolUseId: string; tool: string; input: unknown; parentToolUseId: string | null }
	| { kind: 'tool_result'; toolUseId: string; ok: boolean; summary: string }
	| { kind: 'usage'; inputTokens: number; outputTokens: number }
	| { kind: 'result'; stopReason: string; parentToolUseId: string | null }
	| { kind: 'error'; detail: string }

export interface AgentRunResult {
	outcome: AgentRunOutcome            // COMPLETED | STOPPED
	replyText: string
	sessionId: string | null
	output?: unknown                    // presente sse outputSchema foi passado E validou
	failed: boolean                     // validação estrutural falhou — NUNCA throw
	failure?: string
	stop?: { kind: StopKind; detail: string }   // ex.: AUTH_REQUIRED (stop-kind.tsp já tem)
}
```

**Regras duras do fold:**

1. **UM wrapper opaco por frame de transporte, não uma classe por tipo de frame.** Isto é medscall
   verbatim: eles tinham 32 classes espelho de AG-UI + 138 linhas de conversor e **deletaram tudo**
   em favor de um `AgUiFrameEvent` único, porque *"AG-UI é wire format; não modelamos isso como
   vocabulário de domínio"* (`medscall .../agent/README.md:432`). O `AgentFrame` acima é a taxonomia
   do wire do claude e para por aí.
2. **Fatos de domínio saem do accumulator, não do parser.** `StreamJsonToTurnFactAccumulator` é uma
   máquina de estado pura `(frame) => AgentTurnFact | null`, com `flush()` que materializa
   `tool_use` sem `tool_result` como falha, testada sobre sequências de frames enlatadas. Sem
   dependência de spawn, sem I/O.
3. **Validação estruturada nunca lança no meio do drain.** Falha vira `finished` com
   `failed: true`. É a regra que o medscall documenta no próprio contrato do agent: *"validation
   failures surface as a terminal event with `payload.failed === true` (never as a thrown error, so
   consumers can still drain the stream cleanly)"* (`medscall .../agent/types/Agent.ts:117-125`).
4. **Turn-end é estrutural.** `kind: 'result'` com `parentToolUseId == null` e
   `stopReason !== 'tool_use'` fecha o turno e só então `stdin.end()`. Backstop: watchdog de
   inatividade. Isso substitui os três detectores concorrentes de hoje e mata os enums
   `TuiMarker`/`TuiActionType`/`TurnEndSignal`.

### 4.4 Structured output e trabalho com ferramentas: a MESMA chamada

O açúcar vive na **classe base do Agent**, não no runner:

```ts
// agent/types/Agent.ts
export abstract class Agent<InputSchema extends AgentInputSchemaConstraint, OutputSchema extends ZodType | undefined = undefined> {
	abstract readonly inputSchema: InputSchema
	readonly outputSchema?: OutputSchema
	readonly input!: z.output<InputSchema> & AgentInputEnvelope   // phantom
	readonly output!: OutputSchema extends ZodType ? z.output<OutputSchema> : never

	/** ÚNICO entry point. */
	abstract run(input: this['input']): AsyncIterable<AgentRuntimeEvent>

	/** Helper SOBRE run(): draina, valida o terminal, devolve o output tipado. Não é um segundo transporte. */
	protected async collect(input: this['input']): Promise<this['output']> { /* drena run(), lê result.output */ }
}
```

Os campos `input!`/`output!` são **phantom** (definite-assignment, nunca atribuídos) — puros
carregadores de tipo, copiados do medscall (`.../agent/types/Agent.ts:90-104`), que também explica
por que é **classe abstrata e não interface**: `instanceof` sobrevive e o tsyringe ganha um token de
classe estável. `collect()` existe em **um** lugar, é `protected`, e não aparece no seam.

### 4.5 `ProviderDef` — o literal de dado por CLI externo

```ts
// agent/providers/ProviderDef.ts
export interface ProviderDef {
	id: ProviderKind
	bin: string
	fallbackBins?: string[]
	versionArgs: string[]
	helpArgs?: string[]
	capabilityFlags?: Record<string, string>     // '--include-partial-messages' -> 'partialMessages'
	buildArgs(opts: {
		model?: string
		cwd: string
		extraDirs?: string[]
		resumeSessionId?: string
		newSessionId?: string
		caps: ProviderCapabilities                // passado por PARÂMETRO — ver nota abaixo
	}): string[]
	promptViaStdin: boolean
	promptInputFormat: 'text' | 'stream-json'
	streamFormat: 'claude-stream-json' | 'json-event-stream' | 'plain'
	eventParser?: string
	resumesSessionViaCli?: boolean
	capturesSessionIdFromStream?: boolean
	authProbe?: { args: string[]; timeoutMs?: number }
}

// agent/providers/registry.ts
export const PROVIDER_DEFS: Record<ProviderKind, ProviderDef> = { … }   // exaustivo por tipo
```

Três escolhas explícitas:

- **`Record<ProviderKind, ProviderDef>`, não array + dedupe em runtime.** `ProviderKind` já é wire
  enum (`provider-kind.tsp`); a exaustividade vira erro de `tsc`, que é estritamente melhor que a
  checagem de duplicidade em boot do open-design.
- **`caps` entra por parâmetro, não por `Map` global mutável.** No open-design o `buildArgs` lê um
  mapa de módulo populado pela detecção — impuro na prática. Aqui o `ProviderDetector` devolve
  `{ status, binaryPath, version, caps }` e o caller passa `caps` adiante. **Divergência consciente
  do open-design**, alinhada ao "contrato antes de implementação" do `CLAUDE.md`.
- **Capacidade ausente degrada o REQUEST, nunca a interface.** Provider sem stream-json →
  `promptInputFormat: 'text'` + `streamFormat: 'plain'`, o runner escreve-e-fecha o stdin e emite
  frames `assistant_text` por linha. Provider sem resume → `resumesSessionViaCli` ausente, e o
  **prompt** passa a carregar o transcript renderizado. Nenhum `if (provider === …)` no runner.
  Se `codex`/`opencode` não tiverem modo JSONL equivalente (não verificado — ver risco na Fase 1),
  a adaptação é **um `eventParser` novo**, nunca um segundo método no seam.

### 4.6 Agents internos: definição e registro

Um diretório por agent, exatamente como o medscall (`.../agent/README.md:740-748`):

```
agent/agents/ClassifyIssueAgent/{ClassifyIssueAgent.ts, prompt.ts, types.ts, index.ts}
agent/agents/IssueWorkAgent/{IssueWorkAgent.ts, prompt.ts, types.ts, index.ts}
```

- **`ClassifyIssueAgent`** — absorve o miolo LLM do `IssueClassifier` atual: `LlmDecisionSchema`
  (`IssueClassifier.ts:47-53`) vira o `outputSchema`; `SYSTEM_PROMPT` (`:130-134`) e
  `buildClassificationPrompt` (`:136-142`) viram um `@injectable() ClassifyIssuePromptBuilder` em
  `prompt.ts`. **Fica de fora do agent**: o atalho determinístico de reply-quote (`:78-80`), o gate
  de confiança contra `DEFAULT_THRESHOLD = 0.6` (`:72,89`), a cunhagem de slug (`:98`) e o fallback
  de clarify (`:108-114`) — isso é **política de roteamento**, não runtime de agent, e permanece num
  serviço fino `IssueRouter` no contexto `agent`.
- **`IssueWorkAgent`** — sem `outputSchema`, prompt de sistema resolvido por um prompt builder
  stateful (caminho do repo, título da issue, histórico do thread), como o `ServicePromptBuilder`
  do medscall.

Ambos injetam **o mesmo** `AgentRunner`. **Isso é a decisão #3 satisfeita estruturalmente:**
interface idêntica, transporte idêntico, request diferente.

**Registro** em `agent/registry.ts` via `expandBindings`, token de classe, mesma instância nos três
envs — sem mapa nome→agent, sem factory (`medscall .../agent/registry.ts:19-60`):

```ts
{ token: AgentRunner,        mock: StubAgentRunner, integration: StubAgentRunner, real: realRunner },
{ token: ClassifyIssueAgent, mock: ClassifyIssueAgent, integration: ClassifyIssueAgent, real: ClassifyIssueAgent },
{ token: IssueWorkAgent,     mock: IssueWorkAgent,     integration: IssueWorkAgent,     real: IssueWorkAgent },
```

`AgentName` (enum privado do contexto) existe para **identidade** — `static readonly NAME` na
classe, `agentName` no request, label em log/telemetria — nunca para resolução. O seam E2E hermético
atual é preservado tal e qual (`terminal/registry.ts:18-20`: sob `CODEDM_E2E` o `real` cai para um
stub determinístico) — **nenhum teste jamais spawna um CLI de verdade**.

**Não** portamos o `AgentConfig` do medscall agora. Lá ele nasceu porque um toggle de UI o exigiu;
aqui seria contexto especulativo, proibido por `CLAUDE.md:476-484`.

### 4.7 Streaming/SSE

`AgentStreamRegistry` **fica como está** e é portado sem reescrita: canal observador SSE (um writer
por issue, cap por owner, drop silencioso sem observador, force-unregister quando o writer falha,
`AgentStreamRegistry.ts:137-145`) **mais** a guarda de single-active-run absorvida
(`beginSession`/`endSession`, `:151-162`). É transporte puro, zero significado de domínio.

Muda **uma** coisa, e ela é um ganho: `TerminalActionFrameSchema` hoje é chaveado em
`z.enum(TuiActionType)` — saída de regex sobre a TUI (`AgentStreamRegistry.ts:26-32`). Passa a
carregar o **`tool` real do frame `tool_use` + um resumo do `input`**. `tool` é `z.string()`, **não**
enum: o conjunto é aberto (MCP acrescenta ferramentas em runtime), e a regra "conjunto fechado →
enum" do `CLAUDE.md` não se aplica a conjunto aberto. Isso é o "net gain" do spec (`:49-51`): o
painel passa a poder dizer *"Claude está editando `foo.ts`"*. **É mudança de contrato** → `bun sdk`
+ `react tsc` + `e2e tsc` no mesmo gate.

Só handlers/use cases do contexto `agent` invocam agents. O controller SSE
(`StreamTerminalSession`) **não** chama agent: ele registra um writer e pronto.

### 4.8 Sessão / resume

A entidade durável já existe e já é do shape certo — só está mal nomeada. `TerminalLLMSession`
(`entities/TerminalLLMSession.ts:5-17`) carrega `{ownerId, issueId, threadId, provider, cwd,
claudeSessionId, lastTurnAt}` sobre `terminal_terminal_llm_sessions`
(`packages/contracts/db/schema-sqlite/terminal.ts:10-33`, único por issue).

Vira `AgentSession`, com `claudeSessionId → agentSessionId` (o nome atual amarra o modelo a um
vendor) e **duas colunas novas**: `model` e `lastMessageId`. Elas dão casa às quatro guardas de
invalidação de resume do spec (`:34-36`) — `model_changed`, `cwd_changed`, `missing_cursor`,
`conversation_advanced` — que viram **um método de invariante na entidade**:

```ts
resumeDecision(ctx: { model: string; cwd: string }): { resume: true; id: string } | { resume: false; reason: ResumeInvalidationReason }
```

Sem novo value object: a guarda não é reusada em lugar nenhum, e `CLAUDE.md:476-484` manda
default no mais enxuto. `listRecentForPrewarm` some junto com o prewarm (D7).

### 4.9 Cancelamento

`detached: true` no spawn + `process.kill(-pgid, 'SIGTERM')`, escalando para `SIGKILL` após uma
janela de graça. **Process group é obrigatório**: os subprocessos MCP/tool do claude sobrevivem ao
filho direto (`spec :67-68`). Substitui `closePtyGracefully` e o `shutdown()` duck-typed do runner
que hoje o passo de shutdown do daemon resolve por `import()` dinâmico + `any`
(`packages/api/typescript/src/index.ts`, step `'terminal sessions'`) — passa a ser um método
declarado no `AgentRunner`, sem duck-typing e sem `as any`.

---

## 5. Onde isso vive

### 5.1 O contexto

**O contexto `terminal` é RENOMEADO para `agent`** — `git mv`, história preservada. Não se cria um
segundo contexto: dois contextos disputando "runtime de agent" é exatamente a ambiguidade que este
goal existe para remover, e a `CONTEXTS` é a declaração única de identidade
(`shared/contexts.ts`).

- `CONTEXTS.terminal: { pgSchema: 'terminal' }` → `CONTEXTS.agent: { pgSchema: 'agent' }`.
- `terminal/index.ts:9` hoje passa o **literal** `name: 'terminal'` a `BoundedContext.create` — o
  próprio doc da `contexts.ts` proíbe literais (*"Every consumer imports the value from here
  (`CONTEXTS.ui`, never the literal `'ui'`)"*). Corrigir na renomeação: `name: CONTEXTS.agent`.
- Tabela: `terminal_terminal_llm_sessions` → `agent_agent_sessions`, nos **dois** diretórios de
  schema (`db/schema/` e `db/schema-sqlite/`) + migration. Barato porque a decisão (d) — fresh
  start — segue valendo.
- `ANNOTATED_CYCLES` em `shared/context-map.ts:129-133` é reescrito de `['terminal','thread']` para
  `['agent','thread']`, com o *why* atualizado.
- **Códigos de erro NÃO mudam.** `TERMINAL_ALREADY_RUNNING`, `SESSION_ALREADY_STREAMING`,
  `TOO_MANY_TERMINAL_STREAMS`, `PROVIDER_NOT_DETECTED`, `TERMINAL_SPAWN_FAILED`,
  `CLASSIFICATION_FAILED` (`terminal/errors/index.ts:7-18`) são vocabulário público (status HTTP +
  chave i18n + consumo no react). Renomear custa ripple e não compra nada. Só entra um código novo:
  `AGENT_RESUME_INVALIDATED` (informativo, não-fatal, ou nem isso se o resume degradar em silêncio).

### 5.2 Divergência consciente do medscall: quem invoca o agent

O medscall proíbe: agent é invocado **só** por handler ou job, nunca por use case, nunca por
controller. **Não adotamos essa regra para o classificador.** Justificativa: no medscall o agent
produz a **resposta visível ao usuário** — um efeito colateral, logo handler. Aqui o classificador
produz uma **decisão que o chamador precisa usar dentro da própria transação**:
`thread/usecases/ClassifyMessage.ts` persiste transcript + clarification junto com o resultado.
Tornar isso event-driven quebraria uma decisão de roteamento em duas transações e exigiria uma saga
sem ganho algum. Então: `ClassifyMessage` continua injetando — só que agora
`@agent/agents/ClassifyIssueAgent` em vez de `@terminal/services/IssueClassifier`
(`ClassifyMessage.ts:5`), e a Partnership anotada continua sendo Partnership anotada.
O `IssueWorkAgent`, esse sim, é dirigido **só por handler** (`RunTerminalSessionOnClassification` →
`RunIssueTurn`).

### 5.3 Destino arquivo a arquivo (contexto `terminal`, 7504 LOC)

| Arquivo / pasta | Destino |
|---|---|
| `services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/**` (4028 LOC: `spawner.ts` 315, `transcript.ts` 236, `ClaudeBootSequence.ts` 189, `tui/` 197, `ansi.ts` 70, `SessionMap.ts`, `SessionStore.ts`, `queue.ts`, `BinaryProbe.ts`, `logger/`, `testFakePty.ts` + 6 suites de PTY) | **MORRE** (D2/D6/D7) |
| `services/TerminalLLMRunner/TerminalLLMRunner.ts` (5 membros) | **VIRA** `services/AgentRunner/AgentRunner.ts` (1 membro + `shutdown`) |
| `services/TerminalLLMRunner/types.ts` (`TerminalRuntimeEvent`, `AgentGenerateRequest`) | **VIRA** `AgentRuntimeEvent` + `AgentFrame` + `AgentRunRequest`; `AgentGenerateRequest` **morre** |
| `services/TerminalLLMRunner/oneshot.ts` (175 LOC: `buildCommand(mode)`, `defaultBinary`, `extractJson`, `mergeLineStreams`) | **MORRE**; argv vai para `providers/defs/*`, o resto é substituído pelo codec |
| `services/SessionPrewarm/**` + o `setup:` de `terminal/index.ts:17-25` | **MORRE** (D7) |
| `services/IssueClassifier/IssueClassifier.ts` | **SPLIT**: prompt+schema → `agents/ClassifyIssueAgent/`; threshold/slug/clarify → `services/IssueRouter/`; `slug.ts` acompanha o router |
| `services/IssueClassifier` `OpenIssueRef` (`:11-16`, importado por 3 arquivos de `thread/`) | **MOVE para `thread/`** — é conceito de thread; a dependência inverte no sentido certo |
| `services/ProviderDetector/**` | **FICA**, estendido para devolver `caps` (probe de `helpArgs` × `capabilityFlags`). Corrigir o comentário obsoleto de `SystemProviderDetector.ts` que afirma que o daemon roda sob Node por causa do node-pty — falso desde o Fork D2 |
| `services/AgentStreamRegistry/**` | **FICA**; só o `TerminalActionFrameSchema` muda (§4.7) |
| `services/TerminalOutputAccumulator/**` | **ENCOLHE**: hoje tem dois caminhos de conclusão (`turn_completed` → `replyParts.join` vs `exit === 0` → `stdout.join`) — o segundo existia só para servir o one-shot e **some** |
| `usecases/RunTerminalSession.ts` (249 LOC) | **VIRA** `usecases/RunIssueTurn.ts`; `persistLifecycle` encolhe (sem `resumed`/`killedReason` de PTY); a disciplina de duas transações com o stream **estritamente fora de tx** (`:82-121`) é preservada |
| `entities/TerminalLLMSession.ts` + repositório + schemas | **VIRA** `AgentSession` (§4.8) |
| `enums/{TuiActionType,TuiMarker,TurnEndSignal,TerminalSessionKillReason}.ts` | **MORREM** |
| `enums/{ClassificationVerdict,TerminalRunOutcome}.ts` | **FICAM** (`TerminalRunOutcome` → `AgentRunOutcome`) |
| `events/TerminalSessionIdleEvictedEvent.ts` (exportado, nunca construído) | **MORRE** |
| `events/TerminalSessionResumedEvent`, `TerminalSessionKilledEvent` | **MORREM** ou encolhem com D7 — decidir na Fase 4 com base no que o resume nativo ainda torna observável |
| `events/{Started,ReplyDrafted,Completed,StopRaised}` + `handlers/PublishTerminalIntegrationEvents` + `handlers/RunTerminalSessionOnClassification` | **FICAM** (os integration events são congelados) |
| `controllers/{DetectProviders,StreamTerminalSession}.ts` | **FICAM** |
| **NASCEM** | `providers/{ProviderDef.ts, registry.ts, defs/{claude,codex,opencode}.ts}`, `services/StreamJsonCodec/`, `services/AgentRunner/{StreamJsonAgentRunner,StubAgentRunner,E2eStubAgentRunner}/`, `types/Agent.ts`, `agents/ClassifyIssueAgent/`, `agents/IssueWorkAgent/`, `enums/AgentName.ts`, `services/IssueRouter/` |

### 5.4 Ferramental que precisa nascer junto (house rule)

`agents/` é um **tipo de artefato novo**. `CLAUDE.md` ("if you wrote it, the CLI should write it") e
o `docs/CLI.md` (tabela de verbos de backend, sem linha `agent`) obrigam: na mesma fase em que o
primeiro agent nasce, entram **`.claude/skills/agent/{SKILL.md, registry.yaml}`** (variante
`typescript`) e o verbo **`bun cli agent <ctx> <Name>`** com auto-wiring de barrel. Sem isso o
`/review` e o `bun review` não sabem classificar os arquivos novos, e o próximo agent nasce à mão.

---

## 6. Fases

Toda fase: e2e **verde** ao final, entrada no `BUILD-LOG.md`, commit convencional, `git status`
limpo. Fase substantiva = workflow com builder + 2 juízes adversariais (§7).

### Fase 0 — SQLite compartilhado (em voo; PRECEDE tudo)

Fechar o `sqlite-shared-store`: commitar os 16 arquivos Go não-rastreados (repositórios sqlite de
channel/message/remote + testes + `core/db/dbutil/sqlite.go` + `core/db/sqlite/gen|query`), colocar
**os dois sidecars no MESMO SQLite**, com o data-dir encapsulado no construtor do store.

> **Não abrir o contexto `agent` com esta fase em aberto.** Um contexto novo declarando `pgSchema`
> enquanto o substrato migra escolhe o dono errado — e a lição registrada é não deixar refactor
> uncommitted numa árvore que outro workflow edita.

**AC-0.1** `go build/vet/test` verdes nos dois módulos (`api-go` + `go -C core`).
**AC-0.2** Boot smoke: um sidecar boota, SQLite migra por `//go:embed`, `resolve` → 200.
**AC-0.3** **A lista de channels mostra CONNECTED** — split-DB morto, observável na UI.
**AC-0.4** Zero `CODEDM_DATA_DIR` fora do construtor do store (grep).
**AC-0.5** `bun tsc`, `bun run test`, `bun e2e` verdes; `git status` limpo.

### Fase 1 — Contract lock + `ProviderDef` (aditiva, zero mudança de comportamento)

`ProviderDef` + `PROVIDER_DEFS: Record<ProviderKind, ProviderDef>` + os 3 defs. `ProviderDetector`
estendido para devolver `caps`. Nenhum call-site migrado ainda — `buildCommand` continua vivo.
Congelar aqui qualquer enum/shape novo que cruze o wire (Phase-0 Contract Lock do `CLAUDE.md:485`).

**AC-1.1** Teste unitário por provider: `buildArgs` do claude produz exatamente o argv do spec
(`:14-18`), inclusive `--resume` vs `--session-id` mutuamente exclusivos e
`--include-partial-messages` só quando `caps.partialMessages`.
**AC-1.2** `caps` chega por parâmetro; **zero** estado global mutável lido dentro de `buildArgs` (grep).
**AC-1.3** Risco registrado no BUILD-LOG: se `codex`/`opencode` não têm modo JSONL, o def deles
declara `streamFormat: 'plain'` — **nunca** um branch no runner.
**AC-1.4** `bun tsc` + `bun run test` + `bun e2e` verdes; comportamento em runtime inalterado.

### Fase 2 — `StreamJsonCodec` + `run()` por baixo do token antigo

Codec JSONL line-buffered (~150 LOC) + `StreamJsonAgentRunner.run()`. `TerminalLLMRunner.generate`/
`stream` viram **adaptadores finos** sobre `run()` — os dois consumidores atuais não mudam ainda.
**Decision gate obrigatório antes de codificar** (o padrão medscall de "validar o adapter upstream
antes de construir sobre ele"): script de smoke em `.specs/codedm/phase10-smoke/` que roda o
`claude` **instalado de verdade**, fora de uma sessão do Claude Code, e captura as sequências de
frames que o codec vai depender. Se o shape divergir do spec, **registrar no commit e no BUILD-LOG**
antes de seguir.

**AC-2.1** Artefato de smoke commitado, com frames reais (`system_init`, `assistant_text`,
`tool_use`, `tool_result`, `result`).
**AC-2.2** Testes do codec sobre frames enlatados: turno normal; sub-agent `Task` cujo `end_turn`
**não** fecha o run (guarda `parent_tool_use_id`); `stop_reason === 'tool_use'` não fecha;
`tool_use` órfão vira fato FAILED no `flush()`; JSON truncado a meio de linha.
**AC-2.3** Structured output validado no evento terminal; falha → `failed: true`, **nunca** throw
(teste explícito de drain completo após falha).
**AC-2.4** `bun run test` + `bun e2e` verdes — comportamento visível inalterado.

### Fase 3 — Virar os dois consumidores e matar o split

`IssueClassifier` → `run({ outputSchema })`. `RunTerminalSession` → consome `AgentRuntimeEvent`.
**Deletar** `generate`, `AgentGenerateRequest`, `extractJson`, `mergeLineStreams`, o parâmetro
`mode`, o subtree PTY inteiro, `SessionPrewarm`, os enums de TUI, `getSession`/`killSession`/
`prewarm`, `TerminalSessionIdleEvictedEvent`. Process-group kill + `shutdown()` declarado no seam.

**AC-3.1** `AgentRunner` tem **um** método de execução (`run`) + `shutdown`. Nada mais.
**AC-3.2** Teste de arquitetura novo (o `ImportGraphIsolation.test.ts` citado hoje em dois
cabeçalhos de arquivo **não existe** — `find` retorna vazio; a regra esteve sem enforcement o tempo
todo): nada fora de `agent/services/AgentRunner/` importa `node:child_process`, nenhum arquivo do
repo referencia `claude/projects` ou `Bun.Terminal`.
**AC-3.3** Cancelamento: teste matando um run e provando que nenhum descendente do grupo sobrevive.
**AC-3.4** Nenhum `as any` / `@ts-expect-error` novo; o duck-typing do shutdown no `index.ts` sai.
**AC-3.5** `bun tsc` + `bun run test` + `bun e2e` verdes; smoke manual: mensagem inbound → issue →
reply, com claude real.

### Fase 4 — Sessão durável e resume

`AgentSession` (rename + `model` + `lastMessageId` + `resumeDecision`), migration nos dois
diretórios de schema, repositório e queries.

**AC-4.1** Testes de repositório (env `integration`, PGlite) para as colunas novas.
**AC-4.2** Testes unitários das 4 guardas de invalidação, uma por razão.
**AC-4.3** **e2e multi-turno**: duas mensagens inbound na mesma issue; a segunda faz `--resume` do
`agentSessionId` persistido, provado por asserção sobre o argv (via stub) e pelo estado da linha.
**AC-4.4** Nenhum reset de sessão silencioso: toda invalidação registra a razão no log.

### Fase 5 — O bounded context `agent`

`git mv terminal → agent`; `CONTEXTS` + `context-map` + `BoundedContext.create({ name: CONTEXTS.agent })`;
`types/Agent.ts`; `agents/ClassifyIssueAgent/` + `agents/IssueWorkAgent/`; `enums/AgentName.ts`;
`services/IssueRouter/`; `OpenIssueRef` migra para `thread/`; tokens DI. **Na mesma fase**: skill
`agent` + verbo `bun cli agent` (§5.4).

**AC-5.1** `bun detect` (registry-scan, import-direction, slice-closure) verde; ciclo anotado
reescrito para `['agent','thread']`.
**AC-5.2** Zero literal `'terminal'` sobrando como identidade de contexto (grep); zero import de
`@terminal/*`.
**AC-5.3** Cada agent é um token DI de classe nos três envs; **não existe** mapa nome→agent (grep
por `AgentRegistry`/`getAgent(`).
**AC-5.4** `bun review --pr` sem finding critical no contexto novo; `.claude/skills/agent/` existe e
o `bun cli agent` scaffolda + wira o barrel (verificado por `bun test:tooling`).
**AC-5.5** `bun tsc` + `bun run test` + `bun e2e` verdes.

### Fase 6 — Frame SSE estruturado + fechamento

`TerminalActionFrameSchema` re-chaveado em `tool` + resumo de `input`; `bun sdk`; painel do console
mostrando a ferramenta real. Gates full. `OVERNIGHT-REPORT.md`.

**AC-6.1** OpenAPI emitida bate com o contrato; `bun sdk` **idempotente 2×**.
**AC-6.2** `react tsc` **e** `e2e tsc` verdes (a lição do ripple de enum `PlatformEnum`/`CONTACT`,
`2026-07-24-fundamentals-and-upstream.md:160-166`).
**AC-6.3** e2e cobre o frame novo end-to-end (não só compila: **roda**).
**AC-6.4** `OVERNIGHT-REPORT.md` com commits por fase, PARKED com findings, decisões aguardando
founder.

---

## 7. Regras invioláveis

Herdadas de `OVERNIGHT-GOAL-2026-07-24-go-domain-port.md:68-91`, atualizadas ao novo alvo.

1. **Branch REAL, não worktree.** Sequencial, um committer, e2e contínuo. Fase 0 fecha no
   `sqlite-shared-store`; o trabalho de agent segue em branch própria a partir dele.
2. **Fase substantiva = workflow:** builder + 2 juízes Opus adversariais, **bar ≥90 sem critical**,
   fix loop ≤2. Abaixo da barra após o fix extra → **PARKEAR** com findings completos no BUILD-LOG e
   seguir. **Nunca stubar, nunca inventar.**
3. **Todo componente nasce por skill + CLI, nunca à mão.** Tipo de artefato sem skill/verbo →
   criar skill e verbo **na mesma fase** (house rule do `CLAUDE.md`).
4. **Contrato antes de implementação.** Informação estrutural é declarada em contrato tipado antes
   do código que a consome. **`if (provider === 'x')` sobre convenção significa que o MODELO está
   errado** — a diferença vira campo de `ProviderDef`.
5. **OpenAPI wire-identity onde HTTP/SSE é tocado:** a OpenAPI emitida bate com o contrato (mesmo
   shape/enums/returns); enums de domínio **ALIAS** das wire enums, nunca redeclaração de value-set;
   `bun sdk` regenera; **`react tsc` + `e2e tsc` nos gates**.
6. **Gates por fase, com runtime — não só `tsc`:** `go build/vet/test` (Fase 0), `bun tsc`,
   `bun run test` (rodado a partir de `packages/api/typescript`), `bun lint`, `bun detect`,
   `bun sdk` 2× idempotente, **`bun e2e` executado de verdade**, boot smoke.
7. **`--no-verify` só com gates à mão e justificados no commit.** **Pathspec staging**, nunca
   `git add -A`. **BUILD-LOG por fase.** Commits convencionais. `git mv` preserva história.
   **Tudo local: zero push/fetch.**
8. **Nenhum teste spawna um CLI de verdade.** O seam de DI por env já garante isso
   (`registry.ts:22-27`) e continua garantindo. O único contato com o binário real é o script de
   smoke da Fase 2, explicitamente manual.
9. **Nunca `git stash` atravessando um `bun sdk`/`bun contracts`** — os geradores reescrevem
   arquivos rastreados e o pop conflita silenciosamente.
10. **Decisão genuína de founder emergindo → `.specs/codedm/OVERNIGHT-BLOCKED.md` + BUILD-LOG,
    pular SÓ aquela fatia, continuar.** (Nota: o bloqueio de extração de reply registrado lá —
    opção 2, *"perde a sessão interativa única"* — é **resolvido** por este goal: stream-json
    bidirecional com `--session-id`/`--resume` remove o custo. Fechar a entrada, não escalar.)

---

## 8. Critérios de conclusão (o avaliador verifica TODOS)

1. **Fase 0 fechada:** os dois sidecars leem/escrevem **UM** SQLite; `go build/vet/test` verdes;
   boot smoke ok; **a lista de channels mostra CONNECTED** (split-DB eliminado, observável na UI).
2. **Um método.** `AgentRunner` expõe `run(request)` (+ `shutdown`). Não existem `generate`,
   `stream`, `getSession`, `killSession` nem `prewarm` em nenhuma implementação.
3. **Classificação e execução usam a MESMA chamada.** Grep prova que `ClassifyIssueAgent` e
   `IssueWorkAgent` chamam o mesmo `run()`; a única diferença é `outputSchema` no request.
4. **Zero PTY no caminho do agent.** Nenhuma referência a `Bun.Terminal`, `node-pty`, `claude/projects`
   ou parsing de marcador de TUI no repo. Teste de arquitetura garantindo `node:child_process` só
   dentro de `agent/services/AgentRunner/`.
5. **CLIs externos são literais de dado.** `PROVIDER_DEFS: Record<ProviderKind, ProviderDef>`
   exaustivo por tipo; nenhum `switch (provider)` fora dos defs; `caps` passado por parâmetro.
6. **Fim de turno estrutural** (`stop_reason` + as duas guardas), com testes cobrindo o caso do
   sub-agent `Task`; watchdog de inatividade como backstop.
7. **Structured output nunca lança no meio do drain** — falha vira evento terminal `failed: true`,
   com teste.
8. **Sessão durável com resume nativo:** `agent_agent_sessions` com `agentSessionId`, `model`,
   `lastMessageId`; as 4 guardas de invalidação testadas; **e2e multi-turno verde**.
9. **Cancelamento por process group**, com teste provando que nenhum descendente sobrevive.
10. **Contexto `agent` existe** (renomeado de `terminal` por `git mv`), declarado em `CONTEXTS`,
    `BoundedContext.create({ name: CONTEXTS.agent })`, ciclo anotado atualizado, `bun detect` verde;
    agents registrados como tokens DI de classe, **sem** mapa nome→agent.
11. **Skill `agent` + verbo `bun cli agent` entregues** e exercitados por `bun test:tooling`.
12. **Gates full verdes:** `bun tsc`, `bun lint`, `bun run test`, `bun detect`, `bun sdk` 2×
    idempotente, `react tsc` + `e2e tsc`, **`bun e2e` executado**, boot smoke, OpenAPI wire-identity.
13. **BUILD-LOG por fase + `OVERNIGHT-REPORT.md`**; `git status` limpo; **zero push remoto**; nada
    PARKED sem findings completos.
14. **O goal antigo marcado como SUPERSEDED** por este documento (uma linha de cabeçalho apontando
    para `469eed5b` + este arquivo), sem apagá-lo.