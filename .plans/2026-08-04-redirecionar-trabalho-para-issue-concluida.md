# Redirecionar trabalho para uma issue concluída — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O operador redireciona trabalho para uma issue que já concluiu com uma frase na conversa, sem abrir issue nova e sem perder o contexto da sessão; e a instrução permanente da thread passa a valer para quem trabalha, não só para quem conversa.

**Architecture:** `Issue` ganha a transição de volta (`reopen()`), exposta pelo use case `ReopenIssue` no contexto `issue` — comando do operador, na mesma forma de `ArchiveIssue`/`RestoreIssue`, sem evento novo e sem contrato frozen. O contexto `thread` ganha uma pergunta nova no seu read-service (`steerableIssue`: pertence à thread E não arquivada, qualquer status), que falha fechado por ser guard. O contexto `agent` ganha o use case `SteerIssueTurn`, que compõe reabrir + enfileirar numa transação só, e o controller homônimo passa a delegar. Em paralelo, `thread.customPrompt` — hoje injetado só no orquestrador — passa a alcançar o `IssueWorkAgent` com moldura própria.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, TanStack Router/Query, Zod, Tailwind

**Spec:** .specs/2026-08-04-redirecionar-trabalho-para-issue-concluida-design.md
**Tasks:** 5
**Estimated minutes:** 145

---

## Task T1: Uma issue concluída pode voltar a trabalhar

**Files to write:**
- Modify: `packages/api/typescript/src/issue/entities/Issue.ts` — adiciona o método `reopen()`
- Modify: `packages/api/typescript/src/issue/errors/index.ts` — adiciona `ISSUE_NOT_COMPLETED` à união e ao registro de códigos
- Create: `packages/api/typescript/src/issue/usecases/ReopenIssue.ts`
- Modify: `packages/api/typescript/src/issue/usecases/index.ts` — exporta `ReopenIssue`
- Modify: `packages/app/react/src/locales/pt.json` — tradução de `ISSUE_NOT_COMPLETED`
- Modify: `packages/app/react/src/locales/en.json` — tradução de `ISSUE_NOT_COMPLETED`
- Test: `packages/api/typescript/src/issue/entities/Issue.test.ts` — invariantes de `reopen()`
- Test: `packages/api/typescript/src/issue/usecases/IssueLifecycle.test.ts` — reaberta não é auto-arquivada

**Files to read:**
- `packages/api/typescript/src/issue/usecases/ArchiveIssue.ts`
- `packages/api/typescript/src/issue/usecases/AutoArchiveCompletedIssues.ts`
- `packages/api/typescript/tests/support/given/issues.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /errors, /usecase, /test
**Depends on:** (none)
**Consumes (frozen):** `IssueStatus` de `@codm/contracts-typescript/wire/enums` (membros `WORKING`, `COMPLETED`); `AggregateRoot`, `BaseError`, `Handler`, `z`, `HttpStatusCode`, `registerErrorCodes` de `@codm/core-typescript`.
**Scope fence:** DONE elsewhere — nada; esta é a Task raiz. OUT — o steer (T2 é dono), a propagação do `customPrompt` (T3), o prompt do orquestrador (T4), a regen do SDK (T5). Não toque em `agent/` nem em `thread/` nesta Task.
**Gate:** `cd packages/api/typescript && bun test src/issue/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T1.1 — Escrever o teste que falha (entidade)

Adicione ao final do `describe` existente em `packages/api/typescript/src/issue/entities/Issue.test.ts`:

```typescript
describe('reopen', () => {
	const completed = () => {
		const issue = Issue.open({
			ownerId: '00000000-0000-4000-8000-000000000001',
			threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
			key: 'pix-payment',
			title: 'Pix payment',
			provider: ProviderKind.CLAUDE_CODE,
		})
		issue.complete()
		return issue
	}

	it('leva uma issue concluída de volta para WORKING e zera completedAt', () => {
		const issue = completed()
		expect(issue.status).toBe(IssueStatus.COMPLETED)
		expect(issue.completedAt).toBeDefined()

		issue.reopen()

		expect(issue.status).toBe(IssueStatus.WORKING)
		// Zerado, não apenas ignorado: `AutoArchiveCompletedIssues` seleciona por esta coluna.
		expect(issue.completedAt).toBeUndefined()
	})

	it('recusa uma issue arquivada', () => {
		const issue = completed()
		issue.archive(IssueArchiveReason.MANUAL)
		expect(() => issue.reopen()).toThrow('ISSUE_ARCHIVED')
	})

	it('recusa uma issue que não está concluída', () => {
		const issue = Issue.open({
			ownerId: '00000000-0000-4000-8000-000000000001',
			threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
			key: 'pix-payment',
			title: 'Pix payment',
			provider: ProviderKind.CLAUDE_CODE,
		})
		expect(issue.status).toBe(IssueStatus.WORKING)
		expect(() => issue.reopen()).toThrow('ISSUE_NOT_COMPLETED')
	})
})
```

Garanta que o arquivo importa `IssueArchiveReason` e `IssueStatus` de `@codm/contracts-typescript/wire/enums` e `ProviderKind` da mesma origem.

### Step T1.2 — Rodar o teste para confirmar que falha

Run: `cd packages/api/typescript && bun test src/issue/entities/Issue.test.ts`
Expected: FAIL — `issue.reopen is not a function`

### Step T1.3 — Adicionar o código de erro

Modifique `packages/api/typescript/src/issue/errors/index.ts`: acrescente `| 'ISSUE_NOT_COMPLETED'` ao final da união `IssueDomainErrors` e, dentro de `registerErrorCodes({...})`, acrescente a linha `ISSUE_NOT_COMPLETED: HttpStatusCode.UNPROCESSABLE_ENTITY,` logo depois de `ISSUE_ALREADY_COMPLETED`.

### Step T1.4 — Adicionar `reopen()` à entidade

Modifique `packages/api/typescript/src/issue/entities/Issue.ts`: insira o método abaixo imediatamente depois de `complete()` e antes de `archive()`.

```typescript
	/**
	 * COMPLETED → WORKING — o caminho de volta, e o ÚNICO.
	 *
	 * Não existe um "reabrir" que o operador aciona por si: receber trabalho é o que reabre uma issue
	 * (spec Decisão 4). Reabrir sem instrução deixaria a issue em `WORKING` sem nada enfileirado, que é
	 * um estado que ninguém consegue explicar depois. Por isso este método é chamado do caminho do
	 * steer e de lugar nenhum além dele.
	 *
	 * `completedAt` é ZERADO, e isso não é arrumação: `AutoArchiveCompletedIssues` seleciona por essa
	 * coluna. Uma issue reaberta que mantivesse o carimbo antigo seria arquivada por baixo de um agente
	 * que está trabalhando dentro dela — o pior tipo de bug, porque o sintoma aparece longe da causa.
	 */
	reopen(): void {
		this.assertNotArchived()
		if (this.status !== IssueStatus.COMPLETED) throw new BaseError<DomainErrors>('ISSUE_NOT_COMPLETED')
		this.status = IssueStatus.WORKING
		this.completedAt = undefined
	}
```

### Step T1.5 — Rodar o teste da entidade para confirmar que passa

Run: `cd packages/api/typescript && bun test src/issue/entities/Issue.test.ts`
Expected: PASS — os 3 testes novos de `reopen` passam junto com os já existentes

### Step T1.6 — Scaffold do use case

```bash
bun cli usecase issue ReopenIssue
```

### Step T1.7 — Proposed file (o executor escreve por cima do scaffold)

```typescript
// packages/api/typescript/src/issue/usecases/ReopenIssue.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueRepository } from '../repositories/IssueRepository'
import type { ApplicationErrors } from '../errors'

export const ReopenIssueInputSchema = z.object({ ownerId: z.uuid(), issueId: z.uuid() })
export const ReopenIssueOutputSchema = z.void()

/**
 * Devolve uma issue concluída ao trabalho.
 *
 * ### Por que NÃO publica evento
 * `issue/events/index.ts` declara a regra: fatos de execução (opened / completed) são publicados pelo
 * terminal engine e o BC5 REAGE a eles, não os re-publica. `IssueArchivedEvent` existe porque arquivar
 * é fato que este contexto possui. Reabrir chega por comando do operador, pela mesma porta que
 * `ArchiveIssue` e `RestoreIssue` — nenhum dos dois inventa um evento de execução, e este também não.
 *
 * ### Por que aceita `tx`
 * O chamador é `agent/usecases/SteerIssueTurn`, que precisa reabrir e enfileirar o `STEER` na MESMA
 * transação: um steer que commita sempre reabriu, e um que falha nunca deixa a issue em `WORKING` sem
 * trabalho na fila. `Handler.withTransaction` já une-se à transação recebida em vez de abrir outra.
 */
@injectable()
export class ReopenIssue extends Handler<typeof ReopenIssueInputSchema, typeof ReopenIssueOutputSchema> {
	readonly name = 'reopen_issue' as const
	readonly inputSchema = ReopenIssueInputSchema
	readonly outputSchema = ReopenIssueOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const issue = await this.issues.findById(input.issueId)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		issue.reopen()
		await this.withTransaction(tx, async tx => {
			await this.issues.save(issue, tx)
		})
	}
}
```

### Step T1.8 — Exportar o use case

Modifique `packages/api/typescript/src/issue/usecases/index.ts`: acrescente `export * from './ReopenIssue'` mantendo a ordem alfabética das linhas existentes.

### Step T1.9 — Teste de que a issue reaberta não é auto-arquivada

Adicione a `packages/api/typescript/src/issue/usecases/IssueLifecycle.test.ts`, dentro do `describe` de topo já existente:

```typescript
it('uma issue reaberta não é selecionada pelo auto-arquivamento', async () => {
	const reopenIssue = testBed.resolve(ReopenIssue)
	const autoArchive = testBed.resolve(AutoArchiveCompletedIssues)
	// `AutoArchiveCompletedIssues` varre por `completedBefore(now - WINDOW_MS)`, então as duas
	// precisam estar VENCIDAS. Sem retrodatar, nenhuma seria arquivada e o teste passaria vazio,
	// sem provar nada sobre a reabertura.
	const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000)

	const control = await givenIssue(testBed, { status: IssueStatus.COMPLETED, completedAt: staleAt })
	const reopened = await givenIssue(testBed, { status: IssueStatus.COMPLETED, completedAt: staleAt })

	await reopenIssue.execute({ ownerId: testBed.ownerId, issueId: reopened.id.value })
	const { archivedIssueIds } = await autoArchive.execute({})

	// O controle prova que o varredor está de fato funcionando nesta janela…
	expect(archivedIssueIds).toContain(control.id.value)
	// …e a reaberta escapou dele, porque `reopen()` zerou o carimbo pelo qual ele seleciona.
	expect(archivedIssueIds).not.toContain(reopened.id.value)

	const after = await testBed.resolve(IssueRepository).findById(reopened.id.value)
	expect(after?.archived).toBe(false)
	expect(after?.status).toBe(IssueStatus.WORKING)
})
```

`givenIssue(testBed, { status, completedAt })` já existe em `packages/api/typescript/tests/support/given/issues.ts` e aceita esses dois overrides — use-o em vez de montar a entidade à mão.

### Step T1.10 — Traduções do código de erro

Modifique `packages/app/react/src/locales/pt.json`: no objeto `"errors"`, depois de `"ISSUE_NOT_FOUND"`, acrescente `"ISSUE_NOT_COMPLETED": "Esta issue não está concluída."` mantendo a ordem alfabética das chaves.

Modifique `packages/app/react/src/locales/en.json`: no mesmo lugar, acrescente `"ISSUE_NOT_COMPLETED": "This issue is not completed."`.

### Step T1.11 — Rodar os testes do contexto

Run: `cd packages/api/typescript && bun test src/issue/`
Expected: PASS — todos os testes de `issue/` passam

### Step T1.12 — Type check + lint

Run: `bun x tsc -p packages/api/typescript/tsconfig.build.json --noEmit && bun lint`
Expected: 0 erros

### Step T1.13 — Commit

```bash
git add packages/api/typescript/src/issue/entities/Issue.ts \
        packages/api/typescript/src/issue/entities/Issue.test.ts \
        packages/api/typescript/src/issue/errors/index.ts \
        packages/api/typescript/src/issue/usecases/ReopenIssue.ts \
        packages/api/typescript/src/issue/usecases/index.ts \
        packages/api/typescript/src/issue/usecases/IssueLifecycle.test.ts \
        packages/app/react/src/locales/pt.json \
        packages/app/react/src/locales/en.json
git commit -m "feat(issue): uma issue concluída pode voltar a trabalhar (Task T1)"
```

---

## Task T2: O steer direcionado alcança uma issue concluída e a reabre

**Files to write:**
- Modify: `packages/api/typescript/src/thread/services/OpenIssuesReader/OpenIssuesReader.ts` — adiciona `SteerableIssueRef` e o método `steerableIssue`
- Modify: `packages/api/typescript/src/thread/services/OpenIssuesReader/DrizzleOpenIssuesReader.ts` — implementa `steerableIssue`
- Modify: `packages/api/typescript/src/thread/services/OpenIssuesReader/MockOpenIssuesReader.ts` — implementa `steerableIssue`
- Create: `packages/api/typescript/src/agent/usecases/SteerIssueTurn.ts`
- Modify: `packages/api/typescript/src/agent/usecases/index.ts` — exporta `SteerIssueTurn`
- Modify: `packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts` — delega ao use case
- Test: `packages/api/typescript/tests/flows/steer.flow.test.ts` — reabertura, recusa indistinguível, atomicidade, whisper inalterado

**Files to read:**
- `packages/api/typescript/src/thread/usecases/SteerThread.ts`
- `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /usecase, /controller, /test
**Depends on:** T1
**Consumes (frozen):** de T1 — a classe `ReopenIssue` e `ReopenIssueInputSchema` exportadas por `packages/api/typescript/src/issue/usecases/index.ts` (importar como `import { ReopenIssue } from '@issue/usecases'`), com o input `{ ownerId, issueId }`; o método de entidade `Issue.reopen()`; o código `ISSUE_NOT_COMPLETED`. Já frozen no repo: `MailboxItemKind.STEER`, `MailboxTargetKind.ISSUE`, `MailboxRepository.enqueue({ ownerId, targetKind, targetId, kind, payload, dedupKey }, tx?)`, `OpenIssuesReader`, `AgentRunIdentityCtxSchema`, `AgentInterfaceErrors` (`AGENT_RUN_TOKEN_INVALID`, `AGENT_RUN_SCOPE_MISMATCH`).
**Scope fence:** DONE elsewhere — `Issue.reopen()` e `ReopenIssue` (T1 é dono; consuma, não redefina). OUT — `customPrompt` em qualquer arquivo (T3), o prompt do orquestrador (T4), a regen do SDK (T5). NÃO altere `openIssues`, `issueIdForEntry` nem `hasWorkingIssue`: o whisper de `SteerThread` depende de `openIssues` continuar excluindo `COMPLETED` (AC-11).
**Gate:** `cd packages/api/typescript && bun test tests/flows/steer.flow.test.ts src/agent/ src/thread/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T2.1 — Escrever o teste que falha (fluxo)

Adicione a `packages/api/typescript/tests/flows/steer.flow.test.ts`:

```typescript
describe('steer direcionado numa issue concluída', () => {
	it('reabre a issue e enfileira o STEER', async () => {
		const { thread, issue } = await givenCompletedIssue(testBed)
		const steer = testBed.resolve(SteerIssueTurn)

		await steer.execute({
			ownerId: testBed.ownerId,
			threadId: thread.id.value,
			issueId: issue.id.value,
			entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
			text: 'já pode subir o PR',
		})

		const reopened = await testBed.resolve(IssueRepository).findById(issue.id.value)
		expect(reopened?.status).toBe(IssueStatus.WORKING)
		expect(reopened?.completedAt).toBeUndefined()

		const mailbox = testBed.resolve(MailboxRepository)
		expect(await mailbox.hasPending(MailboxTargetKind.ISSUE, issue.id.value)).toBe(true)
	})

	it('recusa issue de outra thread e issue arquivada de forma INDISTINGUÍVEL', async () => {
		const steer = testBed.resolve(SteerIssueTurn)
		const { thread } = await givenCompletedIssue(testBed)
		const foreign = await givenCompletedIssue(testBed)
		const archived = await givenCompletedIssue(testBed)
		await testBed.resolve(ArchiveIssue).execute({ ownerId: testBed.ownerId, issueId: archived.issue.id.value })

		const errors: string[] = []
		for (const issueId of [foreign.issue.id.value, archived.issue.id.value]) {
			try {
				await steer.execute({
					ownerId: testBed.ownerId,
					threadId: thread.id.value,
					issueId,
					entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
					text: 'já pode subir o PR',
				})
				throw new Error('deveria ter recusado')
			} catch (error) {
				errors.push(error instanceof BaseError ? `${error.code}:${error.message}` : String(error))
			}
		}

		// A propriedade: as duas recusas são a MESMA string. Responder diferente faria deste endpoint
		// um oráculo de ids — dá para varrer uuids e descobrir quais existem.
		expect(errors[0]).toBe(errors[1])
		expect(errors[0]).toContain('AGENT_RUN_SCOPE_MISMATCH')
	})

	it('não deixa a issue reaberta quando o enfileiramento falha', async () => {
		const { thread, issue } = await givenCompletedIssue(testBed)
		const steer = testBed.resolve(SteerIssueTurn)
		const mailbox = testBed.resolve(MailboxRepository)
		const boom = new Error('mailbox down')
		mailbox.enqueue = async () => {
			throw boom
		}

		await expect(
			steer.execute({
				ownerId: testBed.ownerId,
				threadId: thread.id.value,
				issueId: issue.id.value,
				entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
				text: 'já pode subir o PR',
			}),
		).rejects.toThrow('mailbox down')

		// Mesma transação: sem STEER na fila, a issue NÃO ficou em WORKING.
		const after = await testBed.resolve(IssueRepository).findById(issue.id.value)
		expect(after?.status).toBe(IssueStatus.COMPLETED)
	})

	it('o whisper da thread continua não alcançando issue concluída', async () => {
		const { thread, issue } = await givenCompletedIssue(testBed)
		await testBed.resolve(SteerThread).execute({ ownerId: testBed.ownerId, threadId: thread.id.value, text: 'muda o rumo' })

		const mailbox = testBed.resolve(MailboxRepository)
		expect(await mailbox.hasPending(MailboxTargetKind.ISSUE, issue.id.value)).toBe(false)
	})
})
```

Escreva o helper `givenCompletedIssue(testBed)` no mesmo arquivo (ou reutilize os `given` existentes em `packages/api/typescript/tests/support/given/issues.ts` se já cobrirem thread + issue concluída): ele cria owner, workspace, thread e uma issue já `COMPLETED`, retornando `{ thread, issue }`.

### Step T2.2 — Rodar o teste para confirmar que falha

Run: `cd packages/api/typescript && bun test tests/flows/steer.flow.test.ts`
Expected: FAIL — `Cannot find module '../../src/agent/usecases/SteerIssueTurn'` (ou `SteerIssueTurn is not exported`)

### Step T2.3 — Proposed file: a pergunta nova do read-service

```typescript
// packages/api/typescript/src/thread/services/OpenIssuesReader/OpenIssuesReader.ts — arquivo final COMPLETO
/**
 * An open issue a message could be routed to — the element type this reader returns.
 *
 * It LIVES HERE, in the thread context, and Fase 5 moved it here from the agent context
 * (GOAL-agent-abstraction §5.3). The reason is direction, not tidiness: an "open issue of a thread" is
 * a THREAD concept, and having the agent context own it forced `thread/` to import a type from the
 * consumer of its own read seam. Owned here, the dependency points the way the CONTEXT_MAP already
 * declares — `agent → thread` — and `IssueRouter` (which renders these into the classification prompt)
 * is the importer rather than the exporter.
 */
export interface OpenIssueRef {
	issueId: string
	key: string
	title: string
}

/**
 * Uma issue que o orquestrador PODE steerar — o mesmo shape, mais o estado que decide se o steer
 * precisa reabri-la antes de enfileirar.
 *
 * `completed` é um boolean e não o `IssueStatus` inteiro de propósito: o chamador só tem uma decisão a
 * tomar ("preciso reabrir?"), e devolver o enum convidaria o contexto `agent` a ramificar sobre o
 * ciclo de vida da issue, que não é dele.
 */
export interface SteerableIssueRef extends OpenIssueRef {
	completed: boolean
}

/**
 * Reads the open (non-completed, non-archived) issues of a thread — the classifier's context-match
 * candidate set. Modeled as a read Service (BFF-style table read, not a cross-context write-model
 * import): the classification decision needs to know what issues already exist on the thread.
 */
export abstract class OpenIssuesReader {
	abstract openIssues(threadId: string): Promise<OpenIssueRef[]>
	/** Resolve which issue a transcript entry was routed to (for reply-quote authority). */
	abstract issueIdForEntry(entryId: string): Promise<string | undefined>
	/**
	 * Is an agent WORKING on this thread right now? The live-work half of the delete guard
	 * (thread-deletion spec, decision 2), which `DeleteThread` pairs with `ThreadRepository.openStops`.
	 *
	 * Deliberately narrower than `openIssues`, and the two must not be conflated: `openIssues` is the
	 * classifier's candidate set (anything non-archived and non-COMPLETED — a NEEDS_INPUT issue belongs
	 * in it), while this asks the far smaller question the decision names, "non-archived AND WORKING".
	 * An operator whose thread is full of issues waiting on THEM must still be able to delete it.
	 */
	abstract hasWorkingIssue(threadId: string): Promise<boolean>
	/**
	 * Esta issue é steerável POR ESTA THREAD? — a terceira pergunta distinta, e distinta de propósito.
	 *
	 * `openIssues` é o conjunto candidato do classificador e por isso exclui `COMPLETED`. Redirecionar
	 * trabalho é outra coisa: uma issue concluída é um alvo LEGÍTIMO (é o caminho de volta que a spec
	 * abre), e só o arquivamento a torna inalcançável. Reusar `openIssues` aqui foi exatamente o que
	 * fez o steer recusar uma issue concluída com `AGENT_RUN_SCOPE_MISMATCH`.
	 *
	 * Devolve `undefined` para "não é sua" E para "está arquivada", sem distinguir: o chamador
	 * transforma os dois no mesmo erro, e é isso que impede o endpoint de virar oráculo de ids.
	 */
	abstract steerableIssue(threadId: string, issueId: string): Promise<SteerableIssueRef | undefined>
}
```

### Step T2.4 — Proposed file: implementação Drizzle

```typescript
// packages/api/typescript/src/thread/services/OpenIssuesReader/DrizzleOpenIssuesReader.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { and, eq, ne } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codm/core-typescript'
import { issues, transcriptEntries } from '@codm/contracts/db'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import type { OpenIssueRef, SteerableIssueRef } from './OpenIssuesReader'
import { OpenIssuesReader } from './OpenIssuesReader'

@injectable()
export class DrizzleOpenIssuesReader extends OpenIssuesReader {
	constructor(private db: DrizzleClient) {
		super()
	}

	async openIssues(threadId: string): Promise<OpenIssueRef[]> {
		const result = await tryCatchAsync(async () =>
			this.db
				.select({ issueId: issues.id, key: issues.key, title: issues.title })
				.from(issues)
				.where(and(eq(issues.threadId, threadId), eq(issues.archived, false), ne(issues.status, IssueStatus.COMPLETED))),
		)
		return result.success ? result.data : []
	}

	/**
	 * NO `tryCatchAsync`, unlike its two siblings — and the asymmetry is the point.
	 *
	 * `openIssues` and `issueIdForEntry` feed a CLASSIFIER: degrading to "no candidates" on a read error
	 * costs a context match and the message still lands. This one feeds a GUARD on a destructive action,
	 * where the same posture reads "I could not check, so go ahead and delete it" — a read failure would
	 * silently authorise the exact thing decision 2 exists to refuse. A guard that cannot read must fail
	 * CLOSED, and the honest way to fail closed is to let the error out.
	 */
	async hasWorkingIssue(threadId: string): Promise<boolean> {
		const rows = await this.db
			.select({ id: issues.id })
			.from(issues)
			.where(and(eq(issues.threadId, threadId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))
			.limit(1)
		return rows.length > 0
	}

	async issueIdForEntry(entryId: string): Promise<string | undefined> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.db
				.select({ issueId: transcriptEntries.issueId })
				.from(transcriptEntries)
				.where(eq(transcriptEntries.id, entryId))
				.limit(1)
			return rows[0]?.issueId ?? undefined
		})
		return result.success ? (result.data ?? undefined) : undefined
	}

	/**
	 * SEM `tryCatchAsync`, pela mesma razão que `hasWorkingIssue`: isto alimenta um GUARD de
	 * autorização, não um classificador. Degradar para `undefined` num erro de leitura diria "não
	 * consegui verificar, então recuse" — o que parece seguro mas transforma qualquer soluço do banco
	 * numa recusa silenciosa que o operador leria como "o agente me ignorou de novo". Deixar o erro
	 * sair é a forma honesta de falhar.
	 */
	async steerableIssue(threadId: string, issueId: string): Promise<SteerableIssueRef | undefined> {
		const rows = await this.db
			.select({ issueId: issues.id, key: issues.key, title: issues.title, status: issues.status })
			.from(issues)
			.where(and(eq(issues.threadId, threadId), eq(issues.id, issueId), eq(issues.archived, false)))
			.limit(1)
		const row = rows[0]
		if (!row) return undefined
		return { issueId: row.issueId, key: row.key, title: row.title, completed: row.status === IssueStatus.COMPLETED }
	}
}
```

### Step T2.5 — Proposed file: implementação Mock

```typescript
// packages/api/typescript/src/thread/services/OpenIssuesReader/MockOpenIssuesReader.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import type { OpenIssueRef, SteerableIssueRef } from './OpenIssuesReader'
import { OpenIssuesReader } from './OpenIssuesReader'

@injectable()
export class MockOpenIssuesReader extends OpenIssuesReader {
	async openIssues(_threadId: string): Promise<OpenIssueRef[]> {
		return []
	}

	async issueIdForEntry(_entryId: string): Promise<string | undefined> {
		return undefined
	}

	/** No issue table at all in `mock`, so nothing is working — this half never blocks a delete. */
	async hasWorkingIssue(_threadId: string): Promise<boolean> {
		return false
	}

	/** Mesma razão: sem tabela de issues em `mock`, nada é steerável. */
	async steerableIssue(_threadId: string, _issueId: string): Promise<SteerableIssueRef | undefined> {
		return undefined
	}
}
```

### Step T2.6 — Scaffold do use case

```bash
bun cli usecase agent SteerIssueTurn
```

### Step T2.7 — Proposed file: o use case que compõe reabrir + enfileirar

```typescript
// packages/api/typescript/src/agent/usecases/SteerIssueTurn.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { OpenIssuesReader } from '@thread/services'
import { ReopenIssue } from '@issue/usecases'
import { MailboxRepository } from '../repositories'
import type { AgentInterfaceErrors } from '../errors'

export const SteerIssueTurnInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid(),
	/** A entrada do transcript que o orquestrador respondia quando decidiu steerar — a chave de dedup. */
	entryId: z.uuid().optional(),
	text: z.string().trim().min(1),
})
export const SteerIssueTurnOutputSchema = z.object({ issueId: z.uuid(), queued: z.boolean() })

/**
 * Redireciona trabalho para uma issue desta thread — reabrindo-a quando já concluiu.
 *
 * ### Por que isto é um use case e não ficou no controller
 * Reabrir e enfileirar precisam commitar JUNTOS. Um controller não abre transação (só `Handler` tem
 * `withTransaction`), e sem transação existiriam dois estados impossíveis de explicar depois: uma
 * issue em `WORKING` sem nada na fila (o agente nunca acorda, e a console mostra trabalho que não
 * existe) ou um `STEER` enfileirado contra uma issue ainda `COMPLETED` (o turno roda e falha ao
 * concluir de novo). O `SteerThread` vizinho já resolve o mesmo problema do mesmo jeito.
 *
 * ### A recusa é deliberadamente cega
 * `steerableIssue` devolve `undefined` tanto para "não é desta thread" quanto para "está arquivada", e
 * este método transforma os dois no MESMO erro com a MESMA mensagem. Responder diferente diria ao
 * chamador se um uuid existe — e o chamador aqui é um modelo de linguagem com um token de run.
 */
@injectable()
export class SteerIssueTurn extends Handler<typeof SteerIssueTurnInputSchema, typeof SteerIssueTurnOutputSchema> {
	readonly name = 'steer_issue_turn' as const
	readonly inputSchema = SteerIssueTurnInputSchema
	readonly outputSchema = SteerIssueTurnOutputSchema

	constructor(
		private readonly openIssues: OpenIssuesReader,
		private readonly reopenIssue: ReopenIssue,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const target = await this.openIssues.steerableIssue(input.threadId, input.issueId)
		if (!target) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'no steerable issue with that id on this thread')
		}

		return this.withTransaction(tx, async tx => {
			// Só reabre o que está concluído: chamar `reopen()` numa issue em `WORKING` levantaria
			// `ISSUE_NOT_COMPLETED` e derrubaria um steer perfeitamente válido de trabalho em andamento,
			// que é o caso mais comum deste endpoint.
			if (target.completed) {
				await this.reopenIssue.execute({ ownerId: input.ownerId, issueId: input.issueId }, tx)
			}

			const queued = await this.mailbox.enqueue(
				{
					ownerId: input.ownerId,
					targetKind: MailboxTargetKind.ISSUE,
					targetId: input.issueId,
					kind: MailboxItemKind.STEER,
					payload: { issueId: input.issueId, threadId: input.threadId, key: target.key, title: target.title, text: input.text },
					// Dois steers de dois turnos são dois itens; o mesmo turno repetido é um só.
					dedupKey: `steer:${input.entryId ?? input.issueId}:${input.issueId}`,
				},
				tx,
			)

			return { issueId: input.issueId, queued }
		})
	}
}
```

A assinatura é `Handler.execute(input: this['input'], tx?: Tx)` (`packages/api/typescript/core/src/types/Handler.ts:94`), então `this.reopenIssue.execute({...}, tx)` propaga a transação aberta aqui em vez de abrir outra — é assim que os dois writes commitam juntos.

### Step T2.8 — Exportar o use case

Modifique `packages/api/typescript/src/agent/usecases/index.ts`: acrescente `export * from './SteerIssueTurn'` mantendo a ordem das linhas existentes.

### Step T2.9 — Proposed file: o controller passa a delegar

```typescript
// packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { AgentRunIdentityCtxSchema } from '../types/AgentRunIdentity'
import { SteerIssueTurn } from '../usecases/SteerIssueTurn'
import type { AgentInterfaceErrors } from '../errors'

/**
 * Same `ctx` contract as `ForkIssue`, and COMPOSED from the same single declaration, for the same
 * reason: a value a middleware stamps but the schema never names is STRIPPED by Zod before `handle`
 * sees it.
 */
export const SteerIssueTurnControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape),
		params: z.object({ threadId: z.uuid(), issueId: z.uuid() }),
		body: z.object({
			/** The new instruction for work already in flight — or for work that already finished. */
			text: z.string().trim().min(1).max(2000),
		}),
	})
	.example([
		{
			ctx: {
				ownerId: '00000000-0000-4000-8000-000000000001',
				agentIdentity: {
					ownerId: '00000000-0000-4000-8000-000000000001',
					threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
					entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
					scope: McpScope.orchestration,
				},
			},
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: { text: 'prefira o refactor menor' },
		},
	])

export const SteerIssueTurnControllerOutputSchema = z
	.object({ issueId: z.uuid(), queued: z.boolean() })
	.example([{ issueId: '019e4d24-6524-7041-9e1c-8108180cddaf', queued: true }])

/**
 * `SteerIssueTurn` — o orquestrador redireciona trabalho de uma issue desta thread (D7, §7.7).
 *
 * ### Why this is not the console's `SteerIssue`
 * That one lives at `/issues/:issueId/steer`, takes no `threadId`, and writes a terminal line. Under an
 * `orchestration` token it would be UNCONFINED — such an identity carries no `issueId` at all, and
 * `compareIdentity` reads the keys the IDENTITY has, so there is nothing to compare `issueId` against
 * and every issue in the database would be reachable by id. The ownership check in `handle()` below is
 * what closes that, and it is the canonical example of spec decision 4: a controller confines what its
 * identity does not. The class name is also the wire tool name, so the two could not share one anyway.
 *
 * ### What makes a steer safe against a running turn
 * Nothing here interrupts anything. It ENQUEUES, and the dispatcher's per-target lease decides when the
 * item runs — if the subagent is mid-turn, the steer simply waits for the lease. That is why §7.7 can
 * promise "sem corrida, sem retry-throw": the queue is the synchronisation, not this handler.
 *
 * ### Uma issue CONCLUÍDA é alvo legítimo
 * Antes, a checagem de pertencimento era feita lendo `openIssues`, que exclui `COMPLETED` — então o
 * único caminho para redirecionar trabalho a uma issue terminada respondia `AGENT_RUN_SCOPE_MISMATCH`,
 * e o operador via a conversa emudecer. A pergunta certa vive agora em `steerableIssue`, e a reabertura
 * acontece na mesma transação do enfileiramento, dentro do use case.
 */
@injectable()
export class SteerIssueTurnController extends Controller<
	typeof SteerIssueTurnControllerInputSchema,
	typeof SteerIssueTurnControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/issues/:issueId/steer'
	readonly method = 'post' as const
	readonly description = 'Redirect an issue of this thread — including one that already finished'
	readonly inputSchema = SteerIssueTurnControllerInputSchema
	readonly outputSchema = SteerIssueTurnControllerOutputSchema
	// `OperatorMiddleware` answers "who is this daemon" (`ctx.ownerId`). "Which run is speaking" is no
	// longer listed: `static mcpScopes` above makes `AgentIdentityMiddleware` mandatory, appended by
	// `Controller.executeMiddlewares`. A tool-callable door cannot be built without it.
	override middlewares = [OperatorMiddleware]

	constructor(private readonly steerIssueTurn: SteerIssueTurn) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { threadId, issueId } = request.params
		const identity = request.ctx.agentIdentity

		// FAIL-CLOSED HERE, not in the middleware: it serves 32 controllers and 23 of them are console
		// reads a human operator makes with no run anywhere. This door is reachable only from inside an
		// orchestrator run, so an absent identity is a broken invariant rather than an anonymous caller.
		if (!identity) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', 'this operation is only reachable from inside an agent run')
		}

		// The run may only steer its OWN thread. `compareIdentity` already agrees with this line, because
		// an `orchestration` identity DOES carry `threadId`; it is kept because the rule is that a
		// controller confines what its identity does not, and a future scope may drop the axis.
		if (identity.threadId !== threadId) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'this run is not attached to that thread')
		}

		const { queued } = await this.steerIssueTurn.execute({
			ownerId: request.ctx.ownerId,
			threadId,
			issueId,
			entryId: identity.entryId,
			text: request.body.text,
		})

		return { status: HttpStatusCode.ACCEPTED, data: { issueId, queued } }
	}
}
```

### Step T2.10 — Rodar os testes de fluxo para confirmar que passam

Run: `cd packages/api/typescript && bun test tests/flows/steer.flow.test.ts`
Expected: PASS — os 4 testes novos passam

### Step T2.11 — Rodar os testes dos contextos tocados

Run: `cd packages/api/typescript && bun test src/agent/ src/thread/`
Expected: PASS — nenhuma regressão

### Step T2.12 — Type check + lint

Run: `bun x tsc -p packages/api/typescript/tsconfig.build.json --noEmit && bun lint`
Expected: 0 erros

### Step T2.13 — Commit

```bash
git add packages/api/typescript/src/thread/services/OpenIssuesReader/ \
        packages/api/typescript/src/agent/usecases/SteerIssueTurn.ts \
        packages/api/typescript/src/agent/usecases/index.ts \
        packages/api/typescript/src/agent/controllers/SteerIssueTurn.ts \
        packages/api/typescript/tests/flows/steer.flow.test.ts
git commit -m "feat(agent): o steer direcionado alcança e reabre uma issue concluída (Task T2)"
```

---

## Task T3: A instrução permanente da thread chega a quem trabalha

**Files to write:**
- Modify: `packages/api/typescript/src/agent/agents/IssueWorkAgent/types.ts` — adiciona `customPrompt` opcional ao input
- Modify: `packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.ts` — renderiza o bloco de instrução do operador
- Modify: `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts` — adiciona `customPrompt` ao input schema e repassa ao agente
- Modify: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts` — passa `thread.customPrompt` em `runIssueWork`
- Test: `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts` — renderização e ausência

**Files to read:**
- `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /agent, /usecase, /test
**Depends on:** (none)
**Consumes (frozen):** nada de T1/T2 — esta Task é independente. Já frozen no repo: `Thread.customPrompt` (`string | undefined`, colapsado de vazio para ausente em `Thread.configurePrompt`); `IssueWorkInputSchema` declarado com `z.agentInput({...})`; `IssueWorkPromptBuilder.system(input)`.
**Scope fence:** DONE elsewhere — nada. OUT — `Issue.reopen()` e `ReopenIssue` (T1), o steer e o `OpenIssuesReader` (T2), o prompt do orquestrador (T4). NÃO altere `OrchestratorPromptBuilder.operatorInstructions`: ele é lido aqui só como referência de moldura, e a moldura da issue é deliberadamente diferente.
**Gate:** `cd packages/api/typescript && bun test src/agent/agents/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T3.1 — Escrever o teste que falha

Adicione a `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts`:

```typescript
describe('instrução permanente do operador', () => {
	const baseInput = {
		ownerId: '00000000-0000-4000-8000-000000000001',
		issueId: '019e4d24-6524-7041-9e1c-8108180cddaf',
		threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
		cwd: '/tmp/workspace',
		prompt: 'implemente os loops',
		key: 'loops',
		title: 'Loops',
	}

	it('renderiza o texto do operador quando a thread tem customPrompt', () => {
		const builder = new IssueWorkPromptBuilder()
		const system = builder.system({ ...baseInput, customPrompt: 'Sempre suba um PR ao final.' })

		expect(system).toContain('Sempre suba um PR ao final.')
	})

	it('não renderiza cabeçalho algum quando a thread não tem customPrompt', () => {
		const builder = new IssueWorkPromptBuilder()
		const system = builder.system(baseInput)

		// Um cabeçalho vazio diria ao modelo que existe uma instrução e não a forneceria —
		// que é como um modelo começa a inventar uma.
		expect(system).not.toContain('INSTRUCTIONS FROM THE OPERATOR')
	})

	it('não repete as ressalvas do orquestrador, que não são da issue', () => {
		const builder = new IssueWorkPromptBuilder()
		const system = builder.system({ ...baseInput, customPrompt: 'Sempre suba um PR ao final.' })

		// A issue PODE preparar o próprio ambiente e não fala no chat; herdar as duas ressalvas do
		// orquestrador a proibiria de trabalhar e a instruiria sobre um formato que ela nunca emite.
		expect(system).not.toContain('[quote:')
		expect(system).not.toContain('install dependencies')
	})
})
```

Ajuste os imports (`IssueWorkPromptBuilder`) e o formato de `baseInput` ao que `IssueWorkInputSchema` exige — leia `types.ts` antes de escrever, e inclua os campos obrigatórios que faltarem.

### Step T3.2 — Rodar o teste para confirmar que falha

Run: `cd packages/api/typescript && bun test src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts`
Expected: FAIL — o texto do operador não aparece no prompt

### Step T3.3 — Adicionar o campo ao input do agente

Modifique `packages/api/typescript/src/agent/agents/IssueWorkAgent/types.ts`: dentro de `IssueWorkInputSchema = z.agentInput({...})`, depois de `title`, acrescente o campo abaixo.

```typescript
	/**
	 * A instrução permanente que o operador escreveu para ESTA conversa (`Thread.customPrompt`).
	 *
	 * Ausente, nunca `''` — `Thread.configurePrompt` colapsa branco em ausência no write, e o prompt
	 * builder conta com isso para não renderizar um cabeçalho vazio.
	 */
	customPrompt: z.string().min(1).optional(),
```

### Step T3.4 — Renderizar o bloco no prompt da issue

Modifique `packages/api/typescript/src/agent/agents/IssueWorkAgent/prompt.ts`: acrescente o método privado abaixo à classe `IssueWorkPromptBuilder` e inclua sua chamada no array que `system()` monta, como último bloco (depois de `declarationInstruction`), no mesmo estilo de composição que o método já usa.

```typescript
	/**
	 * INSTRUÇÃO DO OPERADOR — o mesmo `Thread.customPrompt` que o orquestrador recebe, com moldura
	 * própria.
	 *
	 * A moldura do orquestrador NÃO serve aqui, e copiá-la seria pior que não ter nenhuma. Ela fixa o
	 * formato da linha `[quote: …]`, que esta agente nunca emite — falar disso a instruiria sobre um
	 * canal que não é dela — e proíbe instalar dependências, uma regra que existe porque o orquestrador
	 * divide o chão com a conversa inteira. Uma issue que não pode preparar o próprio ambiente não
	 * consegue trabalhar.
	 *
	 * Renderizado só quando HÁ texto: um cabeçalho sem conteúdo diz ao modelo que existe uma instrução
	 * e depois não a fornece, que é exatamente como um modelo começa a inventar uma.
	 */
	private operatorInstructions(input: IssueWorkInput): string[] {
		if (!input.customPrompt) return []
		return [
			'',
			'INSTRUCTIONS FROM THE OPERATOR',
			'The person who owns this repository wrote the following for THIS conversation. It applies to the work ' +
				'itself — how to build, what to leave alone, what to always do before you call it done. Where it ' +
				'disagrees with anything above, follow this.',
			'',
			input.customPrompt,
		]
	}
```

### Step T3.5 — Propagar pelo use case

Modifique `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts`:

1. Em `RunIssueTurnInputSchema`, depois de `prompt`, acrescente `customPrompt: z.string().trim().min(1).optional(),` com o comentário `/** A instrução permanente da thread — repassada ao prompt do agente. */`.
2. No ponto em que o input do `IssueWorkAgent` é montado (o objeto que já carrega `prompt`, `key`, `title`, `cwd`), acrescente `customPrompt: input.customPrompt,`.

### Step T3.6 — Passar a instrução no dispatcher

Modifique `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts`: em `runIssueWork`, no objeto passado a `this.handlerFor(RunIssueTurn).execute({...})`, acrescente `customPrompt: thread.customPrompt,`. A `thread` já está carregada logo acima para resolver o provider — nenhuma query nova.

### Step T3.7 — Rodar os testes do agente

Run: `cd packages/api/typescript && bun test src/agent/agents/`
Expected: PASS — os 3 testes novos passam, nenhuma regressão nos existentes

### Step T3.8 — Type check + lint

Run: `bun x tsc -p packages/api/typescript/tsconfig.build.json --noEmit && bun lint`
Expected: 0 erros

### Step T3.9 — Commit

```bash
git add packages/api/typescript/src/agent/agents/IssueWorkAgent/ \
        packages/api/typescript/src/agent/usecases/RunIssueTurn.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts
git commit -m "feat(agent): a instrução permanente da thread chega a quem trabalha (Task T3)"
```

---

## Task T4: O orquestrador sabe redirecionar e não afirma o que não fez

**Files to write:**
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts` — situação de redirecionamento + regra de honestidade
- Test: `packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts` — o prompt nomeia a ferramenta pelo símbolo

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /agent, /test
**Depends on:** (none)
**Consumes (frozen):** já frozen no repo — `toolNameOf` e `SteerIssueTurnController` importados de `../../mcp/exposure` (o arquivo já os importa hoje, para o fluxo de stops).
**Scope fence:** DONE elsewhere — nada. OUT — todo o resto do plano. Esta Task toca UM arquivo de produção. NÃO altere a assinatura de `SteerIssueTurnController` (T2 é dono do arquivo do controller).
**Gate:** `cd packages/api/typescript && bun test src/agent/agents/OrchestratorAgent/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T4.1 — Escrever o teste que falha

Adicione a `packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts`:

```typescript
describe('redirecionar uma issue existente', () => {
	it('ensina a situação e nomeia a ferramenta de steer pelo símbolo', () => {
		const builder = new OrchestratorPromptBuilder()
		const system = builder.system({
			ownerId: '00000000-0000-4000-8000-000000000001',
			threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
		} as never)

		// O nome vem de `toolNameOf(SteerIssueTurnController)` — nunca digitado como literal, para
		// que um rename siga o símbolo em vez de deixar a frase apontando para o vazio.
		expect(system).toContain(toolNameOf(SteerIssueTurnController))
		expect(system).toContain('REDIRECTING WORK THAT ALREADY EXISTS')
	})

	it('proíbe afirmar uma ação que não foi executada', () => {
		const builder = new OrchestratorPromptBuilder()
		const system = builder.system({
			ownerId: '00000000-0000-4000-8000-000000000001',
			threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
		} as never)

		expect(system).toContain('never say you did something you did not do')
	})
})
```

Ajuste o objeto passado a `system()` ao `OrchestratorInput` real — leia `types.ts` do mesmo diretório e forneça os campos obrigatórios em vez do `as never`, se houver.

### Step T4.2 — Rodar o teste para confirmar que falha

Run: `cd packages/api/typescript && bun test src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts`
Expected: FAIL — a seção não existe no prompt

### Step T4.3 — Adicionar a situação faltante

Modifique `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts`: acrescente o método privado abaixo à classe `OrchestratorPromptBuilder`, e inclua sua chamada no array que `system()` monta, imediatamente depois do bloco `issues()`.

```typescript
	/**
	 * REDIRECIONAR TRABALHO QUE JÁ EXISTE — a situação que faltava, e que custou caro.
	 *
	 * O steer aparecia só dentro do fluxo de stops ("resolva o stop, depois steere"), então quando o
	 * operador pedia algo sobre uma issue que não estava perguntando nada — inclusive uma já concluída
	 * — não havia situação sancionada que casasse com o pedido. O modelo tinha a ferramenta, improvisou,
	 * e respondeu "repassei isso pra ela" sem ter chamado nada. Duas vezes, contando a vez em que o
	 * operador desconfiou e perguntou de novo.
	 *
	 * A regra de honestidade fica aqui e não numa seção própria de propósito: ela nasce desta situação,
	 * e uma regra geral sobre "não minta" longe do caso que a motiva é uma frase que o modelo lê e não
	 * aplica.
	 */
	private redirectingWork(): string[] {
		const steerIssue = toolNameOf(SteerIssueTurnController)
		return [
			'',
			'REDIRECTING WORK THAT ALREADY EXISTS',
			'When the operator says something about work you already opened — a correction, an addition, "now do X too" ' +
				`— that belongs to the issue that is already carrying it. Call ${steerIssue} with that issue id and WHAT ` +
				'THEY SAID, in their words. Do not open a second issue for it, and do not answer as if the instruction ' +
				'reached anyone on its own.',
			'This works on an issue that already finished. Finishing is not a door closing — the issue picks the work ' +
				'back up with everything it already knew.',
			'And the rule that makes any of this trustworthy: never say you did something you did not do. If you did ' +
				`not call ${steerIssue}, do not tell the operator you passed it along. If a call failed, say it failed. ` +
				'A turn that narrates an action it never took is worse than a turn that does nothing, because the ' +
				'operator stops watching.',
		]
	}
```

### Step T4.4 — Rodar o teste para confirmar que passa

Run: `cd packages/api/typescript && bun test src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts`
Expected: PASS — os 2 testes novos passam

### Step T4.5 — Type check + lint

Run: `bun x tsc -p packages/api/typescript/tsconfig.build.json --noEmit && bun lint`
Expected: 0 erros

### Step T4.6 — Commit

```bash
git add packages/api/typescript/src/agent/agents/OrchestratorAgent/
git commit -m "feat(agent): o orquestrador sabe redirecionar e não afirma o que não fez (Task T4)"
```

---

## Task T5: Contract Lock — regen do SDK

**Files to write:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T1, T2
**Consumes (frozen):** de T1 — o código de erro `ISSUE_NOT_COMPLETED` registrado em `packages/api/typescript/src/issue/errors/index.ts`. De T2 — a `description` alterada do `SteerIssueTurnController`.
**Scope fence:** DONE elsewhere — todo o código de produção (T1–T4). OUT — qualquer edição manual em `packages/client/dist/**`; esses arquivos são gerados e nunca editados à mão.
**Gate:** `bun tsc`

### Step T5.1 — Regenerar OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T5.2 — Verificar que a regen produziu o esperado

```bash
git diff --stat packages/client/dist/ packages/api/typescript/public/docs/openapi.json
grep -c "ISSUE_NOT_COMPLETED" packages/client/dist/typescript/src/errors/index.ts
```

Expected: `openapi.json` alterado; arquivos sob `packages/client/dist/` alterados; o `grep` retorna `1`.

### Step T5.3 — Type check depois da regen

Run: `bun tsc`
Expected: 0 erros em todos os workspaces

### Step T5.4 — Commit

```bash
git add packages/api/typescript/public/docs/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk para o redirecionamento de issue (Task T5)"
```

---

## Final Validation

- [ ] `bun tsc` — type check completo limpo
- [ ] `bun lint` — lint limpo
- [ ] `bun run test` — testes passam (as 3 falhas pré-existentes de `union-parity` no gateway Go seguem vermelhas e NÃO são desta frente — ver Notes)
- [ ] AC mapping (cada AC da spec → ≥1 caminho de teste):
  - AC-1 → `packages/api/typescript/src/issue/entities/Issue.test.ts:"leva uma issue concluída de volta para WORKING e zera completedAt"`
  - AC-2 → `packages/api/typescript/src/issue/entities/Issue.test.ts:"recusa uma issue arquivada"` + `:"recusa uma issue que não está concluída"`
  - AC-3 → `packages/api/typescript/src/issue/usecases/IssueLifecycle.test.ts:"uma issue reaberta não é selecionada pelo auto-arquivamento"`
  - AC-4 → `packages/api/typescript/tests/flows/steer.flow.test.ts:"reabre a issue e enfileira o STEER"`
  - AC-5 → `packages/api/typescript/tests/flows/steer.flow.test.ts:"recusa issue de outra thread e issue arquivada de forma INDISTINGUÍVEL"`
  - AC-6 → `packages/api/typescript/tests/flows/steer.flow.test.ts:"reabre a issue e enfileira o STEER"` (a issue termina em `WORKING`, então o `complete()` do turno seguinte é legítimo)
  - AC-7 → `packages/api/typescript/tests/flows/steer.flow.test.ts:"não deixa a issue reaberta quando o enfileiramento falha"`
  - AC-8 → `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts:"renderiza o texto do operador quando a thread tem customPrompt"` + `:"não renderiza cabeçalho algum quando a thread não tem customPrompt"`
  - AC-9 → `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts:"não repete as ressalvas do orquestrador, que não são da issue"`
  - AC-10 → `packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts:"ensina a situação e nomeia a ferramenta de steer pelo símbolo"` + `:"proíbe afirmar uma ação que não foi executada"`
  - AC-11 → `packages/api/typescript/tests/flows/steer.flow.test.ts:"o whisper da thread continua não alcançando issue concluída"`

## Notes

**Sem E2E nesta frente.** Não há superfície de console nova: a reabertura acontece por uma ferramenta MCP que só um run de orquestrador alcança, e o `customPrompt` já tem sua tela. `bun e2e` continua valendo como gate de não-regressão, mas nenhum spec novo de Playwright é criado — inventar um exigiria dirigir um agente de verdade, que é justamente o que a suíte de fluxo cobre em processo.

**`/task-breakdown` foi deliberadamente pulado.** O limiar formal foi atingido (~20 arquivos, 3 bounded contexts: `issue`, `thread`, `agent`), mas o grafo real é quase serial — T1 → T2 é a única aresta dura, T5 fecha atrás delas, e T3/T4 são folhas independentes que tocam arquivos disjuntos. A anotação de ondas que a skill produziria seria exatamente esta ordenação. Registrado aqui em vez de omitido.

**Três falhas pré-existentes na suíte.** `bun test` em `packages/api/typescript` fecha com 3 falhas de `union-parity` no gateway Go (`ChannelMessageReceivedPayload.content`, `.platformData`, `ChannelSpecialPlatformEventReceivedPayload.payload`). Medido nos dois sentidos no commit `c05a8dd0`: 1064 pass / 3 fail sem qualquer mudança desta frente. NÃO tente consertá-las aqui — não são desta spec, e o tempo gasto nelas é o modo de falha que este plano existe para evitar.

**Árvore compartilhada.** A spec registra em Riscos que esta frente aumenta a frequência com que uma issue volta a escrever, sem isolamento (R6 segue fora). Se `/build` rodar com um agente de issue ativo no mesmo checkout, os dois trabalhos se misturam — verifique `git status` antes de começar.
