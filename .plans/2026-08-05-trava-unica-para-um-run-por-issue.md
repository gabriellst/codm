# Uma trava só para "um run por issue" — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O lease por alvo do mailbox passa a ser a única exclusão para "um run por issue" — o `Set` em memória de `AgentStreamRegistry` deixa de existir, e com ele o modo de falha que exigia restart do processo.

**Architecture:** Este é um plano de REMOÇÃO. O mecanismo que fica (`claimNext` com `NOT EXISTS` correlacionado sobre `(targetKind, targetId)`, renovado por heartbeat) já existe e já é o único guard do lado thread (`RunOrchestratorTurn`). O trabalho é apagar o segundo guard e tudo que só existia para servi-lo — o ramo de contenção do dispatcher, `MailboxRepository.defer` e o código de erro `TERMINAL_ALREADY_RUNNING` —, corrigir os docstrings que passam a afirmar o contrário do desenho, e instalar um rail que impede um terceiro caminho de aparecer.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod

**Spec:** .specs/2026-08-05-trava-unica-para-um-run-por-issue-design.md
**Tasks:** 3
**Estimated minutes:** 100

**BASE OBRIGATÓRIA:** este plano parte da `main` **com o PR #8 (`fix/no-silent-poison`) já mergeado**. Ele remove código que o #8 introduziu (o ramo de contenção e `MailboxRepository.defer`). Se `git log --oneline | grep -i "no-silent-poison\|contenção"` não encontrar o merge, **pare e reporte** — planejar contra a base errada faz T1 falhar em arquivos que não existem.

**Falsificação, dita em voz alta:** o vazamento de `activeSessions` NUNCA foi reproduzido — nem pelo código nem pelos dados do incidente. Não existe teste RED honesto para "a entrada não vaza mais", e este plano **não finge um**. O falsificador real é estrutural e mora no T3: os símbolos do guard somem da árvore, e um rail com fixture negativa impede que voltem. Os testes comportamentais (T1) provam que a exclusão continua valendo pelo lease — que é a parte que poderia regredir de verdade.

---

## Task T1: A exclusão passa a viver só no lease

**Files to write:**
- Modify: `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts` — remove a reserva/liberação da sessão e o `try/finally` que só existia para soltá-la
- Modify: `packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.ts` — remove o guard de sessão única
- Modify: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts` — remove o ramo de contenção e a constante que o servia
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts` — remove o método abstrato `defer`
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/DrizzleMailboxRepository.ts` — remove a implementação de `defer`
- Modify: `packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts` — remove a implementação de `defer`
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts` — corrige o docstring que passa a afirmar o contrário do desenho
- Test: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts` — remove o caso de contenção, acrescenta o caso de dois turnos sequenciais
- Test: `packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.test.ts` — remove os casos do guard
- Test: `packages/api/typescript/src/agent/usecases/RunIssueTurn.test.ts` — remove o caso que assertava `TERMINAL_ALREADY_RUNNING`

**Files to read:**
- `packages/api/typescript/src/agent/repositories/MailboxRepository/DrizzleMailboxRepository.ts` — o `claimNext` cujo `NOT EXISTS` correlacionado é a trava que fica

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /usecase, /service, /repository, /test
**Depends on:** (none)
**Consumes (frozen):** `MailboxRepository.claimNext(claimedBy, leaseMs, tx?)`, `MailboxRepository.renewLease(id, claimedBy, leaseMs, tx?)`, `MailboxRepository.complete(id, tx?)`, `MailboxRepository.fail(id, error, maxAttempts, tx?)`, `MailboxTargetKind.ISSUE`, `MailboxTargetKind.THREAD`, `AgentStreamRegistry.send/register/historyFor`, `DrizzleMailboxDispatcher.raiseStopForPoisoned` — todos já existentes e **inalterados** por esta task.
**Scope fence:** DONE elsewhere — o heartbeat (`renewLease` + campo `heartbeatMs`) e o `raiseStopForPoisoned` vieram dos PRs #4/#8 e **permanecem intactos**; não reescreva nem "melhore" nenhum dos dois. OUT — `agent/errors/index.ts`, os arquivos de locale e o regen do SDK pertencem ao T2; o rail de `tests/architecture/` pertence ao T3. Não toque em nenhum deles aqui.
**Gate:** `cd packages/api/typescript && bun test src/agent` verde, e `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` com 0 erros.

### Step T1.1 — Confirmar a base

Run: `git log --oneline -20 | grep -i "no-silent-poison"`
Expected: uma linha de merge do PR #8. Se vier vazio, **pare e reporte** — a base está errada e o resto desta task não se aplica.

Run: `grep -n "contentionBackoffMs\|CONTENTION_BACKOFF_MS" packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts`
Expected: linhas encontradas (a const, o campo e o uso no ramo de contenção). Se vier vazio, a base está errada.

### Step T1.2 — Escrever o teste que fixa a exclusão pelo lease

Este é o teste que poderia REGREDIR de verdade: tirando o guard em memória, a exclusão passa a depender inteiramente do lease. Ele deve passar antes E depois — é rede de segurança, não RED.

Acrescente ao `describe('DrizzleMailboxDispatcher — the drain loop wakes for work that arrives mid-turn', ...)` em `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts`, imediatamente ANTES do caso `'um item envenenado levanta um Stop em vez de sumir calado'`:

```typescript
	/**
	 * A invariante que sobrevive à remoção do guard em memória: dois itens ISSUE para a MESMA issue
	 * rodam em sequência, nunca ao mesmo tempo, e nenhum dos dois queima tentativa por contenção.
	 *
	 * O falsificador é exato: afrouxe o `NOT EXISTS` correlacionado de `claimNext` (o predicado que
	 * recusa um alvo com lease vivo) e os dois turnos passam a se sobrepor — `concurrentPeak` vira 2 e
	 * este teste fica vermelho. É a única trava que resta, então é a única que precisa de rede.
	 */
	it('dois itens para a MESMA issue rodam em sequência — a exclusão é do lease, e só dele', async () => {
		const ownerId = 'owner-lease-only'
		const issueId = uuidv7()

		let inFlight = 0
		let concurrentPeak = 0
		const turns: string[] = []

		class SequencingDispatcher extends DrizzleMailboxDispatcher {
			protected override async runIssueWork(item: ClaimedMailboxItem): Promise<void> {
				inFlight += 1
				concurrentPeak = Math.max(concurrentPeak, inFlight)
				turns.push(item.id)
				await new Promise(resolve => setTimeout(resolve, 20))
				inFlight -= 1
			}
		}

		const dispatcher = testBed.resolve(SequencingDispatcher)
		const mailbox = testBed.resolve(MailboxRepository)

		for (const seq of ['first', 'second']) {
			await mailbox.enqueue({
				ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: issueId,
				kind: MailboxItemKind.STEER,
				payload: { threadId: uuidv7(), key: 'ISS-1', title: 'lease only', text: seq, provider: 'CLAUDE' },
				dedupKey: `${issueId}:${seq}`,
			})
		}

		await dispatcher.start()
		await new Promise(resolve => setTimeout(resolve, 300))
		await dispatcher.stop()

		expect(turns).toHaveLength(2)
		expect(concurrentPeak).toBe(1)
	})
```

Se `runIssueWork` for `private` na classe base, promova-o a `protected` no mesmo commit — a subclasse de teste é o único consumidor e o campo `contentionBackoffMs` já estabeleceu esse precedente de visibilidade no arquivo.

### Step T1.3 — Rodar o teste novo contra o código ATUAL

Run: `cd packages/api/typescript && bun test src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts`
Expected: PASS. Ele fixa comportamento que já vale hoje; o valor dele é não deixar a remoção quebrá-lo.

### Step T1.4 — Remover o guard de `RunIssueTurn`

Modify `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts`:

- No método `handle`, apague a linha `this.registry.beginSession(input.issueId)` e o comentário `// Single-active-run guard (independent of whether a browser is observing).` acima dela.
- Desfaça o `try { ... } finally { ... }` que envolve o corpo: o conteúdo do `try` vira o corpo direto do método (um nível de indentação a menos), e o bloco `finally` inteiro — comentário `// Teardown — release the single-active claim whether the run completed or threw.` e a chamada `this.registry.endSession(input.issueId)` — desaparece.
- No docstring da classe, apague o parágrafo final que começa com `The single-active invariant ("one agent run per issue") is claimed on `beginSession`` e termina em `throws TERMINAL_ALREADY_RUNNING.`, e ponha no lugar: `A exclusão "um run por issue" NÃO mora aqui: é o lease por alvo do dispatcher (`claimNext` recusa um alvo com lease vivo, renovado por heartbeat enquanto o turno roda). Um segundo item para a mesma issue espera o lease em vez de disputar — mesma regra que `RunOrchestratorTurn` já seguia do lado thread.`
- **Mantenha** a injeção `private readonly registry: AgentStreamRegistry` no construtor: ela continua sendo usada para empurrar frames SSE durante `drainRun`. Removê-la quebra o streaming.

### Step T1.5 — Remover o guard de `AgentStreamRegistry`

Modify `packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.ts`:

- Apague o campo `private activeSessions = new Set<string>()`.
- Apague o bloco inteiro que começa no separador `// ── Single-active-run guard (absorbed from the superseded interim session registry) ──────────` e vai até o fim da classe: os métodos `beginSession`, `endSession` e `isActive` com seus docstrings.
- No docstring da classe, apague o item numerado `2. SINGLE-ACTIVE-RUN guard — ...` inteiro (três linhas), e na frase de abertura remova o trecho `It additionally ABSORBS the single-active-run guard that codm's interim per-issue session registry carried — that guard is an INVARIANT ("one agent run per issue") and migrates INTO the adopted registry; the interim registry is superseded and deleted.`, deixando a frase terminar em `and rekeyed `chatId → issueId` (Fork B).`
- Se `DomainErrors` deixar de ser referenciado no arquivo após a remoção, ajuste o `import type` da linha 4 para importar só o que sobrou (`SESSION_ALREADY_STREAMING` ainda usa `DomainErrors`, então provavelmente nada muda — confirme com `tsc`, não por inspeção).

### Step T1.6 — Remover o ramo de contenção do dispatcher

Modify `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts`:

- No `catch` de `runTurn`, apague o bloco inteiro que começa no comentário `// CONTENTION IS NOT FAILURE — and conflating the two is what killed real work.` e termina no `}` que fecha o `if (error instanceof BaseError && error.name === 'TERMINAL_ALREADY_RUNNING') { ... return }`. O `catch` passa a ir direto do `const message = ...` para o `this.logging.error({...})`.
- Apague o campo `protected contentionBackoffMs = CONTENTION_BACKOFF_MS` e a constante `CONTENTION_BACKOFF_MS` com o docstring dela.
- Se o `import { BaseError }` ficar sem uso no arquivo, remova-o (confirme por `tsc`, não por inspeção).
- No docstring de `runTurn`, o parágrafo "Why the heartbeat is not optional" descreve a cadeia `lease lapsa → claimNext redistribui → beginSession rejeita → tentativas queimam`. Reescreva a frase do meio para `o lease lapsa sob um run saudável, `claimNext` entrega o MESMO item de novo, e o dispatcher começa um SEGUNDO turno para o mesmo alvo — dois processos escrevendo na mesma issue.` O resto do parágrafo (a medição de 2026-08-04, o park do drain loop) fica.
- **Não toque** em `raiseStopForPoisoned`, no `fail(...)` nem no `if (item.attempts >= MAX_ATTEMPTS)` — o envenenamento continua acontecendo por outras causas e continua levantando Stop.

### Step T1.7 — Remover `defer` das três implementações

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts`: apague o método abstrato `defer` e o docstring inteiro acima dele (o que começa em `Put a CONTENDED item back`). No docstring de `renewLease`, a frase `o single-active guard threw `TERMINAL_ALREADY_RUNNING`, and the retry burnt attempts until the item poisoned` descreve um mecanismo que deixa de existir — troque-a por `the dispatcher started a SECOND turn for the same target while the first was still healthy and running`.

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/DrizzleMailboxRepository.ts`: apague o método `defer` inteiro, com os dois comentários internos sobre o refund.

Modify `packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts`: apague o método `defer` inteiro.

### Step T1.8 — Corrigir o docstring de `RunOrchestratorTurn`

Modify `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts`: a seção `### What it does NOT do, said out loud` afirma hoje `No single-active guard (AgentStreamRegistry.beginSession). RunIssueTurn needs one because two runs could target one issue; here the DISPATCHER's per-target lease is the mutex (§3), and adding a second one keyed by thread would be a second source of truth about whether a turn is in flight.` Isso passa a estar errado nas duas pontas — o método não existe mais e `RunIssueTurn` não tem mais guard. Substitua por: `No single-active guard. O lease por alvo do dispatcher é o mutex (§3), aqui e em `RunIssueTurn` — que até 2026-08-05 carregava um segundo guard em memória, exatamente a "segunda fonte de verdade" que este parágrafo já advertia contra, e que divergiu do lease em produção.`

### Step T1.9 — Remover os testes cujo cenário deixou de existir

Modify `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts`: apague o caso `it('contenção devolve o item à fila SEM gastar tentativa', ...)` inteiro, com o docstring acima dele (o que menciona `troque o `defer` por `fail` no ramo de contenção`). Nenhum caminho pode mais produzir contenção, então o teste não teria como ficar vermelho de novo — mantê-lo seria fossilizar um cenário impossível.

Modify `packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.test.ts`: apague os casos que exercitam `beginSession`/`endSession`/`isActive` — inclusive `it('throws TERMINAL_ALREADY_RUNNING on a second concurrent begin for the same issue', ...)` e os que assertam `registry.isActive(...)`. **Preserve** todos os casos de observer (`register`/`send`/`unregister`/`forceUnregister`/cap por owner) e de replay (`historyFor`, `MAX_HISTORY_*`).

Modify `packages/api/typescript/src/agent/usecases/RunIssueTurn.test.ts`: apague o caso que assertava `expect.objectContaining({ name: 'TERMINAL_ALREADY_RUNNING' })` e, se ele existir, o `expect(registry.isActive(issueId)).toBe(false)` de outro caso — essa asserção testa um símbolo que deixou de existir.

Enumere no corpo do commit **quantos** casos foram removidos e o nome de cada um: o AC-7 compara a contagem final da suíte contra a baseline e precisa dessa lista para distinguir remoção deliberada de teste perdido.

### Step T1.10 — Rodar a suíte do contexto

Run: `cd packages/api/typescript && bun test src/agent`
Expected: PASS, incluindo o caso novo do Step T1.2 e os casos preservados de observer/replay. Zero referências a `defer` ou `beginSession`.

### Step T1.11 — Type check + lint

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 erros.

Run: `bun lint`
Expected: 0 findings.

### Step T1.12 — Commit

```bash
git add packages/api/typescript/src/agent/usecases/RunIssueTurn.ts \
        packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts \
        packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.ts \
        packages/api/typescript/src/agent/services/AgentStreamRegistry/AgentStreamRegistry.test.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/DrizzleMailboxRepository.ts \
        packages/api/typescript/src/agent/repositories/MailboxRepository/MockMailboxRepository.ts \
        packages/api/typescript/src/agent/usecases/RunIssueTurn.test.ts
git commit -m "fix(agent): o lease vira a única trava de um run por issue (Task T1)"
```

---

## Task T2: O código de erro sai do fio

**Files to write:**
- Modify: `packages/api/typescript/src/agent/errors/index.ts` — remove `TERMINAL_ALREADY_RUNNING` da união e do registro
- Modify: `packages/app/react/src/locales/pt.json` — remove a chave `errors.TERMINAL_ALREADY_RUNNING`
- Modify: `packages/app/react/src/locales/en.json` — remove a mesma chave, mantendo a paridade
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/typescript/**`

**Files to read:**
- `packages/api/typescript/tests/architecture/error-coherence.test.ts` — o rail que exige união e registro como o MESMO conjunto

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /errors, /sdk
**Depends on:** T1
**Consumes (frozen):** o T1 já removeu o ÚNICO ponto que levantava `BaseError<DomainErrors>('TERMINAL_ALREADY_RUNNING')` (em `AgentStreamRegistry.beginSession`). Os códigos irmãos `SESSION_ALREADY_STREAMING` (CONFLICT) e `AGENT_TRANSPORT_STOP_NOT_DECLARABLE` (UNPROCESSABLE_ENTITY) **ficam** na união `AgentDomainErrors` e no `registerErrorCodes` — não os toque.
**Scope fence:** DONE elsewhere — toda a remoção de comportamento é do T1; se você encontrar um `beginSession` sobrando, o T1 está incompleto: reporte, não conserte aqui. OUT — o rail de `tests/architecture/` é do T3.
**Gate:** `cd packages/api/typescript && bun test tests/architecture/error-coherence.test.ts tests/architecture/i18n-coherence.test.ts` verde, e `bun tsc` com 0 erros em todos os workspaces.

### Step T2.1 — Remover o código do vocabulário

Modify `packages/api/typescript/src/agent/errors/index.ts`:

- Na união `AgentDomainErrors`, apague o membro `| 'TERMINAL_ALREADY_RUNNING'`. A união passa a começar em `'SESSION_ALREADY_STREAMING'`.
- No `registerErrorCodes({...})`, apague a entrada `TERMINAL_ALREADY_RUNNING: HttpStatusCode.CONFLICT,`. O comentário acima dela — `// Domain — a second run/observer for an issue that already has one.` — passa a valer só para o observer: troque por `// Domain — um segundo OBSERVER para uma issue que já tem um. A exclusão de RUN não vive mais aqui: é o lease por alvo do mailbox.`
- No comentário de cabeçalho do bloco `AgentDomainErrors`, a frase `invariants of the agent runtime (single-active RUN per issue, single SSE observer per issue)` perdeu metade: troque por `invariants of the agent runtime (single SSE observer per issue)`.

Os dois rails cobram as duas direções: `error-coherence` falha se a união e o `registerErrorCodes` divergirem, então **as duas remoções andam juntas ou nenhuma**.

### Step T2.2 — Remover a chave dos dois locales

Modify `packages/app/react/src/locales/pt.json`: apague a linha `"TERMINAL_ALREADY_RUNNING": "Já existe uma sessão de terminal ativa para esta issue.",` do objeto `errors`.

Modify `packages/app/react/src/locales/en.json`: apague a linha `"TERMINAL_ALREADY_RUNNING": "A terminal session is already running for this issue.",` do objeto `errors`.

As duas juntas, sempre: o `i18n-coherence` compara o conjunto recursivo de chaves de `pt.json` e `en.json` e falha se um lado tiver uma que o outro não tem.

### Step T2.3 — Verificar os rails antes do regen

Run: `cd packages/api/typescript && bun test tests/architecture/error-coherence.test.ts tests/architecture/i18n-coherence.test.ts`
Expected: PASS nos dois. Se `error-coherence` falhar, uma das duas remoções do Step T2.1 ficou pela metade.

### Step T2.4 — Regenerar OpenAPI + SDK

Run: `bun sdk`
Expected: conclui sem erro. (Requer `cargo` no PATH — o `bun sdk` compila o `rust-codegen`.)

### Step T2.5 — Verificar que o regen propagou

Run: `git diff --stat packages/api/typescript/public/docs/openapi.json packages/client/dist/`
Expected: os dois mudaram.

Run: `grep -rn "TERMINAL_ALREADY_RUNNING" packages/api/typescript/public/docs/openapi.json packages/client/dist/ | wc -l`
Expected: `0`. Se vier diferente de zero, o kubb é incremental e não propagou — force um regen limpo antes de seguir, **nunca** edite arquivo gerado à mão.

### Step T2.6 — Type check global

Run: `bun tsc`
Expected: 0 erros em todos os workspaces. O app-react consome o `ErrorCode` do SDK; se algum ponto referenciava o código removido, é aqui que aparece.

### Step T2.7 — Commit

```bash
git add packages/api/typescript/src/agent/errors/index.ts \
        packages/app/react/src/locales/pt.json \
        packages/app/react/src/locales/en.json \
        packages/api/typescript/public/docs/openapi.json \
        packages/client/dist/
git commit -m "chore(agent): TERMINAL_ALREADY_RUNNING sai do vocabulário e do fio (Task T2)"
```

---

## Task T3: O fence que impede um terceiro caminho

**Files to write:**
- Create: `packages/api/typescript/tests/architecture/single-run-entry.test.ts`

**Files to read:**
- `packages/api/typescript/tests/architecture/pty-isolation.test.ts` — o molde: scan mecânico por prefixo permitido, mais o teste "o motor SUMIU, não foi só posto de quarentena"
- `packages/api/typescript/tests/architecture/README.md` — a escada de degraus que decide por que este rail existe

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1, T2
**Consumes (frozen):** os dois únicos importadores legítimos, com estes caminhos EXATOS — `packages/api/typescript/src/agent/services/MailboxDispatcher/` (diretório, com separador no fim) e `packages/api/typescript/src/agent/controllers/TestRunIssueTurn.ts` (arquivo). O barrel `src/agent/usecases/index.ts` reexporta `RunIssueTurn` com `export {`, forma que o matcher de `import {` não casa — ele NÃO precisa de exceção, e o único consumidor desse reexport é `tests/flows/agent-session-resume.flow.test.ts`, que vive fora de `src/` e portanto fora do scan.
**Scope fence:** DONE elsewhere — T1 removeu `beginSession`/`endSession` e T2 removeu `TERMINAL_ALREADY_RUNNING`; este rail só CONSTATA as duas remoções, não as executa. Se alguma família acusar violação em `src/`, a task anterior ficou incompleta: reporte, não conserte aqui. OUT — não crie um segundo arquivo de rail nem mexa em `pty-isolation.test.ts`.
**Gate:** `cd packages/api/typescript && bun test tests/architecture/single-run-entry.test.ts` verde, com a fixture negativa provando que o scanner acusa de verdade.

### Step T3.1 — Escrever o rail

```typescript
// packages/api/typescript/tests/architecture/single-run-entry.test.ts — COMPLETE final file
import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

/**
 * Single-run-entry guard — "um run por issue" tem UMA trava, e ela é o lease por alvo do mailbox.
 *
 * Até 2026-08-05 eram duas: o lease durável (`claimNext` recusa um alvo com lease vivo) e um
 * `Set<string>` em memória dentro de `AgentStreamRegistry` (`beginSession`/`endSession`). Duas travas
 * para uma invariante divergem, e divergiram: uma issue ficou `WORKING` por 2h38 porque a entrada em
 * memória sobreviveu a um turno que retornou, enquanto o lease estava limpo. O mecanismo do vazamento
 * nunca foi explicado — o que é exatamente o argumento para não haver a segunda trava, e a razão de
 * este rail existir depois da remoção em vez de um comentário pedindo cuidado (README: degrau
 * `eliminate` acima de `document`).
 *
 * TRÊS famílias, cada uma com seu conjunto permitido:
 *
 *   1. ENTRADA ÚNICA — só dois módulos importam o símbolo `RunIssueTurn`: o dispatcher, que é quem
 *      segura o lease, e a porta E2E, que existe para disparar um turno num teste. Um terceiro
 *      importador seria um caminho até o turno SEM lease, e é a única forma de dois runs voltarem a
 *      disputar uma issue. O matcher é a FORMA DE IMPORT (`import { … RunIssueTurn … } from`), não o
 *      nome nu: `RunIssueTurn` aparece em dezenas de docstrings por todo o contexto e essa prosa tem
 *      de continuar escrevível. Por consequência o barrel `usecases/index.ts` não precisa de exceção
 *      — ele usa `export { … } from`, que não casa.
 *
 *   2. O GUARD SUMIU — nenhum arquivo de `src/` menciona `beginSession` ou `endSession`. Espelha o
 *      `pty-isolation`'s "the PTY engine is GONE, not merely quarantined": manter o rail depois da
 *      deleção é o que impede um futuro "só um Set rapidinho" de reintroduzir a divergência.
 *      `activeSessions` NÃO entra nesta lista: `ui/usecases/GetHomeDashboard.ts` tem um campo de DTO
 *      com esse nome, legítimo e sem relação.
 *
 *   3. O CÓDIGO DE ERRO SUMIU — `TERMINAL_ALREADY_RUNNING` não existe mais em `src/`. Ele era público
 *      (HTTP 409, chave i18n, membro do `ErrorCode` da SDK); a metade fora de `src/` é coberta pelo
 *      `error-coherence` e pelo `i18n-coherence`.
 *
 * Comentários são removidos antes do match nas famílias 2 e 3, para que um docstring que EXPLIQUE a
 * remoção não seja lido como a remoção desfeita.
 */

const SRC = join(import.meta.dir, '..', '..', 'src')

/** O separador final é load-bearing: sem ele, um diretório irmão com o mesmo prefixo herdaria a permissão. */
const ALLOWED_RUN_ISSUE_TURN_IMPORTERS = [
	join(SRC, 'agent/services/MailboxDispatcher') + sep,
	join(SRC, 'agent/controllers/TestRunIssueTurn.ts'),
]

/** `import { … RunIssueTurn … } from` em uma linha ou várias — a forma, não o nome nu. */
const RUN_ISSUE_TURN_IMPORT = /import\s+(?:type\s+)?\{[^}]*\bRunIssueTurn\b[^}]*\}\s*from/

/** Símbolos do guard removido. `activeSessions` fica de fora — ver família 2 no docstring. */
const FORBIDDEN_GUARD_REFS = ['beginSession', 'endSession']

const FORBIDDEN_ERROR_REFS = ['TERMINAL_ALREADY_RUNNING']

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '__fixtures__') continue
			walk(full, out)
		} else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
			out.push(full)
		}
	}
	return out
}

/** Idêntico ao strip do `error-coherence`: prosa citando um símbolo não é o símbolo. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function importViolators(files: string[], allowed: string[]): string[] {
	return files.filter(f => {
		if (allowed.some(prefix => f.startsWith(prefix))) return false
		return RUN_ISSUE_TURN_IMPORT.test(stripComments(readFileSync(f, 'utf8')))
	})
}

function refViolators(files: string[], forbidden: string[]): string[] {
	return files.filter(f => {
		const source = stripComments(readFileSync(f, 'utf8'))
		return forbidden.some(ref => source.includes(ref))
	})
}

describe('Single-run-entry — o lease é a única trava de um run por issue', () => {
	const files = walk(SRC)

	it('sanity: o scan enxerga a árvore e os dois importadores legítimos existem', () => {
		expect(files.length).toBeGreaterThan(100)
		const allowed = files.filter(f => ALLOWED_RUN_ISSUE_TURN_IMPORTERS.some(p => f.startsWith(p)))
		expect(allowed.length).toBeGreaterThan(0)
	})

	it('só o dispatcher e a porta E2E importam RunIssueTurn — um terceiro seria um turno sem lease', () => {
		expect(importViolators(files, ALLOWED_RUN_ISSUE_TURN_IMPORTERS)).toEqual([])
	})

	it('o guard em memória SUMIU, não foi só posto de quarentena', () => {
		expect(refViolators(files, FORBIDDEN_GUARD_REFS)).toEqual([])
	})

	it('TERMINAL_ALREADY_RUNNING não existe mais — nenhum caminho pode levantá-lo', () => {
		expect(refViolators(files, FORBIDDEN_ERROR_REFS)).toEqual([])
	})

	/**
	 * Fixture negativa — sem ela, um rail que passa não prova nada: um regex quebrado passaria igual.
	 * Cada família recebe um arquivo que a viola, num diretório temporário, e o scanner tem de acusar.
	 */
	describe('fixture negativa — o scanner acusa de verdade', () => {
		it('pega um import de RunIssueTurn fora dos dois prefixos permitidos, inclusive via barrel', () => {
			const dir = mkdtempSync(join(tmpdir(), 'single-run-entry-'))
			try {
				mkdirSync(join(dir, 'ui'), { recursive: true })
				const direct = join(dir, 'Direct.ts')
				const viaBarrel = join(dir, 'ui', 'ViaBarrel.ts')
				writeFileSync(direct, "import { RunIssueTurn } from '../../agent/usecases/RunIssueTurn'\nexport const a = RunIssueTurn\n")
				writeFileSync(viaBarrel, "import { RunIssueTurn } from '@agent/usecases'\nexport const b = RunIssueTurn\n")

				const found = importViolators(walk(dir), ALLOWED_RUN_ISSUE_TURN_IMPORTERS)
				expect(found).toContain(direct)
				expect(found).toContain(viaBarrel)
			} finally {
				rmSync(dir, { recursive: true, force: true })
			}
		})

		it('NÃO acusa um reexport de barrel nem uma menção em comentário', () => {
			const dir = mkdtempSync(join(tmpdir(), 'single-run-entry-ok-'))
			try {
				const barrel = join(dir, 'index.ts')
				const prose = join(dir, 'Prose.ts')
				writeFileSync(barrel, "export { RunIssueTurn } from './RunIssueTurn'\n")
				writeFileSync(prose, '// import { RunIssueTurn } from somewhere — explicando por que NÃO se faz isso\nexport const c = 1\n')

				expect(importViolators(walk(dir), ALLOWED_RUN_ISSUE_TURN_IMPORTERS)).toEqual([])
			} finally {
				rmSync(dir, { recursive: true, force: true })
			}
		})

		it('pega os símbolos do guard e o código de erro removidos', () => {
			const dir = mkdtempSync(join(tmpdir(), 'single-run-entry-refs-'))
			try {
				const guard = join(dir, 'Guard.ts')
				const code = join(dir, 'Code.ts')
				writeFileSync(guard, 'export function beginSession(id: string) { return id }\n')
				writeFileSync(code, "export const e = 'TERMINAL_ALREADY_RUNNING'\n")

				const files = walk(dir)
				expect(refViolators(files, FORBIDDEN_GUARD_REFS)).toContain(guard)
				expect(refViolators(files, FORBIDDEN_ERROR_REFS)).toContain(code)
			} finally {
				rmSync(dir, { recursive: true, force: true })
			}
		})
	})
})
```

### Step T3.2 — Rodar o rail

Run: `cd packages/api/typescript && bun test tests/architecture/single-run-entry.test.ts`
Expected: PASS em todos os casos, inclusive as três fixtures negativas.

Se a família 1 acusar um arquivo, leia-o antes de mexer no rail: um importador novo e legítimo é uma decisão de desenho (entra no conjunto permitido com um `why` no docstring), nunca um regex afrouxado — o README é explícito de que um detector enfraquecido vira o buraco por onde todo arquivo futuro cai.

### Step T3.3 — Rodar a suíte de arquitetura inteira

Run: `cd packages/api/typescript && bun test tests/architecture`
Expected: PASS. Confirma que o rail novo não conflita com `pty-isolation`, `error-coherence` nem `i18n-coherence`.

### Step T3.4 — Commit

```bash
git add packages/api/typescript/tests/architecture/single-run-entry.test.ts
git commit -m "test(architecture): rail de entrada única para RunIssueTurn (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — type check limpo em todos os workspaces
- [ ] `bun lint` — lint limpo
- [ ] `cd packages/api/typescript && bun test` — suíte do backend verde; a contagem deve bater com a baseline pós-#8 (1136) **menos** os casos removidos no Step T1.9 (enumerados no corpo daquele commit) **mais** os 6 casos do rail do T3 e o caso novo do Step T1.2
- [ ] E2E: sem spec dedicada. O comportamento removido não tem superfície de UI própria; a cobertura cross-stack existente (`bun e2e`) já exercita o caminho `POST /_test/agent/run-turn` e deve continuar verde
- [ ] Mapeamento AC → teste:
  - AC-1 → `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts:"dois itens para a MESMA issue rodam em sequência — a exclusão é do lease, e só dele"`
  - AC-2 → `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts:"AC-T5.2 — two items for the SAME target never lease at once"` (existente, preservado) e o mesmo caso de AC-1 pela asserção `concurrentPeak === 1`
  - AC-3 → `packages/api/typescript/tests/architecture/single-run-entry.test.ts:"o guard em memória SUMIU, não foi só posto de quarentena"`
  - AC-4 → `packages/api/typescript/tests/architecture/single-run-entry.test.ts:"TERMINAL_ALREADY_RUNNING não existe mais — nenhum caminho pode levantá-lo"` (metade em `src/`), `tests/architecture/error-coherence.test.ts` (união × registro) e `tests/architecture/i18n-coherence.test.ts` (paridade pt/en); a metade gerada é verificada pelo `grep` do Step T2.5
  - AC-5 → `packages/api/typescript/tests/architecture/single-run-entry.test.ts:"pega um import de RunIssueTurn fora dos dois prefixos permitidos, inclusive via barrel"`
  - AC-6 → `packages/api/typescript/tests/architecture/single-run-entry.test.ts` não cobre `defer`; a ausência é verificada pelo `tsc` do Step T1.11 (as três implementações caem juntas) e pelo Step T1.10, onde nenhum teste referencia mais `defer`
  - AC-7 → os Steps T1.10, T1.11, T2.6 e T3.3

## Notes

**Pré-requisito de ferramenta:** o Step T2.4 roda `bun sdk`, que compila o `rust-codegen` via `cargo build`. Sem `cargo` no PATH o passo falha — não é opcional nem contornável editando o gerado à mão.

**Worktree:** a `main` do checkout principal tem trabalho não commitado de outro agente (loops por intervalo). Execute este plano num worktree próprio, criado a partir do HEAD pós-merge do #8.

**O que este plano deliberadamente NÃO faz:** não explica o vazamento de `activeSessions`. Ele remove o carrier. Se o sintoma — issue presa em `WORKING`, itens morrendo por causa não-óbvia — reaparecer depois disto, a hipótese "havia um segundo detentor além do `Set`" volta à mesa, agora com muito menos superfície para investigar. O `raiseStopForPoisoned` do PR #8 é o que torna essa recorrência audível em vez de silenciosa, e é por isso que ele fica.
