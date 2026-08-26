# C8 — e2e presa no mundo pré-F4 + churn do stub — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Suíte e2e completa verde de novo — specs 04/05 asserindo a regra shipped do composer (paused → STEER, running → DIRECT; modos destravados) e o stub do orquestrador sem tentar forkar issue em turno sem entrada de origem.

**Architecture:** Dois comportamentos observáveis, sequenciados de propósito: primeiro as specs passam a asserir a semântica shipped (04/05 ficam verdes isolados, mas a suíte completa continua vermelha por starvation — esse vermelho é o falseador medido do guard); depois o guard `claims.entryId` em `E2eMcpDriver.forkIssue` elimina os retries de whisper-turn e a suíte inteira fecha verde. Nenhum comportamento de produção muda — só specs e o seam de teste.

**Tech Stack:** TypeScript, Bun, Playwright (e2e), tsyringe, MCP SDK

**Spec:** .specs/2026-07-29-e2e-stale-specs-chore.md
**Tasks:** 2
**Estimated minutes:** 25

---

## Task T1: As specs 04/05 assertam a semântica shipped do composer

**Files to write:**
- Modify: `packages/e2e/tests/05-whisper-direct.spec.ts` — reescrita completa à semântica destravada (arquivo inteiro abaixo)
- Modify: `packages/e2e/tests/04-inbound-issue.spec.ts` — só a asserção final de `composerMode` (2 linhas)

**Files to read:**
- `packages/api/typescript/src/thread/usecases/GetSessionChat.ts` — a regra shipped documentada (linhas 59-67) que as specs passam a asserir

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /e2e, /test
**Depends on:** (none)
**Gate:** `cd packages/e2e && bun scripts/run-e2e.ts tests/05-whisper-direct.spec.ts && bun scripts/run-e2e.ts tests/04-inbound-issue.spec.ts` — ambos exit 0 (isolados; a suíte completa fica INTENCIONALMENTE vermelha até T2 — Step T1.5)

### Step T1.1 — Provar o vermelho atual (estado de partida)

Run: `cd packages/e2e && bun scripts/run-e2e.ts tests/05-whisper-direct.spec.ts`
Expected: FAIL — `expect(live.composerMode).toBe('STEER')` recebe `'DIRECT'` (a spec asserta o mundo pré-F4; o código shipped responde a regra nova).

### Step T1.2 — Proposed file (reescrita completa do 05)

```typescript
// packages/e2e/tests/05-whisper-direct.spec.ts — COMPLETE final file
import { test, expect } from '../utils/test'
import { getSessionChat, steerThread, sendDirectMessage, pauseThread, resumeThread } from '@codedm/client-typescript/typescript'
import { givenAttachedThread } from '../utils/given'

/**
 * Canonical flow (c) — the composer after the mode UNLOCK.
 *
 * The mode locks died with `Thread.assertCanSteer`/`assertCanSendDirect` (founder, 29-jul): a whisper
 * and a direct message are BOTH accepted in any state. What stays state-derived is `composerMode`,
 * the DEFAULT of what Enter does, and the rule is the founder's (see GetSessionChat): a RUNNING
 * thread is a live conversation, so typing goes to the PEOPLE in it (DIRECT); a PAUSED thread
 * answers nobody, so typing is instruction for the agents (STEER). This spec proves both lanes are
 * open in both states and that the default follows pause/resume.
 */
test('composer — both lanes always open; the default follows the thread state', async ({ given }) => {
	const user = await given.freshUser({})
	const thread = await givenAttachedThread(user.session)
	const client = user.session.client

	// Live: the default is DIRECT — Enter talks to the people in the conversation.
	const live = await getSessionChat(thread.threadId, { client })
	expect(live.paused).toBe(false)
	expect(live.composerMode).toBe('DIRECT')

	// Both lanes are open while live: a whisper queues for the agents…
	const whispered = await steerThread(thread.threadId, { text: 'focus on the auth module' }, { client })
	expect(whispered.entryId).toBeTruthy()

	// …and a direct message goes out as the operator's own voice.
	const directWhileLive = await sendDirectMessage(thread.threadId, { text: 'hi from operator' }, { client })
	expect(directWhileLive.entryId).toBeTruthy()

	// Pause → the default flips to STEER: nobody is listening, so typing is instruction.
	await pauseThread(thread.threadId, { client })
	const paused = await getSessionChat(thread.threadId, { client })
	expect(paused.paused).toBe(true)
	expect(paused.composerMode).toBe('STEER')

	// Both lanes stay open while paused too.
	const direct = await sendDirectMessage(thread.threadId, { text: 'taking over for a sec' }, { client })
	expect(direct.entryId).toBeTruthy()
	const whisperWhilePaused = await steerThread(thread.threadId, { text: 'nudge the agent' }, { client })
	expect(whisperWhilePaused.entryId).toBeTruthy()

	// Resume restores the live default.
	await resumeThread(thread.threadId, { client })
	const resumed = await getSessionChat(thread.threadId, { client })
	expect(resumed.paused).toBe(false)
	expect(resumed.composerMode).toBe('DIRECT')
})
```

### Step T1.3 — Ajuste pontual do 04

Modify `packages/e2e/tests/04-inbound-issue.spec.ts` (linhas ~104-105): substituir o comentário + asserção

de:

```
	// Live session ⇒ the composer is in whisper (STEER) mode, not paused/direct.
	expect(chat.composerMode).toBe('STEER')
```

para:

```
	// Live session ⇒ the composer DEFAULTS to DIRECT (the founder's rule in GetSessionChat: a running
	// thread is a live conversation, so Enter talks to the people in it; STEER is the paused default).
	expect(chat.composerMode).toBe('DIRECT')
```

Nenhuma outra linha do arquivo muda.

### Step T1.4 — Verificar os dois specs isolados

Run: `cd packages/e2e && bun scripts/run-e2e.ts tests/05-whisper-direct.spec.ts`
Expected: PASS (1 passed)

Run: `cd packages/e2e && bun scripts/run-e2e.ts tests/04-inbound-issue.spec.ts`
Expected: PASS (1 passed) — isolado, sem o tráfego do 05, não há starvation (AC-7)

### Step T1.5 — Provar que a suíte COMPLETA ainda fica vermelha (falseador do guard, metade vermelha)

Run: `cd packages/e2e && bun run test`
Expected: FAIL — `04-inbound-issue` estoura o poll de 20s em `issue never settled at COMPLETED` (os 2 whispers do novo 05 geram turnos de orquestrador sem origem → `ForkIssue` rejeita → 3 retries de Mailbox cada → starvation). Citar a contagem (`1 failed, N passed`). Este é o VERMELHO medido que o T2 apaga.

### Step T1.6 — Commit

```bash
git add packages/e2e/tests/05-whisper-direct.spec.ts packages/e2e/tests/04-inbound-issue.spec.ts
git commit -m "test(e2e): C8 — specs 04/05 assertam a semântica shipped do composer

05 reescrito ao mundo destravado (ambos os modos aceitos em qualquer estado;
composerMode é default derivado: live=DIRECT, paused=STEER — a regra do founder
em GetSessionChat.ts:59-67); docstring deixa de citar assertCanSteer/
assertCanSendDirect (deletados em a4b7f622). 04:105 corrige a asserção invertida.

Suíte completa AINDA vermelha aqui de propósito: o novo 05 dobra os whisper-turns
e o stub tenta forkar sem origem — starvation medida do 04. É o vermelho do
falseador do guard (T2)."
```

## Task T2: Turno de whisper não forka — a suíte inteira fica verde

**Files to write:**
- Modify: `packages/api/typescript/src/agent/mcp/E2eMcpDriver.ts` — guard `claims.entryId` no `forkIssue`, antes de `this.call(...)`
- Modify: `packages/e2e/playwright.config.ts` — `workers: 2 → 1` (emenda medida durante a execução: ver Step T2.3b; harness de teste, dentro do escopo "seam de teste" da spec, necessário para o AC-6)

**Files to read:**
- `packages/api/typescript/src/agent/services/RunTokenService/RunTokenService.ts` — o campo `entryId?` das claims ("the transcript entry that TRIGGERED this run, when one did")
- `packages/api/typescript/src/agent/controllers/ForkIssue.ts` — a rejeição que o guard evita (linhas 102-106)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1
**Consumes (frozen):** nenhum identificador de código — a dependência é de SEQUÊNCIA: o Step T1.5 produz o vermelho medido (starvation do 04 na suíte completa) que o Step T2.4 apaga; T2 não importa nada escrito por T1
**Gate:** `cd packages/e2e && bun run test` — exit 0, suíte completa (AC-6)

### Step T2.1 — Confirmar o vermelho de partida

O Step T1.5 já provou: suíte completa FAIL por starvation do 04. Se T1 acabou de rodar nesta mesma sessão, reutilizar aquela saída como o vermelho; senão, re-rodar `cd packages/e2e && bun run test` e citar o FAIL.

### Step T2.2 — Aplicar o guard (substituição do método `forkIssue`, resto do arquivo intocado)

Modify `packages/api/typescript/src/agent/mcp/E2eMcpDriver.ts`: substituir o método `forkIssue` inteiro (hoje linhas ~84-92) por:

```typescript
	async forkIssue(mcp: AgentMcpInvocation): Promise<DeclaredToolCall[]> {
		// A run with no triggering transcript entry CANNOT fork: the router injects `originEntryId`
		// from this very claim, and `ForkIssue` rejects the attribution gap by design (§7.2). Such
		// turns exist — a whisper queues an orchestrator turn with no origin — and the real
		// orchestrator answers them by replying, not by forking. Declaring nothing is that behavior
		// (AC-5: return [] WITHOUT entering `call`); forcing the call would turn a designed rejection
		// into 3 mailbox retries per whisper. An INVALID token still falls through to `call`, whose
		// fail-loudly path reports it — that guard is for drift on turns that CAN fork and stays.
		const claims = this.runTokens.verify(mcp.token)
		if (claims && !claims.entryId) return []
		return this.call(mcp, verified => [
			{
				tool: operationIdOf(ForkIssueController),
				input: { threadId: verified.threadId, data: { goal: E2eMcpDriver.FORK_GOAL } },
				summary: 'issue forked from the conversation',
			},
		])
	}
```

Nenhuma outra parte do arquivo muda — em particular o `throw` em `result.isError` dentro de `call()` permanece exatamente como está (decisão 3 da spec).

### Step T2.3 — Gates de backend

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: exit 0

Run: `cd packages/api/typescript && bun test`
Expected: 0 fail (contagem igual à baseline — nenhum teste de api muda neste chore)

### Step T2.3b — Emenda medida: `workers: 1` (achado da execução)

O guard eliminou o churn de fork (zero `ForkIssue`/`isError` em 3 execuções pós-guard), mas a suíte completa seguia vermelha 3/3 por uma SEGUNDA causa, não prevista na spec: com `workers: 2`, dois specs contra o mesmo SQLite embarcado fazem o upsert de materialização (`issue_issues ... on conflict`) falhar transientemente, e o backoff de 30s do `DrizzleOutboxDispatcher` (linha 238) estoura o poll de 20s do teste — timeout determinístico (`attempts: 1, maxReached: false`). Medição decisiva: `--workers=1` → suíte verde E mais rápida (14.9s vs ~26s).

Modify `packages/e2e/playwright.config.ts`: `workers: 2` → `workers: 1`, com o comentário reescrito para a verdade medida (o antigo "two workers keeps things moving" era empiricamente falso). Achado de PRODUTO registrado para o B3 (que mexe nessa maquinaria): uma falha transiente custa 30s de latência de materialização também fora de teste — candidato a backoff menor/jitter no primeiro retry, decisão do founder lá.

### Step T2.4 — O verde do falseador: suíte completa

Run: `cd packages/e2e && bun run test`
Expected: PASS — exit 0, `0 failed` (skips honestos permanecem). AC-6 fechado; par vermelho→verde do guard completo (T1.5 → aqui).

### Step T2.5 — 04 isolado de novo (AC-7)

Run: `cd packages/e2e && bun scripts/run-e2e.ts tests/04-inbound-issue.spec.ts`
Expected: PASS (1 passed)

### Step T2.6 — Commit

```bash
git add packages/api/typescript/src/agent/mcp/E2eMcpDriver.ts
git commit -m "fix(agent): C8 — whisper-turn não tenta forkar; suíte e2e verde

Guard claims.entryId no E2eMcpDriver.forkIssue: turno de orquestrador sem entrada
de origem declara nada (o orquestrador real responderia sem forkar) em vez de
bater no ForkIssue real, ser rejeitado por design e queimar 3 retries de Mailbox
por whisper — a starvation que derrubava o 04 na suíte completa.

FALSEADOR executado: sem o guard (T1) a suíte completa falha (04 estoura 20s em
WORKING); com o guard, verde. O fail-loudly em isError de call() fica intocado —
é o guard de drift dos turnos que PODEM forkar."
```

## Final Validation

- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` — exit 0
- [ ] `cd packages/api/typescript && bun test` — 0 fail
- [ ] `cd packages/e2e && bun run test` — exit 0, suíte completa (AC-6)
- [ ] `cd packages/e2e && bun scripts/run-e2e.ts tests/04-inbound-issue.spec.ts` — exit 0 isolado (AC-7)
- [ ] AC mapping:
  - AC-1 → `packages/e2e/tests/05-whisper-direct.spec.ts:"composer — both lanes always open; the default follows the thread state"` (zero `rejects.toThrow` sobre steer/direct — verificável por grep no arquivo)
  - AC-2 → mesmo teste: asserções `live.composerMode === 'DIRECT'` / `paused.composerMode === 'STEER'` / `resumed.composerMode === 'DIRECT'`
  - AC-3 → docstring do mesmo arquivo (grep por `assertCanSteer|assertCanSendDirect` retorna vazio)
  - AC-4 → `packages/e2e/tests/04-inbound-issue.spec.ts:"inbound message → issue appears with slug label → session runs"` (asserção final `toBe('DIRECT')`)
  - AC-5 → comportamento provado pelo par T1.5 (vermelho: starvation com fork-em-whisper) → T2.4 (verde com o guard); guard visível em `E2eMcpDriver.ts#forkIssue`
  - AC-6 → Step T2.4 (`bun run test` exit 0)
  - AC-7 → Steps T1.4 e T2.5 (04 isolado verde antes e depois do guard)

## Notes

- O runner (`bun scripts/run-e2e.ts`) sobe o stack real com data dir efêmero e o derruba ao final — nenhum servidor precisa estar de pé antes; se o app desktop do founder estiver rodando, não interfere (portas/dirs próprios do harness).
- `bun e2e` NÃO existe no codedm (decisão 4 da spec) — todas as verificações usam `bun run test`/`bun scripts/run-e2e.ts` de `packages/e2e`.
- A edição não commitada do founder em `packages/api/typescript/src/thread/entities/Thread.ts` (import órfão) NÃO é staged por nenhum commit deste plano.
