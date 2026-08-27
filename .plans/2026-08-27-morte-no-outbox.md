# Morte no outbox — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** "Há falhas silenciosas no sistema?" deixa de ser arqueologia sobre um campo de texto e vira uma consulta direta, nas duas lanes do outbox, com o mesmo vocabulário que a `agent_mailbox` já usa.

**Architecture:** `shared_outbox` ganha `dead_at`, espelhando `agent_mailbox`. Os três caminhos de morte — dead-letter do `finalize` (TS), poison sweep (TS) e dead-letter do `fail` (Go) — param de carimbar `processed_at` e passam a carimbar `dead_at`; as cláusulas de reivindicação dos dois despachantes passam a excluir os dois estados, que é o que torna a troca segura. O contrato de conformidade entre drivers aprende o campo novo, e um health check publica a contagem.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Go, SQLite

**Spec:** .specs/2026-08-27-morte-no-outbox-design.md
**Tasks:** 4
**Estimated minutes:** 120

---

## Ordenação

Sem `/task-breakdown`: nove artefatos em dois backends irmãos sobre uma tabela — abaixo do limiar (≥10 artefatos ou ≥3 bounded contexts) e com ordenação linear. Topo-sort inline:

- **T1** (coluna + migração + espelho Go) é pré-requisito de tudo: nenhuma das lanes pode escrever num campo que não existe.
- **T2** (lane TypeScript) e **T3** (lane Go) são independentes entre si — mesma tabela, arquivos disjuntos, e a compatibilidade durante a janela está coberta pela spec (Riscos).
- **T4** (health check) depende de T2, porque consulta pela coluna que a lane TS passa a preencher.

Caminho crítico: `T1 → T2 → T4`.

---

## Task T1: A tabela distingue morte de sucesso

**Files to write:**
- Modify: `packages/contracts/src/db/sqlite/infrastructure.ts` — adiciona a coluna `deadAt` a `shared_outbox`
- Create: `packages/contracts/src/db/sqlite/migrations/0024_*.sql` — gerada por `bun migrate:create`, nome escolhido pelo drizzle-kit
- Create: `packages/api/go/core/db/sqlite/migrations/0024_*.sql` — espelho `//go:embed`, gerado por `db:sync-go`
- Modify: `packages/api/typescript/core/src/db/conformance/outbox-conformance.ts` — `deadAt` em `SeedOutboxRow` e `OutboxRowSnapshot`

**Files to read:**
- `packages/contracts/src/db/sqlite/agent.ts` (o `deadAt` de `agent_mailbox`, linhas 126-130)

**Agent:** database-architect
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /db-modelling, /migrate
**Depends on:** (none)
**Consumes (frozen):** `integer('dead_at', { mode: 'timestamp_ms' })` — a forma EXATA que `agent_mailbox.deadAt` usa (`packages/contracts/src/db/sqlite/agent.ts:128`); a tabela `outbox` declarada em `packages/contracts/src/db/sqlite/infrastructure.ts:32`.
**Scope fence:** LEFT — a coluna, a migração, o espelho Go e os dois tipos do conformance. OUT — qualquer mudança nos despachantes (T2 e T3 os possuem); NENHUM backfill (Decisão 5 da spec: não há como distinguir morto de "falhou e depois teve sucesso", porque o sucesso não limpa `last_error`); nenhum índice novo (os existentes têm `source, processed_at` como prefixo e seguem servindo).
**Gate:** `bun run --cwd packages/contracts db:check-go && bun tsc && cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`

### Step T1.1 — Adicionar a coluna ao schema

Modify `packages/contracts/src/db/sqlite/infrastructure.ts`: dentro da definição de `outbox`, imediatamente após `lastError`, adicione

```typescript
		/**
		 * QUANDO o evento MORREU — esgotou as tentativas e ninguém mais vai entregá-lo.
		 *
		 * Existe porque `processed_at` carregava dois significados incompatíveis: "entregue" e
		 * "desisti". Os dois caminhos escreviam no mesmo campo, então uma linha morta ficava
		 * indistinguível de uma bem-sucedida e a única evidência sobrava em `last_error` — um campo
		 * que ninguém consulta sem já suspeitar de algo. Medido em 2026-08-27: 55.082 linhas, 55.082
		 * "processadas", duas delas mortas havia duas semanas.
		 *
		 * Mesmo nome, mesmo tipo e mesma semântica que `agent_mailbox.dead_at`, que já distinguia os
		 * dois estados — esta coluna não inventa vocabulário, aplica o que a tabela irmã tem.
		 *
		 * `last_error` continua sendo o PORQUÊ; esta coluna é o QUE ACONTECEU. A pergunta "há falhas
		 * silenciosas?" passa a ser `WHERE dead_at IS NOT NULL`.
		 */
		deadAt: integer('dead_at', { mode: 'timestamp_ms' }),
```

### Step T1.2 — Gerar a migração

```bash
bun migrate:create
```

Expected: um arquivo novo em `packages/contracts/src/db/sqlite/migrations/` (o drizzle-kit escolhe o nome, no formato `0024_<duas-palavras>.sql`), com um único `ALTER TABLE shared_outbox ADD dead_at integer;`. Se o diff contiver qualquer outra tabela ou coluna, PARE e reporte — significa que o schema tinha drift antes desta mudança, e misturá-los aqui esconde o outro.

### Step T1.3 — Espelhar no embed do gateway

```bash
bun run --cwd packages/contracts db:sync-go
bun run --cwd packages/contracts db:check-go
```

Expected: o `db:sync-go` copia o `.sql` novo para `packages/api/go/core/db/sqlite/migrations/`, e o `db:check-go` confirma que as duas cópias são byte-a-byte iguais. O gateway lê as migrações por `//go:embed` do próprio diretório — sem esta cópia, o Go sobe com um schema sem a coluna e o `ALTER` nunca chega nele.

### Step T1.4 — Ensinar o campo ao contrato de conformidade

Modify `packages/api/typescript/core/src/db/conformance/outbox-conformance.ts`:

- em `SeedOutboxRow`, após `processedAt?: Date | null`, adicione `deadAt?: Date | null`
- em `OutboxRowSnapshot`, após `processedAt: Date | null`, adicione `deadAt: Date | null`

Este arquivo é o contrato que valida o comportamento do outbox ENTRE drivers. Sem o campo aqui, as duas lanes podem divergir sobre o significado de morte sem nada reclamar — que é exatamente a classe de problema que esta spec fecha. As implementações do harness (quem materializa `OutboxRowSnapshot`) passam a precisar ler a coluna; o `bun tsc` do gate aponta cada uma.

### Step T1.5 — Aplicar e verificar a coluna

```bash
bun migrate:dev
```

Expected: a migração aplica sem erro. Confirme a coluna:

```bash
sqlite3 "$(grep -E '^CODM_DATA_DIR=' .env | cut -d= -f2 | sed "s|~|$HOME|")/codm.db" "SELECT name FROM pragma_table_info('shared_outbox') WHERE name='dead_at';"
```

Expected: `dead_at`.

### Step T1.6 — Gates

Run: `bun run --cwd packages/contracts db:check-go && bun tsc`
Expected: check-go sem diferença; 0 erros de tipo.

### Step T1.7 — Commit

```bash
git add packages/contracts/src/db/sqlite/infrastructure.ts \
        packages/contracts/src/db/sqlite/migrations/ \
        packages/api/go/core/db/sqlite/migrations/ \
        packages/api/typescript/core/src/db/conformance/outbox-conformance.ts
git commit -m "feat(db): shared_outbox ganha dead_at, o campo que a agent_mailbox já tinha (Task T1)"
```

---

## Task T2: A lane TypeScript marca morte como morte

**Files to write:**
- Modify: `packages/api/typescript/core/src/services/OutboxDispatcher/LibSqlOutboxDispatcher.ts` — dead-letter e poison sweep carimbam `deadAt`; as duas cláusulas de reivindicação excluem `deadAt`
- Test: `packages/api/typescript/core/src/services/OutboxDispatcher/LibSqlOutboxDispatcher.deadAt.test.ts`

**Files to read:**
- `packages/api/typescript/src/agent/repositories/MailboxRepository/LibSqlMailboxRepository.ts` (como `claimNext` exclui `consumedAt`/`deadAt` — a forma que esta Task espelha)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1
**Consumes (frozen):** a coluna `outbox.deadAt` congelada por T1 (`packages/contracts/src/db/sqlite/infrastructure.ts`); `MAX_ATTEMPTS = 5` (`LibSqlOutboxDispatcher.ts:16`); a tabela `outbox` de `@codm/contracts/db`; `TestBed` de `@test/support`.
**Scope fence:** DONE — a coluna e a migração são de T1: consuma, não redeclare. OUT — a lane Go (`packages/api/go/core/services/outbox/`, Task T3) e o health check (T4). NÃO altere o caminho de SUCESSO: ele continua carimbando apenas `processedAt`. NÃO limpe `last_error` no sucesso (Fora de escopo na spec).
**Gate:** `cd packages/api/typescript && bun test core/src/services/OutboxDispatcher/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T2.1 — Escrever os testes que falham

```typescript
// packages/api/typescript/core/src/services/OutboxDispatcher/LibSqlOutboxDispatcher.deadAt.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { outbox } from '@codm/contracts/db'
import { TestBed } from '@test/support'
import { LibSqlDatabaseDriver } from '../../db'

/**
 * MORTE ≠ SUCESSO no outbox.
 *
 * Antes desta suíte, o dead-letter carimbava `processed_at` — o mesmo campo do sucesso — e uma linha
 * morta ficava indistinguível de uma entregue. Estes testes fixam os dois lados: quem morre ganha
 * `dead_at` e NÃO ganha `processed_at`, e quem morre para de ser reivindicado.
 */
describe('LibSqlOutboxDispatcher — morte distinta de sucesso', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	function db() {
		return testBed.resolve(LibSqlDatabaseDriver).db
	}

	async function rowOf(id: string) {
		const rows = await db().select().from(outbox).where(eq(outbox.id, id)).limit(1)
		return rows[0]
	}

	it('AC-2: um evento que esgota MAX_ATTEMPTS termina com dead_at e SEM processed_at', async () => {
		// Semeia uma linha já no teto de tentativas e força uma falha: o `finalize` deve dead-lettar.
		const id = await testBed.givenOutboxRowThatWillFail({ attempts: 5 })

		await testBed.runOutboxDispatch()

		const row = await rowOf(id)
		expect(row?.deadAt).toBeInstanceOf(Date)
		expect(row?.processedAt).toBeNull()
		expect(row?.lastError).toBeTruthy()
	})

	it('AC-3: um evento recolhido pelo poison sweep termina com dead_at e SEM processed_at', async () => {
		// Lease expirado + tentativas esgotadas = o worker morreu sem finalizar.
		const id = await testBed.givenOutboxRowPoisoned({ attempts: 5 })

		await testBed.runOutboxDispatch()

		const row = await rowOf(id)
		expect(row?.deadAt).toBeInstanceOf(Date)
		expect(row?.processedAt).toBeNull()
		expect(row?.lastError).toContain('poison')
	})

	it('AC-5: um evento morto NÃO é reivindicado de novo', async () => {
		const id = await testBed.givenOutboxRowThatWillFail({ attempts: 5 })
		await testBed.runOutboxDispatch()
		const afterDeath = await rowOf(id)

		await testBed.runOutboxDispatch()

		const afterSecond = await rowOf(id)
		expect(afterSecond?.attempts).toBe(afterDeath?.attempts ?? -1)
		expect(afterSecond?.claimedBy).toBeNull()
	})

	it('AC-6: um evento entregue com sucesso mantém processed_at, dead_at nulo — mesmo com last_error de uma falha anterior', async () => {
		const id = await testBed.givenOutboxRowThatWillSucceed({ attempts: 2, lastError: 'falha anterior' })

		await testBed.runOutboxDispatch()

		const row = await rowOf(id)
		expect(row?.processedAt).toBeInstanceOf(Date)
		expect(row?.deadAt).toBeNull()
	})
})
```

**Os quatro helpers `testBed.given*` / `runOutboxDispatch` são nomes PROPOSTOS, não existentes.** Antes de escrevê-los, leia `packages/api/typescript/tests/support/TestBed.ts` e `core/src/db/conformance/outbox-conformance.ts` (que já semeia linhas de outbox via `SeedOutboxRow`) e use o que houver. Se não houver equivalente, semeie as linhas com `db().insert(outbox).values({...})` DENTRO do próprio arquivo de teste — **não** adicione helper ao `TestBed` para isto, e **não** adicione backdoor ao código de produção. O que cada caso precisa:
- *will fail*: uma linha cujo handler lança (um `name` de evento sem handler registrado serve — o despachante conta como falha).
- *poisoned*: `attempts >= 5`, `leaseUntil` no passado, `claimedBy` preenchido, `processedAt` nulo.
- *will succeed*: um evento com handler registrado, `attempts: 2`, `lastError` preenchido.

### Step T2.2 — Rodar e ver falhar

Run: `cd packages/api/typescript && bun test core/src/services/OutboxDispatcher/LibSqlOutboxDispatcher.deadAt.test.ts`
Expected: FAIL — `deadAt` é sempre `null` e `processedAt` vem preenchido nos casos de morte, porque o despachante ainda carimba o campo antigo.

### Step T2.3 — O dead-letter carimba dead_at

Modify `packages/api/typescript/core/src/services/OutboxDispatcher/LibSqlOutboxDispatcher.ts`, dentro de `finalize`, no laço `for (const fail of failed)`: o ramo `deadLettered` passa de `{ lastError: fail.error, processedAt: now, claimedBy: null }` para

```typescript
							// MORTE CARIMBA `dead_at`, NÃO `processed_at` — o código já sabia qual caso era
							// (a variável se chama `deadLettered` e vai para o log como `maxReached`), e a
							// informação era jogada fora na persistência por não haver coluna para ela.
							// Soltar o token é o que tira a linha do voo; a cláusula de reivindicação exclui
							// `dead_at`, então ela não volta.
							? { lastError: fail.error, deadAt: now, claimedBy: null }
```

Atualize também o docblock de `finalize`: onde ele diz que sucesso vira TOMBSTONE com `processed_at`, acrescente que a morte vira tombstone com `dead_at`, e que os dois estados são distintos de propósito.

### Step T2.4 — O poison sweep carimba dead_at

Modify o mesmo arquivo, no `UPDATE` do poison sweep (por volta da linha 200): troque `SET processed_at = ${now}` por `SET dead_at = ${now}`, mantendo `claimed_by = NULL` e o `last_error = 'poison: exceeded attempts without finalize'` como estão. O `WHERE` desse sweep continua exigindo `processed_at IS NULL`; acrescente `AND ${outbox.deadAt} IS NULL`, senão o sweep reprocessa eternamente as linhas que ele mesmo matou.

### Step T2.5 — As cláusulas de reivindicação excluem os dois estados

Modify o mesmo arquivo, nas DUAS queries que hoje filtram por `${outbox.processedAt} IS NULL` (o sweep do passo anterior e o `SELECT` das linhas devidas, por volta das linhas 204 e 214): acrescente `AND ${outbox.deadAt} IS NULL` em cada uma.

É isto que torna o passo T2.3 seguro. Sem esta metade, uma linha morta deixa de ter `processed_at` e volta a ser reivindicável para sempre. É a mesma forma que `MailboxRepository.claimNext` já usa para `consumed_at`/`dead_at`.

### Step T2.6 — Rodar e ver passar

Run: `cd packages/api/typescript && bun test core/src/services/OutboxDispatcher/`
Expected: PASS — os quatro casos novos e todos os pré-existentes do diretório.

### Step T2.7 — Type check + suíte

Run: `bun tsc && cd packages/api/typescript && bun test`
Expected: 0 erros; suíte verde. Se algum teste pré-existente afirmar `processedAt` num caminho de MORTE, ele codifica o contrato antigo — atualize a asserção para `deadAt`, sem remover a cobertura.

### Step T2.8 — Commit

```bash
git add packages/api/typescript/core/src/services/OutboxDispatcher/
git commit -m "feat(core): a lane TypeScript marca morte com dead_at, não com processed_at (Task T2)"
```

---

## Task T3: A lane Go marca morte como morte

**Files to write:**
- Modify: `packages/api/go/core/services/outbox/sqlite_outbox_dispatcher.go` — `fail()` carimba `dead_at` no dead-letter; a claim query exclui `dead_at`
- Modify: `packages/api/go/core/services/outbox/sqlite_outbox_dispatcher_test.go` — o teste que afirma o contrato antigo passa a afirmar o novo

**Files to read:**
- `packages/api/go/core/services/outbox/sqlite_outbox_dispatcher.go` (integralmente — `fail`, `markProcessed` e a claim query)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1
**Consumes (frozen):** a coluna `dead_at` de `shared_outbox`, congelada por T1 e já espelhada no `//go:embed` do gateway; `sqliteMaxAttempts` (`sqlite_outbox_dispatcher.go:24`).
**Scope fence:** DONE — a coluna e o espelho da migração são de T1. OUT — a lane TypeScript (Task T2) e o health check (T4). NÃO altere `markProcessed`: o caminho de sucesso continua carimbando apenas `processed_at`.
**Gate:** `cd packages/api/go && go test ./core/services/outbox/... -count=1 -race`

### Step T3.1 — Reescrever a asserção do teste que codifica o contrato antigo

Modify `packages/api/go/core/services/outbox/sqlite_outbox_dispatcher_test.go`: o caso que hoje falha com `"dead-lettered row must have processed_at set to stop being claimed"` passa a afirmar o contrato novo. A cobertura NÃO muda de intenção — continua provando que a linha morta sai da fila —, só o campo que carrega essa informação:

- a linha morta deve ter `dead_at` preenchido
- a linha morta deve ter `processed_at` **nulo**
- a linha morta NÃO deve ser reivindicada num ciclo seguinte

Leia o `select` do helper de leitura no topo do arquivo (`SELECT attempts, last_error, processed_at, lease_until, claimed_by FROM shared_outbox WHERE id = ?`) e acrescente `dead_at` a ele, com o campo correspondente na struct — sem isso não há como assertar a coluna nova.

### Step T3.2 — Rodar e ver falhar

Run: `cd packages/api/go && go test ./core/services/outbox/... -count=1`
Expected: FAIL — `dead_at` vem nulo e `processed_at` preenchido, porque o `fail()` ainda carimba o campo antigo.

### Step T3.3 — O dead-letter do Go carimba dead_at

Modify `packages/api/go/core/services/outbox/sqlite_outbox_dispatcher.go`, dentro de `fail()`, no ramo `attempts >= sqliteMaxAttempts`: o `UPDATE` passa de `SET attempts = ?, last_error = ?, processed_at = ?, claimed_by = NULL` para `SET attempts = ?, last_error = ?, dead_at = ?, claimed_by = NULL`.

Substitua também o comentário `// processed_at set → stops being claimed; last_error kept for audit.` por uma explicação do contrato novo: `dead_at` é o que tira a linha do voo (a claim query o exclui), `processed_at` fica reservado para entrega bem-sucedida, e `last_error` segue sendo o porquê. Vale registrar que é o mesmo par que `agent_mailbox` usa.

### Step T3.4 — A claim query do Go exclui dead_at

Modify o mesmo arquivo, na subconsulta da reivindicação (por volta da linha 180): acrescente `AND dead_at IS NULL` logo após `AND processed_at IS NULL`.

Sem isto, o passo anterior faria uma linha morta voltar a ser reivindicada para sempre — ela deixaria de ter `processed_at` e nada mais a excluiria.

### Step T3.5 — Rodar e ver passar

Run: `cd packages/api/go && go test ./core/services/outbox/... -count=1 -race`
Expected: PASS. Rode com `-count=1` para não pegar cache e com `-race` porque o despachante tem concorrência.

### Step T3.6 — Suíte Go completa

Run: `cd packages/api/go && go build ./... && bun x nx run api-go:test`
Expected: build limpo e suíte verde.

### Step T3.7 — Commit

```bash
git add packages/api/go/core/services/outbox/
git commit -m "feat(core-go): a lane Go marca morte com dead_at, não com processed_at (Task T3)"
```

---

## Task T4: A pergunta "há falhas silenciosas?" tem um lugar declarado

**Files to write:**
- Modify: `packages/api/typescript/src/shared/registry.ts` — adiciona o health check da contagem de mortos

**Files to read:**
- `packages/api/typescript/src/shared/registry.ts` (as entradas `HEALTH_CHECKS` existentes, linhas 95-105)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** T2
**Consumes (frozen):** a coluna `outbox.deadAt` (T1), preenchida pela lane TypeScript (T2); `HEALTH_CHECKS`, `PollingHealthCheck` e `resolve` de `@codm/core-typescript`; `LibSqlDatabaseDriver`; a tabela `outbox` de `@codm/contracts/db`.
**Scope fence:** LEFT — uma entrada de health check reportando a contagem. OUT — alarme, notificação, badge no dock ou qualquer superfície de UI (Fora de escopo na spec: esta Task dá o número, para onde ele vai é decisão de produto). NÃO crie service novo, repositório novo nem use case: o registry já resolve o driver e a contagem é uma query.
**Gate:** `bun tsc && cd packages/api/typescript && bun test`

### Step T4.1 — Registrar o check

Modify `packages/api/typescript/src/shared/registry.ts`: junto às entradas `HEALTH_CHECKS` existentes (ao lado de `outboxDispatcher`, linha ~97), adicione uma que reporte a contagem de `outbox.deadAt IS NOT NULL`.

O check deve seguir a forma das entradas vizinhas (`useFactory` recebendo o container, resolvendo o que precisa). Nomeie-o `outboxDeadLetters`. O valor reportado é a contagem; **zero é o estado saudável**, e é justamente por sair do zero que ele existe — o incidente que originou esta spec durou duas semanas porque ninguém tinha onde ver esse número.

Leia as entradas vizinhas antes de escrever: elas usam `PollingHealthCheck` sobre um serviço que já expõe estado. Se a forma existente não acomodar uma contagem por query, use o mecanismo de health check que o `HEALTH_CHECKS` aceitar — **não** invente um tipo novo de check nem envolva a query num service só para caber num molde.

### Step T4.2 — Verificar que reporta zero num sistema são

Run: `cd packages/api/typescript && bun test`
Expected: suíte verde. Se houver teste de health que enumere os checks registrados, ele passa a ver `outboxDeadLetters` — atualize a expectativa.

### Step T4.3 — Verificar que sai do zero quando algo morre

Rode a suíte do outbox de T2, que produz linhas mortas, e confirme pela query direta:

```bash
cd packages/api/typescript && bun test core/src/services/OutboxDispatcher/
```

O AC-7 é observável pela mesma consulta que o check faz: `SELECT count(*) FROM shared_outbox WHERE dead_at IS NOT NULL`. Se a suíte de T2 deixa linhas mortas no banco de teste, o número sai do zero — é essa a afirmação.

### Step T4.4 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T4.5 — Commit

```bash
git add packages/api/typescript/src/shared/registry.ts
git commit -m "feat(shared): health check publica a contagem de eventos mortos no outbox (Task T4)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — todos os testes passam
- [ ] `bun run --cwd packages/contracts db:check-go` — as duas cópias da migração byte-a-byte iguais
- [ ] `cd packages/api/go && go test ./core/services/outbox/... -count=1 -race` — a lane Go verde sob detector de race
- [ ] `bun run detect` — os sete detectores mecânicos limpos
- [ ] AC mapping (cada AC da spec → ≥1 verificação):
  - AC-1 → `bun run --cwd packages/contracts db:check-go` (Step T1.3) + a coluna confirmada no Step T1.5
  - AC-2 → `core/src/services/OutboxDispatcher/LibSqlOutboxDispatcher.deadAt.test.ts:"AC-2: um evento que esgota MAX_ATTEMPTS termina com dead_at e SEM processed_at"`
  - AC-3 → mesmo arquivo, `"AC-3: um evento recolhido pelo poison sweep termina com dead_at e SEM processed_at"`
  - AC-4 → `packages/api/go/core/services/outbox/sqlite_outbox_dispatcher_test.go` (Step T3.1)
  - AC-5 → mesmo arquivo TS, `"AC-5: um evento morto NÃO é reivindicado de novo"` + a asserção equivalente no teste Go
  - AC-6 → mesmo arquivo TS, `"AC-6: um evento entregue com sucesso mantém processed_at, dead_at nulo…"`
  - AC-7 → Step T4.3 (a contagem sai do zero quando a suíte de T2 produz mortos)
  - AC-8 → `sqlite_outbox_dispatcher_test.go` reescrito no Step T3.1, sem perder a cobertura de não-reivindicação

## Notes

**Sem E2E.** A mudança é de persistência e de dois despachantes de fundo; nada atravessa HTTP ou UI. O flow de integração de T2 e a suíte Go de T3 cobrem o que um e2e cobriria.

**Sem SDK.** Nenhum controller ou schema de wire muda. Se o `git diff` mostrar `packages/client/dist/` ou `openapi.json`, algo saiu do escopo.

**A migração é aditiva e sem backfill** (Decisão 5 da spec). As linhas históricas ficam com `dead_at` nulo, inclusive as duas que sabemos estarem mortas — a resposta honesta sobre elas é "não dá para saber", porque `last_error` não é limpo no sucesso e não distingue morto de "falhou e depois deu certo".

**Ordem de deploy não é obrigatória**, mas a consequência vale registrar: um evento morto pelo gateway Go ANTES do T3 não terá `dead_at`, e portanto não aparecerá na consulta até o gateway atualizar. Durante a janela, a lane antiga continua carimbando `processed_at`, o que a mantém fora da fila em qualquer das duas versões da cláusula.

**Defeito conhecido de planos anteriores, para não repetir:** `ownerId: 'integration-tenant'` não é UUID e faz as entidades lançarem `INVALID_ENTITY`. Se algum teste precisar de owner, use `MOCK_CLOUD_OWNER_ID` de `@shared/services/CloudSession/MockCloudSession`.
