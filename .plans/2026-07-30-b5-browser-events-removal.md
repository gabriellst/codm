# Frente B5 — remoção de `browser.*` + `BrowserFrameEnricher` — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Fechar a única lacuna real de `threadId` que ainda falta no contrato (`integration.thread.message_ingested`, novo — a de `stop_resolved` já foi fechada pelo B4), migrar os 3 consumidores frontend (`useThreadRealtime`, `AgentsRunningPill`, `HomeDashboard`) para escutar só eventos crus, e remover `BrowserFrameEnricher` + os 3 frames `browser.*` + seus testes — sem tocar `browser.terminal_action_detected` (SSE separado, fora de escopo).

**Architecture:** Duas metades independentes, sem dependência de código entre si, convergindo no front. (1) T1 é o Contract Lock: `integration.thread.message_ingested` nasce em `packages/contracts`, e `PublishThreadIntegrationEvents` — o handler que já é a ÚNICA ponte write-side→integration do contexto `thread` desde o B3 — passa a assinar também `MessageIngestedEvent` (que `IngestChannelMessage` já levanta com `threadId` resolvido). O transporte é o mesmo que B3 tornou durável: `publish()` grava na lane `integration`, e o poller do `SqlExternalMediator` entrega tanto aos handlers registrados quanto aos callbacks do SSE (emenda O1 do B3) — nenhuma infra nova. (2) T2, em paralelo, mata `BrowserFrameEnricher` e devolve o `ListenEventsController` ao estado pré-phase-6b: o broadcaster só re-emite `rawFrame`. (3) T3 (front) depende só de T1 — a remoção do union no backend (T2) não é um hard-dependency, porque remover 3 nomes de uma tupla `satisfies` nunca quebra o `tsc`, esteja o backend já enxuto ou não; T3 troca os 3 `browser.*` pelos 5 eventos crus que já carregam `threadId` (2 deles — `stop_raised` e `message_ingested` — precisam do T1; os outros 3 já existem desde o B4). (4) T4 fecha, isolado, um gap encontrado no fechamento do B4: nenhum teste prova que `GetNeedsYouPanel` realmente lista um stop sem issue. (5) T5 mede o resultado com os greps e os gates completos.

**Tech Stack:** TypeScript, Bun, TypeSpec (contracts), tsyringe-neo, Zod, React (re-aponte de nomes)

**Spec:** .specs/2026-07-29-browser-events-removal-design.md
**Tasks:** 5
**Estimated minutes:** 185

---

## O que já estava satisfeito em HEAD (B3 + B4) — provado, sem Task de código

A spec foi escrita antes do B4 fechar; boa parte do que ela pede já aconteceu como efeito colateral do rename `issue.stop_*` → `thread.stop_*`. Registrado aqui com prova, para nenhuma Task deste plano reabrir o que já está feito.

### G-A — AC-2 da spec: `thread-stop-resolved.tsp` já carrega `threadId`

`packages/contracts/wire/events/thread-stop-resolved.tsp` (renomeado pelo B4 T7, commit `a29be66d`):

```tsp
model ThreadStopResolvedEvent extends IntegrationEvent {
  name: "integration.thread.stop_resolved";
  stopId: string;
  issueId?: string;
  threadId: string;
  resolution: StopResolution;
}
```

`threadId: string` (não-opcional) já está lá. AC-2 satisfeito em HEAD.

### G-B — AC-4 da spec: o publisher já popula `threadId` a partir do domain event, SEM lookup

`packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts`, ramo `stop_resolved` (código atual, intocado por este plano):

```typescript
await this.mediator.publish(
	new StopResolvedIntegrationEvent({
		ownerId,
		payload: {
			stopId: event.payload.stopId,
			issueId: event.payload.issueId,
			threadId: event.payload.threadId,
			resolution: event.payload.resolution,
		},
	}),
)
```

`event.payload.threadId` vem direto do domain event `ThreadStopResolvedEvent` (`thread/events/ThreadStopResolvedEvent.ts`), que `Thread.resolveStop` já populava a partir do próprio agregado — sem `threadIdForIssue`, sem JOIN. E há teste que PROVA o payload publicado, não só o código lido: `packages/api/typescript/tests/flows/stop-control-plane.flow.test.ts`, caso `'AC-7 — a THREAD-LEVEL stop (no issueId) materializes and resolves, and the resolution carries threadId with no issueId'` —

```typescript
const published = testBed.externalSpy.getPublishedOfType('integration.thread.stop_resolved')
expect(published).toHaveLength(1)
const payload = published[0]?.payload as { stopId: string; threadId: string; issueId?: string }
expect(payload).toMatchObject({ stopId, threadId: thread.id.value })
expect(payload.issueId).toBeUndefined()
```

Esse é exatamente o caso mais exigente (stop de nível-thread, sem `issueId` para fazer JOIN) — se o publisher precisasse de lookup, esse caso especificamente falharia. AC-4 satisfeito em HEAD, provado por teste já existente. Nenhuma Task deste plano toca `PublishThreadIntegrationEvents`'s ramo de stop.

### G-C — o front já escuta `integration.thread.stop_raised` (B4 T8), mas ainda tem os 3 `browser.*` e o enricher ainda existe

`packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts`, `THREAD_REALTIME_EVENTS` em HEAD:

```typescript
export const THREAD_REALTIME_EVENTS = [
	'browser.thread_message_ingested',
	'browser.thread_status_changed',
	'browser.stop_raised',
	'integration.orchestrator.replied',
	'integration.issue.created',
	'integration.issue.opened',
	'integration.issue.completed',
	'integration.issue.archived',
	'integration.thread.stop_raised',
	'integration.artifact.recorded',
] as const satisfies readonly ServerEventName[]
```

10 nomes: 3 `browser.*` + 7 crus (incluindo `integration.thread.stop_raised`, já migrado pelo B4 T8). `integration.thread.stop_resolved` NÃO está na lista — o painel de needs-you hoje só sabe *aparecer* (via `browser.stop_raised`), nunca *desaparecer* via evento cru; o comentário em `NeedsYouPanel/index.tsx:24-28` documenta isso e termina com "wiring the raw fact into the subscription is B5's call, not a silent change here". `BrowserFrameEnricher.ts` + `.test.ts` existem, `ListenEvents.ts` injeta e chama `enricher.enrich(event)`. Nada disso é "já feito" — é exatamente o que T2/T3 fazem.

### G-D — o transporte que o evento novo (T1) vai usar já é durável desde o B3

`packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts:58-66`: `publish()` só faz `INSERT` na lane `integration` (`DomainEventRepository.saveIntegrationEvent`) e retorna; a entrega — a handlers registrados E aos callbacks do SSE broadcaster — sai do poller (`drainOnce`), não do call stack do publisher. A emenda O1 do B3 (`.plans/2026-07-29-b3-activation-semantics.md:1573`) fez o poller reivindicar TODAS as linhas da lane quando existe ≥1 callback global registrado (o caso do `ListenEventsController.ensureBroadcaster`), não só as que têm handler — sem isso, um fato TS publicado sem consumidor backend (exatamente o caso de `integration.thread.message_ingested`: nenhum handler TS o consome, só o browser) nunca chegaria ao SSE. T1 não precisa de nenhuma mudança de infra: só publicar.

---

## Task T1: Contract Lock — `thread-message-ingested.tsp` + o publisher do contexto assina `MessageIngestedEvent`

**Files to write:**
- Create: `packages/contracts/wire/events/thread-message-ingested.tsp`
- Modify: `packages/contracts/wire/events/index.tsp` — uma linha de `import`
- Regen: `packages/contracts/generated/typescript/src/wire/events/**`
- Regen: `packages/contracts/generated/go/wire/**`
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/typescript/src/typescript/**`
- Modify: `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts`
- Create: `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.test.ts`

**Files to read:**
- `packages/contracts/wire/events/thread-attached.tsp` — o molde EXATO de um evento `BC4 Thread & Routing -> consumers` (namespace, `@doc`, `extends IntegrationEvent`)
- `packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts:104-110` — onde `MessageIngestedEvent` já é levantado com `payload.threadId` resolvido; ninguém o republica hoje
- `packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.test.ts` — a convenção de teste de handler COLOCADO (`.handle()` chamado direto, sem `testBed.spy.register` — isso é só de `tests/flows/`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /sdk, /test
**Depends on:** (none)
**Scope fence:** DONE: o contrato novo, o regen completo, e `PublishThreadIntegrationEvents` assinando `MessageIngestedEvent`. OUT: qualquer coisa em `issue/` ou `ui/` (T2); o front (T3 — depende deste); `stop_resolved` (G-B — já satisfeito, não tocar). O nome de classe gerado `ThreadMessageIngestedEvent` NÃO colide com nenhum domain event de `thread/events/` (o domain event chama-se `MessageIngestedEvent`, sem prefixo) — nenhum alias de import é necessário, diferente do caso `ThreadStopResolvedEvent` que o B4 já resolveu.
**Gate:** `bun contracts && bun emit-openapi && bun sdk && bun check:generated && cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test src/thread/handlers/PublishThreadIntegrationEvents.test.ts` — exit 0 em todos

### Step T1.1 — Write o teste que falha

Proposed file: Create `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { OPERATOR_ID } from '@auth/operator'
import { IngestChannelMessage } from '../usecases/IngestChannelMessage'
import { MessageIngestedEvent } from '../events'
import { PublishThreadIntegrationEvents } from './PublishThreadIntegrationEvents'

/**
 * B5, decision 1 / AC-3 — the threadId gap `integration.channel_message.received` cannot close (it is
 * addressed by `(channelId, remoteId)`, never by `threadId`) is closed on the OUTBOUND side instead:
 * `IngestChannelMessage` already resolves the thread and stamps `threadId` on `MessageIngestedEvent` —
 * nobody republished it, so a browser console had no wire fact to scope a live chat update to one
 * thread without a server-side join (`BrowserFrameEnricher.threadIdForContact`, removed by this same
 * frente).
 *
 * Dispatches the REAL use case rather than hand-constructing the domain event, then reads it BACK from
 * the repository and feeds it to the handler directly — the colocated-handler convention this repo
 * already uses (`DeliverOrchestratorReply.test.ts`: `.handle()` called directly, no `testBed.spy.register`,
 * because wiring the InternalMediator dispatch end-to-end is a FLOW concern, not a handler-test one).
 * This proves the ACTUAL payload shape `IngestChannelMessage` produces reaches the bridge, not a shape
 * this file assumes.
 */
describe('PublishThreadIntegrationEvents — message_ingested bridges to integration.thread.message_ingested', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('AC-3 — an inbound message publishes integration.thread.message_ingested with the SAME threadId, no lookup', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		await testBed
			.resolve(IngestChannelMessage)
			.execute({ threadId: thread.id.value, senderExternalId: thread.contactRef.externalId, text: 'oi', receivedAt: new Date() })

		const [raised] = await testBed.resolve(DomainEventRepository).findByType(MessageIngestedEvent)
		expect(raised).toBeDefined()
		expect(raised?.payload.threadId).toBe(thread.id.value)

		await testBed.resolve(PublishThreadIntegrationEvents).handle(raised as never)

		const published = testBed.externalSpy.getPublishedOfType('integration.thread.message_ingested')
		expect(published).toHaveLength(1)
		expect(published[0]?.payload).toEqual({ threadId: thread.id.value })
	})
})
```

### Step T1.2 — Run: verificar o vermelho

Run: `cd packages/api/typescript && bun test src/thread/handlers/PublishThreadIntegrationEvents.test.ts`
Expected: FAIL — `getPublishedOfType('integration.thread.message_ingested')` retorna `[]` (o handler atual não reconhece `MessageIngestedEvent`; o `event` cai no ramo final, que monta um `StopResolvedIntegrationEvent` com campos `undefined` a partir de um payload sem `stopId`/`resolution`).

### Step T1.3 — Proposed file: Create `packages/contracts/wire/events/thread-message-ingested.tsp`

```tsp
import "./_base.tsp";

namespace TemplateContracts;

@doc("BC4 Thread & Routing -> consumers. An inbound message was appended to a thread's transcript. Closes the threadId gap `integration.channel_message.received` cannot: that fact is addressed by (channelId, remoteId) — a WhatsApp JID — not by threadId, so a browser console could not scope a live update to one thread without a server-side join. Published by the bridge that already owns thread.* facts (PublishThreadIntegrationEvents), from the domain event IngestChannelMessage raises with threadId already resolved — no lookup.")
model ThreadMessageIngestedEvent extends IntegrationEvent {
  name: "integration.thread.message_ingested";
  threadId: string;
}
```

Modify `packages/contracts/wire/events/index.tsp`: inserir `import "./thread-message-ingested.tsp";` imediatamente depois de `import "./thread-stop-resolved.tsp";` e antes de `import "./issue-created.tsp";` — mantém a família `thread-*` agrupada no barrel:

```tsp
import "./thread-attached.tsp";
import "./thread-stop-raised.tsp";
import "./thread-stop-resolved.tsp";
import "./thread-message-ingested.tsp";
import "./issue-created.tsp";
```

### Step T1.4 — Regenerar tudo que descende do contrato

```bash
bun contracts        # tsp:compile + codegen:wire (TS + Go) + codegen:fixtures + drizzle:generate (no-op aqui)
bun emit-openapi     # api-typescript + api-go
bun sdk              # kubb (nx run client:generate)
```

Esperado (adição — cada arquivo gerado é tocado uma vez, sem delete, ao contrário de um rename):

- `packages/contracts/generated/typescript/src/wire/events/thread-message-ingested.ts` (novo) — mesmo shape de `thread-attached.ts`: `ThreadMessageIngestedEventSchema = z.integrationEvent('integration.thread.message_ingested', { threadId: z.string() })` + a classe `ThreadMessageIngestedEvent extends BaseIntegrationEvent<...>`
- `generated/typescript/src/wire/events/_imports.ts` (+1 linha), `index.ts` (+1 import member + `export *` + arm de `IntegrationEventSchema`), `materialized.ts` (+1 import + alias `ThreadMessageIngestedEventMaterializedSchema` + arm de `materializedIntegrationEventSchemas` + arm de `MaterializedIntegrationEventSchema`) — todos alfabeticamente ordenados
- `generated/go/wire/events.go` (+1 const `ThreadMessageIngestedEventName`, +2 tipos, +1 método `EventName()`), `generated/go/wire/envelope.go` (+1 `case` do `UnmarshalIntegrationEvent`)
- `packages/api/typescript/public/docs/openapi.json` (+1 `const` no discriminador de `integration.*`)
- `packages/client/dist/typescript/src/typescript/{index.ts, types/ListenEvents.ts, zod/listenEventsSchema.ts}` — `ListenEvents200NameEnum<N>` renumera; nada no front importa esses aliases numerados (mesma checagem do B4 T7.2: `grep -rn "ListenEvents200NameEnum" packages/app/react/src` → vazio)

- [ ] `bun sdk` (kubb) é INCREMENTAL. Se algum arquivo gerado não mencionar `integration.thread.message_ingested` depois de rodar, forçar regen limpo antes de seguir
- [ ] `packages/api/go` NÃO precisa de `sqlc generate` nem de edição à mão — só o regen do wire (não há tabela nova, só um fato)

### Step T1.5 — Proposed file: Modify `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts`

COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import {
	ThreadAttachedEvent as ThreadAttachedIntegrationEvent,
	ThreadStopResolvedEvent as StopResolvedIntegrationEvent,
	ThreadMessageIngestedEvent,
} from '@codedm/contracts-typescript/wire/events'
import { ThreadAttachedEvent } from '../events/ThreadAttachedEvent'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
import { MessageIngestedEvent } from '../events/MessageIngestedEvent'

/**
 * The thread context's NAMED EXCEPTION (B3, decision 4): the ONE handler in this context authorized to
 * call `ExternalMediator.publish()`. Every other handler here is pure domain — it reacts and invokes
 * use cases, and never publishes integration events. Facts republished as their FROZEN contracts:
 *   thread.attached         → integration.thread.attached         (frozen fact; no TS consumer today —
 *                                                                  the browser SSE surface forwards it)
 *   thread.stop_resolved    → integration.thread.stop_resolved    (TAKE_OVER additionally pauses the thread)
 *   thread.message_ingested → integration.thread.message_ingested (B5, decision 1 — the only new branch)
 *
 * The stop branch arrived in B4 with the aggregate: `Thread.resolveStop` raises the fact, so this
 * context's publisher bridges it — it was `PublishIssueIntegrationEvents` while the Stop hung off
 * `Issue`.
 *
 * The message_ingested branch (B5) closes the threadId gap `integration.channel_message.received`
 * cannot: that wire fact is addressed by `(channelId, remoteId)` — a WhatsApp JID — never by `threadId`,
 * so a browser console had no way to scope a live chat update to one thread without a server-side
 * JOIN. That JOIN used to live in `BrowserFrameEnricher.threadIdForContact` (`browser.thread_message_ingested`),
 * removed in the same frente this branch belongs to. `IngestChannelMessage` already resolves the thread
 * and stamps `threadId` on `MessageIngestedEvent` — nobody republished it until now.
 *
 * The `thread.direct_message_sent` branch is GONE (B3, decision 3): it translated a fact into
 * `integration.channel.delivery_requested`, i.e. it used an event to COMMAND. The order is now a
 * durable `deliver_channel_message` command enqueued inside `SendDirectMessage`'s own transaction, and
 * the fact stays as an audit record with no consumer.
 */
@injectable()
export class PublishThreadIntegrationEvents extends EventHandler<
	readonly [typeof ThreadAttachedEvent, typeof ThreadStopResolvedEvent, typeof MessageIngestedEvent]
> {
	readonly event = [ThreadAttachedEvent, ThreadStopResolvedEvent, MessageIngestedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		if (event instanceof ThreadAttachedEvent) {
			await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
			return
		}

		if (event instanceof MessageIngestedEvent) {
			await this.mediator.publish(new ThreadMessageIngestedEvent({ ownerId, payload: { threadId: event.payload.threadId } }))
			return
		}

		await this.mediator.publish(
			new StopResolvedIntegrationEvent({
				ownerId,
				payload: {
					stopId: event.payload.stopId,
					issueId: event.payload.issueId,
					threadId: event.payload.threadId,
					resolution: event.payload.resolution,
				},
			}),
		)
	}
}
```

### Step T1.6 — Run: verificar o verde

- [ ] `cd packages/api/typescript && bun test src/thread/handlers/PublishThreadIntegrationEvents.test.ts` → 1 pass
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `bun check:generated` → exit 0 (nenhuma sujeira sob `contracts/generated/{ts,go}`, `client/dist/src`, o `openapi.json` do daemon)
- [ ] `grep -rn "integration.thread.message_ingested" packages/api/typescript/src packages/contracts/generated` → não-vazio (o contrato TS + o handler)

### Step T1.7 — Commit

```bash
git add packages/contracts/wire packages/contracts/generated \
        packages/api/typescript/public/docs/openapi.json \
        packages/client/dist \
        packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts \
        packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.test.ts
git commit -m "feat(contracts,thread): B5 T1 — integration.thread.message_ingested nasce

Fecha a unica lacuna de threadId que sobrava (a de stop_resolved ja foi
fechada pelo B4 — ver G-B do plano). IngestChannelMessage ja resolvia o
thread e carimbava threadId em MessageIngestedEvent; PublishThreadIntegrationEvents
passa a assinar tambem esse domain event e republica-lo como
integration.thread.message_ingested, pelo mesmo caminho bridge->lane que
thread.attached e thread.stop_resolved ja usam. Nenhuma infra nova: o
transporte publish()->lane->poller ja e durave desde o B3.

Regenerados wire TS/Go, o openapi.json do daemon e o SDK."
```

---

## Task T2: Remoção — `BrowserFrameEnricher` morre, `ListenEvents` volta a só re-emitir `rawFrame`

**Files to write:**
- Delete: `packages/api/typescript/src/ui/services/BrowserFrameEnricher/BrowserFrameEnricher.ts`
- Delete: `packages/api/typescript/src/ui/services/BrowserFrameEnricher/BrowserFrameEnricher.test.ts`
- Delete: `packages/api/typescript/src/ui/services/BrowserFrameEnricher/index.ts`
- Delete: `packages/api/typescript/src/ui/services/index.ts`
- Modify: `packages/api/typescript/src/ui/controllers/ListenEvents.ts`
- Modify: `packages/api/typescript/src/ui/controllers/ListenEvents.test.ts`
- Modify: `packages/api/typescript/src/ui/registry.ts`
- Modify: `packages/api/typescript/tests/flows/inbound-routing.flow.test.ts` — um comentário

**Files to read:**
- `packages/api/typescript/src/ui/services/BrowserFrameEnricher/BrowserFrameEnricher.ts` — o Synthesis map completo, para confirmar que nada dele sobrevive fora do que T3 já cobre no front
- `packages/api/typescript/src/ui/registry.ts` — o comentário sobre "BrowserFrameEnricher deliberately has NO Mock/env split", que fica órfão

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /service, /test
**Depends on:** (none)
**Scope fence:** DONE: apagar o enricher + os 3 `Browser*FrameSchema` + a composição no `ListenEventsControllerOutputSchema` + a chamada `enricher.enrich` no `ensureBroadcaster`; `ListenEvents.test.ts` perde só a asserção dos arms `browser.*`. OUT: qualquer coisa no front (T3); `browser.terminal_action_detected`/`browser.terminal_output_appended` e o `StreamTerminalSession`/`AgentStreamRegistry`/`TerminalOutputAccumulator` que os produz — SSE separado, fora de escopo por decisão explícita da spec. NÃO precisa de T1: a remoção do union não depende do evento novo existir.
**Gate:** `bun emit-openapi && bun sdk && bun check:generated && cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test src/ui` — exit 0 em todos, e `grep -rn "BrowserFrameEnricher" packages/api/typescript` retorna vazio (AC-5)

### Step T2.1 — Proposed file: Modify `packages/api/typescript/src/ui/controllers/ListenEvents.ts`

COMPLETE final file:

```typescript
import { injectable } from 'tsyringe-neo'
import {
	z,
	Controller,
	MimeTypes,
	ExternalMediator,
	SSE_CONNECTED_FRAME,
	createSSEResponse,
	encodeSSEFrame,
	BaseIntegrationEvent,
} from '@codedm/core-typescript'
// The event surface, imported WHOLESALE from the contract bindings (founder ratification 23-jul:
// the contract is the single source — no allowlist, no hand-rolled per-event schemas). The
// MATERIALIZED surface arrives pre-joined from the generated wire layer (wire/events/materialized —
// union-slot payloads already swapped for the owner client's aggregate schemas, union-slots §2.4);
// this controller only COMPOSES and re-emits, clinical-fork-style.
import { materializedIntegrationEventSchemas } from '@codedm/contracts-typescript/wire/events'
import { OperatorMiddleware } from '@auth/middlewares'

export const ListenEventsControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
})

/**
 * The endpoint's SSE frame union — the SDK derives the typed `ServerEventName` union from this for
 * the frontend `useServerEvents` hook. ONE surface (B5: the enriched `browser.*` frames — and the
 * `BrowserFrameEnricher` that synthesized them — are gone; the broadcaster re-emits the raw envelope
 * and nothing else): every `integration.*` event of the contract barrel (all of them — the
 * broadcaster forwards the whole surface, filtered only by envelope-`ownerId` tenancy), each arm the
 * generated MATERIALIZED schema (wire-name-sorted, baked-in literal `name`, union-slot payloads
 * materialized at the wire layer — never here).
 */
export const ListenEventsControllerOutputSchema = z.discriminatedUnion('name', [...materializedIntegrationEventSchemas])

/**
 * The owner an integration event fans out to on the browser SSE surface. ALL integration events are
 * forwarded (founder ratification 23-jul — no allowlist, no per-event exceptions); the ONLY filter is
 * tenancy: the ENVELOPE `ownerId` (the bridge handlers set `ownerId` on the envelope, never inside
 * the payload) must match the client's session owner. An event without an envelope owner is withheld
 * (nothing to scope it to). Extracted as a pure predicate so the broadcaster's filtering is
 * unit-testable without the SSE transport.
 */
export function deliveryOwnerId(event: BaseIntegrationEvent): string | undefined {
	return event.ownerId || undefined
}

/**
 * Is this callback payload an integration event the browser may receive?
 *
 * STRUCTURAL, and that is the whole point. The obvious gate — `event instanceof BaseIntegrationEvent`
 * — is true ONLY for facts a TypeScript handler published as `new SomeEvent({...})`. Everything that
 * arrives through the INGRESS lane (the Go gateway's rows in the shared outbox) reaches
 * `notifyCallbacks` as the PLAIN OBJECT `adaptWireEnvelope` returns — JSON never carries a prototype.
 * So an `instanceof` gate here silently drops the entire Go-originated surface: every
 * `integration.channel.*` and `integration.channel_message.*` fact, which is to say every inbound
 * WhatsApp message, from a stream whose docblock promises "EVERY integration event is forwarded".
 *
 * The name prefix is the real admission rule — this mediator carries nothing else — and it holds for
 * both shapes, which is what makes the promise true for the half of the surface that crosses a
 * process boundary.
 */
export function isBroadcastableIntegrationEvent(event: unknown): event is BaseIntegrationEvent {
	if (!event || typeof event !== 'object') return false
	const candidate = event as { name?: unknown; payload?: unknown }
	return typeof candidate.name === 'string' && candidate.name.startsWith('integration.') && typeof candidate.payload === 'object'
}

interface SSEClient {
	ownerId: string
	// Sends the raw `integration.*` envelope — the only frame shape this stream carries since B5.
	send: (frame: unknown) => void
}

const MAX_CLIENTS = 1000

@injectable()
export class ListenEventsController extends Controller<
	typeof ListenEventsControllerInputSchema,
	typeof ListenEventsControllerOutputSchema
> {
	readonly path = '/ui/events'
	readonly method = 'get' as const
	readonly description = 'Owner-scoped real-time integration events via SSE'
	readonly inputSchema = ListenEventsControllerInputSchema
	readonly outputSchema = ListenEventsControllerOutputSchema
	override readonly contentType: MimeTypes = MimeTypes['.stream']

	override middlewares = [OperatorMiddleware]

	private clients = new Set<SSEClient>()
	private broadcasterRegistered = false

	constructor(private externalMediator: ExternalMediator) {
		super()
	}

	/**
	 * One mediator callback per process, fanned out to every connected client. EVERY integration
	 * event is forwarded — the only filter is tenancy (`deliveryOwnerId`: envelope owner must match
	 * the client's session owner). Re-emits the raw `integration.*` envelope, unchanged — the
	 * `BrowserFrameEnricher` that used to synthesize an ADDITIVE `browser.*` frame per fact is gone
	 * (B5): every consumer now scopes itself off the raw wire fact.
	 */
	private ensureBroadcaster(): void {
		if (this.broadcasterRegistered) return
		this.broadcasterRegistered = true
		this.externalMediator.registerCallback(async event => {
			if (!isBroadcastableIntegrationEvent(event)) return
			const targetOwnerId = deliveryOwnerId(event)
			if (!targetOwnerId) return
			const recipients = [...this.clients].filter(client => client.ownerId === targetOwnerId)
			if (recipients.length === 0) return

			const rawFrame = { name: event.name, ownerId: event.ownerId, payload: event.payload }
			for (const client of recipients) client.send(rawFrame)
		})
	}

	async handle(request: this['input']): Promise<this['output']> {
		this.ensureBroadcaster()
		const ownerId = request.ctx.session.ownerId

		return this.rawResponse(
			createSSEResponse({
				signal: request.raw.signal,
				onStart: handle => {
					if (this.clients.size >= MAX_CLIENTS) {
						handle.close()
						return undefined
					}
					const client: SSEClient = {
						ownerId,
						send: frame => handle.send(encodeSSEFrame(frame)),
					}
					handle.send(SSE_CONNECTED_FRAME)
					this.clients.add(client)
					return () => this.clients.delete(client)
				},
			}),
		)
	}
}
```

### Step T2.2 — Proposed file: Modify `packages/api/typescript/src/ui/controllers/ListenEvents.test.ts`

COMPLETE final file (idêntico ao de HEAD, menos o `it('carries the enriched browser.* frames alongside the contract surface', ...)`):

```typescript
import { describe, expect, it } from 'bun:test'
import type { ZodLiteral, ZodObject } from 'zod'
import { BaseIntegrationEvent } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import * as WireEvents from '@codedm/contracts-typescript/wire/events'
import { ThreadStopRaisedEvent, ChannelMessageDeliveredEvent, ChannelMessageReceivedEvent } from '@codedm/contracts-typescript/wire/events'
import { deliveryOwnerId, isBroadcastableIntegrationEvent, ListenEventsControllerOutputSchema } from './ListenEvents'

const OWNER_A = '00000000-0000-4000-8000-00000000000a'
const OWNER_B = '00000000-0000-4000-8000-00000000000b'

/** Simulates the broadcaster's fan-out loop over connected clients using the pure predicate. */
function fanOut(event: BaseIntegrationEvent, clientOwnerIds: string[]): string[] {
	const target = deliveryOwnerId(event)
	if (!target) return []
	return clientOwnerIds.filter(ownerId => ownerId === target)
}

describe('ListenEvents SSE broadcaster filtering', () => {
	const stopRaised = (ownerId: string) =>
		new ThreadStopRaisedEvent({
			ownerId,
			payload: { stopId: 'stop-1', issueId: 'issue-1', threadId: 'thread-1', kind: StopKind.HUMAN_REQUESTED },
		}) as unknown as BaseIntegrationEvent

	it('an integration event resolves to its envelope owner', () => {
		expect(deliveryOwnerId(stopRaised(OWNER_A))).toBe(OWNER_A)
	})

	it('is delivered to the matching-owner client and withheld from a non-matching owner', () => {
		const recipients = fanOut(stopRaised(OWNER_A), [OWNER_A, OWNER_B])
		expect(recipients).toEqual([OWNER_A])
	})

	it('EVERY integration event is forwarded — no allowlist (founder ratification 23-jul)', () => {
		// channel_message.delivered used to be filtered out by the BROWSER_EVENTS allowlist; the
		// declarative surface forwards the whole contract, filtered only by tenancy.
		const previouslyFiltered = new ChannelMessageDeliveredEvent({
			ownerId: OWNER_A,
			payload: {
				channelId: 'ch-1',
				remoteId: 'c-1',
				senderId: 'c-1',
				messageIds: ['m-1'],
				timestamp: 0,
				platform: 'WHATSAPP' as never,
			},
		}) as unknown as BaseIntegrationEvent
		expect(deliveryOwnerId(previouslyFiltered)).toBe(OWNER_A)
		expect(fanOut(previouslyFiltered, [OWNER_A, OWNER_B])).toEqual([OWNER_A])
	})

	/**
	 * AC-F2.2 — THE GO HALF OF THE SURFACE REACHES THE BROWSER.
	 *
	 * The broadcaster used to admit an event with `event instanceof BaseIntegrationEvent`, and that gate
	 * is true for exactly one of the two shapes this callback receives. A fact THIS daemon published is
	 * a class instance. A fact the Go gateway published travels as an outbox row, is read back as TEXT,
	 * and reaches `notifyCallbacks` as whatever `JSON.parse` returned — a prototype-less object. So the
	 * gate silently withheld every `integration.channel*` fact, which is every inbound WhatsApp message:
	 * the console could not learn about a message except by someone reloading the page.
	 *
	 * The round-trip below is not a stand-in for the ingress — it is the same operation the ingress
	 * performs (`JSON.parse(row.payload)`), and losing the prototype is the whole of what it does.
	 *
	 * FALSIFIER: restore `instanceof BaseIntegrationEvent` as the admission gate in `ListenEvents.ts`
	 * and this test goes red while every other test in this file stays green.
	 */
	it('AC-F2.2 — an INGRESS envelope (plain object, no prototype) is admitted, exactly like a published instance', () => {
		const published = new ChannelMessageReceivedEvent({
			ownerId: OWNER_A,
			payload: { channelId: 'ch-1', remoteId: '5511999999999@s.whatsapp.net', messageType: 'TEXT' } as never,
		})
		const fromIngress: unknown = JSON.parse(JSON.stringify(published))

		// The precondition that made the old gate wrong — stated, so the test explains itself when it fails.
		expect(fromIngress instanceof BaseIntegrationEvent).toBe(false)

		expect(isBroadcastableIntegrationEvent(fromIngress)).toBe(true)
		expect(isBroadcastableIntegrationEvent(published)).toBe(true)
		expect(deliveryOwnerId(fromIngress as BaseIntegrationEvent)).toBe(OWNER_A)
	})

	it('the admission gate still refuses what is not an integration event', () => {
		expect(isBroadcastableIntegrationEvent(null)).toBe(false)
		expect(isBroadcastableIntegrationEvent({ name: 'thread.steered', payload: {} })).toBe(false)
		expect(isBroadcastableIntegrationEvent({ name: 'integration.issue.opened' })).toBe(false)
	})

	it('an event without an envelope owner is withheld (nothing to scope it to)', () => {
		const noOwner = new ThreadStopRaisedEvent({
			ownerId: '',
			payload: { stopId: 'stop-1', issueId: 'issue-1', threadId: 'thread-1', kind: StopKind.HUMAN_REQUESTED },
		}) as unknown as BaseIntegrationEvent
		expect(deliveryOwnerId(noOwner)).toBeUndefined()
	})
})

describe('ListenEvents declarative output union (the contract is the single source)', () => {
	// The literal `name` value of a composed union arm.
	const armName = (arm: ZodObject): string => {
		const literal = arm.shape.name as ZodLiteral<string>
		return literal.def.values[0] as string
	}
	const arms = (ListenEventsControllerOutputSchema.options as ZodObject[]).map(armName)

	it('carries an arm for EVERY integration event class in the wire barrel — zero omissions', () => {
		const contractNames = Object.values(WireEvents)
			.filter((e): e is { name: string; schema: unknown } => e != null && typeof e === 'function' && 'schema' in e && 'name' in e)
			.map(e => e.name)
		expect(contractNames.length).toBeGreaterThan(0)
		for (const name of contractNames) {
			expect(arms, `contract event ${name} missing from the SSE output union`).toContain(name)
		}
	})

	it('materializes union-slot payloads from the owner client (never the opaque contract slots)', () => {
		const received = (ListenEventsControllerOutputSchema.options as ZodObject[]).find(
			arm => armName(arm) === ChannelMessageReceivedEvent.name,
		)
		expect(received).toBeDefined()
		// The materialized payload is the owner's generated aggregate union — parsing a typed WhatsApp
		// TEXT variant succeeds with the content slot preserved as a SHAPE (not swallowed by unknown).
		const parsed = received!.shape.payload.safeParse({
			channelId: '4b6f6b0a-0000-4000-8000-000000000000',
			messageId: 'wamid.1',
			internalMessageId: '4b6f6b0a-0000-4000-8000-000000000001',
			remoteId: '5511999999999@s.whatsapp.net',
			senderId: '5511999999999',
			fromMe: false,
			author: 'HUMAN',
			isGroup: false,
			timestamp: 1753200000,
			occurredAt: '2026-07-23T00:00:00Z',
			observedAt: '2026-07-23T00:00:01Z',
			messageType: 'TEXT',
			platform: 'WHATSAPP',
			ownerId: OWNER_A,
			content: { text: 'hello' },
			platformData: { isEphemeral: false, isViewOnce: false, isGroup: false, pushName: 'Ada' },
		})
		expect(parsed.success).toBe(true)
		// A payload violating the WHATSAPP/TEXT variant contract fails — the slot is materialized,
		// so an opaque-passthrough (which would accept anything) is a regression.
		const invalid = received!.shape.payload.safeParse({ platform: 'WHATSAPP', messageType: 'TEXT' })
		expect(invalid.success).toBe(false)
	})
})
```

### Step T2.3 — Apagar o enricher e o barrel de services

- [ ] `git rm -r packages/api/typescript/src/ui/services` (apaga `BrowserFrameEnricher/{BrowserFrameEnricher.ts,BrowserFrameEnricher.test.ts,index.ts}` + `services/index.ts` — depois desta remoção, `ui/` não tem mais nenhum `services/`, e nada mais em `ui/` importava de lá)

### Step T2.4 — Proposed file: Modify `packages/api/typescript/src/ui/registry.ts`

COMPLETE final file:

```typescript
// Per-env DI bindings for UI (BFF) BC.
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'

// The BFF context owns no ports today — query use cases resolve shared kernel services only.
export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([])
```

### Step T2.5 — Um comentário órfão em `tests/flows/inbound-routing.flow.test.ts`

Modify `packages/api/typescript/tests/flows/inbound-routing.flow.test.ts`: no docblock do `describe` de topo, a linha `to `integration.issue.opened` / completed; \`MaterializeIssueFromExecution\` materializes the Issue row and the \`BrowserFrameEnricher\` synthesizes the \`browser.*\` SSE frame.` passa a `to `integration.issue.opened` / completed; \`MaterializeIssueFromExecution\` materializes the Issue row and the raw facts reach the console via the SSE re-emit (B5: \`BrowserFrameEnricher\` is gone).`

### Step T2.6 — Regenerar SDK e verificar

```bash
bun emit-openapi
bun sdk
bun check:generated
```

Esperado: `packages/api/typescript/public/docs/openapi.json` e `packages/client/dist/typescript/**` perdem os 3 arms `browser.*` (`ListenEvents200NameEnum` renumera de novo, igual ao churn do B4 T7 — nada no front importa os aliases numerados).

- [ ] `cd packages/api/typescript && bun test src/ui` → 0 fail
- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0
- [ ] `grep -rn "BrowserFrameEnricher" packages/api/typescript` → **vazio** (AC-5)
- [ ] `grep -rn "BrowserSseFrameSchema\|browser\.thread_status_changed\|browser\.stop_raised\|browser\.thread_message_ingested" packages/api/typescript/src` → **vazio** (AC-6, AC-7)

### Step T2.7 — Commit

```bash
git add packages/api/typescript/src/ui packages/api/typescript/public/docs/openapi.json \
        packages/client/dist packages/api/typescript/tests/flows/inbound-routing.flow.test.ts
git commit -m "refactor(ui): B5 T2 — BrowserFrameEnricher morre, ListenEvents so re-emite rawFrame

Os 3 frames browser.* (thread_status_changed, stop_raised, thread_message_ingested)
e o servico que os sintetizava saem. ListenEventsControllerOutputSchema volta a
ser so materializedIntegrationEventSchemas; ensureBroadcaster para de injetar e
chamar BrowserFrameEnricher.enrich. O BC ui deixa de ler diretamente das tabelas
issue/thread para um DTO que nenhum consumidor frontend le — o proximo passo
(T3) reaponta os 3 consumidores para os eventos crus."
```

---

## Task T3: front re-aponte — `THREAD_REALTIME_EVENTS`, `AgentsRunningPill`, `HomeDashboard` escutam os crus

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts`
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx`
- Modify: `packages/app/react/src/components/console/AgentsRunningPill.tsx`
- Modify: `packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx` — uma chamada
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx` — um comentário

**Files to read:**
- `packages/app/react/src/hooks/useServerEvents.ts` — o contrato `ServerEventName`/`useServerEvents<K>` que a tupla precisa satisfazer
- `packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx:24-28` — o comentário que este Task cumpre ("wiring the raw fact into the subscription is B5's call")

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component
**Depends on:** T1
**Consumes (frozen):** de T1, verbatim — o nome de wire `'integration.thread.message_ingested'` com payload `{ threadId: string }`, disponível em `ListenEventsQueryResponse` (de onde `ServerEventName` deriva) depois do regen. `'integration.thread.stop_resolved'` já existe desde o B4 (G-A/G-B) — não depende de nenhuma Task deste plano.
**Scope fence:** DONE: os 3 `browser.*` saem de `THREAD_REALTIME_EVENTS`/`AgentsRunningPill`/`HomeDashboard`; entram `integration.thread.message_ingested` e `integration.thread.stop_resolved`; `threadIdOf` simplifica (todo frame agora é wire com `payload`); `useThreadRealtime.test.tsx` reescrito para os nomes novos. OUT: qualquer query key nova, qualquer mudança de shape de resposta — só nomes de subscrição e a função `threadIdOf`. NÃO depende de T2: remover 3 nomes de uma tupla `satisfies readonly ServerEventName[]` nunca quebra o `tsc`, e os 2 nomes novos que este Task PRECISA (`stop_resolved`, `message_ingested`) já são válidos assim que T1 regenerar — independente de T2 já ter rodado.
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun test` — exit 0 nos dois

### Step T3.1 — Proposed file: Modify `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts`

COMPLETE final file:

```typescript
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
	getIssueDetailQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	getSessionIssuesQueryKey,
	listArtifactsQueryKey,
	type ListenEventsQueryResponse,
} from '@codedm/client-typescript/typescript'
import { useServerEvents, type ServerEventName } from '@/hooks'

/**
 * The frames that can change what a thread page is showing. Named as a `const` tuple so the array is
 * the ONE list — `useServerEvents` subscribes to it and `threadInvalidations` switches on it, and a
 * name added to one without the other is a tsc error rather than a subscription that fires into a
 * function with no case for it.
 *
 * Every frame here carries `threadId` directly on its wire payload (B5: the enriched `browser.*`
 * frames — synthesized by a `BrowserFrameEnricher` that resolved a thread scope the raw fact could not
 * express on its own — are gone). `integration.thread.message_ingested` replaces
 * `browser.thread_message_ingested`; `integration.thread.stop_resolved` replaces the half of
 * `browser.thread_status_changed` this page actually needed (clearing the needs-you panel).
 */
export const THREAD_REALTIME_EVENTS = [
	'integration.thread.message_ingested',
	'integration.orchestrator.replied',
	'integration.thread.stop_raised',
	'integration.thread.stop_resolved',
	'integration.issue.created',
	'integration.issue.opened',
	'integration.issue.completed',
	'integration.issue.archived',
	'integration.artifact.recorded',
] as const satisfies readonly ServerEventName[]

/** The SSE frame union narrowed to the names above — the SDK's own type, never a hand-written mirror. */
export type ThreadRealtimeEvent = Extract<ListenEventsQueryResponse, { name: (typeof THREAD_REALTIME_EVENTS)[number] }>

/**
 * Which of THIS thread's queries a frame makes stale — a pure function of the frame, so the mapping
 * can be asserted without a render, a network, or a fake SSE transport.
 *
 * Returns `[]` for a frame belonging to another thread. That guard is not redundant with the server's
 * tenancy filter: the stream is scoped to the OWNER, and an owner has many conversations, so a message
 * in one thread would otherwise refetch every open thread page.
 */
export function threadInvalidations(event: ThreadRealtimeEvent, threadId: string): QueryKey[] {
	if (threadIdOf(event) !== threadId) return []

	switch (event.name) {
		// A message landed — inbound or the orchestrator's own reply. Both write a transcript row
		// BEFORE the browser is notified: the mediator awaits every handler and only then runs the
		// callbacks the SSE broadcaster is one of, so a refetch triggered here can never read the
		// transcript from before the write.
		case 'integration.thread.message_ingested':
		case 'integration.orchestrator.replied':
			return [getSessionChatQueryKey(threadId)]

		// A stop raising OR resolving both change what the needs-you panel and the chat/issues tabs
		// show — the panel must FILL on raise and CLEAR on resolve, so both facts invalidate the same
		// three keys.
		case 'integration.thread.stop_raised':
		case 'integration.thread.stop_resolved':
			return [getNeedsYouPanelQueryKey(threadId), getSessionChatQueryKey(threadId), getSessionIssuesQueryKey(threadId)]

		// An issue's birth and death both show up in the conversation (the ack, then the composed
		// result) and in the issues tab. `completed`/`archived` additionally stale the DETAIL page the
		// operator may be standing on right now.
		case 'integration.issue.created':
		case 'integration.issue.opened':
			return [getSessionChatQueryKey(threadId), getSessionIssuesQueryKey(threadId)]

		case 'integration.issue.completed':
		case 'integration.issue.archived':
			return [getSessionChatQueryKey(threadId), getSessionIssuesQueryKey(threadId), getIssueDetailQueryKey(event.payload.issueId)]

		case 'integration.artifact.recorded':
			return [listArtifactsQueryKey(threadId)]

		default: {
			// Exhaustiveness: a name added to THREAD_REALTIME_EVENTS with no case here fails to compile.
			const _exhaustive: never = event
			return _exhaustive
		}
	}
}

/** The thread a frame belongs to — every frame carries `threadId` on its wire `payload` since B5 (the
 *  enriched `browser.*` frames, which put it at the top level instead, are gone). */
function threadIdOf(event: ThreadRealtimeEvent): string {
	return event.payload.threadId
}

/**
 * Keep one thread page fresh from the server's own facts (F2).
 *
 * Mounted ONCE, by the `$threadId` layout — not by each section. The three tabs (chat, issues,
 * artifacts) are one conversation, and a single issue completing staled all three plus the header; a
 * per-component subscription meant the same frame arriving at four listeners that each invalidated an
 * overlapping set, and — worse — that a tab not currently mounted simply never learned anything. This
 * is the thread-scoped twin of `useServerEventSource`, which the `(app)` layout mounts for the owner
 * scope, and it holds the freshness policy in one readable place.
 *
 * Invalidate only — never `setQueryData`. The backend read models stay the single source of truth.
 */
export function useThreadRealtime(threadId: string): void {
	const queryClient = useQueryClient()

	useServerEvents(THREAD_REALTIME_EVENTS, event => {
		for (const queryKey of threadInvalidations(event, threadId)) queryClient.invalidateQueries({ queryKey })
	})
}
```

### Step T3.2 — Proposed file: Modify `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx`

COMPLETE final file:

```typescript
import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import {
	getIssueDetailQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	getSessionIssuesQueryKey,
	listArtifactsQueryKey,
} from '@codedm/client-typescript/typescript'
import { THREAD_REALTIME_EVENTS, threadInvalidations, useThreadRealtime, type ThreadRealtimeEvent } from './useThreadRealtime'

/**
 * AC-F2.1 — WHEN THE SSE FRAME ARRIVES, THE RIGHT QUERY GOES STALE.
 *
 * The founder's report was "a thread não atualiza": the page rendered whatever it had fetched when it
 * mounted and only moved again on a manual reload. The page DID have a subscription — to
 * `browser.thread_status_changed`, the one frame a new message never produces, because a message
 * changes no status. That is the shape of this bug and the shape of this test: a subscription that
 * exists but to the wrong fact fails silently, and passes any test that only checks a mapping.
 *
 * So both halves are asserted, and neither alone would be enough:
 *   - the WIRING, by mounting the real hook and dispatching the CustomEvent the SSE transport
 *     dispatches (`useServerEventSource` re-emits every frame on `document` under its own name), then
 *     reading which query keys React Query actually marked stale;
 *   - the MAP, exhaustively, as a pure function — cheap enough to cover every frame and every guard.
 *
 * B5: every frame is now a wire fact (`{ name, ownerId, payload }`) — the enriched `browser.*` shape
 * (`{ name, threadId, ... }` at the top level, no `payload`) is gone, so `wireFact` is the only factory
 * this file needs.
 */
const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
const OTHER_THREAD = '019e4d24-6524-7041-9e1c-8108180cddbb'
const ISSUE = '019e4d24-6524-7041-9e1c-8108180cddaf'

/** A frame as it reaches a subscriber: the transport parses the SSE line and re-dispatches it here. */
function arrive(event: ThreadRealtimeEvent): void {
	act(() => {
		document.dispatchEvent(new CustomEvent(event.name, { detail: event }))
	})
}

const wireFact = (name: ThreadRealtimeEvent['name'], payload: Record<string, unknown>) =>
	({ name, ownerId: 'owner-1', payload }) as unknown as ThreadRealtimeEvent

describe('useThreadRealtime — the wiring', () => {
	let root: Root | null = null

	afterEach(() => {
		act(() => root?.unmount())
		root = null
	})

	/** Mounts the hook for `threadId` and returns the keys React Query invalidated, in arrival order. */
	function mount(threadId: string): QueryKey[] {
		const invalidated: QueryKey[] = []
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		// Recorded at the CLIENT, not by stubbing the hook: this is the call the component really makes,
		// and a test that spied on the mapping instead would keep passing if the hook stopped calling it.
		const realInvalidate = queryClient.invalidateQueries.bind(queryClient)
		queryClient.invalidateQueries = (filters => {
			if (filters?.queryKey) invalidated.push(filters.queryKey)
			return realInvalidate(filters)
		}) as typeof queryClient.invalidateQueries

		function Probe() {
			useThreadRealtime(threadId)
			return null
		}

		const host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			)
		})
		return invalidated
	}

	it('AC-F2.1 — an arriving message frame invalidates the thread chat query', () => {
		const invalidated = mount(THREAD)

		arrive(wireFact('integration.thread.message_ingested', { threadId: THREAD }))

		expect(invalidated).toEqual([getSessionChatQueryKey(THREAD)])
	})

	it('a stop being resolved clears the needs-you panel and stales the chat + issues', () => {
		const invalidated = mount(THREAD)

		arrive(wireFact('integration.thread.stop_resolved', { threadId: THREAD, issueId: ISSUE }))

		expect(invalidated).toEqual([getNeedsYouPanelQueryKey(THREAD), getSessionChatQueryKey(THREAD), getSessionIssuesQueryKey(THREAD)])
	})

	it('the orchestrator replying invalidates the chat — the reply is written BEFORE the frame is sent', () => {
		const invalidated = mount(THREAD)

		arrive(wireFact('integration.orchestrator.replied', { threadId: THREAD, text: 'pronto' }))

		expect(invalidated).toEqual([getSessionChatQueryKey(THREAD)])
	})

	/**
	 * The stream is owner-scoped, not thread-scoped, and an owner has many conversations. Without this
	 * guard every open thread page would refetch on every message anywhere.
	 */
	it('a frame for ANOTHER thread invalidates nothing on this one', () => {
		const invalidated = mount(THREAD)

		arrive(wireFact('integration.thread.message_ingested', { threadId: OTHER_THREAD }))
		arrive(wireFact('integration.issue.created', { threadId: OTHER_THREAD, issueId: ISSUE }))

		expect(invalidated).toEqual([])
	})

	it('unmounting stops the subscription — a frame after teardown invalidates nothing', () => {
		const invalidated = mount(THREAD)
		act(() => root?.unmount())
		root = null

		arrive(wireFact('integration.thread.message_ingested', { threadId: THREAD }))

		expect(invalidated).toEqual([])
	})
})

describe('threadInvalidations — the map', () => {
	it('an issue completing stales the conversation, the issue list AND the detail page', () => {
		const keys = threadInvalidations(wireFact('integration.issue.completed', { threadId: THREAD, issueId: ISSUE }), THREAD)

		expect(keys).toEqual([getSessionChatQueryKey(THREAD), getSessionIssuesQueryKey(THREAD), getIssueDetailQueryKey(ISSUE)])
	})

	it('a stop being raised stales the needs-you panel', () => {
		const keys = threadInvalidations(wireFact('integration.thread.stop_raised', { threadId: THREAD, issueId: ISSUE }), THREAD)

		expect(keys).toEqual([getNeedsYouPanelQueryKey(THREAD), getSessionChatQueryKey(THREAD), getSessionIssuesQueryKey(THREAD)])
	})

	/** The half the enricher never wired (see G-C in the plan): before B5 nothing invalidated the panel
	 *  on RESOLVE, so a cleared stop stayed on screen until something else refreshed the page. */
	it('a stop being resolved stales the SAME three keys — the panel must clear, not just fill', () => {
		const keys = threadInvalidations(wireFact('integration.thread.stop_resolved', { threadId: THREAD, issueId: ISSUE }), THREAD)

		expect(keys).toEqual([getNeedsYouPanelQueryKey(THREAD), getSessionChatQueryKey(THREAD), getSessionIssuesQueryKey(THREAD)])
	})

	it('an artifact stales only the artifacts list', () => {
		const keys = threadInvalidations(wireFact('integration.artifact.recorded', { threadId: THREAD, artifactId: 'a1' }), THREAD)

		expect(keys).toEqual([listArtifactsQueryKey(THREAD)])
	})

	/**
	 * Every subscribed name must map to at least one query. A name added to the subscription list with
	 * no case would compile (the `never` guard only catches a name the switch does not handle at all)
	 * but would return `[]` forever — a live subscription that refreshes nothing.
	 */
	it('every subscribed frame stales something — no dead subscriptions', () => {
		for (const name of THREAD_REALTIME_EVENTS) {
			const event = wireFact(name, { threadId: THREAD, issueId: ISSUE })

			expect(threadInvalidations(event, THREAD).length, `${name} maps to no query`).toBeGreaterThan(0)
		}
	})
})
```

### Step T3.3 — Proposed file: Modify `packages/app/react/src/components/console/AgentsRunningPill.tsx`

COMPLETE final file:

```typescript
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getHomeDashboardQueryKey, useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import { useServerEvents } from '@/hooks'
import { Dot } from './StatusDot'

/**
 * The persistent operating pulse in the top-right of every console page: how many
 * agents are running right now. Owns its own data and stays live — invalidates the
 * dashboard read (never hand-mutate the cache) on the raw facts that change it: an
 * issue starting or finishing work, or a stop raising/clearing NEEDS_ATTENTION.
 * Direct wire events since B5 — the synthesized `browser.thread_status_changed`
 * frame (and the `BrowserFrameEnricher` that computed it) are gone.
 */
export function AgentsRunningPill() {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data } = useGetHomeDashboard()

	useServerEvents(
		['integration.issue.opened', 'integration.issue.completed', 'integration.thread.stop_raised', 'integration.thread.stop_resolved'],
		() => {
			queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
		},
	)

	const count = data?.agentsRunningNow ?? 0
	const running = count > 0

	return (
		<span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-medium text-secondary-foreground shadow-sm">
			<Dot className={running ? 'bg-success' : 'bg-muted-foreground/40'} />
			{t('console.agentsRunning', { count })}
		</span>
	)
}
```

### Step T3.4 — Um edit em `HomeDashboard/index.tsx`

Modify `packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx`: a chamada

```typescript
	useServerEvents(['browser.thread_status_changed', 'browser.stop_raised'], () => {
		queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
	})
```

vira

```typescript
	useServerEvents(
		['integration.issue.opened', 'integration.issue.completed', 'integration.thread.stop_raised', 'integration.thread.stop_resolved'],
		() => {
			queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
		},
	)
```

— mesma lista de 4 nomes crus que `AgentsRunningPill` (Step T3.3), mesmo corpo de callback. Nenhum outro trecho do arquivo muda.

### Step T3.5 — Um comentário em `NeedsYouPanel/index.tsx`

Modify `packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx`: o bloco de comentário

```typescript
	// The stop-raised subscription moved to `useThreadRealtime`. This panel only knew how to APPEAR
	// (`stop_raised`) and never how to disappear: a resolution publishes `stop_resolved`, which since B4
	// DOES carry `threadId` — so it is this thread's frame and no longer needs the enricher's recomputed
	// status frame to stand in for it. The layout hook still invalidates on the status frame; wiring the
	// raw fact into the subscription is B5's call, not a silent change here.
```

vira

```typescript
	// The subscription lives in `useThreadRealtime`, mounted once by the `$threadId` layout: both
	// `integration.thread.stop_raised` (this panel fills) and `integration.thread.stop_resolved` (this
	// panel clears) invalidate `getNeedsYouPanelQueryKey` directly off the raw wire fact (B5) — no
	// enriched `browser.*` frame, no server-side status recompute standing in for either direction.
```

### Step T3.6 — Verde

- [ ] `cd packages/app/react && bun x tsc --noEmit` → exit 0
- [ ] `cd packages/app/react && bun test` → 0 fail
- [ ] `grep -rn "browser\.thread_status_changed\|browser\.stop_raised\|browser\.thread_message_ingested" packages/app/react/src` → **vazio** (AC-8, AC-9)

### Step T3.7 — Commit

```bash
git add packages/app/react/src/routes/\(app\)/threads/\$threadId/-hooks/useThreadRealtime.ts \
        packages/app/react/src/routes/\(app\)/threads/\$threadId/-hooks/useThreadRealtime.test.tsx \
        packages/app/react/src/components/console/AgentsRunningPill.tsx \
        packages/app/react/src/routes/\(app\)/dashboard/-components/HomeDashboard/index.tsx \
        packages/app/react/src/routes/\(app\)/threads/\$threadId/-components/NeedsYouPanel/index.tsx
git commit -m "refactor(app-react): B5 T3 — os 3 consumidores escutam so os eventos crus

THREAD_REALTIME_EVENTS perde os 3 browser.* e ganha
integration.thread.message_ingested + integration.thread.stop_resolved;
threadIdOf simplifica (todo frame agora tem payload.threadId).
AgentsRunningPill e HomeDashboard trocam a dupla browser.* pelos 4 eventos
crus (issue.opened/completed, thread.stop_raised/stop_resolved).
useThreadRealtime.test.tsx reescrito para os nomes novos, incluindo o caso
que faltava: stop_resolved agora limpa o needs-you panel (antes so o
stop_raised o preenchia)."
```

---

## Task T4: `GetNeedsYouPanel` — o teste que faltou no fechamento do B4 (AC-9)

**Files to write:**
- Create: `packages/api/typescript/src/thread/usecases/GetNeedsYouPanel.test.ts`

**Files to read:**
- `packages/api/typescript/tests/support/given/stops.ts` — `givenStop`, que levanta via `thread.raiseStop` + `repo.save`, nunca via o use case
- `packages/api/typescript/src/thread/usecases/GetSessionChat.test.ts` — o molde de teste de query use case (`TestBed.create('integration', ...)`, `.execute(...)`)
- `packages/api/typescript/src/thread/usecases/GetNeedsYouPanel.ts` — o `leftJoin` + o `OutputSchema` com `issueId`/`issueKey` opcionais que este teste prova

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)
**Scope fence:** DONE: um teste de use case, sem tocar `GetNeedsYouPanel.ts` (já correto desde o B4 — só faltava o teste). OUT: qualquer mudança de código de produção. Gap encontrado no fechamento do B4 (`.plans/2026-07-30-b4-aggregate-boundaries.md`, T11 nota AC-9): `stop-control-plane.flow.test.ts` prova que um stop de nível-thread MATERIALIZA e RESOLVE; nunca chama `GetNeedsYouPanel`.
**Gate:** `cd packages/api/typescript && bun test src/thread/usecases/GetNeedsYouPanel.test.ts && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois

### Step T4.1 — Write o teste

Proposed file: Create `packages/api/typescript/src/thread/usecases/GetNeedsYouPanel.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { GetNeedsYouPanel } from './GetNeedsYouPanel'

/**
 * B4 AC-9, closed here — flagged as a gap at the B4 closure and not covered by any existing test.
 * `stop-control-plane.flow.test.ts` proves a thread-level stop (no issue) MATERIALIZES and RESOLVES;
 * it never calls `GetNeedsYouPanel`, so nothing proved the `leftJoin` that replaced the `innerJoin`
 * (when `issue_stops.issue_id` went nullable) actually keeps the stop in the panel's output instead of
 * silently dropping it. An `innerJoin` regression here would pass every other suite in the repo.
 */
describe('GetNeedsYouPanel — a thread-level stop is not dropped by the join (B4 AC-9)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('FALSIFIER — a stop with NO issueId is listed, with issueId/issueKey UNDEFINED (not dropped by the leftJoin)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, title: 'Approve the campaign?' })

		const panel = await testBed.resolve(GetNeedsYouPanel).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect(panel.stops).toHaveLength(1)
		expect(panel.stops[0]?.issueId).toBeUndefined()
		expect(panel.stops[0]?.issueKey).toBeUndefined()
		expect(panel.stops[0]?.title).toBe('Approve the campaign?')
	})

	it('a stop WITH an issue still carries issueId + issueKey — the leftJoin resolves the key when there is one', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'ISS-42' })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, issueId: issue.id.value })

		const panel = await testBed.resolve(GetNeedsYouPanel).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect(panel.stops).toHaveLength(1)
		expect(panel.stops[0]?.issueId).toBe(issue.id.value)
		expect(panel.stops[0]?.issueKey).toBe('ISS-42')
	})
})
```

### Step T4.2 — Provar que o `leftJoin` pode falhar (o FALSEADOR de verdade)

- [ ] `cd packages/api/typescript && bun test src/thread/usecases/GetNeedsYouPanel.test.ts` → 2 pass, do jeito que `GetNeedsYouPanel.ts` já está
- [ ] Trocar `leftJoin` por `innerJoin` em `GetNeedsYouPanel.ts` temporariamente, rodar de novo → o primeiro `it` (`FALSIFIER`) fica vermelho (`panel.stops` vem vazio); o segundo continua verde. Desfazer a troca. Registrar as duas saídas no artefato do T5.

### Step T4.3 — Verde e commit

- [ ] `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` → exit 0

```bash
git add packages/api/typescript/src/thread/usecases/GetNeedsYouPanel.test.ts
git commit -m "test(thread): B5 T4 — GetNeedsYouPanel prova o leftJoin do B4 AC-9

Gap flagrado no fechamento do B4: nenhum teste chamava GetNeedsYouPanel com
um stop sem issue. Dois casos — sem issue (issueId/issueKey undefined, nao
descartado pelo leftJoin) e com issue (issueId/issueKey resolvidos) — provam
as duas metades do AC-9. Falseador confirmado: trocar leftJoin por innerJoin
derruba o primeiro caso."
```

---

## Task T5: fechamento — os greps re-rodados e o mapa AC-1..AC-11

**Files to write:**
- Create: `.plans/artifacts/2026-07-30-b5-browser-events-removal-closure.md`

**Files to read:**
- `.specs/2026-07-29-browser-events-removal-design.md` — os 11 ACs que o artefato mapeia
- `.plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md` — o molde do artefato de fechamento

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** /test
**Depends on:** T1, T2, T3, T4
**Consumes (frozen):** de T1 — o contrato `integration.thread.message_ingested` e o teste do publisher. De T2 — a remoção de `BrowserFrameEnricher` e do union `browser.*`. De T3 — `THREAD_REALTIME_EVENTS` com os 9 nomes crus. De T4 — `GetNeedsYouPanel.test.ts`.
**Scope fence:** DONE: todo o código e o contrato. OUT: qualquer mudança de código — esta Task só MEDE e registra. Nenhuma Task deste plano toca `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md` (spec nova do founder, não versionada) nem qualquer stash.
**Gate:** `bun tsc && bun lint && bun run test && bun detect && bun check:generated && bun test:tooling && cd packages/api/go && go build ./... && go test ./... && cd packages/e2e && bun run test` — exit 0 em todos

### Step T5.1 — Os greps de fechamento

Run: `grep -rn "browser\." packages/api/typescript/src`
Expected: só hits de `browser.terminal_output_appended` / `browser.terminal_action_detected` — a família `StreamTerminalSession`/`AgentStreamRegistry`/`TerminalOutputAccumulator`, SSE separado, fora de escopo por decisão explícita da spec. **Nota de precisão:** são DOIS nomes que sobrevivem, não um só (`browser.terminal_output_appended` E `browser.terminal_action_detected` — ambos literais em `AgentStreamRegistry.ts` e `TerminalOutputAccumulator.ts`).

Run: `grep -rn "browser\." packages/app/react/src`
Expected: só `useTerminalStream.ts` e `IssueDetailSection/index.tsx` (mesma família `terminal_action_detected`).

Run: `grep -rn "BrowserFrameEnricher\|BrowserSseFrameSchema" packages/api/typescript`
Expected: **vazio** (AC-5, AC-6).

Run: `grep -rn "integration.thread.message_ingested" packages/api/typescript/src packages/app/react/src packages/contracts/generated`
Expected: não-vazio nos três (AC-1, AC-3, AC-8).

Run: `grep -rn "browser\.thread_status_changed\|browser\.stop_raised\|browser\.thread_message_ingested" packages/api packages/app packages/client packages/e2e`
Expected: **vazio** (AC-11).

### Step T5.2 — Proposed file: Create `.plans/artifacts/2026-07-30-b5-browser-events-removal-closure.md`

Escreva o artefato com: (a) a saída VERBATIM dos 5 greps do Step T5.1; (b) a tabela AC-1..AC-11 → caminho de teste/evidência, copiada do bloco Final Validation abaixo com os resultados reais; (c) as saídas dos 8 gates; (d) as saídas dos falseadores provados (T4.2 — `leftJoin`→`innerJoin`); (e) a seção G-A..G-D deste plano (o que já estava satisfeito em HEAD), citada como parte do fechamento — a spec tinha 2 lacunas de `threadId`, só 1 exigiu código.

### Step T5.3 — Gates completos

Run: `bun tsc` → exit 0
Run: `bun lint` → exit 0
Run: `bun run test` → 0 fail (nx run-many, exclui e2e)
Run: `bun detect` → exit 0
Run: `bun check:generated` → exit 0
Run: `bun test:tooling` → exit 0
Run: `cd packages/api/go && go build ./... && go test ./...` → ok (só o wire gerado do T1 mudou)
Run: `cd packages/e2e && bun run test` → exit 0 (`bun e2e` NÃO é usado neste repo)

### Step T5.4 — Commit

```bash
git add .plans/artifacts/2026-07-30-b5-browser-events-removal-closure.md
git commit -m "docs(plans): B5 — artefato de fechamento (greps citados + mapa AC->teste)

integration.thread.message_ingested nasce e e assinado pelo publisher do
thread (T1); BrowserFrameEnricher morre (T2); os 3 consumidores frontend
escutam so eventos crus (T3); o gap do B4 AC-9 fecha com teste dedicado
(T4). Duas das 4 lacunas da spec ja estavam satisfeitas em HEAD antes deste
plano comecar (G-A/G-B) — provado por grep + por um teste ja existente, sem
Task de codigo. browser.terminal_action_detected/terminal_output_appended
seguem fora de escopo (SSE separado)."
```

---

## Final Validation

- [ ] `bun tsc` — type check completo, exit 0
- [ ] `bun lint` — exit 0
- [ ] `bun run test` — 0 fail (todos os workspaces exceto e2e)
- [ ] `bun detect` — exit 0, sem findings novos
- [ ] `bun check:generated` — exit 0 (o contrato novo + SDK regenerado não derivaram)
- [ ] `bun test:tooling` — exit 0
- [ ] `cd packages/api/go && go build ./... && go test ./...` — exit 0
- [ ] `cd packages/app/react && bun x tsc --noEmit && bun test` — exit 0 nos dois
- [ ] `cd packages/e2e && bun run test` — exit 0 (`bun e2e` NÃO é usado neste repo)
- [ ] AC mapping (todo AC da spec → ≥1 caminho de teste):
  - AC-1 → `packages/contracts/wire/events/thread-message-ingested.tsp` (T1) — `ThreadMessageIngestedEvent extends IntegrationEvent`, `name: "integration.thread.message_ingested"`, `threadId: string`
  - AC-2 → **já satisfeito em HEAD** (G-A do plano) — `packages/contracts/wire/events/thread-stop-resolved.tsp` (renomeado pelo B4 T7), `threadId: string` não-opcional
  - AC-3 → `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.test.ts:"AC-3 — an inbound message publishes integration.thread.message_ingested with the SAME threadId, no lookup"` (T1)
  - AC-4 → **já satisfeito em HEAD** (G-B do plano) — `packages/api/typescript/tests/flows/stop-control-plane.flow.test.ts:"AC-7 — a THREAD-LEVEL stop (no issueId) materializes and resolves, and the resolution carries threadId with no issueId"`, que assere `payload).toMatchObject({ stopId, threadId: thread.id.value })` no evento PUBLICADO
  - AC-5 → Step T2.6 (grep `BrowserFrameEnricher` vazio) + Step T5.1
  - AC-6 → `packages/api/typescript/src/ui/controllers/ListenEvents.ts` (T2) — `ListenEventsControllerOutputSchema = z.discriminatedUnion('name', [...materializedIntegrationEventSchemas])`, sem `BrowserSseFrameSchema`
  - AC-7 → `packages/api/typescript/src/ui/controllers/ListenEvents.ts` (T2) — `ensureBroadcaster` sem `enricher`/`enrich`, só `rawFrame`
  - AC-8 → `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts:THREAD_REALTIME_EVENTS` (T3, 9 nomes) + `useThreadRealtime.test.tsx:"every subscribed frame stales something — no dead subscriptions"`
  - AC-9 → `packages/app/react/src/components/console/AgentsRunningPill.tsx` + `HomeDashboard/index.tsx` (T3) — os 4 nomes crus, sem `browser.*`
  - AC-10 → `bun sdk` nos gates de T1/T2 + `cd packages/api/typescript && bun x tsc` + `cd packages/app/react && bun x tsc` nos gates de cada Task
  - AC-11 → Step T5.1 (grep `browser.thread_status_changed|browser.stop_raised|browser.thread_message_ingested` vazio em `packages/api`/`packages/app`) + `bun test` limpo nos gates de T1-T4

## Notes

- **`bun e2e` NÃO é usado neste repo** — o script é `cd packages/e2e && bun run test`.
- **Duas das 4 lacunas de `threadId` da spec já estavam fechadas em HEAD antes deste plano começar.** A spec (`2026-07-29`) foi escrita antes do B4 (`2026-07-30`, commits `a29be66d`..`20a510cf`) renomear `issue.stop_*` → `thread.stop_*` — o rename, como efeito colateral, já resolveu AC-2 e AC-4. G-A/G-B no topo deste plano citam a prova exata (código lido + teste já existente); nenhuma Task refaz esse trabalho.
- **`browser.terminal_action_detected` E `browser.terminal_output_appended`** (não só o primeiro) seguem fora de escopo — `StreamTerminalSession`/`AgentStreamRegistry`/`TerminalOutputAccumulator`, um SSE separado sem relação com `ListenEventsController`. Nenhum dos dois foi tocado por nenhuma Task.
- **T2 não depende de T1, e T3 não depende de T2.** T1 e T2 mexem em arquivos disjuntos (contrato+handler vs. controller+service) e cada um regenera o SDK de forma idempotente — não há corrida real entre eles. T3 só precisa dos 2 nomes de wire novos existirem (`stop_resolved` já existe desde o B4; `message_ingested` só depende de T1), então remover 3 nomes de uma tupla `satisfies` nunca quebra o `tsc` independente de T2 já ter rodado ou não.
- **Nenhuma skill/registry/rail/core é tocada por este refactor** (herdado da seção "O que sobe pro template" da spec) — a mudança é inteiramente dentro dos bounded contexts de produto (`thread`, `ui`) e do contrato TypeSpec do próprio produto.
- **Nenhuma Task deste plano toca `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`.** É spec nova do founder, não versionada — se algum gate reclamar dela, PARE e reporte.

### O que o `bun scripts/review-plan.ts` achou, e o veredito de cada achado

5 arquivos revisados (2 do plano — `ui/registry.ts` e `useThreadRealtime.ts` — não bateram em nenhuma regra de classificação e não foram revisados; gap conhecido do `review-plan.ts`, o mesmo tipo que o B4 já registrou para `.tsp`/schema Drizzle/`registry.yaml`). **Zero defeitos reais introduzidos por este plano.**

- **`ListenEvents.ts` classificado como `query`, não `controller`.** É por isso que `QRY-03`/`QRY-04` ("InputSchema/OutputSchema sem `.example()`") e `QRY-P10` ("outputSchema.parse() antes de enviar o frame") apareceram: são regras da skill `query`, aplicadas a um controller SSE. Os três acusam código **byte-idêntico ao de HEAD** — `ListenEventsControllerInputSchema`, `ListenEventsControllerOutputSchema` (a composição, não o conteúdo dos arms) e a construção de `rawFrame` em `ensureBroadcaster` não mudam de forma nenhuma nesta Task (T2 só remove a metade `browser.*`). Nenhum dos três é responsabilidade do B5. Misclassificação de skill, sem ação.
- **`HDL-04`/`HDL-C01` em `PublishThreadIntegrationEvents.ts` ("barrel export não verificado").** Falso positivo de modo-parcial: `handlers/internal.ts` (`export { PublishThreadIntegrationEvents } from './PublishThreadIntegrationEvents'`) já existe em HEAD e T1 não o toca, mas o `review-plan.ts` não materializa arquivos que a Task não declara como `Modify`/`Create`. Confirmado por leitura direta do arquivo durante o planejamento.
- **`cc-bp-25` em `PublishThreadIntegrationEvents.ts` ("handler sem idempotência — at-least-once duplica o efeito").** Achado real, mas sobre um padrão PRÉ-EXISTENTE do handler: os dois ramos que já existem (`thread.attached`, `thread.stop_resolved`) fazem exatamente o mesmo `this.mediator.publish(new X({...}))` sem guarda de idempotência, desde o B3/B4. A Decisão 1 da spec pede explicitamente "o mesmo caminho bridge→lane que os outros dois casos do handler já usam" — adicionar uma guarda só no ramo novo seria inconsistente (dois ramos idempotentes, um não), e adicioná-la aos três é uma mudança de mecanismo que a spec não pede e que este plano não vai inventar (Phase 4 anti-invention check). Registrado aqui como observação; não vira Task.
- **`CMP-01` em `NeedsYouPanel/index.tsx` e `HomeDashboard/index.tsx` ("sem função exportada").** Falso positivo de modo-parcial, o caso textual que o `plan.md` já documenta: os dois Steps (T3.4, T3.5) são edições de UMA linha/comentário num arquivo que a Task não possui inteiro — o snippet revisado é só o trecho antes/depois, sem a declaração `export function` que vive fora dele. `CMP-P09`/`bp-20` em `HomeDashboard.tsx` (ComponentProps do root) têm a mesma causa.
- **`bp-02`/`CMP-C01` (skeleton de loading) e `bp-08`/`bp-20` (pasta própria + ComponentProps) em `AgentsRunningPill.tsx`.** Este arquivo É revisado por inteiro (Step T3.3 manda o arquivo completo), então não é modo-parcial — mas as quatro acusam comportamento **idêntico ao de HEAD**: `data?.agentsRunningNow ?? 0` sem skeleton, arquivo flat (não `AgentsRunningPill/index.tsx`), `<span>` sem `ComponentProps<'span'>` — nenhuma dessas três formas muda nesta Task, que só troca o nome do evento escutado. Mexer nelas seria escopo que a spec B5 não pede (ela é inteiramente sobre nomes de evento). Registrado; não vira Task.
