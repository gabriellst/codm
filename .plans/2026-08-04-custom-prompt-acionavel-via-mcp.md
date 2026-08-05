# Custom Prompt da thread acionável via MCP do orquestrador — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O operador registra, muda e apaga as instruções permanentes da sua thread falando na própria conversa — e o texto que ele ditou é o mesmo que ele vê no console e o mesmo que passa a moldurar os turnos seguintes.

**Architecture:** Nenhuma entidade, use case, schema, migration ou endpoint novo. `ConfigurePromptController` — que já serve o console — passa a declarar também `McpScope.orchestration`, e o confinamento vem de graça da cadeia que a própria declaração liga (`AgentIdentityMiddleware` compara o `threadId` do path contra o `threadId` da identidade). O `OrchestratorPromptBuilder` ganha a situação sancionada que faltava, nomeando a ferramenta pelo símbolo derivado. O restante é regeneração de artefato (`openapi.json` + servidores MCP do Kubb) e os rails que provam a mudança nos dois sentidos.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod, Kubb/MCP

**Spec:** .specs/2026-08-04-custom-prompt-acionavel-via-mcp-design.md
**Tasks:** 3
**Estimated minutes:** 70

---

## Task T1: A ferramenta abre para o orquestrador, confinada à própria thread

**Files to write:**
- Modify: `packages/api/typescript/src/thread/controllers/ConfigurePrompt.ts` — `static mcpScopes` passa a `[McpScope.system, McpScope.orchestration]`, e o bloco de doc troca a justificativa antiga pela nova (spec decisões 1, 4 e 5)
- Test: `packages/api/typescript/src/thread/controllers/ConfigurePrompt.test.ts` (novo) — a porta é chamável de dentro de um run `orchestration`, e só na própria thread

**Files to read:**
- `packages/api/typescript/src/thread/controllers/ResolveStop.test.ts` — o molde exato desta suíte (cadeia composta à mão, credencial `orchestration`, contra-prova de thread alheia)
- `packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.ts`
- `packages/api/typescript/tests/support/given/` — `givenThread`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /test
**Depends on:** (none)
**Consumes (frozen):** `McpScope` (membros `system`, `orchestration`) de `@codm/contracts-typescript/wire/enums`; `AGENT_RUN_TOKEN_HEADER`, `AgentIdentityMiddleware`, `InMemoryAgentIdentityService`, `HttpControllerRequest`, `BaseError` de `@codm/core-typescript`; `ConfigurePrompt` / `ConfigurePromptInputSchema` de `../usecases/ConfigureThreadSettings`; `ThreadParam` de `../schemas`; `OPERATOR_ID` de `@auth/operator`.
**Scope fence:** DONE elsewhere — nada. OUT — o prompt do orquestrador (T2 é dono), a regen de `openapi.json`/SDK e o snapshot dourado (T3). **Não** adicione guard em `handle()`: o confinamento desta ferramenta é o genérico, e um guard redundante apagaria a propriedade que a spec está afirmando. **Não** mexa em `GetThreadSettings`, em `ConfigureMentionGate`, em `ConfigureContextBuffer` nem no use case.
**Gate:** `cd packages/api/typescript && bun test src/thread/controllers/ConfigurePrompt.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T1.1 — Escrever a suíte que falha

Crie `packages/api/typescript/src/thread/controllers/ConfigurePrompt.test.ts` seguindo o molde de `ResolveStop.test.ts` (inclusive o motivo documentado de compor a cadeia à mão em vez de passar por `executeController`: `executeMiddlewares` resolve do container RAIZ, enquanto o `TestBed` liga `AgentIdentityService` num container FILHO).

Cobertura obrigatória, uma asserção de estado por caso — sempre lendo o campo de volta pelo `ThreadRepository`, nunca só o status da resposta:

- **AC-7** — sem run token (console): grava.
- **AC-3** — credencial `orchestration` da própria thread: grava, e `thread.customPrompt` passa a ser o texto enviado.
- **AC-4** — mesma credencial, body sem `customPrompt`: o campo volta a `undefined` (e não `''`).
- **AC-5** — credencial da thread A mirando a thread B: `middleware.execute` rejeita com `FORBIDDEN`, o controller **nunca** é chamado, e o `customPrompt` de B continua exatamente o que era. Este é o caso que prova a Decisão 4 — se alguém remover `McpScope.orchestration` ou trocar o path por um id que a identidade não carrega, esta linha fica vermelha.
- **AC-6** — token revogado: `UNAUTHORIZED`, e o campo não muda.

### Step T1.2 — Abrir a porta

Em `ConfigurePrompt.ts`, troque a declaração:

```typescript
static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
```

E reescreva o bloco de doc acima dela. O comentário atual argumenta que `system` sozinho é o certo *porque* um agente que edita o próprio prompt é um loop sem operador — deixá-lo lá contradizendo a linha logo abaixo é pior do que não ter comentário. O novo bloco precisa dizer, sem inventar nada que a spec não decidiu:

- por que as duas superfícies (console + cliente MCP externo continuam em `system`; o orquestrador é o público novo);
- por que o loop não se fecha: só a própria thread (confinamento genérico via `threadId` do path), só quando o operador pede em voz alta (a seção do prompt, T2), e a MOLDURA — as ressalvas de git/dependências e a forma da linha `[quote: …]` — é código deste repositório, não conteúdo do campo, então o texto que o modelo escreve continua sendo emoldurado por ela;
- por que **não** há guard em `handle()`, ao contrário de `ResolveStop` e `SteerIssueTurn`: esta ferramenta é thread-shaped e o `compareIdentity` já recusa a thread alheia.

### Step T1.3 — Verde

Rode o gate. `bun test src/thread/` inteiro para garantir que nada em `thread` regrediu.

---

## Task T2: O orquestrador sabe QUANDO registrar uma instrução permanente

**Files to write:**
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts` — nova seção `standingInstructions()`, encaixada em `system()`
- Modify: `packages/api/typescript/src/agent/mcp/exposure.ts` — `ConfigurePromptController` entra no re-export nominal (a lista de classes NOMEADAS POR PROSA), para o prompt nomear a ferramenta por símbolo
- Test: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts` — a situação renderiza, o nome é derivado, a linha condicional respeita a presença do texto

**Files to read:**
- `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts` — em especial `issues()`, `redirectingWork()` e `operatorInstructions()`
- `packages/api/typescript/src/agent/mcp/exposure.ts` — o bloco de doc do re-export por prosa
- `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts:220-232` — de onde vem `customPrompt`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /agent, /test
**Depends on:** T1 (o re-export só faz sentido com a ferramenta exposta)
**Consumes (frozen):** `toolNameOf` e `ConfigurePromptController` de `../../mcp/exposure`; `OrchestratorInputSchema` (campo `customPrompt`), já existente.
**Scope fence:** DONE elsewhere — T1 abriu o escopo. OUT — regen de SDK (T3); qualquer mudança em `IssueWorkPromptBuilder` (a instrução permanente já alcança o agente de trabalho pela spec anterior, e esta ferramenta é do orquestrador). **Não** digite o nome da ferramenta como literal — o arquivo inteiro deriva nomes por `toolNameOf`, e um literal quebra a regra que ele documenta. **Não** mexa em `operatorInstructions()`: a moldura é justamente o que não muda.

**Gate:** `cd packages/api/typescript && bun test src/agent/agents/OrchestratorAgent/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T2.1 — Escrever os testes que falham

Em `prompt.test.ts`, junto do bloco que já cobre `INSTRUCTIONS FROM THE OPERATOR`:

- **AC-8** — `system(baseInput)` contém a seção e contém `toolNameOf(ConfigurePromptController)`; a asserção usa o símbolo, não a string, para que um rename siga o símbolo.
- **AC-9** — com `customPrompt` presente, o texto instrui a reenviar o que já existe; sem `customPrompt`, essa linha não aparece (e a seção continua aparecendo — registrar a primeira instrução é o caso principal).
- **AC-10** — a seção diz que a mudança vale a partir da próxima mensagem.

### Step T2.2 — Escrever a seção

Método privado `standingInstructions(input)`, chamado em `system()` **depois** de `redirectingWork()` e **antes** de `stops()` — as três são a mesma família ("o operador pediu algo que não é só uma resposta"), e a seção precisa vir antes de `operatorInstructions()`, que fecha o prompt.

O conteúdo cobre, em voz do arquivo (frases diretas, sem headings markdown):

1. o que é uma instrução permanente e que ela vale só para esta conversa;
2. a regra de nunca inferir — mesma de `issues()`: o operador pede em voz alta; uma reclamação de passagem não vira regra;
3. como chamar (`toolNameOf(ConfigurePromptController)`), com as palavras do operador;
4. **substitui o texto inteiro** — e, condicionalmente (só quando `input.customPrompt` existe), que o texto vigente está no fim deste mesmo prompt e precisa ser reenviado junto se o operador está SOMANDO;
5. apagar é chamar sem texto;
6. vale a partir da próxima mensagem — não diga que já está obedecendo;
7. o recibo: uma linha dizendo o que registrou, e a regra de nunca afirmar o que não executou.

### Step T2.3 — Re-export nominal

Some `ConfigurePromptController` ao bloco `export { … }` do fim de `exposure.ts` — o mesmo caminho de `ResolveStopController`, e pela mesma razão registrada lá (é o módulo já licenciado a importar o barrel de outro contexto; espalhar essa licença para um prompt builder espalharia as exceções do context-map). Se `shared/context-map.ts` precisar de ajuste, ele **não** precisa: a exceção por arquivo já cobre `exposure.ts → @thread/controllers`.

---

## Task T3: O artefato publicado e os rails concordam

**Files to write:**
- Regenerate: `packages/api/typescript/public/docs/openapi.json` (via `bun emit-openapi`)
- Regenerate: `packages/client/dist/**` (via `bun sdk`) — inclui o servidor MCP do escopo `orchestration`
- Modify: `packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` — o snapshot dourado ganha a ferramenta em `orchestration`
- Modify: `packages/api/typescript/tests/architecture/mcp-exposure.test.ts` — asserção nomeada da mudança de exposição desta frente (molde do `AC-3 — RaiseStop`)

**Files to read:**
- `packages/api/typescript/tests/architecture/mcp-exposure.test.ts`
- `packages/api/typescript/src/agent/mcp/generated-server.test.ts` — já é paramétrico sobre `McpScope`; não precisa de edição

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /sdk
**Depends on:** T1, T2
**Consumes (frozen):** —
**Scope fence:** OUT — qualquer edição manual em arquivo gerado. Se o `bun sdk` não propagar (o Kubb é incremental), force a regen limpa; **nunca** edite `dist/` na mão.
**Gate:** `bun sdk && cd packages/api/typescript && bun test tests/architecture/mcp-exposure.test.ts src/agent/mcp/ && cd ../../.. && bun tsc && bun lint && bun run test`

### Step T3.1 — Regenerar

`bun emit-openapi` e `bun sdk`. Confira no diff que `openapi.json` ganhou `mcp:orchestration` na tag e `orchestration` no `x-mcp-scope` da operação `ConfigurePrompt`, e que o `x-mcp-scopes` da raiz a lista nos dois escopos.

### Step T3.2 — Fechar os rails

- Atualize o snapshot (`bun test tests/architecture/mcp-exposure.test.ts --update-snapshots`) e **leia o diff**: ele é a revisão da mudança de superfície. Espere exatamente uma entrada nova em `orchestration` e nenhuma remoção em `system`.
- Adicione a asserção nomeada (AC-1), no molde da que existe para `RaiseStop`:

```typescript
test('AC-1 — ConfigurePrompt está nas DUAS superfícies, que é a mudança de exposição desta frente', () => {
	expect(sorted(mcpExposure().scopesFor('ConfigurePrompt'))).toEqual([McpScope.system, McpScope.orchestration].sort())
})
```

- AC-2 e AC-11 não precisam de teste novo: `generated-server.test.ts` itera sobre `Object.values(McpScope)` e compara com o `x-mcp-scopes` publicado, e `IssueWorkAgent.test.ts` já assevera que nenhuma ferramenta de `system` alcança o agente de trabalho — as duas passam a cobrir esta ferramenta sozinhas. Confirme que passam.

### Step T3.3 — Gate completo

`bun tsc`, `bun lint`, `bun run test` na raiz.
