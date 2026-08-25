# Um turno travado volta à fila — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Uma indisponibilidade externa passa a custar o tempo dela, não o tempo dela mais o relógio do lease: o watchdog mata um turno travado em até três minutos, e um turno MUDO que morre no transporte devolve seu item à fila em vez de consumi-lo.

**Architecture:** Duas mudanças de mecanismo e uma invariante que as protege. O watchdog do `ClaudeAgentRunner` passa a reiniciar por frame decodificado em vez de chunk de stdout, então bytes que não são progresso deixam de contar como sinal de vida. Os dois métodos de turno do dispatcher passam a REPORTAR o desfecho em vez de devolver `void`, e o `runTurn` vira o único lugar que escreve no mailbox — chamando `fail()` (que libera o lease na hora e envenena no teto) quando o turno morreu no transporte SEM ter falado, e `complete()` em todo o resto.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod

**Spec:** .specs/2026-08-05-turno-travado-volta-a-fila-design.md
**Tasks:** 3
**Estimated minutes:** 115

**BASE OBRIGATÓRIA:** este plano parte da `main` **com a trava única já mergeada** (branch `build/trava-unica-para-um-run-por-issue`, 3 commits). Aquele trabalho remove o ramo de contenção e o `defer` do MESMO `runTurn` que este plano reescreve. O Step T2.1 é um gate que verifica isso; se não estiver mergeada, **pare e reporte** em vez de tentar conciliar.

**REFINAMENTO SOBRE O SPEC, decidido na Fase 2 e a razão de existir a T3:** o spec diz "stop de transporte devolve o item à fila". A regra correta é mais estreita — **transporte E o turno ainda não falou**. `RunOrchestratorTurn` transmite por cortes progressivos (`await streamed.cut(...)`); um turno que já entregou um corte e só então morreu já falou no grupo real do operador, e retentá-lo produz a segunda mensagem que o próprio código documenta como o motivo de nunca retentar turno de thread (`RunOrchestratorTurn.ts`, na altura de `outcome.kind !== 'COMPLETED'`). No incidente medido o turno NÃO falou — quatro chamadas Bash, nenhum texto entregue —, então a regra estreita resolve o caso e preserva a decisão antiga.

---

## Task T1: Um run que fala sem progredir morre no orçamento

**Files to write:**
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts` — o relógio de inatividade passa a reiniciar por frame decodificado, não por chunk de stdout
- Test: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.test.ts` — acrescenta o caso do run tagarela-mas-travado

**Files to read:**
- `packages/api/typescript/src/agent/services/StreamJsonCodec` — o codec cujo `push(chunk)` decide o que é um frame

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)
**Consumes (frozen):** `DEFAULT_INACTIVITY_MS = 180_000` e a variável de ambiente `CODM_AGENT_INACTIVITY_MS` — o VALOR do orçamento não muda nesta task, só o que reinicia a contagem. O campo `private inactivityMs` e o seam de teste `ClaudeAgentRunner.withOptions({ spawner, inactivityMs })` já existem e são o caminho suportado para injetar um orçamento curto num teste.
**Scope fence:** OUT — o dispatcher, os use cases e o mailbox pertencem à T2. Não toque em `classifyStop`, em `watchdogFired` ou na semântica do `stop` que a morte produz: a T2 depende de a morte continuar virando um `finished` com stop de transporte, exatamente como hoje.
**Gate:** `cd packages/api/typescript && bun test src/agent/services/AgentRunner` verde, e `bun x tsc -p tsconfig.build.json --noEmit` exit 0.

### Step T1.1 — Escrever o teste que falsifica

O falsificador precisa de um spawner que emita chunks SEM nunca fechar um frame. Acrescente ao `ClaudeAgentRunner.test.ts`:

```typescript
	/**
	 * O WATCHDOG MEDE AVANÇO, NÃO TAGARELICE.
	 *
	 * Medido em 2026-08-05: um turno ficou 8m12s parado esperando o classificador de permissão do
	 * provider responder, com o orçamento de inatividade em 3 minutos, e não foi morto. O relógio
	 * reiniciava a cada CHUNK de stdout, então qualquer byte que o CLI emitisse enquanto não progredia
	 * — retries, mensagens parciais — o mantinha vivo indefinidamente. O item do mailbox só voltou à
	 * fila quando o lease expirou, 20 minutos depois.
	 *
	 * O falsificador é exato: volte o reset para o chunk e este teste pendura, porque o spawner abaixo
	 * emite para sempre e nunca fecha um frame.
	 */
	it('mata um run que emite bytes sem nunca completar um frame', async () => {
		const runner = ClaudeAgentRunner.withOptions({
			inactivityMs: 60,
			spawner: () => {
				let stop = false
				return {
					stdout: (async function* () {
						while (!stop) {
							// Meio de uma linha JSON: o codec bufferiza e NÃO entrega frame algum.
							yield new TextEncoder().encode('{"type":"assis')
							await new Promise(resolve => setTimeout(resolve, 10))
						}
					})(),
					stderr: (async function* () {})(),
					write: () => {},
					endStdin: () => {},
					kill: () => {
						stop = true
					},
					exited: Promise.resolve(0),
				}
			},
		})

		const events: unknown[] = []
		for await (const event of runner.run(baseRunRequest())) events.push(event)

		const finished = events.at(-1) as { type: string; stop?: { detail: string } }
		expect(finished.type).toBe('finished')
		expect(finished.stop?.detail).toContain('inactivity watchdog')
	}, 5_000)
```

Se `baseRunRequest()` não existir no arquivo, use a mesma fábrica de request que os casos vizinhos já usam — não invente uma nova forma de request.

### Step T1.2 — Rodar o teste contra o código atual

Run: `cd packages/api/typescript && bun test src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.test.ts`
Expected: o novo caso FALHA por timeout do bun:test (5s) — o run nunca termina, que é o defeito. Os demais casos do arquivo seguem verdes.

### Step T1.3 — Mudar o que reinicia o relógio

Modify `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts`, no laço `for (;;)` da drenagem:

Hoje cada volta cria um `setTimeout(this.inactivityMs)` novo, então QUALQUER chunk que resolva `iterator.next()` renova o orçamento inteiro. Substitua por um prazo que só avança quando um frame sai do codec:

- Antes do laço, declare `let deadlineAt = Date.now() + this.inactivityMs`.
- Dentro do laço, o `setTimeout` passa a receber `Math.max(deadlineAt - Date.now(), 0)` em vez de `this.inactivityMs`.
- Declare `let sawFrame = false` imediatamente antes do `for (const decoded of codec.push(settled.value))` e ponha `sawFrame = true` dentro do laço interno que itera `decoded.frames`, na mesma altura em que o frame é entregue.
- Depois desse bloco, `if (sawFrame) deadlineAt = Date.now() + this.inactivityMs`.

Não mexa em mais nada do laço: o ramo `settled === 'timeout'` (que seta `watchdogFired`, loga, faz `step.catch(() => {})` e `proc.kill()`) fica idêntico, e `classifyStop` continua traduzindo `watchdogFired` no stop de `SERVER_ERROR` que a T2 vai consumir.

Atualize também o docstring da classe, na seção "The watchdog is NOT optional": a frase que descreve o disparo por inatividade deve dizer que a contagem é de FRAMES, não de bytes — do contrário a prosa passa a descrever o mecanismo antigo.

### Step T1.4 — Rodar o teste de novo

Run: `cd packages/api/typescript && bun test src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.test.ts`
Expected: PASS, todos os casos.

### Step T1.5 — Type check + suíte do subsistema

Run: `cd packages/api/typescript && bun test src/agent/services/AgentRunner && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 fail, exit 0.

### Step T1.6 — Commit

```bash
git add packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts \
        packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.test.ts
git commit -m "fix(agent): o watchdog mede avanço, não tagarelice (Task T1)"
```

---

## Task T2: Um turno mudo que morre no transporte volta à fila

**Files to write:**
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts` — reporta o stop de transporte e se o turno chegou a falar
- Modify: `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts` — idem; e um stop de transporte deixa de persistir Stop e de enfileirar o ISSUE_RESULT
- Modify: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts` — os dois métodos de turno reportam em vez de devolver `void`, e `runTurn` vira o único que escreve no mailbox
- Test: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts`
- Test: `packages/api/typescript/src/agent/usecases/RunIssueTurn.test.ts`

**Files to read:**
- `packages/api/typescript/src/agent/enums/TransportStopKind.ts` — o predicado que decide a pertinência
- `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.ts` — o contrato de `fail(id, error, maxAttempts)`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /usecase, /service, /test
**Depends on:** T1
**Consumes (frozen):** `isTransportStopKind(kind)` e `TRANSPORT_STOP_KINDS` de `agent/enums/TransportStopKind` — o subconjunto é `{ StopKind.AUTH_REQUIRED, StopKind.SERVER_ERROR }` e NÃO deve ser redeclarado nem ampliado aqui. `MailboxRepository.fail(id, error, maxAttempts, tx?)` já grava `last_error`, libera o lease e envenena passando do teto. `MAX_ATTEMPTS = 3` e `raiseStopForPoisoned(item, cause)` já existem no dispatcher, vindos do PR #8, e ficam INTACTOS.
**Scope fence:** DONE elsewhere — a T1 já garante que um run travado morre e produz um stop de transporte; não reimplemente watchdog nem mexa em `classifyStop`. OUT — a invariante "um turno que já falou não é retentado" tem teste próprio na T3; implemente a regra aqui, mas não escreva o teste dela.
**Gate:** `cd packages/api/typescript && bun test src/agent` verde, `bun x tsc -p tsconfig.build.json --noEmit` exit 0, e `bun lint` sem achados.

### Step T2.1 — Confirmar a base

Run: `git log --oneline -20 | grep -i "trava única\|lease (Task T1)"`
Expected: o commit da trava única. Se vier vazio, **pare e reporte** — este plano reescreve o mesmo `runTurn` e a base errada produz conflito silencioso.

Run: `grep -c "contentionBackoffMs\|MailboxRepository.defer\|\.defer(" packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts`
Expected: `0`. Se for maior que zero, a trava única não está aplicada.

### Step T2.2 — Escrever o teste que falsifica

Acrescente ao `describe('DrizzleMailboxDispatcher — the drain loop wakes for work that arrives mid-turn', ...)` em `DrizzleMailboxDispatcher.test.ts`:

```typescript
	/**
	 * TRANSPORTE NÃO É FRACASSO DO TRABALHO — é a hora errada de tentar.
	 *
	 * Medido em 2026-08-05: o classificador de permissão do provider caiu, o turno morreu sem ter dito
	 * nada, e o item foi CONSUMIDO como se tivesse sido atendido. O operador ficou 20 minutos sem
	 * resposta, sem retry e sem sinal — a única recuperação era o lease expirar.
	 *
	 * O falsificador é exato: troque o `fail` de volta por `complete` no ramo de transporte e este
	 * teste fica vermelho, porque `consumedAt` deixa de ser nulo e o item some da fila.
	 */
	it('um turno MUDO que morre no transporte devolve o item à fila em vez de consumi-lo', async () => {
		const ownerId = 'owner-transport'
		const { thread } = await givenThread(testBed, { ownerId })

		class TransportFailingDispatcher extends DrizzleMailboxDispatcher {
			protected override async runThreadTurn(): Promise<TurnReport> {
				return { spoke: false, transportStop: { detail: 'provider unavailable' } }
			}
		}

		const dispatcher = testBed.resolve(TransportFailingDispatcher)
		const mailbox = testBed.resolve(MailboxRepository)

		await mailbox.enqueue({
			ownerId,
			targetKind: MailboxTargetKind.THREAD,
			targetId: thread.id.value,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'oi' },
			dedupKey: `transport:${thread.id.value}`,
		})

		await dispatcher.start()
		await new Promise(resolve => setTimeout(resolve, 200))
		await dispatcher.stop()

		// NÃO consumido, e reclamável de novo sem esperar o lease.
		const again = await mailbox.claimNext('transport-test', 60_000)
		expect(again).toBeDefined()
		expect(again?.targetId).toBe(thread.id.value)
	})
```

`TurnReport` é o tipo que o Step T2.4 introduz; importe-o do módulo do dispatcher.

### Step T2.3 — Rodar o teste contra o código atual

Run: `cd packages/api/typescript && bun test src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts`
Expected: FALHA de compilação em `TurnReport` (ainda não existe) — que é o RED desta task.

### Step T2.4 — O dispatcher reporta em vez de devolver void

Modify `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts`:

Declare, junto dos outros tipos do módulo, o relatório que um turno devolve:

```typescript
/**
 * O que um turno reporta ao `runTurn`, que é o ÚNICO lugar que escreve no mailbox.
 *
 * `spoke` existe porque retentar não é sempre seguro: `RunOrchestratorTurn` transmite por cortes
 * progressivos, então um turno que já entregou um corte e só então morreu JÁ FALOU no grupo real do
 * operador, e uma segunda tentativa produziria uma segunda mensagem. `transportStop` sem `spoke` é a
 * única combinação que devolve o item à fila.
 *
 * `dropped` distingue "o alvo sumiu" (thread desanexada, workspace desvinculado) de "o turno rodou":
 * `dropSilently` deixou de escrever no mailbox por conta própria — o double-write que existia aqui era
 * inofensivo enquanto o único desfecho era `complete`, e vira ambiguidade agora que há dois.
 */
export interface TurnReport {
	spoke: boolean
	transportStop?: { detail: string }
	dropped?: boolean
}
```

- `dropSilently` para de chamar `this.mailbox.complete(item.id)`; ela só loga e devolve `{ spoke: false, dropped: true }`. O docstring dela explica hoje por que um alvo sumido é COMPLETADO e não falhado — mantenha esse raciocínio e acrescente que quem executa a completude agora é o `runTurn`.
- `runThreadTurn` e `runIssueWork` mudam a assinatura para `Promise<TurnReport>` e devolvem o que o use case reportar.
- No `runTurn`, o trecho que hoje é `if (targetKind === THREAD) await this.runThreadTurn(item) else await this.runIssueWork(item); await this.mailbox.complete(item.id)` passa a:

```typescript
			const report = item.targetKind === MailboxTargetKind.THREAD ? await this.runThreadTurn(item) : await this.runIssueWork(item)

			// TRANSPORTE MUDO VOLTA À FILA. `fail` sobe `attempts`, grava a causa em `last_error` e
			// libera o lease AGORA — o item é reclamável no próximo poll (250ms) em vez de esperar o
			// relógio de 10 minutos. Passando do teto, `raiseStopForPoisoned` transforma a desistência
			// num Stop, que é o único aviso que o operador recebe, e só no fim.
			if (report.transportStop && !report.spoke) {
				await this.mailbox.fail(item.id, report.transportStop.detail, MAX_ATTEMPTS)
				if (item.attempts >= MAX_ATTEMPTS) await this.raiseStopForPoisoned(item, report.transportStop.detail)
				return
			}

			await this.mailbox.complete(item.id)
```

O `catch` que segue — o `fail` seguido de `raiseStopForPoisoned` para uma exceção — fica exatamente como está: uma exceção continua sendo falha do trabalho, não do transporte.

### Step T2.5 — O turno de thread reporta o transporte e se falou

Modify `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts`:

- `RunOrchestratorTurnOutputSchema` ganha dois campos: `spoke: z.boolean()` e `transportStop: z.object({ detail: z.string() }).optional()`.
- O use case já rastreia se transmitiu algum corte (o estado de corte que governa `streamed.cut`). Marque isso numa variável local e devolva-a como `spoke` em TODOS os retornos — inclusive no caminho feliz, onde `spoke` é verdadeiro assim que o texto é entregue.
- No ramo `if (outcome.kind !== 'COMPLETED')`, que hoje loga e devolve `{ text: '' }`: quando `isTransportStopKind(outcome.stopKind)` for verdadeiro, devolva também `transportStop: { detail: outcome.detail ?? outcome.stopKind }`. Um stop NÃO transportado continua devolvendo só `{ text: '', spoke }` — ele é resposta do agente, não falha, e não deve ser retentado.
- O comentário que explica "Logged rather than thrown: the dispatcher would treat a throw as a failed turn and retry it, and re-running a conversational turn produces a SECOND message in a real group" continua VÁLIDO e deve ficar — acrescente que é exatamente por isso que o retry passou a exigir `spoke === false`, em vez de valer para qualquer stop.

### Step T2.6 — O turno de issue reporta, e um stop de transporte não persiste nada

Modify `packages/api/typescript/src/agent/usecases/RunIssueTurn.ts`:

- `RunIssueTurnOutputSchema` ganha `spoke: z.boolean()` e `transportStop: z.object({ detail: z.string() }).optional()`.
- Em `persistOutcome`, ANTES do `await this.enqueueResult(input, outcome, tx)`: quando o desfecho for `STOPPED` e `isTransportStopKind(outcome.stopKind)`, retorne sem enfileirar o ISSUE_RESULT e sem persistir o Stop. Enfileirar ali anunciaria uma falha que a próxima tentativa vai desmentir, e persistir o Stop daria ao operador dois sinais para um fato — o alarme agora e a resposta um minuto depois.
- `handle` devolve `spoke: false` quando houve stop de transporte (nada foi enfileirado, logo nada foi dito) e `spoke: true` caso contrário, mais o `transportStop` correspondente.
- No docstring da classe, a frase que descreve `persistOutcome` como o lugar onde a conclusão sempre vira fato precisa registrar a exceção: um stop de transporte não vira fato aqui, ele vira retry no dispatcher.

### Step T2.7 — O teste do issue turn

Acrescente ao `RunIssueTurn.test.ts` um caso que prova a metade silenciosa: um turno cujo runner devolve stop de transporte NÃO enfileira `ISSUE_RESULT` e NÃO persiste `AgentRunStopRaisedEvent`. Use o mesmo `TestBed` em modo `integration` e o mesmo estilo dos casos vizinhos, resolvendo `MailboxRepository` e `DomainEventRepository` do `testBed` e assertando que `claimNext` volta `undefined` e que `findByType(AgentRunStopRaisedEvent)` tem comprimento zero.

### Step T2.8 — Rodar tudo

Run: `cd packages/api/typescript && bun test src/agent`
Expected: 0 fail, incluindo o caso novo do Step T2.2 e o do T2.7.

### Step T2.9 — Type check + lint

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: exit 0.

Run: `bun lint`
Expected: 0 findings.

### Step T2.10 — Commit

```bash
git add packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts \
        packages/api/typescript/src/agent/usecases/RunIssueTurn.ts \
        packages/api/typescript/src/agent/usecases/RunIssueTurn.test.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts \
        packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts
git commit -m "fix(agent): turno mudo que morre no transporte volta à fila (Task T2)"
```

---

## Task T3: Um turno que já falou nunca é retentado

**Files to write:**
- Test: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts` — acrescenta o caso da invariante

**Files to read:**
- `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts` — o `TurnReport` e o ramo de transporte que a T2 introduziu

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T2
**Consumes (frozen):** a interface `TurnReport { spoke: boolean; transportStop?: { detail: string }; dropped?: boolean }` exportada pelo módulo do dispatcher na T2, e a regra que a T2 implementou: só `transportStop && !spoke` devolve o item à fila.
**Scope fence:** DONE elsewhere — a regra JÁ está implementada pela T2. Esta task só a FIXA com um teste; se ela não estiver valendo, a T2 está incompleta: reporte, não conserte aqui. OUT — nenhum arquivo de produção é tocado nesta task.
**Gate:** `cd packages/api/typescript && bun test src/agent/services/MailboxDispatcher` verde.

### Step T3.1 — Escrever o teste da invariante

Esta é a invariante que o caminho feliz não detecta, e por isso tem task própria: se alguém simplificar a condição do ramo de transporte para só `report.transportStop`, todos os outros testes seguem verdes e o operador volta a receber mensagem duplicada num grupo real.

Acrescente ao mesmo `describe` do dispatcher:

```typescript
	/**
	 * A DUPLICATA É PIOR QUE A DEMORA, e esta é a invariante que o caminho feliz não vê.
	 *
	 * `RunOrchestratorTurn` transmite por cortes progressivos. Um turno que já entregou um corte e só
	 * então morreu no transporte JÁ FALOU no grupo real do operador — retentá-lo produz a segunda
	 * mensagem que o próprio use case documenta como o motivo de nunca retentar turno de thread.
	 *
	 * O falsificador é exato: apague o `&& !report.spoke` do ramo de transporte no `runTurn` e este
	 * teste fica vermelho, enquanto todos os outros continuam verdes.
	 */
	it('um turno que JÁ FALOU e depois morre no transporte é consumido, não devolvido', async () => {
		const ownerId = 'owner-spoke'
		const { thread } = await givenThread(testBed, { ownerId })

		class SpokeThenDiedDispatcher extends DrizzleMailboxDispatcher {
			protected override async runThreadTurn(): Promise<TurnReport> {
				return { spoke: true, transportStop: { detail: 'died after speaking' } }
			}
		}

		const dispatcher = testBed.resolve(SpokeThenDiedDispatcher)
		const mailbox = testBed.resolve(MailboxRepository)

		await mailbox.enqueue({
			ownerId,
			targetKind: MailboxTargetKind.THREAD,
			targetId: thread.id.value,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'oi' },
			dedupKey: `spoke:${thread.id.value}`,
		})

		await dispatcher.start()
		await new Promise(resolve => setTimeout(resolve, 200))
		await dispatcher.stop()

		// CONSUMIDO: nada volta à fila, porque uma segunda tentativa falaria duas vezes.
		expect(await mailbox.claimNext('spoke-test', 60_000)).toBeUndefined()
	})
```

### Step T3.2 — Rodar e falsificar de verdade

Run: `cd packages/api/typescript && bun test src/agent/services/MailboxDispatcher`
Expected: PASS.

Depois, prove que o teste tem dentes: remova temporariamente o `&& !report.spoke` do `runTurn`, rode de novo e confirme que ESTE caso fica vermelho enquanto o caso do Step T2.2 segue verde. Restaure a condição e confirme o verde antes de seguir. Relate as duas contagens no seu report — um teste de invariante que nunca foi visto falhando não é rede.

### Step T3.3 — Suíte do contexto + type check

Run: `cd packages/api/typescript && bun test src/agent && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 fail, exit 0.

### Step T3.4 — Commit

```bash
git add packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts
git commit -m "test(agent): um turno que já falou nunca é retentado (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — type check limpo em todos os workspaces
- [ ] `bun lint` — lint limpo
- [ ] `cd packages/api/typescript && bun test` — suíte do backend verde, com 4 casos a mais que a baseline (1 na T1, 2 na T2, 1 na T3)
- [ ] E2E: sem spec dedicada. O comportamento não tem superfície de UI própria e a cobertura cross-stack existente (`bun e2e`) deve continuar verde
- [ ] Mapeamento AC → teste:
  - AC-1 → `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.test.ts:"mata um run que emite bytes sem nunca completar um frame"`
  - AC-2 → `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts:"um turno MUDO que morre no transporte devolve o item à fila em vez de consumi-lo"`
  - AC-2b → `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts:"um turno que JÁ FALOU e depois morre no transporte é consumido, não devolvido"` (Task T3)
  - AC-3 → o mesmo caso de AC-2, pela asserção de que `claimNext` devolve o item logo depois, sem espera de lease
  - AC-4 → `packages/api/typescript/src/agent/usecases/RunIssueTurn.test.ts` (Step T2.7: nenhum `ISSUE_RESULT` e nenhum `AgentRunStopRaisedEvent` num stop de transporte) e o `raiseStopForPoisoned` já coberto pelo caso `'um item envenenado levanta um Stop em vez de sumir calado'`, preservado
  - AC-5 → a asserção de `last_error` no caso de AC-2 — verifique a linha do mailbox, não só a reclamabilidade
  - AC-6 → Steps T2.9 e T3.3

## Notes

**Ordem obrigatória:** mergear `build/trava-unica-para-um-run-por-issue` ANTES de rodar este plano. Os dois reescrevem o `runTurn`; o Step T2.1 é o gate que recusa a base errada.

**A invariante da T3 não é decoração.** O código já documenta, em `RunOrchestratorTurn`, que retentar um turno conversacional produz uma segunda mensagem num grupo real — e o operador reclamou de mensagem duplicada em 2026-08-05. A regra estreita (`transportStop && !spoke`) é o que deixa este plano resolver a demora sem reintroduzir aquilo.

**O que este plano deliberadamente NÃO faz:** não torna o heartbeat sensível a progresso. Ele continua provando que o intervalo dispara, não que o turno avança — o mesmo erro conceitual que a T1 corrige uma camada abaixo. Com a T1 e a T2, um turno travado no stream resolve em ≤180s e o caminho medido nunca alcança o heartbeat; um travamento DENTRO do use case (round trip de MCP, consulta de banco) ainda o alcançaria. Está registrado como Open Question no spec, e a primeira pergunta a responder é qual sinal de progresso viaja do runner até o dispatcher.
