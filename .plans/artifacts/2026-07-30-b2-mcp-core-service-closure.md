# B2 — MCP como capacidade do core: artefato de fechamento

Frente `.plans/2026-07-30-b2-mcp-core-service.md`. Medição feita em `d0b4bc77` (T9), antes do commit
deste artefato. Este documento só MEDE — nenhuma linha de código de produção foi alterada por ele
(exceto a amplificação de rail autorizada junto do T9, já commitada separadamente em `d0b4bc77`).

Commits da frente:

| Task | SHA | Mensagem |
|---|---|---|
| plano | `ae5f1c51` | docs(plans): B2 — plano da frente mcp-core-service |
| T1 | `8486b494` | feat(contracts): B2 T1 — McpScope nasce onde todo enum cross-boundary nasce |
| T2 | `cfa1cd85` | feat(core): B2 T2 — a identidade de agente vira formato do template |
| T3 | `94b36f81` | feat(core): B2 T3 — o slot static mcpScopes e a varredura que substitui o Map global |
| T4 | `0eb9595e` | refactor(agent): B2 T4 — o agente declara a propria identidade, e ela e parseada no spawn |
| T4 (falseador consertado) | `297bc4d4` | test(agent): B2 T4 — o falseador da ordem deixa de ser vacuoso |
| T5+T6 | `4871fd7b` | refactor(agent,core): B2 T5+T6 — o controller declara a propria exposicao; o manifesto e o Map global morrem |
| T7 | `7c68c2b2` | refactor(core,agent): B2 T7 — a checagem de identidade vai para o destino, e e obrigatoria |
| T8 | `a3c6fc18` | refactor(core,agent): B2 T8 — o adaptador fino, com a unica carga que nao podia sair de la |
| T9 | `d0b4bc77` | docs(skills): B2 T9 — os tres padroes entram nas skills que os ensinam |

T4 saiu em dois commits: `0eb9595e` implementou, `297bc4d4` corrigiu o falseador da ordem que estava
vacuo (ver §(c) T4.8 abaixo) — decisão documentada na própria mensagem do segundo commit, não uma
pendência solta.

---

## (a) Os greps de fechamento — saída VERBATIM

Re-executados em `d0b4bc77` (pós-T9), da raiz do repo.

### AC-2 — as sete estruturas e os dois arquivos de infra não existem

```
$ grep -rn "mcp/manifest\|McpScopeRegistry\|registerMcpScopes\|mcpScopesFor\|mcpScopeRegistrySnapshot" packages/ --include="*.ts" | grep -v node_modules
packages/api/typescript/core/src/utils/OpenAPI.ts:349:	 * discarded with it. Its predecessor was a module-level `Map` in `utils/McpScopeRegistry.ts`,
packages/api/typescript/core/src/utils/OpenAPI.ts:889:		// spelled here and copied by hand into `agent/mcp/manifest.ts`, with an architecture test
packages/api/typescript/core/src/utils/McpExposure.ts:15: * instance; `agent/mcp/manifest.ts#operationIdOf` re-derived it from the class, and
packages/api/typescript/core/src/utils/McpExposure.ts:57: * `core/src/utils/McpScopeRegistry.ts`, populated by a SIDE-EFFECT import from the api package
packages/api/typescript/src/agent/mcp/exposure.ts:23: * Its predecessor, `mcp/manifest.ts`, held `MCP_SCOPES = { 'issue-handling': [A, B, C, …] }` — the
packages/api/typescript/src/agent/mcp/exposure.ts:84: * (`mcp/manifest.ts`) imported the six external barrels and this context's controllers BY FILE for
```

```
$ grep -rn "MCP_SCOPES\|MCP_SCOPE_NAMES\|SCOPE_CONFINEMENT\|MCP_SCOPE_BY_OPERATION\|ISSUE_HANDLING_OPERATION\|scopeOperationIds" packages/ --include="*.ts" | grep -v node_modules
packages/api/typescript/src/agent/types/Agent.ts:69:	 * It replaces `SCOPE_CONFINEMENT`, a `Record<McpScope, 'issue' | 'thread'>` in the MCP manifest
packages/api/typescript/src/agent/types/Agent.ts:164:		// `if (SCOPE_CONFINEMENT[scope] === 'issue' && !input.issueId) throw` — one hardcoded axis, one
packages/api/typescript/src/agent/types/Agent.identity.test.ts:18: * `SCOPE_CONFINEMENT` — a `Record<McpScope, 'issue' | 'thread'>` in the MCP manifest, read by exactly
packages/api/typescript/src/agent/mcp/exposure.ts:23: * Its predecessor, `mcp/manifest.ts`, held `MCP_SCOPES = { 'issue-handling': [A, B, C, …] }` — the
packages/client/generators/typescript.ts:252:const MCP_SCOPES_DIR = 'scopes'
packages/client/generators/typescript.ts:257:	return path.join(plan.outputRoot, MCP_DIR, MCP_SCOPES_DIR, scope)
packages/client/generators/typescript.ts:267:	return `${REPO.sdkPackage}/${plan.source.service}/${MCP_DIR}/${MCP_SCOPES_DIR}/${scope}`
```

```
$ ls packages/api/typescript/src/agent/mcp/ packages/api/typescript/core/src/utils/ | grep -i "manifest\|register\|McpScopeRegistry\|router"
(vazio — exit 1)
```

**Leitura — desvio do plano registrado, mesma classe que o B4 já documentou.** O plano previa "vazio"
para os dois primeiros greps. A saída real tem 6 + 3 = 9 linhas, mas:

- As 6 linhas do primeiro grep e as 3 primeiras do segundo são TODAS docblocks/comentários que
  explicam o que foi substituído e por quê (`OpenAPI.ts`, `McpExposure.ts`, `exposure.ts`,
  `Agent.ts`, `Agent.identity.test.ts`) — zero `import`, zero declaração de classe/const viva, zero
  call site. Código-vazio, não string-vazio.
- As 3 últimas linhas (`packages/client/generators/typescript.ts:252,257,267`) são uma COLISÃO DE
  SUBSTRING, não uma sobrevivência do símbolo morto: `MCP_SCOPES_DIR` é uma constante viva e
  correta (`'scopes'`, o nome do diretório onde os servidores gerados por escopo são emitidos) que
  o regex `MCP_SCOPES` casa como prefixo. Não é `MCP_SCOPES` (o Record morto), é
  `MCP_SCOPES_DIR` (uma string de diretório). Confirmado por leitura direta do arquivo.

O terceiro comando (`ls | grep`) retorna vazio (exit 1): nenhum `manifest.ts`, `register.ts`,
`McpScopeRegistry.ts` ou `router.ts` existe em `agent/mcp/` ou `core/src/utils/`. **AC-2 fechado**
sob a leitura "vazio-de-código".

### AC-6/AC-7 — o vocabulário velho de identidade

```
$ grep -rn "RunTokenClaims\|RunTokenService\|RunTokenMiddleware\|\.mint(\|\.verify(" packages/api --include="*.ts" | grep -v node_modules
packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.ts:11: * (B2, spec decision 4). It replaces BOTH the per-controller `RunTokenMiddleware` and the generic
packages/api/typescript/scripts/phase6-mcp-smoke.ts:14: * case) and mints a run token directly via the SAME `RunTokenService` singleton the router verifies
packages/api/typescript/src/agent/types/AgentRunIdentity.ts:51: * Renamed from `RunTokenClaims` (spec decision 3): "claims" named the ENVELOPE, and there is no
```

**Leitura — 2 de 3 são o padrão comentário-explica-a-migração; a 3ª é um achado real, registrado em
§(e).** `AgentIdentityMiddleware.ts:11` e `AgentRunIdentity.ts:51` documentam explicitamente o que
substituíram ("It replaces...", "Renamed from..."). `phase6-mcp-smoke.ts:14` é DIFERENTE: não é um
"renamed from" — é um docstring que nunca foi atualizado quando o T4/T7 renomeou o serviço. O CÓDIGO
do mesmo arquivo (linha 59, 138-139) já usa `AgentIdentityService` corretamente
(`container.resolve<AgentIdentityService<AgentRunIdentity>>(AgentIdentityService)`); só o comentário
ficou para trás. Zero impacto funcional (é prosa, não código executável), mas é uma citação do nome
morto que sobreviveu por descuido, não por design — ver achado O-smoke em §(e). **AC-6/AC-7 fechados**
sob a leitura "zero código vivo usa o vocabulário morto", com a ressalva do comentário desatualizado
registrada, não escondida.

### AC-8 — o walk genérico

```
$ grep -rn "IDENTITY_KEYS\|findIdentityMismatches\|assertIdentityMatches" packages/ --include="*.ts" | grep -v node_modules
packages/api/typescript/core/src/types/AgentIdentity.ts:54: * `IDENTITY_KEYS = ['ownerId','issueId','threadId']` — blind to the fact that different scopes have
```

**Leitura.** 1 linha, docblock de `compareIdentity` explicando o deny-list que substituiu. Zero
código vivo. **AC-8 fechado.**

### AC-10 — a injeção de argumento à distância

```
$ grep -rn "runClaims\|RunClaimsCtxSchema" packages/ --include="*.ts" | grep -v node_modules
packages/api/typescript/src/agent/types/AgentRunIdentity.ts:87: * (`RunClaimsCtxSchema`), because there was nowhere shared to put it. There is now, and the third
```

**Leitura.** 1 linha, docblock de `AgentRunIdentityCtxSchema` explicando a cópia verbatim que
substituiu. Zero código vivo. **AC-10 fechado.**

### AC-3 — os statics existem e são 32 classes

```
$ grep -rn "static override readonly mcpScopes" packages/api/typescript/src --include="*.ts" | wc -l
      32
```

**Match exato com o esperado. AC-3 fechado.**

### AC-12 — o core não conhece o produto

```
$ grep -rn "McpScope\|AgentRunIdentity\|@codedm/client-typescript\|@agent/" packages/api/typescript/core/src/types/AgentIdentity.ts packages/api/typescript/core/src/types/McpAdapter.ts packages/api/typescript/core/src/services/AgentIdentityService packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.ts
packages/api/typescript/core/src/types/AgentIdentity.ts:10: * (`scope: McpScope`, `issueId?: string`) at its own layer, and core keeps the FORMAT.
packages/api/typescript/core/src/types/AgentIdentity.ts:91: * core cannot import from `@codedm/client-typescript` — the api depends on the SDK, so the edge would
packages/api/typescript/core/src/services/AgentIdentityService/AgentIdentityService.ts:20: * `AgentIdentityService<AgentRunIdentity>` at an injection site gives the product its own fields back
```

**Leitura.** 3 linhas, todas docblock explicando POR QUE o core evita esses tipos/imports — zero
`import { McpScope }`, zero `import { AgentRunIdentity }`, zero `@codedm/client-typescript` ou
`@agent/` como especificador de import real nesses 4 arquivos. A fronteira core↔produto se sustenta.
**AC-12 fechado.**

### AC-15 — 3 imports estáticos, servidor por request

```
$ grep -n "import('@codedm/client-typescript/typescript/mcp/scopes" packages/api/typescript/src/agent/mcp/door.ts | wc -l
       3

$ grep -n "buildTransport" packages/api/typescript/src/agent/mcp/door.ts
81:		const transport = await this.buildTransport(scope)
120:	protected async buildTransport(scope: string): Promise<WebStandardStreamableHTTPServerTransport>
```

**Match exato (3). `buildTransport` constrói `server` + `transport` NOVOS a cada chamada — lidos os
`120-124`: `loadGeneratedServer` + `new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator:
undefined, ... })` + `server.connect(transport)`, sem nenhum campo de cache na classe. O docstring do
método (linhas 96-113) cita o erro medido da alternativa: `Stateless transport cannot be reused across
requests`. AC-15 fechado.**

### AC-17 — o teste antigo não existe

```
$ ls packages/api/typescript/tests/architecture/ | grep mcp
mcp-exposure.test.ts
```

**Match exato — só o arquivo esperado. AC-17 fechado.**

---

## (b) Mapa AC → evidência (resultados reais, verificados nesta sessão de fechamento)

| AC | Evidência | Resultado |
|---|---|---|
| AC-1 | `packages/contracts/wire/enums/mcp-scope.tsp` + import em `wire/main.tsp` + os 3 bindings gerados (`generated/{typescript,go,rust}`); provado por `bun run --cwd packages/contracts test` (92 pass TS + 8 pass Rust + Go `ok`) | ✅ pass |
| AC-2 | Greps §(a) — vazio-de-código nos dois primeiros + `ls` sem `manifest.ts`/`register.ts`/`McpScopeRegistry.ts`/`router.ts` | ✅ pass (desvio de contagem documentado em §(a)) |
| AC-3 | `tests/architecture/mcp-exposure.test.ts` (15 pass / 0 fail) + grep de 32 statics | ✅ pass |
| AC-4 | `mcp-exposure.test.ts` (set-equalities por scope) — suíte verde | ✅ pass |
| AC-5 | `src/agent/types/Agent.identity.test.ts` — `IssueWorkAgent.IdentitySchema` requer `issueId`; `OrchestratorAgent.IdentitySchema` não tem o campo (8 pass / 0 fail) | ✅ pass |
| AC-6 | Grep `SCOPE_CONFINEMENT` vazio-de-código + `Agent.identity.test.ts` FALSEADOR da ordem (T4.8, ver §(c)) | ✅ pass |
| AC-7 | Grep `RunTokenClaims\|RunTokenService\|.mint(\|.verify(` vazio-de-código (com a ressalva do comentário em `phase6-mcp-smoke.ts`, §(e)) + `core/src/services/AgentIdentityService/` com os 3 verbos + `core/src/types/AgentIdentity.test.ts` (13 pass / 0 fail) | ✅ pass |
| AC-8 | Grep `IDENTITY_KEYS\|findIdentityMismatches\|assertIdentityMatches` vazio-de-código | ✅ pass |
| AC-9 | `core/src/middlewares/AgentIdentityMiddleware.ts` + `Controller.executeMiddlewares`/`effectiveMiddlewares` + `AgentIdentityMiddleware.test.ts` (7 pass / 0 fail); grep `AgentIdentityMiddleware` em `packages/api/typescript/src` (fora de `core/`) → vazio, nenhum controller lista o middleware | ✅ pass |
| AC-10 | `src/agent/controllers/ForkIssue.ts` lendo `request.ctx.agentIdentity` (linha 100) + grep `runClaims\|RunClaimsCtxSchema` vazio-de-código | ✅ pass |
| AC-11 | `AgentIdentityMiddleware.test.ts`: `'AC-11 — NO token: the request passes untouched, and nothing is stamped'` verde + suíte `src/ui` sem regressão (dentro dos 899 pass do `bun test` de `packages/api/typescript`) | ✅ pass |
| AC-12 | `core/src/types/McpAdapter.ts`, `core/src/types/AgentIdentity.ts` (com `compareIdentity`), `core/src/services/AgentIdentityService/` (abstract + InMemory) existentes; grep §(a) AC-12 vazio-de-código | ✅ pass |
| AC-13 | `src/agent/mcp/door.test.ts` (9 `it`, scope-mismatch → 403) + `core/src/types/McpAdapter.ts#handle` fazendo o match antes de `serve()` (linha 82-88) | ✅ pass |
| AC-14 | Grep `findIdentityMismatches` vazio + `door.ts` sem `rejectMismatchedIdentity`/`toolCallsIn`/`JSONRPC_INVALID_PARAMS` — arquivo lido inteiro nesta sessão, confirma | ✅ pass |
| AC-15 | Greps §(a) AC-15 — 3 imports estáticos + `buildTransport` por request, sem cache | ✅ pass |
| AC-16 | `tests/architecture/mcp-exposure.test.ts` + `__snapshots__/mcp-exposure.test.ts.snap` commitado; falseadores do Step T6.3 (ver §(c)) | ✅ pass |
| AC-17 | Grep §(a) AC-17 — só `mcp-exposure.test.ts` | ✅ pass |
| AC-18 | `src/agent/mcp/E2eMcpDriver.ts` — não lido linha a linha nesta sessão, mas `packages/e2e && bun run test` está verde (6 pass / 2 skip, ver §(d)), incluindo `10-terminal-tool-frame.spec.ts` que exercita a ponta MCP real | ✅ pass (evidência indireta via e2e verde) |
| AC-19 | A bateria completa de §(d) | ✅ pass |

---

## (c) As saídas dos falseadores

Seis falseadores medidos nos lotes T1-T8 (números REAIS — o plano cita contagens desatualizadas em
alguns pontos; os números abaixo são os medidos e corroborados nesta sessão contra os arquivos de
teste correntes em HEAD `d0b4bc77`).

### T2.8(a) — `compareIdentity`, a validação (3 eixos)

Arquivo: `core/src/types/AgentIdentity.test.ts`. Com `if (supplied !== claimed) mismatches.push(...)`
trocado por `if (false) mismatches.push(...)`: **10 pass / 3 fail** (os dois primeiros FALSEADOR e o
`'reports EVERY axis'`). Revertido: **13 pass / 0 fail**.

`13/0 → 10/3 → 13/0`. Baseline confirmado nesta sessão: `bun test src/types/AgentIdentity.test.ts` em
HEAD → `13 pass / 0 fail`.

### T2.8(b) — `compareIdentity`, o expiry

Mesmo arquivo. Com `if (identity.expiresAt.getTime() <= Date.now())` trocado por `if (false)`: **o
`it` `FALSEADOR — an EXPIRED identity resolves to null` fica vermelho** → **12 pass / 1 fail**.
Revertido: `13/0`.

### T3.5 — a exposição, default-is-exposed

Arquivo: `core/src/utils/McpExposure.test.ts`. Com `mcpScopesOf` trocado de `source.mcpScopes ?? []`
para `source.mcpScopes ?? ['issue-handling']`: **6 pass / 5 fail**. Revertido: **11 pass / 0 fail**.

`11/0 → 6/5 → 11/0`. Baseline confirmado nesta sessão: `bun test src/utils/McpExposure.test.ts` em
HEAD → `11 pass / 0 fail`. **Nota:** o texto do plano (Step T3.5) cita só 2 `it` vermelhos
("the default is NOT exposed" + o FALSEADOR de controller não-declarado); o número real medido nos
lotes é 5 — usado aqui por instrução explícita (números do plano defasados).

### T4.8 — a ORDEM (parse antes de `.issue(`) — o falseador obrigatório, consertado em `297bc4d4`

Arquivo: `src/agent/types/Agent.identity.test.ts`. **O `it` da ordem, na variante LITERAL do plano,
era VACUOSO**: com `buildMcpInvocation` reescrito para chamar `.issue(` ANTES do parse (em vez de
depois), a suíte continuava **8 pass / 0 fail — zero vermelhos**, porque o double/stub usado não
registrava a ORDEM das chamadas, só a ocorrência. `297bc4d4` consertou introduzindo
`RecordingAgentIdentityService`, que timestampa cada chamada (`issue`/`resolve`/`revoke`) numa lista.
Com o falseador aplicado sobre a versão corrigida:

- **Eixo VALIDAÇÃO** (o parse falha e `.issue(` nunca deveria rodar): `5 pass / 3 fail`.
- **Eixo ORDEM** (parse-then-issue vs issue-then-parse, mesmo quando ambos "passam"): `6 pass / 2
  fail`, com a mensagem de asserção `Received length: 1` (o array de chamadas do
  `RecordingAgentIdentityService` tinha 1 entrada de `.issue(` no lugar esperado de 0 — a prova de que
  `.issue(` rodou antes do parse rejeitar).

Baseline: `8 pass / 0 fail` (confirmado nesta sessão: `bun test src/agent/types/Agent.identity.test.ts`
em HEAD → `8 pass / 0 fail`). Restaurado (ambos os eixos): `8/0`.

**Este é o falseador mais importante da frente** — é o único que capturou um bug de FERRAMENTA DE
TESTE (um double que não observava ordem) mascarando um falseador inerte, e `297bc4d4` existe
exclusivamente para consertá-lo antes que a frente fosse declarada fechada.

### T6.3 — o snapshot de exposição (US-5 / AC-16)

Arquivo: `tests/architecture/mcp-exposure.test.ts` (baseline `15 pass / 0 fail`, confirmado nesta
sessão). Dois falseadores simétricos, ambos medidos nos lotes:

- **Remover** `static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]` de
  `TransitionIssueStatus.ts`: **3 assertions vermelhas** — o snapshot reprova NOMEANDO
  `mcp__codedm__TransitionIssueStatus`, e junto reprovam `'issue-handling': the CLASS-side scan and
  the published root extension agree` e `...the operations STAMPED with x-mcp-scope are exactly the
  scan's`.
- **Acrescentar** um static novo a um controller sem scope: **3 assertions vermelhas**, o espelho —
  o snapshot reprova ganhando a tool nova, e as mesmas duas set-equalities discordam na direção
  oposta.

`remove → 3 fail / add → 3 fail`, ambos revertendo para `15/0`.

### T7.6 — `AgentIdentityMiddleware`, o mismatch (path param + body)

Arquivo: `core/src/middlewares/AgentIdentityMiddleware.test.ts` (7 `it`, baseline `7 pass / 0 fail`,
confirmado nesta sessão). Com a comparação de `compareIdentity` desligada dentro do middleware: os
dois `it` FALSEADOR (`'a PATH PARAM naming another thread is 403...'` e `'a BODY field naming another
issue is 403...'`) ficam vermelhos: **5 pass / 2 fail**. Revertido: **7 pass / 0 fail**.

`7/0 → 5/2 → 7/0`.

### T8 — o scope match (McpAdapter/McpDoorController)

Arquivos: `src/agent/mcp/door.test.ts` (9 `it`) + `src/agent/mcp/door.write-isolation.test.ts` (4
`it`), rodados juntos (baseline `13 pass / 0 fail`, confirmado nesta sessão: `bun test
src/agent/mcp/door.test.ts src/agent/mcp/door.write-isolation.test.ts` em HEAD → `13 pass / 0 fail`).
Com o scope match (`identity.scope !== scope` em `McpAdapter.handle`) desligado: **10 pass / 3 fail** —
os dois `it` de scope-mismatch em `door.test.ts` (`'a token minted for issue-handling CANNOT open
/mcp/system...'` e `'a SYSTEM-scoped token is likewise confined...'`) mais o `it` de
`door.write-isolation.test.ts` que mede "a chamada com scope errado não escreve" (a assimetria
escrita/rejeição perde seu lado rejeitado). Revertido: **13 pass / 0 fail**.

`13/0 → 10/3 → 13/0`.

---

## (d) Gates — saída real

Rodados nesta sessão de fechamento, contra HEAD `d0b4bc77` (pós-T9, pré-commit do T10).

| Gate | Comando | Exit | Saída |
|---|---|---|---|
| api tsc build | `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` | **0** | limpo, sem output |
| bun test api | `cd packages/api/typescript && bun test --preload reflect-metadata` | **0** | `899 pass / 3 skip / 0 fail`, 2146 expect() calls, 902 testes em 142 arquivos |
| bun test core | `cd packages/api/typescript/core && bun test` | **0** | `199 pass / 0 fail`, 421 expect() calls, 199 testes em 29 arquivos |
| bun tsc (raiz) | `bun tsc` | **0** | `NX Successfully ran target tsc for 7 projects` — 7/7 do cache (client-typescript, core-typescript, api-typescript, app-astro, app-react, api-go, e2e); `app-astro` reexecutou `astro check` ao vivo: 30 arquivos, 0 erros/warnings/hints |
| bun lint | `bun lint` | **0** | `NX Successfully ran target lint for 3 projects` (app-styles, app-react, app-astro) — 3/3 do cache. **`core`/`api-typescript`/`api-go` não têm target `lint`** (ver achado em §(e)) |
| bun run test (raiz) | `bun run test` | **0** | `NX Successfully ran target test for 6 projects` — 4/6 do cache, `core-typescript` e `@codedm/contracts` reexecutaram ao vivo (199 pass / 0 fail; 92 pass TS + 8 pass Rust + Go `ok`) |
| test:tooling | `bun run test:tooling` | **0** | `414 pass / 0 fail`, 1067 expect() calls, 414 testes em 26 arquivos (rodado durante o T9, mesma contagem re-verificada) |
| contracts codegen | `cd packages/contracts && bun test codegen/ && bun run test:rust && bun run test:go` | **0** | TS: `92 pass / 0 fail`, 396 expect(); Rust: `cargo test` — 0+3+4+1+0 = 8 pass / 0 fail across 5 crates; Go: `ok template/contracts-go/tests (cached)` |
| Go build+test | `cd packages/api/go && go build ./... && go test ./...` | **0** | build limpo; testes: todos os pacotes `ok` (cached) ou `[no test files]`; `pkg/openapi` 3.377s |
| drift (dump-sqlite-schema) | `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check` | **0** | `✔ schema.sql matches the migrations` |
| e2e | `cd packages/e2e && bun run test` | **0** | `6 passed / 2 skipped` (14.9s) — `08-stop-resolve.spec.ts` e `09-sse-pill.spec.ts` seguem `test.skip` (mesmos motivos do B4/B5, não tocados por B2); `10-terminal-tool-frame.spec.ts` PASSOU — é o caso que assevera `mcp__codedm__TransitionIssueStatus` e `mcp__codedm__RecordArtifact`, os dois nomes de wire que o snapshot do T6 também lista |
| react tsc | `cd packages/app/react && bun x tsc --noEmit` | **0** | limpo, sem output |
| react test | `cd packages/app/react && bun test` | **0** | `32 pass / 0 fail`, 61 expect() calls, 32 testes em 6 arquivos |
| check:generated (pós-commit) | `bun check:generated` | **0** | Rodado DEPOIS do commit `3e757cea`, conforme a ordem que o próprio T10 prescreve. `✓ generated output in sync (contracts bindings, SDK dist, openapi.json)`. O regen imprime as 3 superfícies MCP com a contagem exata do snapshot dourado do T6: `'issue-handling': 6 tools`, `'orchestration': 5 tools`, `'system': 23 tools` (6/5/23). `git status` confirma zero drift pós-regen — nenhum arquivo gerado mudou |

Bônus (não pedidos explicitamente na lista, rodados por completude — mesmo padrão do artefato do B4):

| Gate | Comando | Exit | Saída |
|---|---|---|---|
| bun detect | `bun run detect` | **1** | 6/6 detectores reportaram findings — **nenhum toca arquivo desta frente** (`agent/mcp/**`, `core/src/{types,services,middlewares}/AgentIdentity*`, controllers com `mcpScopes`). Os findings são 100% pré-existentes e não-relacionados: `SCW-01b/c` (eventos sem consumidor, contexto `thread`/`workspace`), `CP-01/02` (component-props em ~20 componentes React do console, nenhum deles tocado por B2), `GPS-03` (projectors Go com múltiplas structs por arquivo), `GEL-01` (2 literais de enum não tipados em `whatsmeow_channel.go`). Sob a leitura "sem findings NOVOS" do Final Validation, este gate está satisfeito para o escopo de B2; o exit code 1 é ruído de baseline pré-existente, não uma regressão desta frente |

---

## (e) Achados e follow-ups — registrados, não corrigidos (fora do scope fence do T10)

### E1 — `biome check --write --unsafe` apaga construtores DI-portadores em silêncio (o rail do T9)

Medido no T8: `noUselessConstructor` é um autofix UNSAFE do biome que roda mesmo a regra nunca
reportando em nível `error`. Aplicado sobre `McpDoorController` (cujo construtor só existe para
carregar `design:paramtypes` do tsyringe — o corpo é `super(identities)`, literalmente "inútil" pela
métrica sintática do linter), o autofix apagaria o construtor e `container.resolve(McpDoorController)`
passaria a devolver uma instância com `identities` `undefined` — SEM lançar. Nenhum teste da suíte
constrói a porta pelo container (ela fica deliberadamente fora do barril de controllers, ver E2), e
`.not.toThrow()` sozinho não capturaria o defeito (medido nesta sessão: resolver com o construtor
apagado continua sem lançar). **Corrigido no T9**: `real-di-resolution.test.ts` ganhou um `it` que
resolve `McpDoorController` e assevera que o CAMPO construído (`identities`) está definido — falseador
provado nesta sessão (constructor apagado → `3 pass / 1 fail`; restaurado → `4 pass / 0 fail`).

### E2 — o ciclo de import do barril, e por que `exposure.ts` importa por arquivo

`agent/controllers/index.ts` exporta `TestRunIssueTurnController`, que importa `../usecases/RunIssueTurn`,
que importa `IssueWorkAgent`, que importa `agent/mcp/exposure.ts` (para montar `--allowedTools`) — se
`exposure.ts` importasse os controllers do PRÓPRIO contexto pelo barril (`../controllers`), o ciclo
fecharia e morreria como `ReferenceError: Cannot access 'AgentRunnerFactory' before initialization` em
**63 testes** (medido, documentado inline em `exposure.ts:79-84`), porque `@injectable()` lê
`design:paramtypes` enquanto o ciclo ainda está em voo. `exposure.ts` importa os 6 controllers do
próprio contexto `agent` BY FILE (`../controllers/CreateIssue`, `../controllers/ForkIssue`, etc.) —
exatamente a mesma disciplina que a amplificação do T9 aplicou ao importar `McpDoorController` no rail
de DI (por arquivo, nunca pelo barril), citada verbatim nas instruções desta Task.

### E3 — dois pontos do emitter publicam a exposição MCP, não um

A spec descreve o emitter lendo a exposição em UM ponto (`buildOperation`, que estampa
`x-mcp-scope` por operação — `OpenAPI.ts:870`). Há um SEGUNDO ponto: `generateSpecification` publica,
na RAIZ do spec, `x-mcp-scopes` (plural) — o manifesto invertido `scope → operationIds[]`
(`OpenAPI.ts:512-521`), lido de `this.mcpExposure.manifest()`. O propósito é deliberado, não um
resíduo: o docstring explica que sem esse segundo ponto, o gerador de SDK (`packages/client/generators/
typescript.ts`) não teria contra o que comparar sua própria contagem de tools emitidas — derivar a
contagem esperada dos mesmos stamps por-operação tornaria a asserção tautológica. Confirmado por
leitura direta nesta sessão (`OpenAPI.ts:508-521`).

### E4 — o header do run token é declarado duas vezes, pinado por um teste

`AGENT_RUN_TOKEN_HEADER` (`core/src/types/AgentIdentity.ts:97`, valor `'x-codedm-run-token'`) e
`MCP_RUN_TOKEN_HEADER` (`packages/client/dist/typescript/src/typescript/mcp/context/index.ts:59`,
mesmo valor) são duas declarações do mesmo byte — uma no core, outra na SDK gerada. `mcp-exposure.
test.ts:137` assevera `expect(AGENT_RUN_TOKEN_HEADER).toBe(MCP_RUN_TOKEN_HEADER)`, então uma divergência
quebra a suíte em vez de silenciosamente desalinhar os dois lados. O single-sourcing real exigiria
`packages/client/generators/typescript.ts` ler a constante do core, o que colocaria `packages/client`
dependendo de `core` — decisão de topologia de pacotes fora das Decisions desta spec. Confirmado por
leitura direta nesta sessão.

### E5 — `core`, `api-typescript` e `api-go` estão fora do `bun lint`

`bun lint` (`nx run-many -t lint`) rodou nesta sessão para **3 projetos apenas**: `app-styles`,
`app-react`, `app-astro`. `core-typescript`, `api-typescript` e `api-go` não têm um target `lint`
configurado no Nx — nenhum arquivo tocado por B2 (incluindo os 6 arquivos de `.claude/skills/` do T9,
que SÃO cobertos por um bloco separado de `lint-staged`) passa por `bun lint`. Medido nesta sessão via
saída literal do comando (`Running target lint for 3 projects`, sem `core-typescript`/`api-typescript`/
`api-go` na lista).

### E6 — o ponto cego do `bun review`: `core/` e `mcp/` não casam nenhuma `CLASSIFICATION_RULES`

Verificado no T9.5 e reconfirmado nesta sessão: `bun scripts/review.ts
packages/api/typescript/core/src/middlewares/AgentIdentityMiddleware.ts
packages/api/typescript/core/src/services/AgentIdentityService/AgentIdentityService.ts
packages/api/typescript/src/agent/mcp/exposure.ts --no-cascade` classifica os dois primeiros
corretamente (`middleware` e `service`, respectivamente — os padrões de path fragment de
`CLASSIFICATION_RULES` em `scripts/review.ts` não são ancorados em
`packages/api/typescript/src/*/`, então `core/src/middlewares/**` e `core/src/services/**` casam do
mesmo jeito), mas `exposure.ts` fica **NÃO CLASSIFICADO** — nenhuma regra em `CLASSIFICATION_RULES`
casa `mcp/`. Isso confirma a observação O9 do próprio plano: o guard de silent-drop do script
(`"this is exactly how jobs/ was silently dropped"`) avisa em voz alta, mas não corrige sozinho.
**Não corrigido aqui** — corrigir exige uma entrada nova em `CLASSIFICATION_RULES` para `<ctx>/mcp/**`,
decisão de escopo da ferramenta de review, fora das Decisions desta spec (mesma leitura do plano,
Step T9.5).

### E7 — `HttpMethod` widened para `string` em `buildOperation` — pré-existente, surfaced (não corrigido) pelo B2

`OpenAPI.ts:811-815`: `buildPath` mapeia `controller.method` (tipado `HttpMethod[]`, união fechada)
para `String(method)` antes de passar a `buildOperation`, que recebe um `string` solto. O próprio
código documenta que é uma violação PRÉ-EXISTENTE, exposta (não introduzida) porque este foi o
primeiro change a tocar o arquivo nesta frente — a correção real (tipar `buildOperation` como
`HttpMethod`) cascateia em `buildOperationId` e depois em `operationIdOf`, cuja assinatura o T5
consome. Registrado como follow-up, não corrigido — decisão do próprio código-fonte, confirmada por
leitura direta nesta sessão.

### E8 — o smoke script `phase6-mcp-smoke.ts` fica fora de AMBOS os `tsconfig`

`packages/api/typescript/tsconfig.build.json` (o gate autoritativo `bun x tsc -p tsconfig.build.json
--noEmit`) inclui só `src/**` e `tests/**` — não inclui `scripts/**`. `tsconfig.json` (o mais amplo)
tenta cobrir scripts via `"../scripts/**/*.ts"`, mas esse caminho relativo aponta para
`packages/api/scripts` (**um nível ACIMA de `packages/api/typescript/`**) — um diretório que **não
existe** (`ls packages/api/scripts` → vazio). O diretório real,
`packages/api/typescript/scripts/` (onde vive `phase6-mcp-smoke.ts`, `build.ts`,
`dump-sqlite-schema.ts`, etc.), não é coberto por NENHUM dos dois tsconfigs. É exatamente por isso
que o docstring desatualizado do achado no grep AC-6/AC-7 (`RunTokenService` em
`phase6-mcp-smoke.ts:14`, §(a)) nunca foi pego por `tsc` — embora, sendo comentário, `tsc` não o
pegaria de qualquer forma; o achado real de E8 é que QUALQUER erro de TIPO real dentro de
`scripts/**` (não só comentários) passaria despercebido por `bun tsc`. Confirmado por leitura direta
dos dois tsconfigs e `ls` nesta sessão.

---

## (f) O inventário das sete estruturas + os dois arquivos de infra + o deny-list — commit que matou cada um

| # | Estrutura/arquivo | Commit que matou | Task |
|---|---|---|---|
| 1 | `MCP_SCOPES` (Record central `scope → controllers[]`) | `4871fd7b` | T5+T6 |
| 2 | `MCP_SCOPE_NAMES` | `4871fd7b` | T5+T6 |
| 3 | `SCOPE_CONFINEMENT` (`Record<McpScope, 'issue'|'thread'>`) | `4871fd7b` | T5+T6 |
| 4 | `TOOLS_IN_SCOPE` | `4871fd7b` | T5+T6 |
| 5 | `MCP_SCOPE_BY_OPERATION` | `4871fd7b` | T5+T6 |
| 6 | `ISSUE_HANDLING_OPERATION` | `4871fd7b` | T5+T6 |
| 7 | a cópia duplicada de `operationIdOf` (dentro de `mcp/manifest.ts`, arbitrada por teste contra `buildOperationId`) | `94b36f81` | T3 (a delegação nasce); `4871fd7b` remove o arquivo que ainda a hospedava |
| infra-1 | `core/src/utils/McpScopeRegistry.ts` (o `Map` global do core, populado por side-effect import) | `4871fd7b` | T5+T6 |
| infra-2 | `agent/mcp/manifest.ts` (o módulo de side-effect em si) | `4871fd7b` | T5+T6 |
| infra-3 | `agent/mcp/register.ts` | `4871fd7b` | T5+T6 |
| infra-4 | `tests/architecture/mcp-manifest.test.ts` | `4871fd7b` | T5+T6 |
| deny-list | `IDENTITY_KEYS` (`['ownerId','issueId','threadId']`, walk genérico) | `7c68c2b2` | T7 |
| infra-5 | `agent/mcp/identity.ts` (o walk genérico em si) | `7c68c2b2` | T7 |
| infra-6 | `agent/middlewares/RunTokenMiddleware.ts` | `7c68c2b2` | T7 |
| infra-7 | `agent/middlewares/index.ts` | `7c68c2b2` | T7 (ficou vazio, removido) |
| infra-8 | `agent/mcp/router.ts` (o `McpRouterController` de ~270 linhas) | `a3c6fc18` | T8 |

Seis das sete estruturas paralelas do manifesto (`MCP_SCOPES`, `MCP_SCOPE_NAMES`,
`SCOPE_CONFINEMENT`, `TOOLS_IN_SCOPE`, `MCP_SCOPE_BY_OPERATION`, `ISSUE_HANDLING_OPERATION`) morreram
no MESMO commit (`4871fd7b`, T5+T6) — o controller passou a se auto-declarar e o manifesto inteiro
ficou órfão de uma vez. A sétima (a cópia de `operationIdOf`) teve morte em duas fases: T3 criou o
dono único (`buildOperationId` delega), T5+T6 removeu o arquivo que ainda hospedava a cópia morta.

---

## (g) O mapeamento it-a-it — `router.test.ts` → onde cada propriedade foi medida depois do T7

`router.test.ts` (T7, diff real: `139 +++------------------`, líquido de deleções) perdeu 10 `it`
blocks. Mapeamento contra os 7 `it` de `AgentIdentityMiddleware.test.ts` (T7.6) e o que sobrou em
`door.test.ts` (T8) — construído nesta sessão por leitura do diff de `7c68c2b2` e dos arquivos atuais,
não copiado do plano:

| `it` removido de `router.test.ts` | Destino | Observação |
|---|---|---|
| `PATH PARAM — a threadId that disagrees with the claims` | `AgentIdentityMiddleware.test.ts`: `'FALSEADOR — a PATH PARAM naming another thread is 403 and nothing is stamped'` | migração direta, mesma propriedade |
| `REQUEST BODY — ...issueId inside data pointing at issue B` | `AgentIdentityMiddleware.test.ts`: `'FALSEADOR — a BODY field naming another issue is 403, on the same footing as a param'` | migração direta |
| `QUERY / any other position — the walk is positional-agnostic, at any depth` | **nenhum** — propriedade ABSORVIDA PELO REDESENHO | o walk genérico varria QUALQUER posição no corpo JSON-RPC; `compareIdentity` compara chaves NOMEADAS (`params`+`body`, já separados pela camada HTTP) — não existe mais "posição" para ser agnóstico sobre. Não é uma perda de cobertura, é uma propriedade que deixou de fazer sentido no novo design |
| `reports EVERY axis at once...` | `core/src/types/AgentIdentity.test.ts` (T2.8a, ver §(c)) | migrou de CAMADA — de "o router relata todos os eixos" para "`compareIdentity` relata todos os eixos", testado no unit da função pura, não mais no middleware/router |
| `AC-6.6(d) — the HAPPY path with concordant identity is NOT rejected` | `AgentIdentityMiddleware.test.ts`: `'a concordant call is stamped with the identity the controller then reads'` | migração direta |
| `the rejection is AGENT_RUN_SCOPE_MISMATCH → 403, never the 401 of an invalid token` | `door.test.ts` (T8) — os `it` de scope-mismatch (linha 134, 159) | migrou de CAMADA — scope match não é mais responsabilidade do que virou `AgentIdentityMiddleware`; ficou em `McpAdapter`/`McpDoorController`, o único ponto que vê toda mensagem JSON-RPC (T8) |
| `a VALID token aimed at another issue answers 403 and NEVER reaches the transport` | `AgentIdentityMiddleware.test.ts` (path/body FALSEADOR) | a propriedade "nunca alcança o transporte" agora é estrutural: o middleware roda ANTES do controller/`serve()`, então rejeitar ali estruturalmente impede o transporte de rodar — não há mais um `it` dedicado a essa asserção porque a ordem do pipeline a garante por construção |
| `a BATCH is checked member by member — one bad member taints the batch` | **nenhum** — propriedade REMOVIDA, não migrada | era semântica de BATCH do JSON-RPC antigo (múltiplas chamadas por request); o T8 reescreveu para uma chamada HTTP por tool, então "batch" não é mais um conceito do adaptador |
| `a token of O1 cannot name O2's resources...` | parcialmente coberto por `AgentIdentity.test.ts` (eixo `ownerId` de `compareIdentity`) | cobertura estrutural, não um `it` com o mesmo nome — `ownerId` é um dos três eixos que `compareIdentity` compara, mas o cenário multi-operador específico não tem um `it` dedicado pós-T7 |
| `the router carries NO middleware — nothing stamps operator authority onto a tool call` | `door.test.ts`: `'it carries NO middleware — nothing stamps operator authority onto a tool call'` (linha 170) | migração direta, título quase idêntico, sobreviveu no adaptador (T8), não no middleware |

**Leitura.** 4 de 10 migraram 1:1 para `AgentIdentityMiddleware.test.ts`; 1 migrou para
`door.test.ts` com o título quase idêntico; 1 migrou de camada para o unit test de `compareIdentity`;
1 migrou de camada para `door.test.ts` (scope-mismatch); 1 tem cobertura estrutural mas não um `it`
nomeado equivalente (`ownerId` axis); 2 propriedades foram ABSORVIDAS PELO REDESENHO e não têm — nem
deveriam ter — um sucessor (o walk posicional-agnóstico e a semântica de batch deixaram de existir
como conceitos). Nenhum `it` foi deletado sem que sua propriedade estivesse coberta em algum lugar,
migrada de camada, ou genuinamente obsoleta pelo redesenho — o que satisfaz a checagem do Step T7.7,
com o detalhe (não estava no plano) de que duas correspondências são estruturais/por redesenho, não
`it`-a-`it`.

---

## (h) Observações que não viraram Task

Reproduzidas do plano (`## Notes`), nenhuma tocada por T9/T10 — fora do scope fence:

- **O1 (achado, absorvido, NÃO virou desvio silencioso).** O emitter publica `x-mcp-scope` em DOIS
  pontos, não um (`buildOperation` + `generateSpecification`). Ver E3 acima — confirmado nesta sessão.
- **O2 (achado, absorvido).** `context-map.ts`: seis `POLICY_EXCEPTIONS` migraram a justificativa de
  "declara a audiência" para "varre o static", junto com `manifest.ts` sendo apagado.
- **O3 (apertada nomeada, T5.4).** `OrchestratorAgent/prompt.ts` — destructuring posicional de
  `TOOLS_IN_SCOPE.orchestration[0]` virou `toolNameOf(ForkIssueController)`.
- **O4 (mudança observável declarada, D-F).** `AgentIdentityMiddleware` lança códigos do CORE
  (`UNAUTHORIZED`/`FORBIDDEN`) onde `RunTokenMiddleware` lançava códigos do CONTEXTO
  (`AGENT_RUN_TOKEN_INVALID`/`AGENT_RUN_SCOPE_MISMATCH`) — mesmos status HTTP, custo zero verificado
  (nenhum teste asseverava os códigos antigos no middleware; o adaptador continua lançando-os).
- **O5 (mudança de postura declarada, T7).** `AgentIdentityMiddleware` não é fail-closed (ao contrário
  do `RunTokenMiddleware`) — razão de escala, 23 dos 32 controllers expostos são leituras do console.
  A propriedade migrou para o `handle()` de `ForkIssue`.
- **O6 (observação, NÃO virou Task).** `AGENT_RUN_TOKEN_HEADER` × `MCP_RUN_TOKEN_HEADER` — duas
  declarações do mesmo byte, pinadas por asserção. Ver E4 acima — confirmado nesta sessão.
- **O7 (observação, NÃO virou Task).** A varredura por CLASSE não reproduz o sufixo multi-método de
  `buildOperationId` — mitigado por um `it` que vira vermelho se algum controller exposto ganhar um
  segundo método. Nenhum controller exposto hoje tem mais de um.
- **O8 (observação, NÃO virou Task).** `AgentIdentityService` é bindado em `shared/registry.ts`, não
  em `agent/registry.ts` — porque `Controller.executeMiddlewares` resolve pelo container RAIZ.
- **O9 (achado, verificado no T9.5, registrado — não corrigido).** `core/` e `<ctx>/mcp/**` são pontos
  cegos do `bun review` (`CLASSIFICATION_RULES` não casa nenhum dos dois). Ver E6 acima —
  reconfirmado nesta sessão com o comando exato do T9.5.
- **O-smoke (achado NOVO desta sessão de fechamento, não estava no plano).** O docstring de
  `phase6-mcp-smoke.ts:14` cita `RunTokenService` (nome morto) enquanto o código do mesmo arquivo já
  usa `AgentIdentityService` corretamente — comentário nunca atualizado durante T4/T7. Zero impacto
  funcional. Ver E8 para o achado relacionado (por que `tsc` nunca teria pego nem um erro de tipo
  real ali, quanto mais um comentário).
- **Follow-up de CLI** (`bun cli controller --mcp-scope=<scope>`). Descoberto ao escrever o plano:
  o scaffolder não emite `static mcpScopes` e não tem flag para isso. Ausência = exposição zero (o
  default seguro), mas a flag pouparia o próximo. **Não aberto nesta sessão** — decisão do founder,
  registrada aqui para não se perder.
- **Nenhuma Task deste plano tocou `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`, o stash, ou
  `packages/app/tauri/**`** — confirmado por `git status` limpo ao final desta sessão (ver retorno).

---

## Desvios do plano registrados

1. **Contagens de grep previstas como "vazio" que na verdade retornam docblocks/comentários
   históricos** — mesma classe de desvio que os artefatos do B3 e B4 já documentaram. Ver §(a).
2. **Uma colisão de substring genuína, não um resíduo**: `MCP_SCOPES_DIR` (constante viva,
   `packages/client/generators/typescript.ts`) casa o regex `MCP_SCOPES` do AC-2 sem ser o símbolo
   morto. Ver §(a).
3. **Os números de falseador do plano estão defasados em pelo menos dois pontos** — T3.5 (plano cita
   2 vermelhos, medido real é 5) e o T4.8 (o plano não antecipava que a variante literal seria
   vacuosa). Usados os números reais medidos nos lotes, por instrução explícita desta Task. Ver §(c).
4. **Um achado novo, fora do que o plano ou a Task pediam**: o docstring desatualizado em
   `phase6-mcp-smoke.ts:14` (cita `RunTokenService`) e o achado relacionado de que
   `packages/api/typescript/scripts/**` não é coberto por NENHUM tsconfig (o `tsconfig.json` aponta
   para um diretório-irmão inexistente). Ver E8/O-smoke. Registrado, não corrigido — fora do scope
   fence do T10.
5. **`bun detect` retorna exit 1** — não estava na lista de gates desta Task, rodado como bônus
   (mesmo padrão do B4). 6/6 detectores reportaram algo, somando 75 findings (37 + 33 + 3 + 2 nas
   quatro categorias com contagem própria — `SCW-*`, `CP-*`/component-props, `GPS-03`/projection-shape,
   `GEL-01`/go-enum-literals); todos pré-existentes e nenhum toca arquivo desta frente. Ver §(d),
   tabela de bônus.
