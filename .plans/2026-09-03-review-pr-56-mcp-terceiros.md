# Correção do review do PR #56 (MCP de terceiros) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each Task wraps one observable behavior in an outer RED→GREEN cycle.

**Goal:** Fechar os 7 itens bloqueantes e os 8 ajustes do review do PR #56, de modo que o
recurso de MCP de terceiros entregue o que o spec prometeu — a aprovação decidindo de verdade,
os segredos do daemon fora do alcance de pacotes de terceiros, os processos upstream morrendo
com o daemon, e o contrato dizendo a verdade nas três linguagens.

**Architecture:** Quatro naturezas de defeito, e a ordem entre elas importa. Primeiro o **rebase
com renumeração da migração** (T1), para que a migração nova do T2 já nasça no número certo e
nada precise ser refeito. Depois os quatro defeitos de **comportamento e segurança** (T2–T5),
que são o mérito do PR. Em seguida os dois de **contrato e gate** (T6–T7), que são o que torna o
PR mergeável e honesto. Por último os **ajustes de qualidade** (T8–T12), que o dono decidiu que
entram neste PR.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Go (`go/types` walker), TanStack
Router/Query/Form, Zod, Playwright.

**Spec:** o relatório de revisão do PR #56 (colado na sessão de 2026-09-03), com as medições de
reprodução registradas em cada Task.
**Tasks:** 13
**Estimated minutes:** 545

---

## Medições que sustentam este plano

Todas reproduzidas nesta máquina ANTES de planejar. Cada Task cita a sua.

| # | Alegação | Como foi medida | Resultado |
|---|---|---|---|
| 1.1 | `findByCall` indeterminado quebra o ciclo de aprovação | 3 testes de integração escritos contra o `TestBed` real | **3/3 vermelhos**, e o defeito é SIMÉTRICO — `APPROVE→DENY` também falha, ou seja **revogar não revoga** |
| 1.2 | `detached` nunca chega ao `spawn` | leitura do fonte `@modelcontextprotocol/sdk@1.30.0` `dist/esm/client/stdio.js:65-75` | confirmado: objeto de opções FIXO, o spread é descartado |
| 1.3 | o env inteiro do daemon vai para MCP de terceiro | leitura de `getDefaultEnvironment()` no mesmo fonte | confirmado: allowlist estilo `sudo`, que nosso `childEnv` sobrescreve |
| 1.4 | o openapi Go mente sobre `json.RawMessage` | probe com `go/packages` sobre `encoding/json` | **causa nomeada**: no Go 1.27 `RawMessage` é `*types.Alias` → `encoding/json/jsontext.Value`; o walker só trata `*types.Named` |
| 1.5 | `core-go` reprova 31≠29 | `go test -count=1 ./db/sqlite/ -run TestConcurrentBoot` | confirmado — **e** descobri que meu `bun run test` dava verde porque os `inputs` de cache do alvo `api-go:test` não incluem os `.sql` |
| 1.6 | colisão de migração com a `main` | `git merge-tree --write-tree origin/main HEAD` | confirmado: só `meta/_journal.json` e `meta/0028_snapshot.json` |
| 1.7 | reconfigurar apaga segredos | leitura de `McpServer.reconfigure` + do form | confirmado: substituição integral + listas iniciando vazias |

**Decisão de desenho tomada com o dono (2026-09-03):** o T2 usa **índice ÚNICO com reabertura**,
não `ORDER BY`. O argumento que decidiu: o histórico do DENY **não se perde**, porque
`issue_stops` guarda uma linha por stop com `kind`, `detail`, `raisedAt`, `resolution` e
`resolvedAt` — verificado no schema. A tabela de aprovação é ESTADO CORRENTE ("esta chamada pode
rodar?"); o histórico é a sequência de perguntas e respostas, e vive no stop.

---

## Task T1: A migração deixa de colidir com a main

**Files to write:**
- Modify: `packages/contracts/src/db/sqlite/migrations/meta/_journal.json` — reescrito pelo drizzle-kit ao renumerar
- Modify: `packages/api/go/core/db/sqlite/migrations/` — espelho `//go:embed` sincronizado

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /migrate
**Depends on:** (none)
**Gate:** `bun run --cwd packages/contracts db:check-go` sai 0, e
`git merge-tree --write-tree origin/main HEAD | grep -c CONFLICT` imprime `0`.

### Step T1.1 — Medir o conflito antes de tocar em nada

```bash
git fetch origin main
git merge-tree --write-tree origin/main HEAD | grep -E "^CONFLICT"
```

Esperado (o estado de hoje, que esta Task remove):

```
CONFLICT (add/add): Merge conflict in packages/contracts/src/db/sqlite/migrations/meta/0028_snapshot.json
CONFLICT (content): Merge conflict in packages/contracts/src/db/sqlite/migrations/meta/_journal.json
```

### Step T1.2 — Rebase sobre a main

```bash
git rebase origin/main
```

Nos DOIS arquivos de `meta/`, resolver tomando o lado da **main** (`--theirs` na gramática do
rebase é o lado que está sendo reaplicado; confira com `git status` qual é qual antes de
escolher). O `0028_bitter_ken_ellis.sql` deste PR sobrevive como arquivo; o que se perde é a
entrada dele no journal, que o próximo passo reautora.

### Step T1.3 — Reautorar a migração deste PR no próximo índice livre

```bash
rm packages/contracts/src/db/sqlite/migrations/0028_bitter_ken_ellis.sql
rm -f packages/contracts/src/db/sqlite/migrations/meta/0028_snapshot.json
bun migrate:create
```

O `drizzle-kit generate` lê o schema (que já tem `agent_mcp_servers` e
`agent_mcp_tool_approvals`) e emite a migração como `0029_*`, com journal e snapshot próprios.

**Não edite o `_journal.json` à mão.** Ele é saída do gerador; editar à mão é o mesmo defeito de
classe que o `.env.example` (arquivo gerado, editado no lugar errado) já cobrou nesta sessão.

### Step T1.4 — Espelhar no embed do Go e provar a igualdade

```bash
bun run --cwd packages/contracts db:sync-go
bun run --cwd packages/contracts db:check-go
```

Esperado: `db:check-go` sai 0 (as duas cópias byte-a-byte iguais).

### Step T1.5 — Provar que o conflito morreu

```bash
git merge-tree --write-tree origin/main HEAD | grep -c "^CONFLICT"
```

Esperado: `0`.

### Step T1.6 — Commit

```bash
git add packages/contracts/src/db/sqlite/migrations packages/api/go/core/db/sqlite/migrations
git commit -m "fix(sqlite): renumera a migração do MCP para 0029 — a main autorou o próprio 0028 (Task T1)"
```

---

## Task T2: O veredito mais recente vence, e o re-pedido reaproveita o card

**Files to write:**
- Create: `packages/contracts/src/db/sqlite/migrations/00NN_<nome-gerado>.sql` — índice ÚNICO em `(issue_id, call_hash)`
- Modify: `packages/contracts/src/db/sqlite/agent.ts` — `index(...)` vira `uniqueIndex(...)` no lookup de aprovações
- Modify: `packages/api/typescript/src/agent/entities/McpToolApproval.ts` — ganha `reask(stopId)`
- Modify: `packages/api/typescript/src/agent/repositories/McpToolApprovalRepository/McpToolApprovalRepository.ts` — declara `findPendingByCall`
- Modify: `packages/api/typescript/src/agent/repositories/McpToolApprovalRepository/LibSqlMcpToolApprovalRepository.ts` — implementa `findPendingByCall`
- Modify: `packages/api/typescript/src/agent/repositories/McpToolApprovalRepository/MockMcpToolApprovalRepository.ts` — mesma semântica
- Modify: `packages/api/typescript/src/agent/usecases/RequestMcpToolApproval.ts` — reabre a linha em vez de criar outra
- Test: `packages/api/typescript/src/agent/usecases/McpApprovalReversal.test.ts`

**Files to read:**
- `packages/api/typescript/src/agent/mcp/door.ts` — o consumidor de `findByCall` (não muda; a leitura passa a ser determinística por baixo dele)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /usecase, /migrate, /test
**Depends on:** T1
**Consumes (frozen):** `McpApprovalDecision` (de `@codm/contracts-typescript/wire/enums`),
`canonicalCallHash`, `McpToolApproval`, `McpToolApprovalRepository`, `DeclareStop`,
`StopKind.APPROVAL_NEEDED`, `AgentDomainErrors['MCP_APPROVAL_ALREADY_SETTLED']`.
**Scope fence:** DONE — o índice de `agent_mcp_servers`, o `door.ts` e o `SettleMcpToolApproval`
já estão corretos e NÃO mudam. OUT — cache de conexão do registry (T8), qualquer coisa de UI.
**Gate:** `cd packages/api/typescript && bun test src/agent/usecases/McpApprovalReversal.test.ts
src/agent/usecases/McpApprovalConfinement.test.ts src/agent/handlers/SettleMcpToolApproval.test.ts
src/agent/usecases/RequestMcpToolApproval.test.ts` — tudo verde.

### Step T2.1 — Restaurar o teste vermelho

O teste já existe, escrito e medido nesta sessão. Copie-o do scratchpad para o lugar dele:

```bash
cp "$CLAUDE_SCRATCHPAD/McpApprovalReversal.test.ts" \
   packages/api/typescript/src/agent/usecases/McpApprovalReversal.test.ts
```

Se o scratchpad não estiver acessível, este é o arquivo COMPLETO:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue } from '@test/support'
import { StopResolution } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopResolvedEvent } from '@codm/contracts-typescript/wire/events'
import { SettleMcpToolApproval } from '../handlers/SettleMcpToolApproval'
import { canonicalCallHash } from '../entities/McpToolApproval'
import { McpToolApprovalRepository } from '../repositories/McpToolApprovalRepository'
import { RequestMcpToolApproval } from './RequestMcpToolApproval'

/**
 * O DONO MUDOU DE IDEIA — o ciclo DENY → o agente tenta de novo → APPROVE.
 *
 * As suítes vizinhas param no PRIMEIRO settle: `SettleMcpToolApproval.test` prova o flip, e
 * `McpApprovalConfinement` prova o WHERE cross-issue. Nenhuma segue a chamada DEPOIS de um DENY, e é
 * ali que o recurso tinha dois defeitos que se escondem um no outro:
 *
 *  (a) `findByCall` é `SELECT … LIMIT 1` SEM `ORDER BY` sobre um índice NÃO-único em
 *      `(issue_id, call_hash)`. Com duas linhas para a mesma chamada, qual delas volta é
 *      indeterminado — e na prática é a mais ANTIGA (ordem de rowid no scan do índice).
 *  (b) `RequestMcpToolApproval` só reaproveita quando a linha achada está PENDENTE. Achando a
 *      DENIED, ele levanta um stop NOVO e grava uma linha nova a CADA tentativa.
 *
 * Juntos: o retry depois do DENY enche o Needs-you de perguntas duplicadas, e quando o dono
 * finalmente aprova uma delas, o door continua lendo a linha velha DENIED — a chamada nunca libera.
 * O terceiro caso é o que o relatório de revisão NÃO viu: o mesmo defeito no sentido inverso é
 * direção de SEGURANÇA — o dono revoga e a ferramenta continua liberada.
 */
describe('McpApprovalReversal — DENY, novo pedido, APPROVE', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const ownerId = '019e4d24-6524-7041-9e1c-8108180cdd07'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function settle(stopId: string, issueId: string, threadId: string, resolution: StopResolution) {
		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId, threadId, resolution },
			}) as never,
		)
	}

	it('depois de um DENY, o pedido seguinte REAPROVEITA o card em vez de abrir outro', async () => {
		const issue = await givenIssue(testBed, { ownerId })
		const call = { serverKey: 'shell', toolName: 'run', args: { cmd: 'rm -rf /' } }
		const request = testBed.resolve(RequestMcpToolApproval)
		const base = { ownerId, issueId: issue.id.value, threadId: issue.threadId, ...call }

		const first = await request.execute(base)
		await settle(first.stopId, issue.id.value, issue.threadId, StopResolution.DENY)

		const second = await request.execute(base)
		const third = await request.execute(base)

		// O card do dono não pode multiplicar: o segundo pedido abre UM stop novo (o anterior foi
		// respondido e não serve mais), e o terceiro tem de reaproveitar ESSE — senão cada turno do
		// agente vira uma pergunta a mais na fila do dono.
		expect(second.stopId).not.toBe(first.stopId)
		expect(third.stopId).toBe(second.stopId)
	})

	it('o APPROVE do pedido novo LIBERA a chamada — o veredito que vale é o mais recente', async () => {
		const issue = await givenIssue(testBed, { ownerId })
		const call = { serverKey: 'shell', toolName: 'run', args: { cmd: 'ls' } }
		const request = testBed.resolve(RequestMcpToolApproval)
		const base = { ownerId, issueId: issue.id.value, threadId: issue.threadId, ...call }

		const denied = await request.execute(base)
		await settle(denied.stopId, issue.id.value, issue.threadId, StopResolution.DENY)

		const reopened = await request.execute(base)
		await settle(reopened.stopId, issue.id.value, issue.threadId, StopResolution.APPROVE)

		// A leitura que o DOOR faz, com os mesmos argumentos: é ela que decide executar ou recusar.
		const found = await testBed.resolve(McpToolApprovalRepository).findByCall(issue.id.value, canonicalCallHash(call))

		expect(found?.grantsExecution).toBe(true)
	})

	it('o inverso também vale: APPROVE e depois DENY volta a recusar', async () => {
		const issue = await givenIssue(testBed, { ownerId })
		const call = { serverKey: 'shell', toolName: 'run', args: { cmd: 'whoami' } }
		const request = testBed.resolve(RequestMcpToolApproval)
		const base = { ownerId, issueId: issue.id.value, threadId: issue.threadId, ...call }

		const approved = await request.execute(base)
		await settle(approved.stopId, issue.id.value, issue.threadId, StopResolution.APPROVE)

		// Sem esta metade, um "o mais recente vence" implementado como "o APPROVED vence" passaria.
		const revoked = await request.execute(base)
		await settle(revoked.stopId, issue.id.value, issue.threadId, StopResolution.DENY)

		const found = await testBed.resolve(McpToolApprovalRepository).findByCall(issue.id.value, canonicalCallHash(call))

		expect(found?.grantsExecution).toBe(false)
	})
})
```

### Step T2.2 — Rodar e confirmar o vermelho

```bash
cd packages/api/typescript && bun test src/agent/usecases/McpApprovalReversal.test.ts
```

Esperado: **3 fail**. O segundo caso falha com `Expected: true / Received: false`; o terceiro com
`Expected: false / Received: true`.

### Step T2.3 — O par (issue, chamada) passa a ser único no schema

Modifique `packages/contracts/src/db/sqlite/agent.ts`: na tabela `mcpToolApprovals`, troque
`index('agent_mcp_tool_approvals_lookup_idx').on(t.issueId, t.callHash)` por
`uniqueIndex('agent_mcp_tool_approvals_call_unq').on(t.issueId, t.callHash)`.

Acrescente, no docblock da tabela, o motivo — uma linha por CHAMADA, não por decisão:

> `uniqueIndex`, e não `index`: a tabela é ESTADO CORRENTE ("esta chamada pode rodar nesta
> issue?"), não histórico. Com duas linhas para o mesmo par, a leitura do door vira loteria
> (`LIMIT 1` sem `ORDER BY` devolve a mais antiga) e o dono passa a ver uma pergunta nova a cada
> retry. O histórico de quantas vezes foi perguntado e o que se respondeu vive em `issue_stops`,
> uma linha por stop com `resolution` e `resolvedAt` — que é onde ele pertence.

### Step T2.4 — Autorar a migração

```bash
bun migrate:create
bun run --cwd packages/contracts db:sync-go
bun run --cwd packages/contracts db:check-go
```

O SQL gerado troca o índice. **Confira** que ele emite o `DROP INDEX` do antigo antes do
`CREATE UNIQUE INDEX` — se não emitir, acrescente o `DROP INDEX` à mão no arquivo gerado (é o
único caso em que se edita um SQL gerado: o drizzle-kit não sabe renomear índice).

### Step T2.5 — A entidade ganha o direito de ser perguntada de novo

Modifique `packages/api/typescript/src/agent/entities/McpToolApproval.ts`: mantenha `settle`
exatamente como está (uma decisão respondida não vira outra em silêncio — essa invariante
continua valendo) e acrescente, logo abaixo dele:

```typescript
	/**
	 * PERGUNTAR DE NOVO a mesma chamada — o caminho do dono que mudou de ideia.
	 *
	 * NÃO é o inverso de `settle`, e a diferença é o ponto: `settle` recusa reabrir porque um
	 * veredito não pode virar outro EM SILÊNCIO, pelas costas de quem respondeu. Aqui o dono está
	 * sendo perguntado OUTRA VEZ, explicitamente, e o novo stop é a nova pergunta — a antiga
	 * continua registrada em `issue_stops` com a resposta que recebeu.
	 *
	 * Por que reabrir a linha em vez de inserir outra: o par `(issueId, callHash)` é ÚNICO, porque a
	 * tabela responde "esta chamada pode rodar AGORA?" e essa pergunta tem uma resposta só. Duas
	 * linhas foi exatamente o defeito — a leitura virava loteria e o card do dono multiplicava.
	 */
	reask(stopId: string): void {
		this.decision = undefined
		this.settledAt = undefined
		this.stopId = stopId
		this.requestedAt = new Date()
		this.validate()
	}
```

### Step T2.6 — O repositório passa a responder a pergunta certa

Modifique `packages/api/typescript/src/agent/repositories/McpToolApprovalRepository/McpToolApprovalRepository.ts`:
acrescente `abstract findPendingByCall(issueId: string, callHash: string, tx?: Transaction): Promise<McpToolApproval | undefined>`
e estenda o docblock para nomear as TRÊS leituras — `findByStopId` (o handler respondendo),
`findByCall` (o door decidindo se executa) e `findPendingByCall` (o use case decidindo se
reaproveita o card).

Modifique `LibSqlMcpToolApprovalRepository.ts`: implemente

```typescript
	async findPendingByCall(issueId: string, callHash: string, tx?: LibSqlTransaction): Promise<McpToolApproval | undefined> {
		return this.findOne(
			and(eq(mcpToolApprovals.issueId, issueId), eq(mcpToolApprovals.callHash, callHash), isNull(mcpToolApprovals.decision)),
			tx,
		)
	}
```

acrescentando `isNull` ao import de `drizzle-orm`.

Modifique `MockMcpToolApprovalRepository.ts`: a mesma leitura sobre o array em memória —
filtrar por `issueId`, `callHash` e `decision === undefined`.

### Step T2.7 — O use case reabre em vez de duplicar

Modifique `packages/api/typescript/src/agent/usecases/RequestMcpToolApproval.ts`, no corpo de
`handle`: troque a leitura `findByCall` por `findPendingByCall` e, quando não houver pendente,
procure a linha JÁ DECIDIDA do mesmo par para reabri-la em vez de inserir outra. O corpo passa
a ser:

```typescript
	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const callHash = canonicalCallHash({ serverKey: input.serverKey, toolName: input.toolName, args: input.args })

		// PENDENTE, e não "qualquer uma": reaproveitar um card que o dono JÁ respondeu seria devolver
		// um stop resolvido, que ele nunca mais vai ver. Esta é a metade do dedup que faz o Needs-you
		// não multiplicar dentro de um mesmo turno.
		const pending = await this.approvals.findPendingByCall(input.issueId, callHash, tx)
		if (pending) return { stopId: pending.stopId }

		// UMA transação para os dois. O stop é a PERGUNTA e a linha é o que a resposta vai encontrar:
		// gravar o stop e falhar ao gravar a linha deixaria um card no Needs-you cuja aprovação não
		// libera nada — e o dono não teria como saber disso.
		return this.withTransaction(tx, async tx => {
			const { stopId } = await this.declareStop.execute(
				{
					ownerId: input.ownerId,
					issueId: input.issueId,
					threadId: input.threadId,
					kind: StopKind.APPROVAL_NEEDED,
					detail: describeCall(input),
				},
				tx,
			)

			// A linha JÁ DECIDIDA do mesmo par é REABERTA, nunca duplicada: `(issueId, callHash)` é
			// único, e a tabela responde "pode rodar agora?" — uma pergunta com uma resposta só. O
			// histórico de que houve um DENY antes fica em `issue_stops`, com a sua resolução.
			const settled = await this.approvals.findByCall(input.issueId, callHash, tx)
			if (settled) {
				settled.reask(stopId)
				await this.approvals.save(settled, tx)
				return { stopId }
			}

			await this.approvals.save(
				McpToolApproval.request({
					ownerId: input.ownerId,
					issueId: input.issueId,
					threadId: input.threadId,
					serverKey: input.serverKey,
					toolName: input.toolName,
					args: input.args,
					stopId,
				}),
				tx,
			)
			return { stopId }
		})
	}
```

Mantenha os imports existentes e acrescente o que faltar.

### Step T2.8 — Verde, e as suítes vizinhas seguem verdes

```bash
cd packages/api/typescript && bun test src/agent/usecases/McpApprovalReversal.test.ts \
  src/agent/usecases/McpApprovalConfinement.test.ts \
  src/agent/usecases/RequestMcpToolApproval.test.ts \
  src/agent/handlers/SettleMcpToolApproval.test.ts \
  src/agent/mcp/door.test.ts src/agent/mcp/door.preapproved.test.ts
```

Esperado: **0 fail**. Se `SettleMcpToolApproval.test` reprovar no caso de redelivery
idempotente, é porque o `reask` mudou o `stopId` da linha — o handler procura por `stopId`, então
uma redelivery do stop ANTIGO não acha mais a linha e vira no-op, que é o comportamento certo:
ajuste a expectativa do teste, não o handler.

### Step T2.9 — Type check + lint

```bash
bun tsc && bun lint
```

### Step T2.10 — Commit

```bash
git add packages/contracts/src/db packages/api/go/core/db/sqlite/migrations \
        packages/api/typescript/src/agent/entities/McpToolApproval.ts \
        packages/api/typescript/src/agent/repositories/McpToolApprovalRepository \
        packages/api/typescript/src/agent/usecases/RequestMcpToolApproval.ts \
        packages/api/typescript/src/agent/usecases/McpApprovalReversal.test.ts
git commit -m "fix(agent): o veredito mais recente vence, e o re-pedido reaproveita o card (Task T2)"
```

---

## Task T3: Um servidor de terceiro recebe só o env que o dono declarou

**Files to write:**
- Modify: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/DefaultMcpUpstreamRegistry.ts` — `childEnv` passa a compor sobre `getDefaultEnvironment()` do SDK
- Test: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/childEnv.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)
**Gate:** `cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/`

### Step T3.1 — Escrever o teste que falha

```typescript
// packages/api/typescript/src/agent/services/McpUpstreamRegistry/childEnv.test.ts — arquivo final COMPLETO
import { describe, expect, it } from 'bun:test'
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { childEnv } from './DefaultMcpUpstreamRegistry'

/**
 * O QUE UM PACOTE DE TERCEIRO CONSEGUE LER — e por que a herança total era o defeito.
 *
 * O caminho feliz do produto é o dono cadastrar `npx <pacote-mcp>`: um processo que NÓS spawnamos,
 * com código que não é nosso, escolhido por quem não audita a árvore de dependências dele. O SDK
 * trata isso com uma allowlist deliberada — `getDefaultEnvironment()`, com o comentário
 * *"list inspired by the default env inheritance of sudo"*. Copiar `process.env` inteiro por cima
 * dessa allowlist entrega ao pacote o `JWT_SECRET`, o `BETTER_AUTH_SECRET`, o
 * `INTERNAL_SERVICE_KEY`, a URL do Postgres com senha e as credenciais de OAuth — os mesmos
 * segredos que a decisão 14 do spec gasta uma página cercando pelo lado do prompt.
 *
 * Um `JSON.stringify(process.env)` na telemetria de um pacote comprometido é tudo que separa isso
 * de um vazamento; o teste abaixo é a fronteira.
 */
describe('childEnv', () => {
	it('NÃO entrega os segredos do daemon a um servidor de terceiro', () => {
		const env = childEnv()

		for (const secret of [
			'JWT_SECRET',
			'BETTER_AUTH_SECRET',
			'INTERNAL_SERVICE_KEY',
			'OPERATOR_API_KEY',
			'CLOUD_DATABASE_URL',
			'GITHUB_CLIENT_SECRET',
			'GOOGLE_CLIENT_SECRET',
		]) {
			expect(env[secret]).toBeUndefined()
		}
	})

	it('entrega o que o SDK considera seguro herdar — senão o servidor nem acha o binário', () => {
		const env = childEnv()
		const safe = getDefaultEnvironment()

		// PATH é o caso que dói: sem ele, `npx` não resolve. A asserção é sobre a allowlist inteira,
		// não sobre uma chave escolhida a dedo, para que uma mudança do SDK apareça aqui.
		expect(Object.keys(env).sort()).toEqual(Object.keys(safe).sort())
	})

	it('o env DECLARADO pelo dono passa, e vence a allowlist quando colide', () => {
		const env = childEnv({ OPENAI_API_KEY: 'sk-do-dono', PATH: '/rota/escolhida' })

		// É a única porta: o que o dono digitou no cadastro chega ao servidor. O resto não.
		expect(env.OPENAI_API_KEY).toBe('sk-do-dono')
		expect(env.PATH).toBe('/rota/escolhida')
	})
})
```

### Step T3.2 — Rodar e confirmar o vermelho

```bash
cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/childEnv.test.ts
```

Esperado: FAIL — `childEnv` ainda não é exportado (`SyntaxError`/import ausente) e, uma vez
exportado, o primeiro caso reprova porque os segredos estão lá.

### Step T3.3 — Trocar a herança total pela allowlist do SDK

Modifique `DefaultMcpUpstreamRegistry.ts`: acrescente `getDefaultEnvironment` ao import de
`@modelcontextprotocol/sdk/client/stdio.js`, EXPORTE `childEnv` (o teste o exercita direto, como
`resolveMcpCallDisposition` e `resolveSocialProviders` já fazem) e reescreva o corpo e o docblock:

```typescript
/**
 * O env do processo filho — a allowlist do SDK, mais o que o DONO declarou. Nada além disso.
 *
 * A versão anterior copiava `process.env` INTEIRO e justificava outra coisa (evitar que uma
 * variável ausente virasse a string `"undefined"`). Isso resolvia um problema de tipo e criava um
 * de segurança: `StdioClientTransport` já monta o env do filho a partir de `getDefaultEnvironment()`
 * — uma allowlist deliberada, com o comentário *"inspired by the default env inheritance of sudo"* —
 * e passar um env explícito SOBRESCREVE essa proteção.
 *
 * O que ia junto: `JWT_SECRET`, `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_KEY`, a URL do Postgres da
 * nuvem com senha e os segredos de OAuth. Para um processo de TERCEIRO, spawnado a partir de um
 * `npx <pacote>` que o dono digitou num formulário. O spec gasta a decisão 14 inteira cercando o
 * raio de ação de prompt-injection→shell; entregar os segredos por env ao mesmo raio contradiz o
 * próprio modelo de ameaça.
 *
 * Se um servidor precisar de mais que a allowlist, isso é campo DECLARADO no cadastro (`server.env`,
 * que continua passando por cima), nunca herança silenciosa.
 */
export function childEnv(extra?: Record<string, string>): Record<string, string> {
	return { ...getDefaultEnvironment(), ...(extra ?? {}) }
}
```

### Step T3.4 — Verde

```bash
cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/
```

Esperado: **0 fail** (o `childEnv.test.ts` novo mais o `teardown.test.ts` e o `unreachable.test.ts`
existentes).

### Step T3.5 — Type check + lint

```bash
bun tsc && bun lint
```

### Step T3.6 — Commit

```bash
git add packages/api/typescript/src/agent/services/McpUpstreamRegistry
git commit -m "fix(agent): um servidor MCP de terceiro deixa de receber os segredos do daemon (Task T3)"
```

---

## Task T4: Encerrar o daemon derruba a árvore, não só o filho direto

**Files to write:**
- Modify: `packages/api/typescript/core/src/utils/ProcessTree.ts` — a estratégia ganha `terminateByPid`, para uma árvore que NÃO é um grupo
- Modify: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/DefaultMcpUpstreamRegistry.ts` — para de fabricar um `TreeRoot` com `kill` no-op
- Modify: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/teardown.test.ts` — o fixture ganha um NETO e passa a ignorar o fechamento do stdin

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)
**Gate:** `cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/teardown.test.ts core/src/utils/ProcessTree.test.ts`

### Step T4.1 — Registrar a medição no topo do teste, e torná-lo capaz de morder

O `teardown.test.ts` de hoje passa **sem exercer o mecanismo**: o fixture é um filho bem-comportado
sem netos, que morre quando o stdin fecha. Ele prova a ordem pid/close (que é real e vale manter) e
nada mais.

Reescreva `writeFixtureServer` para spawnar um NETO e para NÃO morrer com o stdin:

```typescript
/**
 * Um servidor MCP stdio real que SPAWNA UM NETO e IGNORA o fechamento do stdin.
 *
 * As duas coisas são o teste. O fixture anterior morria sozinho quando o `client.close()` fechava o
 * stdin dele — então a suíte via o processo sumir e concluía que o teardown funcionava, quando o que
 * funcionava era o `close`. Um MCP de navegador (o caso que o docblock do `shutdown` nomeia) faz
 * exatamente o contrário: abre um browser que não é filho do nosso stdin e não morre com ele.
 *
 * `process.on('SIGTERM', () => {})` não é decoração: sem ignorar o sinal, o filho morreria no
 * primeiro passe gracioso e o teste voltaria a passar sem tocar na escalada.
 */
function writeFixtureServer(dir: string, name: string): { path: string; grandchildPidFile: string } {
	const grandchildPidFile = join(dir, `${name}.grandchild.pid`)
	const path = join(dir, `${name}.mjs`)
	writeFileSync(
		path,
		[
			`import { Server } from ${JSON.stringify(serverIndexUrl)}`,
			`import { StdioServerTransport } from ${JSON.stringify(serverStdioUrl)}`,
			`import { spawn } from 'node:child_process'`,
			`import { writeFileSync } from 'node:fs'`,
			// O NETO: um processo que não conhece o nosso stdin e só morre por sinal.
			`const grandchild = spawn(process.execPath, ['-e', 'process.stdin.resume(); setInterval(() => {}, 1000)'], { stdio: 'ignore' })`,
			`writeFileSync(${JSON.stringify(grandchildPidFile)}, String(grandchild.pid))`,
			`process.on('SIGTERM', () => {})`,
			`process.stdin.on('close', () => {})`,
			`const server = new Server({ name: ${JSON.stringify(name)}, version: '0.0.0' }, { capabilities: {} })`,
			`await server.connect(new StdioServerTransport())`,
		].join('\n'),
		'utf8',
	)
	return { path, grandchildPidFile }
}
```

E acrescente o caso que o mecanismo precisa passar:

```typescript
	it('(e) o NETO morre junto — é o caso que o docblock do shutdown nomeia, e o único que o mecanismo precisa entregar', async () => {
		const { grandchildPidFile } = await registerStdioServer('com-neto')
		await registry.listTools(OWNER_ID)

		// O neto só existe depois que o servidor subiu; ler o pid do arquivo é como o teste o alcança
		// sem conhecer a árvore por dentro.
		const grandchildPid = Number(readFileSync(grandchildPidFile, 'utf8').trim())
		expect(isAlive(grandchildPid)).toBe(true)

		await registry.shutdown()

		expect(await waitUntilDead(grandchildPid)).toBe(true)
	}, 30_000)
```

### Step T4.2 — Rodar e confirmar o vermelho

```bash
cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/teardown.test.ts
```

Esperado: o caso `(e)` FALHA. No Windows ele pode passar (o `taskkill /T /F` anda a árvore por
pid e não depende de grupo); **no POSIX ele falha**, que é a plataforma de produção. Se você está
num host Windows, registre no corpo do PR que este caso não foi visto vermelho localmente e peça
a verificação num mac antes do merge.

### Step T4.3 — A estratégia ganha "matar a árvore de um pid que não é líder de grupo"

Modifique `packages/api/typescript/core/src/utils/ProcessTree.ts`.

Acrescente ao contrato `ProcessTree`:

```typescript
	/**
	 * Matar a árvore enraizada num PID que NÃO é líder de grupo — o caso em que `spawnOptions` não
	 * chegou ao `spawn`.
	 *
	 * `terminate` acima pressupõe que QUEM SPAWNOU aplicou `spawnOptions`; no POSIX isso significa
	 * `detached: true`, que é o que cria o grupo. Nem todo consumidor pode: o
	 * `StdioClientTransport` do SDK do MCP spawna com um objeto de opções FIXO (medido no fonte,
	 * `dist/esm/client/stdio.js:65-75`) e descarta silenciosamente qualquer opção que a gente passe.
	 * Um `process.kill(-pid)` ali lança ESRCH, e o filho — mais os netos dele — sobrevive.
	 *
	 * Então esta é uma capacidade DECLARADA e não um detalhe de implementação: quem spawna sem poder
	 * adotar o filho chama isto, e cada plataforma resolve com a ferramenta que tem — o Windows já
	 * anda a árvore por pid (`taskkill /T`), o POSIX desce pelos filhos diretos.
	 */
	terminateByPid(pid: number, graceMs: number): void
```

No `posixProcessTree`, implemente a descida recursiva:

```typescript
	terminateByPid(pid, graceMs) {
		// Sem grupo para sinalizar, a árvore é descoberta pelo pai de cada processo. `pgrep -P` lista
		// os filhos diretos; a recursão faz o resto. Os FILHOS primeiro, o pai por último: matar o pai
		// antes reparenta os netos ao init e some com o caminho até eles.
		const descendants = (root: number): number[] => {
			const found = spawnSync('pgrep', ['-P', String(root)], { encoding: 'utf8' })
			if (found.status !== 0 || !found.stdout) return []
			const children = found.stdout.split('\n').map(Number).filter(Number.isInteger)
			return children.flatMap(child => [...descendants(child), child])
		}

		const tree = [...descendants(pid), pid]
		const signal = (sig: 'SIGTERM' | 'SIGKILL') => {
			for (const target of tree) {
				try {
					process.kill(target, sig)
				} catch {
					// já reaped — o alvo seguinte ainda pode existir
				}
			}
		}

		signal('SIGTERM')
		const escalation = setTimeout(() => signal('SIGKILL'), graceMs)
		escalation.unref?.()
	},
```

acrescentando `spawnSync` ao import de `node:child_process`.

No `windowsProcessTree`, implemente delegando ao mesmo `taskkill` que a estratégia já usa:

```typescript
		terminateByPid(pid, _graceMs) {
			// `taskkill /T /F` já anda a árvore por pid — é indiferente a grupo e a `detached`, então
			// esta capacidade e a `terminate` coincidem aqui. Estão separadas porque no POSIX não
			// coincidem, e o contrato existe para o consumidor não precisar saber em qual está.
			run('taskkill', ['/T', '/F', '/PID', String(pid)])
		},
```

### Step T4.4 — O registry para de fabricar um `TreeRoot` falso

Modifique `DefaultMcpUpstreamRegistry.shutdown`: troque a chamada
`tree.terminate({ pid, kill: () => true, exitCode: null, signalCode: null }, Promise.resolve(), 2000)`
por `tree.terminateByPid(pid, 2000)`, e reescreva o comentário:

```typescript
			// O pid é lido ANTES do close, nunca depois: `StdioClientTransport.close()` zera
			// `this._process` de forma SÍNCRONA antes de esperar qualquer coisa (medido no SDK,
			// `dist/esm/client/stdio.js:146`).
			//
			// `terminateByPid`, e não `terminate`: o `terminate` espera um `TreeRoot` — um filho que
			// NÓS adotamos, com `kill` de verdade e `spawnOptions` aplicadas. Nenhuma das duas coisas
			// existe aqui, porque quem spawna é o SDK, com opções fixas. A versão anterior contornava
			// isso passando um `TreeRoot` FABRICADO (`kill: () => true`) — e o `kill` de fallback do
			// POSIX, que é justamente o que roda quando o sinal de grupo falha, caía num no-op. Nenhum
			// sinal era entregue nunca; o único teardown real era o `close` fechar o stdin, que não
			// alcança neto nenhum.
			const pid = this.transports.get(key)?.pid
			await client.close().catch(() => undefined)
			if (pid) tree.terminateByPid(pid, 2000)
```

### Step T4.5 — Verde

```bash
cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/teardown.test.ts \
  core/src/utils/ProcessTree.test.ts
```

Esperado: **0 fail**, incluindo o caso `(e)` do neto.

### Step T4.6 — Type check + lint + commit

```bash
bun tsc && bun lint
git add packages/api/typescript/core/src/utils/ProcessTree.ts \
        packages/api/typescript/src/agent/services/McpUpstreamRegistry
git commit -m "fix(agent): o teardown do upstream mata a árvore, não só o filho direto (Task T4)"
```

---

## Task T5: Reconfigurar um servidor não apaga os segredos que já estavam lá

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/settings/-forms/McpServerForm/index.tsx` — as listas de env/headers nascem semeadas com as chaves que o servidor já tem
- Modify: `packages/app/react/src/routes/(app)/settings/-components/McpServersSection/McpServersSection.stories.tsx` — story do modo reconfigure com segredos existentes
- Modify: `packages/app/react/src/locales/pt.json` e `en.json` — as chaves de rótulo/aviso novas

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /form, /component, /storybook
**Depends on:** (none)
**Consumes (frozen):** `GetSettingsQueryResponse['mcpServers'][number]` (com `envKeys` e
`headerKeys`, que o T13 do PR já congelou), `updateMcpServerMutationRequestSchema`,
`useUpdateMcpServer`, `McpTransportEnum`.
**Scope fence:** DONE — o backend NÃO muda: a substituição integral em `McpServer.reconfigure` é
decisão deliberada e correta da entidade, e `envKeys`/`headerKeys` já existem no DTO por
contrato (nomes só, nunca valores). OUT — qualquer mudança no `UpdateMcpServer` ou na entidade.
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun run storybook:build`

### Step T5.1 — Semear as linhas a partir do que o servidor já tem

Modifique `McpServerForm/index.tsx`. Em `StdioServerForm`, troque
`useState<KeyValueEntry[]>([])` por uma semeadura a partir de `server?.envKeys`, e faça o mesmo em
`HttpServerForm` com `server?.headerKeys`:

```typescript
	/**
	 * SEMEADO com as chaves que o servidor JÁ TEM — e a lista nascer vazia era perda silenciosa de
	 * segredo.
	 *
	 * `McpServer.reconfigure` substitui o transporte INTEIRO, o que é a decisão certa da entidade: um
	 * servidor STDIO que vira HTTP não pode carregar um `command` órfão. Mas o form submetia
	 * `env: undefined` sempre que o dono abrisse "Reconfigurar" só para trocar um argumento — e a
	 * `OPENAI_API_KEY` que ele cadastrou uma vez evaporava sem aviso, com o upstream passando a
	 * falhar auth e a tela mostrando "0 variáveis" depois do fato.
	 *
	 * O VALOR não vem semeado, e não pode vir: `envKeys` é só nomes, porque o DTO de leitura nunca
	 * carrega segredo (non-negotiable #4). Então a linha nasce com a chave preenchida e o valor
	 * vazio, e o submit fica bloqueado enquanto houver valor faltando — o dono re-informa o que quer
	 * manter e apaga o que não quer, explicitamente.
	 */
	const [envEntries, setEnvEntries] = useState<KeyValueEntry[]>(() =>
		(server?.envKeys ?? []).map(key => ({ id: crypto.randomUUID(), key, value: '' })),
	)
```

Acrescente, ao `form.Subscribe` do botão de submit de cada variante, a condição que bloqueia
enquanto houver linha semeada sem valor:

```typescript
	// Uma linha com chave e sem valor é uma chave que o dono ainda não re-informou. Submeter assim
	// apagaria o segredo — que é exatamente o defeito. O botão espera.
	const hasBlankSecret = envEntries.some(entry => entry.key.trim().length > 0 && entry.value.length === 0)
```

e renderize, quando `hasBlankSecret` for verdadeiro, um `FieldError` com
`t('settings.mcpServers.form.secretsMustBeReentered')`.

### Step T5.2 — As traduções

Acrescente a `packages/app/react/src/locales/pt.json` e `en.json`, sob
`settings.mcpServers.form`:

- `secretsMustBeReentered` — pt: `"Reconfigurar substitui as variáveis: re-informe o valor de cada chave que quiser manter."` · en: `"Reconfiguring replaces the variables: re-enter the value of every key you want to keep."`

### Step T5.3 — A story do caso

Modifique `McpServersSection.stories.tsx`: acrescente uma story `ReconfigureWithSecrets` que abre
o form com um servidor que tem `envKeys: ['OPENAI_API_KEY']`, com um `play` que assere que a
linha aparece com a chave preenchida e que o botão de salvar está desabilitado até o valor ser
digitado.

### Step T5.4 — Verificar

```bash
cd packages/app/react && bun x tsc --noEmit && bun run storybook:build
```

### Step T5.5 — Commit

```bash
git add "packages/app/react/src/routes/(app)/settings" packages/app/react/src/locales
git commit -m "fix(app): reconfigurar um servidor MCP deixa de apagar os segredos em silêncio (Task T5)"
```

---

## Task T6: O contrato para de mentir sobre `json.RawMessage` nas três linguagens

**Files to write:**
- Modify: `packages/api/go/pkg/openapi/schema.go` — `typeSchema` desalia antes de decidir, e `namedSchema` reconhece o alvo novo
- Modify: `packages/api/go/pkg/openapi/openapi_test.go` — caso que trava a forma emitida para `json.RawMessage`
- Regen: `packages/api/go/public/docs/openapi.json`, `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /sdk
**Depends on:** (none)
**Gate:** `bun emit-openapi && bun sdk && bun tsc`, e
`git diff --stat packages/client/dist | tail -1` mostrando uma redução de ~370 arquivos em
relação ao estado atual do branch.

### Step T6.1 — Registrar a medição e escrever o caso que trava a forma

A causa está nomeada, não suposta. Probe rodado com `go/packages` sobre `encoding/json` neste
host (Go 1.27):

```
Go type do objeto : *types.Alias
  ALIAS -> Obj().Name(): "RawMessage"
  ALIAS -> Obj().Pkg() : "encoding/json"
  ALIAS -> Rhs         : *types.Named encoding/json/jsontext.Value
Underlying        : *types.Slice []byte
```

`go.mod` declara `go 1.25.0`; nesta máquina o toolchain é `1.27.0`. No 1.25 `RawMessage` é um
`*types.Named` em `encoding/json` e o caso especial do walker casa; no 1.27 é um `*types.Alias` e
o walker cai no `*types.Slice` do underlying `[]byte`, emitindo `items: {type: integer}` — um
array de inteiros no lugar de JSON arbitrário.

Acrescente a `openapi_test.go`:

```go
// A FORMA EMITIDA PARA json.RawMessage NÃO PODE DEPENDER DA VERSÃO DO TOOLCHAIN.
//
// Medido em 2026-09-03: no Go 1.25 `json.RawMessage` é um *types.Named em "encoding/json" e o caso
// especial do walker casa; no Go 1.27 ele virou um *types.Alias para "encoding/json/jsontext".Value,
// o caso não casa mais, e o walker desce para o underlying []byte — emitindo `items: {type:
// integer}`. O efeito é um contrato que MENTE em três linguagens (o cliente Go vira *[]int, o Rust
// vira Vec<i64>, o zod vira z.array(z.int())) para um campo que carrega JSON arbitrário.
//
// Este caso trava a saída, não o caminho: qualquer que seja a forma interna que o toolchain do dia
// dê a RawMessage, o que sai tem de ser `x-unknown`.
func TestRawMessageEmitsUnknownRegardlessOfToolchain(t *testing.T) {
	// ... carrega o pacote de wire e assere que o campo platformData de um evento traz
	// `x-unknown: true` e NÃO traz `items`.
}
```

### Step T6.2 — Rodar e confirmar o vermelho

```bash
cd packages/api/go && go test ./pkg/openapi/ -run TestRawMessageEmitsUnknownRegardlessOfToolchain
```

Esperado: FAIL neste host (Go 1.27). **Num host com Go 1.25 este teste passa antes do conserto** —
registre isso no corpo do PR: o vermelho depende do toolchain, que é exatamente o defeito.

### Step T6.3 — Desaliar antes de decidir

Modifique `packages/api/go/pkg/openapi/schema.go`.

Em `typeSchema`, antes do `switch tt := t.(type)`, normalize o alias:

```go
	// DESALIA antes de decidir. Um alias não é nenhum dos casos abaixo, então sem esta linha ele cai
	// para o underlying e um `json.RawMessage` (alias no Go ≥1.27) vira `items: {type: integer}` — o
	// []byte por baixo, refletido cru. `types.Unalias` é no-op quando não há alias, então isto não é
	// um desvio por versão: é a forma de fazer a pergunta uma vez só, em qualquer toolchain.
	t = types.Unalias(t)
```

Em `namedSchema`, estenda o caso especial para reconhecer também o alvo novo:

```go
	case pkgPath == "encoding/json" && name == "RawMessage",
		pkgPath == "encoding/json/jsontext" && name == "Value":
		// DOIS caminhos para o MESMO tipo, e ambos são `encoding/json` do ponto de vista do contrato.
		// No Go ≥1.27 `json.RawMessage` é alias de `jsontext.Value`; `types.Unalias` em `typeSchema`
		// resolve o alias e é o NOME DE DESTINO que chega aqui. Listar os dois mantém o walker correto
		// nas duas versões, em vez de amarrá-lo à do dia.
		//
		// Quando a struct pai tem anotação @union, o campo já foi substituído em unionSchema; os
		// RawMessage que sobram são genuinamente desconhecidos.
		return map[string]any{"x-unknown": true}
```

### Step T6.4 — Verde, e regen canônico

```bash
cd packages/api/go && go test ./pkg/openapi/
cd ../../.. && bun emit-openapi && bun sdk
```

### Step T6.5 — Conferir que o diff encolheu para o que ele deveria ser

```bash
git diff --stat packages/api/go/public/docs/openapi.json packages/client/dist | tail -3
git diff packages/api/go/public/docs/openapi.json | grep -cE '^\+.*"items"'
```

Esperado: o segundo comando imprime `0` (nenhum `items` novo no openapi do Go), e o diff de
`packages/client/dist` encolhe drasticamente — os ~359 arquivos de churn de ordem de import
voltam ao estado da base.

Se o churn de import PERSISTIR depois do regen, ele não vem do walker: registre no corpo do PR
que a ordem de import do kubb difere entre hosts e abra um follow-up, em vez de commitá-lo de
novo.

### Step T6.6 — Type check + commit

```bash
bun tsc
git add packages/api/go/pkg/openapi packages/api/go/public/docs/openapi.json packages/client/dist
git commit -m "fix(openapi): json.RawMessage volta a emitir x-unknown em qualquer toolchain (Task T6)"
```

---

## Task T7: `bun run test` volta a dizer a verdade sobre o Go

**Files to write:**
- Modify: `packages/api/go/core/db/sqlite/store_test.go` — a contagem esperada passa a 31, com o ledger estendido
- Modify: `packages/api/go/project.json` — os `inputs` do alvo `test` passam a incluir as migrações embarcadas

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T2
**Consumes (frozen):** as duas tabelas que o PR cria — `agent_mcp_servers` e
`agent_mcp_tool_approvals` — já na numeração de migração que o T1 fixou.
**Scope fence:** DONE — a migração em si (T1/T2). OUT — qualquer outra contagem ou outro alvo nx.
**Gate:** `bun x nx run api-go:test --skip-nx-cache` sai 0.

### Step T7.1 — Medir os dois lados antes de mudar

```bash
cd packages/api/go/core && go test -count=1 ./db/sqlite/ -run TestConcurrentBoot
```

Esperado: `found 31 application tables, want 29`.

### Step T7.2 — Corrigir a contagem, estendendo o ledger no estilo do arquivo

Modifique `packages/api/go/core/db/sqlite/store_test.go`: troque `29` por `31` nas duas
ocorrências (a condição e a mensagem) e estenda o comentário-ledger acrescentando a linha:

```go
	// 31 drizzle tables (MCP de terceiros: agent_mcp_servers + agent_mcp_tool_approvals — era 29
	// desde ONB-1 T2, que somou owner_onboardings na 0017). No gateway-adapter tables here: that
	// schema is upgraded by the channel module's own store, which this test does not boot.
```

### Step T7.3 — Fechar o buraco que escondeu isto

Modifique `packages/api/go/project.json`: acrescente `"{projectRoot}/**/*.sql"` aos `inputs` do
alvo `test`, e registre o porquê num campo `"//inputs"` ao lado (o mesmo idioma do
`"//env"` de `app-react`):

> Os `.sql` embarcados ENTRAM na chave de cache, e a ausência deles foi o que escondeu uma falha
> real. O `store_test.go` conta as tabelas que o boot cria, e essas tabelas vêm das migrações
> `//go:embed` — arquivos `.sql`. Com os `inputs` limitados a `**/*.go` + go.mod/go.sum, uma
> migração que cria tabela não invalida o cache: o `bun run test` serviu um verde ANTIGO e o PR
> #56 declarou `AC-21 bun run test verde` acreditando nele. Um alvo cujo resultado depende de um
> arquivo que ele não declara como entrada não é um gate, é uma memória.

### Step T7.4 — Provar que o gate volta a morder

```bash
bun x nx run api-go:test --skip-nx-cache
```

Esperado: sucesso.

Depois, prove que o cache agora invalida — toque uma migração e confirme que o alvo re-executa
em vez de servir cache:

```bash
touch packages/api/go/core/db/sqlite/migrations/*.sql
bun x nx run api-go:test 2>&1 | grep -c "existing outputs"
```

Esperado: `0` (não leu do cache).

### Step T7.5 — Commit

```bash
git add packages/api/go/core/db/sqlite/store_test.go packages/api/go/project.json
git commit -m "fix(api-go): a contagem de tabelas acompanha o MCP, e o cache do alvo passa a ver as migrações (Task T7)"
```

---

## Task T8: Editar, desabilitar ou remover um servidor tem efeito imediato

**Files to write:**
- Modify: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/McpUpstreamRegistry.ts` — o contrato ganha `evict(ownerId, serverKey)`
- Modify: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/DefaultMcpUpstreamRegistry.ts` — implementa `evict`, deduplica o connect em voo e passa a cachear o `tools/list`
- Modify: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/MockMcpUpstreamRegistry.ts` — implementa `evict`
- Modify: `packages/api/typescript/src/agent/usecases/UpdateMcpServer.ts` — invalida depois de salvar
- Modify: `packages/api/typescript/src/agent/usecases/RemoveMcpServer.ts` — invalida depois de remover
- Test: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/eviction.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /usecase, /test
**Depends on:** T3, T4
**Consumes (frozen):** `McpUpstreamRegistry`, `McpServerRepository`, `UpstreamTool`,
`UpstreamCallResult`, `childEnv` (T3), `terminateByPid` (T4).
**Scope fence:** DONE — a allowlist de env (T3) e o teardown por pid (T4) já estão prontos e são
CONSUMIDOS aqui, não reescritos. OUT — a política de aprovação (T2) e qualquer coisa de UI.
**Gate:** `cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/ src/agent/usecases/McpServerLifecycle.test.ts`

### Step T8.1 — Escrever os três testes que falham

Crie `eviction.test.ts` cobrindo, contra o `DefaultMcpUpstreamRegistry` real:

1. **Editar um servidor derruba a conexão velha.** Registrar um servidor STDIO, chamar
   `listTools` (o que conecta), `evict`, e assere que o processo antigo morreu — hoje o cache por
   `server.key` serve o processo velho até o daemon reiniciar, então o dono "corrige" a config e
   nada muda, sem erro em lugar nenhum.
2. **Dois `tools/call` paralelos no mesmo servidor spawnam UM processo.** `Promise.all` de duas
   chamadas contra um servidor ainda não conectado; assere que só um processo nasceu. Hoje os dois
   entram em `connect`, o segundo sobrescreve o mapa e o primeiro fica órfão — invisível ao
   `shutdown`.
3. **`listTools` não re-consulta o upstream a cada request.** Duas chamadas seguidas; assere que o
   upstream recebeu UM `tools/list`. Hoje toda montagem de transporte consulta todos os upstreams
   habilitados — inclusive para chamadas às NOSSAS ferramentas — e um upstream HTTP inalcançável
   pode segurar o `GetSettings` e o door até o timeout do SDK.

### Step T8.2 — Rodar e confirmar o vermelho

```bash
cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/eviction.test.ts
```

Esperado: 3 fail.

### Step T8.3 — Implementar

No contrato `McpUpstreamRegistry`, acrescente:

```typescript
	/**
	 * Esquecer o que sabemos de um servidor — a conexão viva e as ferramentas cacheadas.
	 *
	 * Existe porque o cache aqui é por CHAVE, e a chave não muda quando a configuração muda. Sem uma
	 * porta de invalidação, editar `command`/`env` continuava servindo o processo velho até o daemon
	 * reiniciar: o dono corrige a configuração, salva, e nada acontece — sem erro nenhum, que é a
	 * pior forma de falhar. Desabilitar ou remover tinha o gêmeo disso: a chamada passava a ser
	 * recusada (o `call` re-checa `enabled`), mas o PROCESSO seguia vivo.
	 */
	abstract evict(ownerId: string, serverKey: string): Promise<void>
```

No `DefaultMcpUpstreamRegistry`:
- troque as chaves dos mapas de `server.key` para `${ownerId}::${server.key}` (o `ownerId` faltava
  na chave, o que é um cruzamento entre donos esperando para acontecer);
- acrescente um `Map<string, Promise<Client>>` de conexões EM VOO, consultado antes de spawnar —
  é o que faz duas chamadas paralelas compartilharem um processo;
- acrescente um cache de `UpstreamTool[]` por chave, invalidado por `evict`;
- implemente `evict` fechando o cliente, chamando `terminateByPid` e limpando os três mapas.

Em `UpdateMcpServer` e `RemoveMcpServer`, injete `McpUpstreamRegistry` e chame
`await this.registry.evict(input.ownerId, server.key)` DEPOIS do save/delete — nunca antes, para
que uma falha de escrita não derrube uma conexão que continua válida.

### Step T8.4 — Verde, type check, commit

```bash
cd packages/api/typescript && bun test src/agent/services/McpUpstreamRegistry/ src/agent/usecases/McpServerLifecycle.test.ts
cd ../../.. && bun tsc && bun lint
git add packages/api/typescript/src/agent
git commit -m "fix(agent): editar, desabilitar ou remover um servidor MCP tem efeito imediato (Task T8)"
```

---

## Task T9: O console dirige o ciclo inteiro de um servidor (AC-16 completo)

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/settings/-components/McpServersSection/index.tsx` — a linha do servidor ganha identidade acessível
- Modify: `packages/e2e/tests/mcp-servers.spec.ts` — a Story 3 passa a dirigir toggle, troca de política e remoção

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component, /e2e
**Depends on:** T5
**Consumes (frozen):** `useUpdateMcpServer`, `useRemoveMcpServer`, `McpApprovalPolicyEnum`,
as chaves i18n `settings.mcpServers.*` já existentes, e os helpers `dialog`/`field`/
`pickOptionByValue` de `packages/e2e/utils/selectors.ts`.
**Scope fence:** DONE — o cadastro já é dirigido de ponta a ponta e passa; o `data-value` do
`SelectItem` já foi corrigido nesta sessão. OUT — as Stories 1 e 2 do e2e, que seguem `test.skip`
pelo motivo registrado no arquivo (ver T12).
**Gate:** `bun packages/e2e/scripts/run-e2e.ts tests/mcp-servers.spec.ts` — 1 passed, 2 skipped.

### Step T9.1 — Dar identidade à linha

Modifique `McpServersSection/index.tsx`: a linha do servidor ganha
`data-testid={`mcp-server-${server.key}`}` e um `aria-label` legível. O seletor atual do e2e é
`locator('div').filter(...).last()`, que depende do aninhamento do DOM e quebra na primeira
mudança de layout.

### Step T9.2 — Estender a Story 3 sobre a linha já cadastrada

Modifique `mcp-servers.spec.ts`, ao final do teste que já passa (a linha do servidor recém-criado
está na tela, então isto não custa um novo boot):

1. desligar o toggle e assere que a linha reflete desabilitado;
2. trocar a política de `ASK` para `AUTO` e assere a troca;
3. remover o servidor e assere que a linha some.

### Step T9.3 — Rodar

```bash
bun packages/e2e/scripts/run-e2e.ts tests/mcp-servers.spec.ts
```

Esperado: 1 passed, 2 skipped.

### Step T9.4 — Commit

```bash
git add "packages/app/react/src/routes/(app)/settings/-components/McpServersSection" packages/e2e/tests/mcp-servers.spec.ts
git commit -m "test(e2e): o console dirige toggle, política e remoção de um servidor MCP (Task T9)"
```

---

## Task T10: O aviso de pré-aprovação aparece no ponto do toggle (AC-19)

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/settings/index.tsx` — o toggle de `approvalNeeded` passa a existir, com o aviso inline
- Modify: `packages/app/react/src/locales/pt.json` e `en.json` — a chave do aviso

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component
**Depends on:** (none)
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun run storybook:build`

### Step T10.1 — Medir o que existe

```bash
grep -rn "useUpdateStopCriteria" packages/app/react/src | wc -l
```

Esperado hoje: `0`. O AC-19 pede o aviso "no ponto do toggle" e o banner que existe fica em outro
lugar — o dono só o vê DEPOIS que o gate já está desligado.

### Step T10.2 — Montar o toggle com o aviso inline

Modifique a seção de settings: renderize o `Switch` de `approvalNeeded` ligado a
`useUpdateStopCriteria`, com o texto de aviso ao lado — dizendo, na hora em que ele desliga, que
isso pré-aprova também as ferramentas de servidores MCP **cadastrados depois**.

Se `useUpdateStopCriteria` não existir na SDK, PARE e registre no corpo do PR: a metade do plano
que previa esse toggle não foi entregue, e o AC-19 fica declarado como parcial em vez de
silenciosamente incompleto.

### Step T10.3 — Verificar e commitar

```bash
cd packages/app/react && bun x tsc --noEmit && bun run storybook:build
git add "packages/app/react/src/routes/(app)/settings" packages/app/react/src/locales
git commit -m "feat(app): o aviso de pré-aprovação passa a viver no ponto do toggle (Task T10)"
```

---

## Task T11: As limpezas que o review listou

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/settings/-components/McpServersSection/index.tsx` — `TOOL_POLICY_OPTIONS` compõe o enum da SDK
- Modify: `packages/api/typescript/src/agent/entities/McpToolApproval.ts` — ordenação por codepoint
- Modify: `packages/api/typescript/src/agent/mcp/door.ts` — o gate checa `enabled` junto do `!mcpServer`
- Modify: `packages/api/typescript/src/agent/controllers/RegisterMcpServer.ts` — importa a regex da entidade
- Modify: `packages/api/typescript/src/agent/services/McpUpstreamRegistry/teardown.test.ts` e `scripts/injection-cast.test.ts` — comentários embaralhados
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.services.test.tsx` — comentário com TAB literal
- Delete: `packages/api/typescript/src/agent/mcp/upstream.scope.test.ts` — o caso é vácuo

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /component, /test
**Depends on:** T2, T8
**Consumes (frozen):** `McpApprovalPolicyEnum` (SDK), `MCP_SERVER_KEY_PATTERN` (entidade
`McpServer`), `canonicalCallHash`.
**Scope fence:** DONE — tudo que T2/T8 mudaram. OUT — nenhuma mudança de comportamento aqui além
do gate de `enabled`, que é uma janela pequena e nomeada.
**Gate:** `bun tsc && bun lint && cd packages/api/typescript && bun test src/agent/`

### Step T11.1 — `TOOL_POLICY_OPTIONS` para de redigitar o enum

`INHERIT` como sentinela é legítimo; `AUTO`/`ASK` re-declarados perdem a exaustividade do
contrato. Troque por `{ INHERIT: 'INHERIT', ...McpApprovalPolicyEnum } as const`.

### Step T11.2 — O hash canônico ordena por codepoint

`localeCompare` é colação dependente de ICU: a mesma chamada pode gerar hashes diferentes em
runtimes com tabelas diferentes. Para forma canônica PERSISTIDA, a ordenação tem de ser
determinística — troque por `sort()` (comparação por codepoint) e registre o porquê no comentário.
A direção de falha era segura (re-pergunta), o que é por que isto é limpeza e não bloqueio.

### Step T11.3 — Um servidor desabilitado não levanta stop inútil

No `door.ts`, o gate ASK de um servidor desabilitado hoje levanta um stop cuja aprovação leva a
`unknown MCP server`. Cheque `enabled` junto do `!mcpServer` na guarda que já existe.

### Step T11.4 — A regex da key vem da entidade

O controller redigita o padrão. Importe `MCP_SERVER_KEY_PATTERN` de `McpServer.ts` (exportando-o
se ainda não estiver).

### Step T11.5 — Os comentários embaralhados

Três ocorrências, todas exatamente onde um argumento de timeout foi inserido —
`scripts/injection-cast.test.ts`, `teardown.test.ts` (dois pontos) — mais o
`C:\tmp` com TAB literal em `SessionChatSection/index.services.test.tsx`. Reescreva as frases e
**confira que nenhum trecho de CÓDIGO ao redor sofreu a mesma corrupção**.

### Step T11.6 — Apagar o teste vácuo

`upstream.scope.test.ts` asserta `expect(scope).not.toBe(ISSUE_HANDLING)` — aritmética de enum,
não o door. O door real é provado em `door.test.ts` (T6 do PR), que está correto. Apague o arquivo.

### Step T11.7 — Verificar e commitar

```bash
bun tsc && bun lint
cd packages/api/typescript && bun test src/agent/
cd ../../.. && git add -u && git commit -m "refactor(agent,app): limpezas do review — enum composto, hash determinístico, gate de servidor desabilitado (Task T11)"
```

---

## Task T12: O PR conta a verdade sobre si mesmo

**Files to write:**
- Modify: `packages/e2e/tests/mcp-servers.spec.ts` — o `test.skip` passa a citar a issue de follow-up
- Modify: o corpo do PR #56 (via `gh pr edit`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Depends on:** T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T13
**Consumes (frozen):** os números de commit e os resultados de gate produzidos pelas Tasks
anteriores.
**Scope fence:** DONE — todo o código. OUT — qualquer mudança de comportamento.
**Gate:** `gh pr view 56 --json body -q .body | grep -c "build.rs"` imprime ≥1.

### Step T12.1 — Abrir a issue do gate e2e que não pode ser dirigido

```bash
gh issue create --title "e2e: dirigir o gate de aprovação MCP exige uma coluna de DI 'e2e' para McpUpstreamRegistry" \
  --body "As Stories 1 e 2 de packages/e2e/tests/mcp-servers.spec.ts estão test.skip. O motivo é estrutural e está registrado no arquivo: agent/registry.ts binda MockMcpUpstreamRegistry em integration e não há coluna e2e; withUpstream desembrulha quando a lista de ferramentas é vazia; e o conjunto de declarações do E2eMcpDriver é fechado. Destravar exige decidir entre uma coluna de DI 'e2e' com porta de semeadura ou um tipo de cenário CALL_UPSTREAM_TOOL — código de produto que o PR #56 deliberadamente não adicionou às cegas."
```

### Step T12.2 — Citar a issue no skip

Modifique o `test.skip` para nomear a issue criada, em vez de só descrever o motivo.

### Step T12.3 — Registrar no corpo do PR o que pegou carona

Acrescente ao corpo do PR uma seção listando, com honestidade, o que entrou sem relação com MCP:
o `build.rs` do Tauri (manifesto comctl32 para `cargo test` no Windows msvc), os consertos das
três suítes quebradas no Windows, e o conserto do login social. Cada um com uma linha dizendo por
que pegou carona em vez de ser PR próprio.

Registre também, na mesma seção: **AC-4 segue NÃO MEDIDO** contra um `claude` real — existe teste
unitário do nome de fio e o e2e correspondente está skipado. É rebaixamento declarado, não
entrega.

---

## Task T13: As seis limpezas de gosto que valem o custo

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/settings/-forms/McpServerForm/index.tsx` — `splitArgs` respeita aspas
- Modify: `packages/api/typescript/src/agent/errors/index.ts` — remove `MCP_TOOL_APPROVAL_REQUIRED`, que nunca é lançado
- Modify: `packages/api/typescript/src/agent/usecases/RequestMcpToolApproval.ts` — `describeCall` trunca args gigantes
- Modify: `packages/api/typescript/src/agent/usecases/RegisterMcpServer.ts` — a corrida no índice único vira o erro nomeado
- Modify: `packages/e2e/utils/given/thread.ts` — `AttachedThread` devolve os `providers` que anexou
- Modify: `packages/e2e/utils/given/onboarding.ts` — para de cravar `['CLAUDE_CODE']`
- Create: `packages/api/typescript/tests/architecture/mcp-namespace-collision.test.ts` — o rail do `__`
- Test: `packages/app/react/src/routes/(app)/settings/-forms/McpServerForm/splitArgs.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /errors, /form, /test
**Depends on:** T2, T5
**Consumes (frozen):** `MCP_SERVER_KEY_CONFLICT` e `AgentApplicationErrors` (já declarados),
`canonicalCallHash`, `AttachedThread` (com `contactDisplayName`, já congelado nesta sessão), o
índice único `agent_mcp_tool_approvals_call_unq` (T2).
**Scope fence:** DONE — tudo que T2 e T5 mudaram nesses arquivos. OUT — os quatro gostos que ficam
registrados e NÃO feitos (`reachable` conflatando vazio/quebrado, os `as never` dos testes, o
`safeParse` mudo no submit, o quoting do `playwright.config`), e o AC-13, que é ratificação de spec
e não trabalho de código.
**Gate:** `bun tsc && bun lint && cd packages/api/typescript && bun test src/agent/ tests/architecture/mcp-namespace-collision.test.ts`

### Step T13.1 — `splitArgs` respeita aspas (o único que não era gosto)

Medido: a implementação é `raw.trim().split(/\s+/)`. Com ela, `--profile "My Profile"` vira TRÊS
argumentos. O caso motivador do próprio recurso é `npx -y @agent/browser-use-mcp`, e perfil de
browser-use tem espaço no nome — então isto reprova no caminho feliz, não numa borda.

Escreva primeiro o teste, em `splitArgs.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { splitArgs } from './index'

/**
 * O QUE O DONO DIGITA NA CAIXA DE ARGUMENTOS — e por que separar por espaço não serve.
 *
 * A caixa recebe a linha inteira, como ele a escreveria num terminal. Separar por espaço estava
 * certo enquanto os exemplos fossem `-y @pacote/mcp`; o caso motivador do recurso não é esse.
 * O browser-use recebe `--profile "My Profile"`, e três argumentos no lugar de dois fazem o
 * servidor subir com configuração errada e falhar de um jeito que não aponta para o formulário.
 *
 * Não é um shell: sem expansão de variável, sem glob, sem pipe. É só a regra de aspas, que é a
 * única que a caixa precisa entender para não mentir sobre o que o dono escreveu.
 */
describe('splitArgs', () => {
	it('separa por espaço, como antes', () => {
		expect(splitArgs('-y @agent/browser-use-mcp')).toEqual(['-y', '@agent/browser-use-mcp'])
	})

	it('mantém junto o que está entre aspas — o caso do browser-use', () => {
		expect(splitArgs('--profile "My Profile" --headless')).toEqual(['--profile', 'My Profile', '--headless'])
	})

	it('aspas simples valem igual', () => {
		expect(splitArgs('--path \'C:/Program Files/app\'')).toEqual(['--path', 'C:/Program Files/app'])
	})

	it('aspas ABERTAS e não fechadas não engolem o resto em silêncio', () => {
		// Devolver `['--profile', 'My Profile --headless']` seria adivinhar onde ele queria fechar.
		// `undefined` faz o campo reprovar na validação, e o dono vê que faltou fechar a aspa.
		expect(splitArgs('--profile "My Profile')).toBeUndefined()
	})

	it('linha vazia continua sendo ausência de argumentos, não lista vazia', () => {
		expect(splitArgs('   ')).toBeUndefined()
	})
})
```

Rode e confirme o vermelho:

```bash
cd packages/app/react && bun test "src/routes/(app)/settings/-forms/McpServerForm/splitArgs.test.ts"
```

Esperado: FAIL — `splitArgs` ainda não é exportado, e os casos de aspas reprovam depois que for.

Depois EXPORTE `splitArgs` do form (o teste o exercita direto, como `resolveMcpCallDisposition` e
`resolveSocialProviders` já fazem em outros pontos do repo) e troque a implementação:

```typescript
/**
 * A linha de argumentos como o dono a escreveu — respeitando aspas, e só isso.
 *
 * NÃO é um shell e não deve virar um: sem expansão de variável, sem glob, sem pipe. A única regra
 * que a caixa precisa é a de aspas, porque sem ela `--profile "My Profile"` vira três argumentos —
 * medido, e é o caso motivador do próprio recurso.
 *
 * Aspas abertas e não fechadas devolvem `undefined` em vez de adivinhar onde o dono queria fechar:
 * o campo reprova na validação e ele vê o que faltou, que é melhor do que um servidor subindo com
 * dois argumentos colados num só.
 */
export const splitArgs = (raw: string): string[] | undefined => {
	const trimmed = raw.trim()
	if (trimmed.length === 0) return undefined

	const args: string[] = []
	let current = ''
	let quote: '"' | "'" | undefined
	let started = false

	for (const char of trimmed) {
		if (quote !== undefined) {
			if (char === quote) quote = undefined
			else current += char
			continue
		}
		if (char === '"' || char === "'") {
			quote = char
			started = true
			continue
		}
		if (char === ' ' || char === '\t') {
			if (started) args.push(current)
			current = ''
			started = false
			continue
		}
		current += char
		started = true
	}

	if (quote !== undefined) return undefined
	if (started) args.push(current)
	return args.length > 0 ? args : undefined
}
```

### Step T13.2 — Apagar o vocabulário morto

Medido: `MCP_TOOL_APPROVAL_REQUIRED` aparece em DUAS linhas, ambas declaração —
`packages/api/typescript/src/agent/errors/index.ts:56` (a união) e `:87` (o mapa para 403).
**Nunca é lançado em lugar nenhum.** O door devolve `isError` JSON-RPC, que é o correto para o
protocolo MCP — um 403 HTTP ali quebraria o transporte.

Remova as duas linhas. Um código de erro que existe e nunca acontece é pior que nenhum: o próximo
leitor assume que há um caminho 403 e vai procurá-lo.

Se houver chave i18n correspondente em `packages/app/react/src/locales/pt.json` e `en.json`,
remova também — o rail `i18n-coherence` reprova uma tradução órfã.

### Step T13.3 — O rail contra um `operationId` futuro com `__`

Medido: **0 de 65** operationIds contêm `__` hoje, então o sombreamento é inalcançável. Nada
impede o 66º.

```typescript
// packages/api/typescript/tests/architecture/mcp-namespace-collision.test.ts — arquivo final COMPLETO
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * RAIL — nenhum `operationId` nosso pode conter `__`.
 *
 * `withUpstream` registra uma ferramenta de terceiro como `<key>__<tool>` e intercepta o
 * `tools/call` por esse nome ANTES do servidor gerado. O separador é o que mantém os dois espaços
 * apartados: enquanto nenhum operationId nosso tiver `__`, nenhuma ferramenta de terceiro pode
 * sombrear uma nossa, e a decisão 10 do spec ("o `wire.ts` nunca muda") continua verdadeira.
 *
 * Medido em 2026-09-03: 0 de 65 operationIds contêm `__` — é uma propriedade REAL do sistema hoje,
 * e é exatamente por isso que ela merece um rail em vez de um comentário. O sombreamento fica
 * inalcançável até o dia em que alguém nomear um controller com `__` e descobrir pelo caminho mais
 * caro: uma ferramenta NOSSA deixando de ser chamada, em silêncio, porque um servidor de terceiro
 * reivindicou o nome dela.
 */
const OPENAPI = join(import.meta.dir, '..', '..', 'public', 'docs', 'openapi.json')

interface OpenApiSpec {
	paths: Record<string, Record<string, { operationId?: string }>>
}

function operationIds(): string[] {
	const spec = JSON.parse(readFileSync(OPENAPI, 'utf8')) as OpenApiSpec
	return Object.values(spec.paths)
		.flatMap(methods => Object.values(methods))
		.map(operation => operation.operationId)
		.filter((id): id is string => typeof id === 'string')
}

describe('rail — o separador de namespace do MCP', () => {
	it('nenhum operationId contém `__`, que é o que impede uma ferramenta de terceiro de sombrear a nossa', () => {
		expect(operationIds().filter(id => id.includes('__'))).toEqual([])
	})

	it('a varredura vê os operationIds que existem — a rail não pode passar por varrer o vazio', () => {
		expect(operationIds().length).toBeGreaterThan(50)
	})
})
```

### Step T13.4 — O card do Needs-you para de virar parede de texto

Modifique `describeCall` em `packages/api/typescript/src/agent/usecases/RequestMcpToolApproval.ts`:

```typescript
/**
 * O limite de pré-visualização dos argumentos no card.
 *
 * Este texto vai para a tela em que o dono decide sob pressão, no meio de um turno do agente. Um
 * `JSON.stringify` cru de um argumento grande (o conteúdo de um arquivo, um payload) vira uma
 * parede que empurra a PERGUNTA para fora da vista — e a pergunta é a única coisa que o card
 * precisa entregar. O hash canônico, que é o que de fato identifica a chamada, não depende disto.
 */
const ARGS_PREVIEW_LIMIT = 300

function describeCall(input: { serverKey: string; toolName: string; args: Record<string, unknown> }): string {
	const serialized = JSON.stringify(input.args)
	const preview =
		serialized.length > ARGS_PREVIEW_LIMIT
			? `${serialized.slice(0, ARGS_PREVIEW_LIMIT)}… (${serialized.length} caracteres no total)`
			: serialized
	return `O agente quer executar "${input.toolName}" do servidor MCP "${input.serverKey}" com: ${preview}`
}
```

### Step T13.5 — A corrida no índice único vira o erro nomeado

Com o índice ÚNICO do T2, dois cadastros simultâneos da mesma key passam a estourar erro cru do
driver (500) em vez de `MCP_SERVER_KEY_CONFLICT` (409), que o contrato já declara.

Modifique `packages/api/typescript/src/agent/usecases/RegisterMcpServer.ts`: envolva o `save` de
modo que uma violação de unicidade vinda do driver seja relançada como o erro nomeado, com o
comentário dizendo por que as duas checagens coexistem:

```typescript
		// A checagem acima é o caminho NORMAL e continua sendo — ela devolve o erro nomeado sem
		// gastar uma escrita. Este catch é a rede para a CORRIDA: dois cadastros simultâneos da mesma
		// key passam os dois pela leitura e só o índice único os separa, e aí o que chega ao dono
		// seria um erro cru do driver (500) no lugar do 409 que o contrato promete. Janela minúscula,
		// resposta consistente.
```

### Step T13.6 — O given de onboarding para de cravar o provider

Modifique `packages/e2e/utils/given/thread.ts`: `AttachedThread` ganha
`providers: readonly ProviderKind[]`, devolvido a partir do que `givenAttachedThread` realmente
anexou — o `overrides.providers ?? ['CLAUDE_CODE']` já é calculado ali; extraia para uma const e
devolva, exatamente como foi feito com `contactDisplayName` nesta mesma sessão.

Modifique `packages/e2e/utils/given/onboarding.ts`: troque `providers: ['CLAUDE_CODE']` por
`providers: [...attached.providers]` e estenda o docblock — o rascunho do onboarding tem de
espelhar a thread que a spec criou, não uma cópia que envelhece à parte no dia em que alguma spec
anexar com CODEX.

### Step T13.7 — Verificar tudo

```bash
bun tsc && bun lint
cd packages/api/typescript && bun test src/agent/ tests/architecture/mcp-namespace-collision.test.ts
cd ../../app/react && bun test "src/routes/(app)/settings/-forms/McpServerForm/splitArgs.test.ts"
cd ../../.. && bun packages/e2e/scripts/run-e2e.ts tests/mcp-servers.spec.ts
```

Esperado: tudo verde; o e2e com 1 passed, 2 skipped.

### Step T13.8 — Commit

```bash
git add packages/api/typescript/src/agent \
        packages/api/typescript/tests/architecture/mcp-namespace-collision.test.ts \
        "packages/app/react/src/routes/(app)/settings/-forms/McpServerForm" \
        packages/e2e/utils/given
git commit -m "refactor(agent,app,e2e): aspas nos args, vocabulário morto fora, rail do namespace (Task T13)"
```

---

## Final Validation

- [ ] `bun tsc` — type check limpo nos 7 projetos
- [ ] `bun lint` — limpo nos 9
- [ ] `bun run test` — verde nos 8 projetos, **rodado com `--skip-nx-cache`** (o T7 corrige a
      chave de cache, mas a primeira validação depois dele precisa ignorar o cache velho)
- [ ] `bun x nx run api-go:test --skip-nx-cache` — verde (era o gate quebrado, item 1.5)
- [ ] `bun packages/e2e/scripts/run-e2e.ts tests/mcp-servers.spec.ts` — 1 passed, 2 skipped
- [ ] `bun run --cwd packages/contracts db:check-go` — sai 0
- [ ] `git merge-tree --write-tree origin/main HEAD | grep -c CONFLICT` — imprime 0
- [ ] `git diff --stat packages/client/dist | tail -1` — ~370 arquivos a menos que hoje
- [ ] Mapeamento dos itens do review → caminho de teste verde:
  - 1.1 → `packages/api/typescript/src/agent/usecases/McpApprovalReversal.test.ts` (3 casos)
  - 1.2 → `packages/api/typescript/src/agent/services/McpUpstreamRegistry/teardown.test.ts:"(e) o NETO morre junto"`
  - 1.3 → `packages/api/typescript/src/agent/services/McpUpstreamRegistry/childEnv.test.ts` (3 casos)
  - 1.4 → `packages/api/go/pkg/openapi/openapi_test.go:"TestRawMessageEmitsUnknownRegardlessOfToolchain"`
  - 1.5 → `packages/api/go/core/db/sqlite/store_test.go:"TestConcurrentBoot"` + a prova de invalidação de cache no Step T7.4
  - 1.6 → `git merge-tree` no Step T1.5
  - 1.7 → story `ReconfigureWithSecrets` + `bun run storybook:build`
  - §2 cache/race/tools-list → `packages/api/typescript/src/agent/services/McpUpstreamRegistry/eviction.test.ts` (3 casos)
  - §2 AC-16 → `packages/e2e/tests/mcp-servers.spec.ts` (Story 3 estendida)
  - §3 aspas nos args → `packages/app/react/src/routes/(app)/settings/-forms/McpServerForm/splitArgs.test.ts` (5 casos)
  - §3 sombreamento de namespace → `packages/api/typescript/tests/architecture/mcp-namespace-collision.test.ts` (2 casos)
  - §3 vocabulário morto, card truncado, 409 na corrida, provider do given → T13, verificados pelo Gate do T13

## Notes

**O que este plano NÃO pode verificar nesta máquina.** O host é Windows. O caso `(e)` do T4 (o
neto morrendo) é a prova do item 1.2, e o mecanismo que ele exercita — a descida por `pgrep -P` —
só roda no POSIX. No Windows o `taskkill /T /F` já andava a árvore, então o caso pode passar
ANTES do conserto. **Peça a verificação num mac antes do merge** e registre o resultado no PR;
sem isso, o AC-13 continua declarado e não medido na plataforma de produção.

O mesmo vale, em espelho, para o T6: o vermelho do
`TestRawMessageEmitsUnknownRegardlessOfToolchain` depende do toolchain. Ele falha com Go 1.27 e
passa com 1.25 — o que é exatamente o defeito, e é por isso que o teste trava a SAÍDA e não o
caminho.

**Ordem entre as ondas.** T1 é serial e vem primeiro (o rebase move o chão de todo o resto).
T2–T7 são independentes entre si depois dele, exceto T7, que depende do T2 (a contagem de tabelas
muda com a migração). T8 depende de T3 e T4 porque reescreve o mesmo arquivo. T11 vem depois de
T2 e T8 pelo mesmo motivo. T12 é o último por construção.

**O que fica fora deste plano, deliberadamente.** Quatro notas §3 do review que são gosto e não
defeito, e uma que não é código:

- `reachable` conflatando "upstream vazio" com "upstream quebrado" — já documentado honestamente
  no próprio `GetSettings.ts`; separar em dois campos só se a UI precisar distinguir, e hoje não
  precisa.
- Os `as never` dos testes novos (×11) — medido: a base já usa o mesmo idioma (3 ocorrências só em
  `PublishAgentIntegrationEvents.test.ts`, pré-PR). É dívida da base, não violação nova; consertar
  significa tipar os construtores de evento, que é refactor próprio.
- O `safeParse` mudo no submit do form — inalcançável na prática, porque o botão desabilita pelo
  mesmo parse.
- O `JSON.stringify` como quoting de shell no `playwright.config.ts` — funciona nos dois shells e
  está comentado no ponto de uso.

E o **AC-13**, que não é trabalho de código: o AC diz "encerrar um RUN derruba os processos", e a
implementação derruba no shutdown do DAEMON, porque as conexões são reusadas entre requests de
propósito. Mesmo com o T4 pronto, um browser aberto por um upstream vive entre runs. Ou o AC é
re-ratificado para dizer "daemon", ou o reúso de conexão precisa ser repensado — decisão do dono,
registrada aqui para não virar esquecimento.
