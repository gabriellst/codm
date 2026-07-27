# Decisão — convergência da abstração de agent: CodeDM × medscall

**Data:** 2026-07-26 · **Escopo:** `medscall/packages/api/src/agent/**` × `codedm/.specs/codedm/GOAL-agent-abstraction.md` · **Status:** decidido

---

## 1. Veredito

**CONVERGÊNCIA PARCIAL, e a fatia que converge é menor do que a intuição sugere.**

| Camada | Decisão |
|---|---|
| **Léxico** — nomes de seam, campos do request, taxonomia de evento, contratos invioláveis | **CONVERGE.** Nome idêntico, campo idêntico, regra idêntica nos dois repos. |
| **Playbook** — `.claude/skills/agent/{SKILL.md, registry.yaml}` | **CONVERGE.** Um artefato, escrito uma vez, propagado pelo trem que já roda. |
| **Seam de runtime** — `LlmRunner` / `AgentRunner`, request record, frame union, `ProviderDef`, `Tool`, agregado de sessão | **NÃO CONVERGE.** Duplicação deliberada, razão escrita. |
| **Bytes de runtime compartilhados** (`Agent<I,O>`, `AgentStreamRegistry`) | **NÃO AGORA, e não por prudência — por ausência de cano.** Gatilho de reavaliação definido no §6. |

### Por que não o seam — contra o melhor argumento da defesa

O argumento mais forte a favor da convergência total não é "as formas são parecidas". É este, e ele é bom:

> *"O `AgentStreamRegistry` do CodeDM já é o arquivo do medscall — o cabeçalho diz `ADOPTED WHOLE … rekeyed chatId → issueId` (`codedm .../AgentStreamRegistry.ts:47-49`). O GOAL cita o medscall oito vezes e copia o `Agent<I,O>` quase caractere a caractere. E a assimetria de capacidade já tem resposta escrita no próprio GOAL: 'Capacidade ausente degrada o REQUEST, nunca a interface' (`GOAL:325-328`)."*

Três respostas, em ordem de peso.

**(a) O exhibit de convergência é o exhibit de drift.** Comparei os dois arquivos linha a linha. Em **um** hop, três dos quatro eixos divergiram: a chave (`chatId` → `issueId`), o payload do writer (`AgUiFrameEvent` em `medscall :7` → `TerminalSseFrame`, união Zod discriminada de produto, `codedm :18-40`) e — o que importa — o **conjunto de invariantes**: o CodeDM absorveu `beginSession`/`endSession`/`isActive`, um guard de "uma sessão por issue" que o medscall não tem, dobrando dentro do arquivo adotado um `TerminalSessionRegistry` que morreu (`codedm :47-58`). Se esse arquivo estivesse no trem como Tier 1, aquele fold é *"the one illegal move: silently editing a synced file"* (`ECOSYSTEM.md:91`) e todo `sync:pull` futuro aborta como conflito (`scripts/sync/pull.ts:10-16`). O registry sobreviveu bem **porque era propriedade do repo**, não apesar disso.

**(b) Citar não é importar — e a citação produziu um design melhor que o original.** O CodeDM leu o medscall e discordou em três pontos, todos certos: um método em vez de dois (`GOAL:174-179`, justificado por os dois caminhos diferirem por um único flag de argv, `oneshot.ts:77`), `usage` como frame de primeira classe (`GOAL:224` — o medscall não tem *nenhuma* contabilidade de token: `grep -rn "inputTokens\|outputTokens\|totalTokens" src/agent` nos 165 arquivos retorna **zero**), e cancelamento no seam (`GOAL:198,411-416` — `grep -rn "AbortSignal\|abort(\|shutdown"` no mesmo escopo também retorna **zero**). O valor extraído foi o *julgamento*. Um import remove o julgamento e congela o pior dos dois.

**(c) A regra de degradação é certa, e é exatamente por isso que ela não sobe ao seam.** `GOAL:325-328` degrada o **request dentro de um runtime**. Levá-la ao nível do seam significaria tornar `tools` e `toolContext` campos opcionais. Mas `ToolContext { chatId, ownerId, context? }` (`medscall types/Tool.ts:11-15`) **é a fronteira de autorização por chamada** do medscall — é como uma tool sabe por qual tenant está agindo. Transformar uma fronteira de autorização em campo opcional não é degradação; é erosão. Do outro lado o CodeDM delega autoridade por atacado, uma vez, no spawn (`--permission-mode bypassPermissions`, *"uma troca de autoridade, aceita conscientemente"*, `GOAL:118`). Um único tipo de request que acomoda ambos torna invisível, no tipo, qual das duas coisas está acontecendo.

E as quatro incompatibilidades duras não são quatro acidentes — são **uma pergunta observada quatro vezes: quem roda o loop de tools.** Ela determina a aridade do método (§4.1 do GOAL), se `tools` é campo (`LlmRunner.ts:26,63` × `GOAL:188-199`), onde mora a autorização, e quem é dono do histórico (`chatEventsToMastraMessages(request.inputEvents)`, `MastraLlmRunner.ts:112`, × handle opaco `--resume`, `GOAL:196`). Uma interface cuja assinatura é inteiramente determinada por uma pergunta que os dois consumidores respondem de forma oposta não é uma interface compartilhada — são duas interfaces com o mesmo nome.

### Por que não bytes — o fato mecânico que encerra a discussão

Não é uma questão de gosto arquitetural. **Não existe cano.**

1. `ECOSYSTEM.md:71-73` classifica, por nome, o contexto `agent` do medscall como **Tier 4 — product code (no rules). "Not the template's business."**
2. `medscall/software/monorepo/sync.yaml` é o **único** manifesto do ecossistema. `grep -c "packages/api/src" sync.yaml` → **0**. `adapted: []` (linha 45). As 41 globs herdadas são `.claude/agents`, hooks, quatro arquivos de skill, `.githooks`, config LGTM, dois docs, `nx.json`, infra de e2e e `scripts/**`. **Zero código de runtime.**
3. O medscall **não tem** package `core` — seu kernel é o alias in-src `@shared/*`. O `pull.ts` copia para caminhos repo-relativos idênticos; não faz path-mapping (o teto Copybara está explicitamente adiado, `ECOSYSTEM.md:141-143`).
4. O único package de abstração que o template de fato entrega já está quebrado: `diff -rq template/core/src codedm/core/src` → **13 arquivos divergentes, 2 só no filho, 1 deletado no filho** (`utils/index.ts` existe no template e sumiu no CodeDM), semanas após o stamp — incluindo um **bugfix crítico encalhado no fork** (`codedm core/src/types/EventHandler.ts:73-87`, reconstrução de objetos JSONB do outbox sem a qual *"the whole domain→integration event bridge [is] dead in real mode"*).
5. Byte-match é mecanicamente impossível para o que importa: `grep -rn "@template/" core/src` → **6 especificadores hardcoded** (`db/client.ts:2`, `repositories/DrizzleDomainEventRepository.ts:5`, `services/OutboxDispatcher/DrizzleOutboxDispatcher.ts:3`, `services/IdempotencyGuard/DrizzleIdempotencyGuard.ts:3`, `services/CommandQueue/PostgresCommandQueue.ts:9`, `index.ts:45`), contra a afirmação de `ECOSYSTEM.md:137`.
6. Nenhum repo roda `bun sync:check` em CI (o medscall não tem `.github/`). O CodeDM não tem `sync.yaml`.

Adicionar uma segunda abstração compartilhada a um trem que não está fiscalizando a primeira dobra a superfície de drift silencioso — para deduplicar ~150 linhas sem comportamento, de 9.603 (**1,6%** do contexto `agent` do medscall).

---

## 2. A abstração melhorada

Independente do veredito, os dois lados saem melhores. Isto é a parte acionável.

### 2.1 O que o CodeDM adota do medscall

**(A) `AgentInputSchemaConstraint` + `AgentInputEnvelope` — buraco real, hoje, no GOAL.**
O GOAL copia `readonly input!: z.output<InputSchema> & AgentInputEnvelope` (`GOAL:268`) e **nunca define nenhum dos dois**. O medscall documenta exatamente o que quebra sem isso: *"TypeScript's generic narrowing of `z.output<InputSchema>` alone collapses to `Record<string, unknown>` under constraint erasure, losing the envelope fields"* (`LlmRunner.ts:54-59`; a mesma explicação em `types/AgentInputSchemaConstraint.ts:19-31`). Sem o constraint, o runner do CodeDM não lê `ownerId`/`issueId`/`cwd` do input sem cast — e a **AC-3.4 proíbe qualquer `as any` novo** (`GOAL:552`). Adotar, com o envelope do CodeDM, não o do medscall:

```ts
// agent/types/AgentInput.ts
export const BaseAgentInputSchema = z.object({
	ownerId: z.string(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	cwd: z.string(),                                   // workspace absoluto — nunca opcional
	context: z.record(z.string(), z.unknown()).optional(),
})

export const AgentInputSchema = BaseAgentInputSchema        // idem medscall types/AgentInput.ts:21
export type AgentInputEnvelope = z.output<typeof AgentInputSchema>
export type AgentInputSchemaConstraint = ZodObject<(typeof BaseAgentInputSchema)['shape'] & ZodRawShape>
```

E o verbo de schema, espelhando `z.agentInput(props)` (`medscall shared/utils/schema/ExtraTypes.ts:219-224`), para que o constraint valha **por construção** e não por disciplina.

**(B) `model` tipado, não `string`.** `GOAL:195` declara `model?: string`; o medscall usa `modelId: ModelId` resolvido por um `ModelRegistry` (`ModelRegistry.ts:27-39`). A regra 4 do próprio GOAL — *"Contrato antes de implementação… informação estrutural é declarada em contrato tipado"* — condena o `string`. Idem `stopReason: string` em `GOAL:225`: o `stop_reason` do claude é conjunto **fechado**; a exceção de conjunto aberto que o GOAL argumenta vale para `tool` (`:381-384`), não para ele.

**(C) `AgentTurnFact` como subclasses de `BaseDomainEvent`, definidas ANTES do codec.** É a parte menos especificada do documento: `AgentTurnFact` aparece em `GOAL:214` e `:246` e **não é definida em lugar nenhum** das 668 linhas — enquanto o formato de wire ganhou nove variantes tipadas. O medscall mostra a forma certa: `ChatEvent` é marcador abstrato (`events/ChatEvent.ts:15`) com `ChatMessageEvent`/`ChatToolCallEvent`/`ChatActionEvent`, e o `ChatToolCallEvent` carrega ciclo de vida completo (`name/input/output/status/startedAt/finishedAt/errorMessage`, `:19-36`) reconstruído pelo accumulator. Como `fact` é justamente o que vai ao outbox, ele **tem** de ser evento de domínio, não POJO:

```ts
// agent/events/index.ts
export type AgentTurnFact = AgentMessageEvent | AgentToolCallEvent | AgentUsageEvent
export type AgentRuntimeEvent =
	| { type: 'frame';    frame: AgentFrame }        // transporte, nunca outbox
	| { type: 'fact';     fact: AgentTurnFact }      // BaseDomainEvent, vai ao outbox
	| { type: 'finished'; result: AgentRunResult }   // exatamente um, sempre o último
```

**(D) Pré-compromisso de placement da config.** O CodeDM recusa `AgentConfig` como especulativo (`GOAL:369-370`) — **certo**. Mas registre agora a regra que o medscall aprendeu: config multi-tenant chega ao agent **como campo do input schema** (`agents/ServiceAgent/types.ts:26-29` estende `AgentInputSchema` com `agentConfig: z.instance(AgentConfig)`), consumida só pelo prompt builder (`ServiceAgent.ts:65-69`). O runner **nunca** vê tenancy. Sem esse pré-compromisso, a primeira config a aparecer aterrissa no request e o seam apodrece.

### 2.2 O que o medscall adota do CodeDM

**(A) Cancelamento — a lacuna mais cara.** Zero ocorrências de `AbortSignal`/`abort(`/`shutdown` em 165 arquivos. Hoje, fechar a aba do SSE só faz o consumidor parar de drenar (`AgentStreamRegistry.ts:94-105`); o turno Mastra segue queimando tokens até o fim. Aditivo e opcional:

```ts
export interface LlmRunnerStreamRequest<InputSchema, OutputSchema = undefined> {
	agentId: string
	modelId: ModelId
	systemPrompt: string
	input: z.output<InputSchema> & AgentInputEnvelope
	inputEvents: ChatEvent[]
	tools: Tool[]
	toolContext: ToolContext
	outputSchema?: OutputSchema
	maxSteps?: number
	signal?: AbortSignal        // ← NOVO (GOAL:198). Abortar o drain aborta o turno.
}
```

**(B) `usage` como fato de primeira classe.** Hoje o medscall mede consumo por **contagem de mensagem** (`services/QuotaCounter/AgentMessageCounter.ts:17-33`, `EVENT_NAME = 'agent.chat.agent_message_sent'`) porque token nunca cruza o seam. Quota por custo está bloqueada nisso. Adotar `{ inputTokens, outputTokens }` do `GOAL:224` como um `ChatUsageEvent extends BaseDomainEvent` emitido pelo accumulator — é capacidade de billing, não refactor.

**(C) Frame tipado no wire (sem desfazer a deleção das 32 classes).** O medscall mantém `frame: z.unknown(), // AG-UI BaseEvent; kept opaque intentionally` (`events/AgUiFrameEvent.ts:23`), o que está **certo** no domínio — modelar 32 classes-espelho foi o erro que eles deletaram (`README.md:432`). Mas está **errado no wire**: todo consumidor de frontend discrimina `frame.type` à mão. A regra do CodeDM — *"publishes the MATERIALIZED discriminated union on the wire — never z.unknown()"* (`codedm AgentStreamRegistry.ts:14-17`) — se aplica à superfície SSE, não ao evento de domínio. A correção preserva as duas coisas:

```ts
// agent/controllers/Completion.ts — a projeção do SSE, não o evento de domínio
export const AgUiWireFrameSchema = z.discriminatedUnion('type', [
	TextMessageStartFrameSchema, TextMessageContentFrameSchema, TextMessageEndFrameSchema,
	ToolCallStartFrameSchema, ToolCallArgsFrameSchema, ToolCallResultFrameSchema,
	RunErrorFrameSchema,
])   // ← só os tipos que o controller de fato encaminha; o resto é descartado, não `unknown`
```

**(D) Renomear `LlmRunner` → `AgentRunner`, e resolver o `outputSchema` morto.** O nome: regra de harmonização do próprio `CLAUDE.md` (`platform` não `provider`, `XQueryService` não `XLookupService`) — o seam não é sobre LLM, é sobre agent, e o CodeDM já chegou lá. Os dois métodos **ficam**: `generate` é um caminho genuinamente mais barato (`MastraLlmRunner.ts:88-100` — uma chamada `innerAgent.generate(prompt, { structuredOutput })` sem bridge push→pull, sem adapter AG-UI, sem accumulator), diferente do caso do CodeDM onde os dois caminhos diferem por um flag. E `outputSchema?` no `LlmRunnerStreamRequest` (`LlmRunner.ts:65`) está declarado, implementado (`MastraLlmRunner.ts:220-267`) e **não exercitado por nenhum agent** — ou nasce um teste que cobre o caminho, ou o campo sai. Contrato não exercitado é contrato que mente.

---

## 3. Onde vive o que converge, e como propaga

O único artefato que compartilha bytes é o **playbook**.

**Onde:** `template-fullstack/.claude/skills/agent/{SKILL.md, registry.yaml}` (variante `typescript`). Tier 1 por definição (`ECOSYSTEM.md:29` lista `.claude/{skills,registry.yaml,agents}/**`). Hoje o template tem 47 skills e **nenhuma `agent`** — e o medscall tem três agents em produção sem playbook nenhum. O CodeDM já se obriga a criar essa skill na mesma fase em que nasce o primeiro agent (`GOAL:482-488`, house rule do `CLAUDE.md`).

**Como propaga:** o cano já existe e já carrega quatro arquivos de skill para o medscall (`sync.yaml:12-15`). Enrolar a skill de agent custa **uma linha**:

```yaml
inherited:
  - '.claude/skills/agent/{SKILL.md,registry.yaml}'   # ← uma linha
```

Depois: `bun sync:pull` faz fast-forward e reescreve `parent.ref`. Fluxo reverso (melhoria do fork → template) é sempre PR explícito (`scripts/sync/contract.ts:6-7`).

**História de breakage:** skill não quebra `tsc`, não quebra runtime, não entra em merge conflict de código. O pior caso é `bun review` classificar um arquivo com um checklist levemente desatualizado. Comparado a compartilhar tipos — onde uma alteração de union deixa switches exaustivos não-exaustivos em outro repo, sem CI cruzado para detectar — o risco é de outra ordem de grandeza.

**Migração, por repo:**

- **CodeDM:** escreve `.claude/skills/agent/` **local** na Fase 5 (já está no goal, AC-5.4). Nada muda no cronograma.
- **template-fullstack:** recebe a skill por PR do CodeDM depois da Fase 6, revisada contra a implementação do medscall (dois consumidores reais, não um). Só então ela vira canon.
- **medscall:** acrescenta a glob ao `inherited`, roda `sync:pull`, roda `bun review --pr` no contexto `agent`. As violações que aparecerem são a lista de trabalho do §2.2.

---

## 4. O que se compartilha assim mesmo — e o que se duplica de propósito

### Compartilhado

| Item | Veículo |
|---|---|
| **Skill `agent`** — SKILL.md + registry.yaml com `bad_practices` e `patterns` | Trem de sync, Tier 1 |
| **Léxico** — `AgentRunner`, `AgentRuntimeEvent`, `AgentTurnFact`, `AgentRunResult`, `AgentName`, `outputSchema` como único botão de structured output, `Mock*`/`Stub*` runner nos envs `mock`+`integration` | Convenção codificada no registry.yaml da skill; `bun review` fiscaliza em cada repo |
| **As quatro regras invioláveis** — (1) união de três slots transporte/fato/terminal; (2) UM wrapper opaco por frame de transporte, nunca uma classe por tipo de frame (`medscall README.md:432`); (3) accumulator é fold puro `(frame) => Fact \| null` com `flush()` materializando `tool_use` órfão como FAILED (`AgUiToChatEventAccumulator.ts:105-113`); (4) validação estruturada vira evento terminal `failed: true`, **nunca** throw no meio do drain (`medscall types/Agent.ts:117-125` ≡ `GOAL:250-253`) | Idem |
| **Checklist de conformidade do accumulator** — não fixtures (os alfabetos são AG-UI × stream-json e não se traduzem), mas a lista do que um accumulator conforme precisa provar | `registry.yaml` da skill; cada repo escreve seus próprios canned frames |
| **Padrão `Record<Kind, Def>` + factory** — `PaymentProviderFactory.ts:22-52` no template é o exemplar; `ModelRegistry` no medscall e `PROVIDER_DEFS` no CodeDM são os dois usos | Doc, já Tier 2 (`ECOSYSTEM.md:47`) |

### Duplicado de propósito — com a razão escrita

| Duplicado | Razão (a ser gravada no cabeçalho do arquivo em ambos os repos) |
|---|---|
| `LlmRunner`/`AgentRunner` (o seam) | Aridade determinada por "quem roda o loop de tools". `generate` do medscall é caminho de execução realmente mais barato (`MastraLlmRunner.ts:88-100`); no CodeDM os dois caminhos diferem por um flag de argv (`oneshot.ts:77`). Qualquer seam único carrega maquinaria morta em um dos lados. |
| Request record | 9 de 14 campos da união honesta morrem em um dos lados. `tools`/`toolContext` são a fronteira de autorização por chamada do medscall; `cwd`/`binaryPath`/`session`/`signal` são ciclo de vida de processo. |
| Frame union | Requisito de um é anti-padrão explícito do outro: `frame: z.unknown()` deliberado (`AgUiFrameEvent.ts:23`) × união materializada obrigatória no wire (`codedm AgentStreamRegistry.ts:14-17`). Ambos corretos no seu repo. |
| `ProviderDef` | 11 dos 13 campos são argv (`GOAL:288-310`). Literal de dado privado do runner de CLI. |
| `Tool` / `ToolContext` | O CLI é dono do próprio inventário e o MCP o estende em runtime — por isso `tool` é `z.string()` e não enum (`GOAL:381-384`). O CodeDM **não deve** portar `Tool` agora: seria contexto especulativo. Quando precisar de dados nossos, o caminho é um MCP server in-process expondo `Tool` — plug futuro, não campo de request. |
| Agregado de sessão | `ChatSession` é event-log próprio (`entities/ChatSession.ts:40-48`); `AgentSession` guarda handle opaco de terceiro + 4 guardas de invalidação (`GOAL:399-407`). `sessionId` é homônimo, não conceito comum. |
| `Agent<I,O>` base + `AgentStreamRegistry` | Compartilháveis em tese; sem cano hoje (§1). Duplicados com nome e forma idênticos e um `// CONTEXT-ORIGIN:` apontando o pin de origem (`ECOSYSTEM.md:62-70` — modelo shadcn). |

---

## 5. Riscos

| # | Risco | Mitigação |
|---|---|---|
| **R1** | O léxico converge no papel e diverge no código. **Já aconteceu:** `CHAT_ALREADY_STREAMING` (`medscall :27`) × `SESSION_ALREADY_STREAMING` (`codedm :81`) — mesma invariante, dois códigos, duas chaves i18n, zero conteúdo de domínio na divergência. | Nomes canônicos entram como `bad_practices` no `registry.yaml` da skill; `bun review --pr` fiscaliza por repo. O CodeDM se recusa a renomear códigos públicos (`GOAL:438-442`) — **aceitar**, e travar apenas os nomes novos. |
| **R2** | Alguém lê "convergência parcial" como convite e extrai bytes cedo, congelando um contrato derivado de uma implementação e um documento. | Gatilho escrito no §6, com três pré-condições nomeadas. Nada de bytes antes das três. |
| **R3** | O smoke gate da Fase 2 (`GOAL:531-540`) muda a taxonomia de frames e a skill nasce errada. A taxonomia de 9 variantes vem hoje de um **estudo de produto de terceiro** (`2026-07-26-agent-driving-stream-json.md:44-51`), nunca observada contra o `claude` instalado. | A skill é entregável de **Fase 5**, depois do gate. Não antecipar. E o suporte JSONL de `codex`/`opencode` segue não verificado (AC-1.3) — se cair, `ProviderDef` fica com um provider real e duas degradações `plain`, o que enfraquece a taxonomia como vocabulário cross-runtime. |
| **R4** | Este documento atrapalha a Fase 0 (SQLite compartilhado, em voo). | Nada aqui toca Go, SQLite ou sidecar. Os itens do §2.1 são Fase 1 (model tipado), Fase 2 (`AgentTurnFact` antes do codec) e Fase 5 (envelope + skill) — todos já dentro do goal. **Regra explícita do próprio goal: não abrir o contexto `agent` com a Fase 0 em aberto** (`GOAL` Fase 0). |
| **R5** | O template ganha uma skill sem consumidor no próprio template e apodrece (o template não tem contexto `agent`: `src/` = auth, billing, notifications, owner, quota, shared, ui). | A skill sobe ao template **depois** de existir em dois repos, escrita a partir das duas implementações. Até lá vive local no CodeDM. |
| **R6** | `signal`/`usage` no medscall quebram o adapter Mastra. | Campos opcionais e aditivos; o swap de DI por env já existe (`registry.ts:26,39,52`) e o `MockLlmRunner` emite o mesmo shape de stream (`MockLlmRunner.ts:46-73`), então o dispatch inteiro é exercitado sem tocar em OpenAI. |
| **R7** | O drift já existente em `core` piora, e alguém aponta "a convergência de agent" como prova de que o ecossistema funciona. | Curar `core` é **pré-condição** de qualquer compartilhamento futuro de bytes: upstream do fix de `codedm core/src/types/EventHandler.ts:73-87`, remoção de `CODEDM_DATA_DIR` de `core/src/utils/Config.ts`, restauração de `core/src/utils/index.ts`, e `bun sync:check` em CI nos três repos. |

---

## 6. Próximos passos

Ordenado, e desenhado para **não** tocar a Fase 0 do CodeDM.

**Agora (custo: edição de um arquivo de spec, zero código)**

- [ ] **P0.1** Emendar `GOAL-agent-abstraction.md` com os quatro itens do §2.1: `AgentInputSchemaConstraint`+`AgentInputEnvelope` definidos; `model` e `stopReason` tipados; `AgentTurnFact` definido como união de `BaseDomainEvent`; regra "config anda no envelope, nunca no runner".
- [ ] **P0.2** Acrescentar ao GOAL uma seção `## Linhagem` declarando o medscall como **referência lida, não dependência** (Tier 3, modelo shadcn) e registrando o pin de 40 hex no `source-map-and-decisions.md`, conforme a regra `## Sources` do `BOOTSTRAP.md`.

**Fase 0 (em voo) — não tocar.** SQLite compartilhado fecha primeiro. AC-0.1 a AC-0.5 inalteradas.

**Fase 1 (contract lock)**
- [ ] **P1.1** `AgentModel` tipado (enum/alias de wire) substituindo `model?: string` no `AgentRunRequest`.

**Fase 2 (codec + `run()`)**
- [ ] **P2.1** Definir `AgentTurnFact` **antes** de escrever o codec — a Projection/união é dona do que muda nela.
- [ ] **P2.2** No script de smoke, capturar explicitamente frames de `usage` e `parent_tool_use_id` além dos cinco já listados na AC-2.1.

**Fase 5 (contexto `agent`)**
- [ ] **P5.1** `types/Agent.ts` nasce **junto** com `AgentInputSchemaConstraint` + `z.agentInput()` — sem isso a AC-3.4 (zero `as any` novo) colide de frente.
- [ ] **P5.2** `.claude/skills/agent/{SKILL.md, registry.yaml}` local no CodeDM, com as quatro regras invioláveis do §4 e os nomes canônicos do léxico.

**Trilha medscall (independente, paralela, não bloqueia nada)**
- [ ] **M.1** `LlmRunner` → `AgentRunner` (rename puro; `generate`+`stream` ficam).
- [ ] **M.2** `signal?: AbortSignal` no request + teardown de verdade nos dois runners.
- [ ] **M.3** `ChatUsageEvent` emitido pelo accumulator; `AgentMessageCounter` ganha o irmão por custo.
- [ ] **M.4** Projeção tipada do frame na superfície SSE (evento de domínio segue opaco).
- [ ] **M.5** Decidir `outputSchema` no `LlmRunnerStreamRequest`: teste que exercite, ou deleção.

**Gatilho de reavaliação (não é um passo — é uma condição)**

Reabrir a discussão de bytes compartilhados **somente** quando as três forem verdade ao mesmo tempo:
1. A Fase 6 do CodeDM fechou e a taxonomia de frames sobreviveu ao contato com o `claude` instalado.
2. Existe um **terceiro** consumidor da mesma forma (o cabeçalho do registry do CodeDM cita `whatscode` como ancestral — se ele ainda estiver vivo e com a mesma forma, essa condição já está a um `git log` de ser verificada).
3. `bun sync:check` verde em CI nos três repos, o drift de 16 arquivos em `core` curado, e o fix de `EventHandler.ts` upstreamado.

Antes disso, a unidade honesta de compartilhamento é o **playbook**, e o mecanismo honesto é um engenheiro lendo o outro repo — que foi, aliás, exatamente o que produziu as melhores partes do GOAL.