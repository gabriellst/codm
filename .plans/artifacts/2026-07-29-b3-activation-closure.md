# B3 — semântica de ativação: artefato de fechamento

Frente `.plans/2026-07-29-b3-activation-semantics.md` (spec `.specs/2026-07-29-activation-semantics-design.md`).
Medição feita em `3324d9c8` (T6), antes do commit deste artefato. Este documento só MEDE — nenhuma
linha de código foi alterada por ele.

Commits da frente:

| Task | SHA | Mensagem |
|---|---|---|
| T1 | `837a4158` | refactor(thread,core): a entrega no canal é um comando durável, não um evento |
| T2 | `b3347db7` | feat(thread): a mensagem do operador e o comando de entrega commitam juntos |
| T3 | `92c1c184` | refactor(thread): a resposta do orquestrador vira use case + comando |
| T4 | `56bec8bc` | chore(contracts): ChannelDeliveryRequestedEvent morre (AC-1) |
| T5 | `92fe0b00` | fix(core): publish() persiste na lane integration; o poller entrega TS→TS |
| T6 | `3324d9c8` | docs(skills): a regra de intenção entra no registry e nas skills (TS e Go) |

---

## (a) Os greps de fechamento — saída VERBATIM

### T7.1 — TS: quem chama `ExternalMediator.publish`

```
$ grep -rn "\.publish(" packages/api/typescript/src --include='*.ts' | grep -v test
packages/api/typescript/src/workspace/handlers/PublishWorkspaceIntegrationEvents.ts:22:		await this.mediator.publish(
packages/api/typescript/src/agent/handlers/PublishAgentIntegrationEvents.ts:56:			await this.mediator.publish(
packages/api/typescript/src/agent/handlers/PublishAgentIntegrationEvents.ts:74:			await this.mediator.publish(
packages/api/typescript/src/agent/handlers/PublishAgentIntegrationEvents.ts:92:			await this.mediator.publish(
packages/api/typescript/src/agent/handlers/PublishAgentIntegrationEvents.ts:111:			await this.mediator.publish(
packages/api/typescript/src/agent/handlers/PublishAgentIntegrationEvents.ts:127:			await this.mediator.publish(
packages/api/typescript/src/issue/handlers/PublishIssueIntegrationEvents.ts:23:			await this.mediator.publish(
packages/api/typescript/src/issue/handlers/PublishIssueIntegrationEvents.ts:32:		await this.mediator.publish(
packages/api/typescript/src/artifact/handlers/PublishArtifactIntegrationEvents.ts:16:		await this.mediator.publish(
packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts:8: * call `ExternalMediator.publish()`. Every other handler here is pure domain — it reacts and invokes
packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts:33:			await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
```

**Leitura.** 11 linhas casam o padrão; **10 são call sites** e a 11ª
(`PublishThreadIntegrationEvents.ts:8`) é a frase do próprio docblock do publisher que declara a
exceção nomeada — o grep não distingue comentário de código. Os 10 call sites estão TODOS dentro dos
cinco `Publish*IntegrationEvents`, exatamente na distribuição prevista no inventário:
workspace (1), agent (5), issue (2), artifact (1), thread (1). Zero linhas em qualquer outro arquivo
de produção — as duas que morreram nesta frente foram a branch de delivery do publisher de thread
(T2) e `DeliverOrchestratorReply.ts:69` (T3). **AC-9 fechado.**

### T7.2 — Go: quem chama `ExternalMediator.Publish`

```
$ grep -rn "\.Publish(" packages/api/go/internal packages/api/go/core --include='*.go' | grep -v _test.go
packages/api/go/internal/channel/handlers/messages_synced_handler.go:37:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/message_sent_handler.go:96:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/sync_started_handler.go:37:	if err := h.externalMediator.Publish(ctx, integration); err != nil {
packages/api/go/internal/channel/handlers/message_delivered_handler.go:37:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/remote_created_handler.go:36:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/channel_disconnected_handler.go:73:		if err := h.externalMediator.Publish(ctx, types.NewIntegrationEvent(wire.ChannelDisconnectedEventName, inst.OwnerID, e.Payload)); err != nil {
packages/api/go/internal/channel/handlers/remotes_synced_handler.go:37:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/remote_deleted_handler.go:37:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/sync_progress_handler.go:36:	if err := h.externalMediator.Publish(ctx, integration); err != nil {
packages/api/go/internal/channel/handlers/channel_logged_out_handler.go:73:		if err := h.externalMediator.Publish(ctx, types.NewIntegrationEvent(wire.ChannelLoggedOutEventName, inst.OwnerID, e.Payload)); err != nil {
packages/api/go/internal/channel/handlers/membership_added_handler.go:37:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/remote_updated_handler.go:37:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/channel_connected_handler.go:88:		if err := h.externalMediator.Publish(ctx, types.NewIntegrationEvent(wire.ChannelConnectedEventName, inst.OwnerID, e.Payload)); err != nil {
packages/api/go/internal/channel/handlers/presence_updated_handler.go:33:	if err := h.ext.Publish(ctx, types.NewIntegrationEvent(wire.ChannelPresenceUpdatedEventName, e.OwnerID, e.Payload)); err != nil {
packages/api/go/internal/channel/handlers/message_seen_handler.go:37:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/chat_presence_updated_handler.go:33:	if err := h.ext.Publish(ctx, types.NewIntegrationEvent(wire.ChannelChatPresenceUpdatedEventName, e.OwnerID, e.Payload)); err != nil {
packages/api/go/internal/channel/handlers/sync_completed_handler.go:36:	if err := h.externalMediator.Publish(ctx, integration); err != nil {
packages/api/go/internal/channel/handlers/membership_removed_handler.go:37:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/gateway_platform_event_handler.go:32:	if err := h.ext.Publish(ctx, integrationEvent); err != nil {
packages/api/go/internal/channel/handlers/message_received_handler.go:48:	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
```

**Leitura.** **20 call sites** (o plano previu 21 — miscontagem do plano; nenhuma linha Go foi tocada
nesta frente, logo 20 é o número pré-existente). TODOS em
`packages/api/go/internal/channel/handlers/*.go`. Zero em use cases, repositórios, rotas ou services.
As seis outras ocorrências de `Publish(` no tree Go são DECLARAÇÕES (`func (m *X) Publish(...)` em
`core/services/mediator/{log,internal,sql_external,memory}_mediator.go` e as duas assinaturas de
interface em `mediator.go`) — o grep por `\.Publish(` corretamente não as inclui. A convenção Go já
estava fechada e continua. **AC-10 (metade do grep) fechado.**

### Greps auxiliares (AC-1 e AC-5)

```
$ grep -rn "ChannelDeliveryRequestedEvent" packages/api/typescript/src packages/api/go/internal packages/contracts/wire packages/contracts/generated --include='*.ts' --include='*.go' --include='*.tsp'
IDENT_EXIT=1   (vazio)

$ ls packages/contracts/wire/events/channel-delivery-requested.tsp
ls: packages/contracts/wire/events/channel-delivery-requested.tsp: No such file or directory

$ grep -rn "delivery_requested" packages/contracts packages/client/dist packages/api/typescript/public/docs/openapi.json
AC1_GEN_EXIT=1   (vazio)

$ grep -rn "DirectMessageSentEvent" packages/api/typescript/src/thread/handlers/
AC5_EXIT=1   (vazio)
```

O identificador gerado desapareceu de `src`, do `.tsp`, dos bindings, do SDK e do `openapi.json`.
Restam TRÊS menções ao string `integration.channel.delivery_requested` em `packages/api/typescript/src`,
todas em **docblocks históricos** que explicam por que o evento morreu
(`PublishThreadIntegrationEvents.ts:14`, `SendDirectMessage.ts:24`, `DeliverChannelMessage.ts:32`) —
prosa, não import nem call site. **AC-1 e AC-5 fechados.**

---

## (b) Mapa AC → evidência (resultados reais)

| AC | Evidência | Resultado |
|---|---|---|
| AC-1 | `.tsp` deletado (T4) + greps acima vazios em `src`/`contracts`/`client/dist`/`openapi.json` + `bun check:generated` | ✅ exit 0, saída vazia |
| AC-2 | `src/thread/usecases/SendDirectMessage.test.ts:"ATOMICITY — a rolled-back transaction leaves NEITHER the transcript entry NOR the command"` + o caso do enqueue com `jobId = entryId` | ✅ 3 pass |
| AC-3 | `src/thread/usecases/RecordOrchestratorReply.test.ts:"ATOMICITY …"` + `src/thread/handlers/DeliverOrchestratorReply.test.ts:"delegates: a valid envelope produces the SYSTEM entry and the delivery command"` | ✅ pass |
| AC-4 | `src/thread/usecases/DeliverChannelMessage.test.ts:"FALSEADOR — a failed send is RETRIED from the queue…"` + registro em `src/thread/index.ts` (`commandHandlers: { DeliverChannelMessage }`) | ✅ 4 pass |
| AC-5 | `SendDirectMessage.test.ts:"the \`thread.direct_message_sent\` FACT is still recorded…"` + grep `DirectMessageSentEvent` em `src/thread/handlers/` vazio | ✅ pass, grep vazio |
| AC-6 | `core/src/services/Mediator/SqlExternalMediator.test.ts:"publish PERSISTS on this lane and dispatches NOTHING in the same call stack"` (par vermelho→verde) + `core/src/repositories/DrizzleDomainEventRepository.test.ts:"an INTEGRATION event lands on the \`integration\` lane…"` | ✅ RED 2 fail → GREEN 17 pass |
| AC-7 | `tests/flows/ts-integration-lane.flow.test.ts` (2 casos: publish→lane→drainOnce; e a entrega por uma instância NOVA do mediator) + docblocks da lane e da classe reescritos | ✅ 12 pass com `shared-outbox-lanes.test.ts` |
| AC-8 | `.claude/registry.yaml` `cc-bp-26` (`severity: warning`, sem `mechanical: true`) + `event/{typescript,go}` `EVT-C11`/`EVT-GO-09` + `handler/{typescript,go}` `bp-09`/`bp-GO-HDL-07` + `usecase/typescript` `UC-P16` | ✅ `bun test:tooling` exit 0 |
| AC-9 | grep T7.1 (10 call sites, só nos 5 publishers) + `HDL-P13` no registry do handler | ✅ |
| AC-10 | este artefato (greps verbatim) + a seção "Inventário (rodada TS+Go)" do plano + paridade Go em T6.3/T6.5 | ✅ |

### O par vermelho→verde do T5 (registro do falseador)

RED, `cd packages/api/typescript/core && bun test --preload reflect-metadata src/services/Mediator/SqlExternalMediator.test.ts`, com a implementação ANTIGA de `publish` (alias de `dispatch`):

```
231 | 		expect(rows).toHaveLength(1)
error: expect(received).toHaveLength(expected)
Expected length: 1
Received length: 0
✗ SqlExternalMediator (shared-outbox ingress) > publish PERSISTS on this lane and dispatches NOTHING in the same call stack

264 | 		expect(await mediator.drainOnce()).toBe(1)
error: expect(received).toBe(expected)
Expected: 1
Received: 0
✗ SqlExternalMediator (shared-outbox ingress) > EMENDA O1 — a row with NO registered handler is still claimed FOR THE CALLBACKS, then tombstoned

 10 pass
 2 fail
```

Duas falhas, uma por caso novo: `publish` não escrevia linha nenhuma (0 linhas de outbox), e uma linha
sem handler registrado nunca era claimada (`drainOnce` → 0). GREEN após T5.3–T5.7: **17 pass, 0 fail**
nos dois arquivos de core; **12 pass, 0 fail** nos dois flows.

---

## (c) Gates — saída real

| Gate | Comando | Exit | Saída |
|---|---|---|---|
| tsc | `bun tsc` | **0** | `NX Successfully ran target tsc for 7 projects` |
| lint | `bun lint` | **0** | `NX Successfully ran target lint for 3 projects` |
| test | `bun run test` | **0** | api-typescript `848 pass / 3 skip / 0 fail` (851 em 137 arquivos); api-go `ok` em 16 pacotes; contracts `60 pass`; app-react `31 pass`; core-typescript `168 pass / 0 fail`. `NX Successfully ran target test for 5 projects` |
| detect | `bun detect` | **1 (pré-existente)** | ver nota abaixo |
| generated | `bun check:generated` | **0** | `✓ generated output in sync (contracts bindings, SDK dist, openapi.json)` |
| tooling | `bun test:tooling` | **0** | `414 pass / 0 fail` (414 em 26 arquivos) |
| e2e | `cd packages/e2e && bun run test` | **0** | `2 skipped / 6 passed (22.8s)` |

**Nota sobre `bun detect`.** Sai 1, e saía 1 **antes** desta frente. A saída completa foi comparada
byte-a-byte contra uma worktree limpa em `7a4a5e03` (HEAD antes de T5/T6) e é **idêntica** — zero
findings novos. Os findings gatilhantes são débito pré-existente, alheio a este diff:
`component-props` (33, `packages/app/react/**`), `projection-shape` (3, projectors Go),
`go-enum-literals` (2, `whatsmeow_channel.go`), `registry-scan` (42 acima do baseline),
`import-direction` (3), `slice-closure` (37). O plano listava `bun detect` como "exit 0", o que não
correspondia ao estado do repo em nenhum momento desta frente. Registrado como observação, não
corrigido aqui (corrigir 78 findings de UI/Go é outra frente).

No e2e a entrega passou a ser assíncrona (poll da fila) e a suíte segue verde: o log do servidor mostra
`channel message delivered` com `mock-wamid-*` — o comando `deliver_channel_message` executando de
verdade sob o `ChannelSender` mock do harness.

---

## (d) Observações O1–O5 — pendências de decisão do founder

Nenhuma virou Task. **O1 foi resolvida por emenda ao plano durante o T5** (as outras quatro seguem
abertas).

**O1 — RESOLVIDA (emenda T5.5(5) + caso de teste T5.1(3)): o poller entrega também aos callbacks.**
O achado: o claim filtrava por nomes com handler registrado, então com `publish`→lane os fatos TS sem
consumidor backend (`integration.thread.attached`, `integration.issue.archived`,
`integration.issue.stop_resolved`) nunca mais chegariam ao SSE. A resolução não é decisão nova — é
derivação de três decisões aprovadas: a decisão 5 desta spec ("o SSE broadcaster passa a disparar A
PARTIR DO POLLER"), a ratificação no-allowlist de 23-jul ("todo o surface `integration.*` vai ao
browser") e o desenho aprovado do B5. Implementação: com ≥1 **callback global** registrado, o claim
cobre TODA a lane e `notifyCallbacks` dispara para toda linha claimada; handlers rodam onde existirem.
Sem nenhum callback, o comportamento antigo permanece — um script headless não tombstona o que não
consome. Efeito colateral desejado: linhas dormentes param de acumular sem processamento. Premissa
anotada e reversível: veto do founder desfaz com um commit.

**O2 — ordenação intra-batch (aberta).** A lane não tem owner-skip (`finalizeFailure`: "this lane does
not group by owner"), então a ordenação que o `publish` awaited garantia por construção
(`issue.opened` antes de `issue.completed`) passa a valer só INTRA-BATCH (`ORDER BY created_at`). Um
predecessor que falha não segura o sucessor. `CompleteIssue` trata "issue not found" como no-op
idempotente sem retry — exatamente o cenário que o docblock antigo dizia proteger. A spec responde com
"consumidores deduplicam" (decisão 5); um degrau a mais (sequência por owner na lane) é decisão do
founder. Está dito em voz alta no novo parágrafo ORDERING do docblock da classe.

**O3 — a citação nunca chega ao wire (aberta).** `DeliverChannelMessage` **nunca passou
`quotedMessageId` ao `sender.send()`** — a citação que `RecordOrchestratorReply` resolve via
`findPlatformId` é montada, viaja no comando e é descartada no envio (idem `replyEntryId`, que o
docblock diz existir para um `linkEntry` que não é chamado). O comando carrega os dois campos para
preservar a resolução dos produtores; o executor mantém o comportamento shipped. Ativar a citação é
mudança de comportamento e não é do B3.

**O4 — `@doc` mentiroso no enum de lane (aberta).** `packages/contracts/wire/enums/outbox-source.tsp`
afirma que "the Go SqlExternalMediator claims `integration`" — falso desde que o gêmeo Go virou
egress-only, e mais falso depois do B3 (agora o TS também PRODUZ ali). Corrigir mexe em arquivos
gerados + `contracts.openapi.yaml`; ficou fora porque a decisão 5 nomeia o docblock do
`SqlExternalMediator`, não o do enum.

**O5 — `shutdown()` não fecha o `CommandQueue` (aberta).** `src/index.ts:127-144` não tem passo para a
fila. Os jobs repetíveis já convivem com isso desde sempre e o lease de 60s cobre um comando
interrompido no meio; com a entrega de mensagem agora na fila, um `close()` gracioso pouparia uma
tentativa queimada por deploy.

**Achado C8 (fora das Decisions, aberto).** `DrizzleOutboxDispatcher.finalizeFailure` retém o lease
como backoff ("Lease deliberately retained → natural 30s backoff"), então uma falha transiente custa
30s de latência de materialização — foi o que estourou o poll de 20s do e2e com `workers: 2` e levou o
C8 a fixar `workers: 1`. Candidato a backoff menor/jitter no PRIMEIRO retry; decisão do founder.

---

## Desvios do plano registrados

1. **`bun detect` "exit 0"** (T6.8 e T7.4) — inatingível: o gate sai 1 no HEAD anterior à frente. Saída
   verificada idêntica byte-a-byte, zero findings novos. Ver a nota em (c).
2. **Contagens de linha** — T7.1 previa "exatamente 10 linhas": o grep casa 11, sendo a 11ª uma linha de
   docblock. T7.2 previa 21 call sites Go: são 20 (nenhuma linha Go mudou nesta frente). T5.8 previa
   "2 + 11 casos" nos flows: são 2 + 10 = 12.
3. **O cast em `publish()`** — o plano propunha `event as unknown as AnyIntegrationEvent` justificado
   por invariância do generic. `tsc` prova que uma ÚNICA conversão (`event as AnyIntegrationEvent`)
   compila, e o double-cast disparava `registry-scan universal#as-unknown` (finding novo). Mantida a
   semântica, ajustado o cast e o comentário que o justifica.
