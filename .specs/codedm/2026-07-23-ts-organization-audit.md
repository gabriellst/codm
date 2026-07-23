# Auditoria de organização TypeScript — codedm api-typescript (8 dimensões)

> Workflow read-only wf_c23fe769-88f (2026-07-23, pós-noite): 8 auditores + síntese fable.
> Mesma régua da auditoria Go: CONFORMANT | FIX-NOW | REWRITE | SANCTIONED, tudo file:line.

# Síntese — Auditoria de organização TS (codedm `packages/api/typescript`) — 8 dimensões, 2026-07-22

## 1) Matriz de conformidade

| Dimensão | % conformant | #FIX-NOW | #REWRITE | #SANCTIONED | Nota |
|---|---|---|---|---|---|
| terminal-context (phase-10) | ~93% | 1 | 2 (micro) | 5 | Melhor contexto do repo; engine port isolado e testado |
| contexts-structure (workspace/thread/issue/artifact/ui/external/shared) | ~90% | 9 | 1 | 6 | Espinha estrutural 100% canon; drift é layout de arquivo |
| core-seam (@codedm/core-typescript) | ~95% | 2 | 0 | 2 | Seam mais saudável; 1 fork (ForwardRequest), zero deep imports |
| controllers + schemas | ~60% | 12 | 0 | 4 | Rails duros limpos; débito concentrado nos 4 contextos da noite |
| events + handlers | ~88% | 4 | 1 | 5 | Backbone exemplar; não-conformidade = artefatos mortos/órfãos |
| usecases + queries | ~78% | 5 | 2 | 5 | Write-side forte; drift no read-side (placement, ver conflito §6) |
| tests-layout | ~90% | 6 | 0 | 4 | Taxonomia template-true; 6 itens mecânicos, zero comportamental |
| sdk + frontend-seam | ~72% | 6 | 3 | 2 | Seams load-bearing corretos; blind spot Go error-codes |
| **Total consolidado** | **~83%** | **~45 itens em 7 lotes** | **8 clusters** | **~33 citados** | |

## 2) Lotes FIX-NOW mecânicos (ordenados por alavancagem; cada lote = 1 commit coeso)

**Lote A — Correção de comportamento silencioso (maior severidade/linha).** Gates: `bun tsc` + `bun test` + `bun sdk`.
- `src/issue/controllers/IssueReads.ts:12` — `z.coerce.boolean()` → `z.stringToBoolean()` (**bug vivo**: `?includeArchived=false` vira `true`); `src/terminal/controllers/DetectProviders.ts:10,56` — idem (drop `z.enum(['true','false'])` + `=== 'true'`).
- `src/issue/handlers/MaterializeIssueFromExecution.ts:69-71` — estreitar `catch {}` para `BaseError` + os 3 códigos sancionados (STOP_CRITERION_DISABLED/ISSUE_ARCHIVED/ISSUE_NOT_FOUND); rethrow do resto (hoje um outage de DB come o sinal needs-you em silêncio).
- `src/terminal/handlers/RunTerminalSessionOnClassification.ts:60` — `?? ''` quebra `z.uuid()`; trocar por guard-drop (`if (!event.ownerId) return`) honrando a postura defensiva declarada.
- `src/issue/usecases/SteerIssue.ts:34` — retornar o id real da linha appendada (hoje `entryId` é uuid fantasma).
- `src/thread/events/{ClarificationRequestedEvent.ts:11,DirectMessageSentEvent.ts:11}` — `contactKind: z.string()` → `z.enum(ContactKind)`; remover 2 casts no bridge (`PublishThreadIntegrationEvents.ts`).

**Lote B — Vocabulário de erro + config de seam do console.** Gates: `bun tsc`, e2e smoke.
- `src/shared/registry.ts:38-75,156,202-203` — deletar binding morto do SDK `Client` + `mockSdkClient`/`realSdkClient`/`stubRequest` (~40 linhas; zero injection sites; carrega o braço self-call que BACKEND.md:171 proíbe).
- `app/react/src/router.tsx:15` + `.storybook/preview.tsx:15` — deletar chaves `rust:`; corrigir base `go` do storybook para o shape do proxy (`Config.gatewayBaseUrl`); `packages/e2e/utils/given/user.ts:6` → `${API_BASE_URL}/v1/external/channel`. Ideal: exportar 1 mapa canônico de `lib/config.ts`.
- `app/react/src/lib/errors.ts:2,14-19` — trocar `ApiErrorsEnum` (só TS-service) pelo union `ERROR_CODES` de `@codedm/client-typescript/error-codes` (pré-requisito para o REWRITE Go #8 chegar ao runtime).
- `src/locales/{en,pt}.json` — podar ~39 traduções-resíduo de template (billing/subscription/webhook) para `ERROR_CODES` + 3 códigos frontend.

**Lote C — Sweep schema-reuse + shape de controllers (contextos da noite).** Gates: `bun tsc` + `bun sdk` + diff do openapi.json revisado.
- Compor bodies via `UseCaseInputSchema.omit({ownerId:true})`/`.pick()` e reusar OutputSchemas dos use cases (~12 schemas em 5 arquivos: `thread/controllers/AttachThread.ts:9-21`, `issue/controllers/IssueCommands.ts:62-63,110-118`, `artifact/controllers/ArtifactControllers.ts:12-20`, `workspace/controllers/AddWorkspace.ts:10-19`, `thread/controllers/ThreadCommands.ts:54-76`).
- Split dos 6 arquivos multi-controller (IssueCommands×5, IssueReads×4, ThreadCommands×4, ThreadSettingsCommands×3, ThreadReads×2, ArtifactControllers×2) para one-per-file; extrair `ThreadParam`/`IssueParam` (4 cópias) para `<ctx>/schemas/`; mover `MentionGateSchema` de `thread/entities/Thread.ts:14` para `thread/schemas/`.
- `.example([...])` nos 30 controllers sem exemplo (padrão exemplar existe no contexto owner).
- `src/terminal/controllers/StreamTerminalSession.ts:17` — materializar o union `TerminalSseFrame` (já existe como tipo TS em `AgentStreamRegistry.ts:14-30`) como Zod, matando o `z.unknown()`.
- Menores: `.max()`/refine de path absoluto em `ArtifactControllers.ts:16-17`/`AddWorkspace.ts:10`; nomear os 3 enums inline do terminal em `terminal/enums/`; harmonizar `ctx.session.ownerId` → `ctx.ownerId` nos 2 controllers do terminal.

**Lote D — Higiene de teste/build (superfície de produção).** Gates: `bun test` + `bun x tsc -p tsconfig.build.json --noEmit`.
- `src/terminal/.../ClaudeCliTerminalLLMRunner/testFakePty.ts` — tirar do escopo do build (tsconfig.build.json:4 só exclui `*.test.ts`) — **consenso de 2 auditorias** (terminal#12, tests#6).
- `src/terminal/services/TerminalLLMRunner/ImportGraphIsolation.test.ts` — mover para `tests/architecture/` (rail repo-wide; re-rootar `SRC`).
- Sweep `testId()` nos ~35 UUIDs literais em `src/terminal/**` + `SetActiveOwner.test.ts:55`; substituir `seedOwner`/`seedSession`/`seedActiveOwner` pelos givens existentes; adicionar `givenStop` repo-direct.
- Trio DI: constructor-inject `DrizzleClient` em `SetActiveOwner.ts:42` (drop `resolve(... as any)`); `RecordArtifact.ts:37-48` trocar checks raw-table por `ThreadRepository`/`IssueRepository.findById`.

**Lote E — Hoist ForwardRequest no kernel.** Gates: `bun tsc`.
- Substituir corpo de `core/src/utils/ForwardRequest.ts` (stale+morto) pela versão viva de `src/shared/utils/ForwardRequest.ts` (abort-signal anti-zombie-SSE + `duplex:'half'`); exportar de `core/src/index.ts`; deletar a cópia local (esvazia `shared/utils/`); repontar `src/external/utils/forwardToChannel.ts:2`. Reconciliar `core/src/index.ts:46-55` × `core/src/utils/index.ts` (zona-sombra que gerou o fork; candidato a upstream no template).

**Lote F — Purge de código morto de eventos + resíduo shared.** Gates: `bun tsc` + `bun test`.
- Cluster auth morto (sanção da fase-1 expirou na fase-3): 7 eventos `src/auth/events/*` com 0 raise sites + `UserRegisteredHandler.ts` + `identity-events.index.test.ts` + linhas de barrel; limpar comentários stale (`owner/handlers/external.ts:2-3`, `auth/handlers/external.ts:2`).
- Corrigir os 2 docblocks mentirosos (`PublishWorkspaceIntegrationEvents.ts:6-10`, `PublishThreadIntegrationEvents.ts:18`) — parte tonight-executável do REWRITE events#11.
- Podar `shared/objects/{Money,MultiCurrencyMoney,Phone,Timeline}.ts` + `shared/schemas/Metric.ts` (0 consumidores; sem sync-train bloqueando) e helpers `mockMoney/mockMetric/mockSignedMoney` de `shared/testing/mock.ts` (mantendo `faker/mockIsoDate/pick`, consumidos pelos stubs sancionados).

**Lote G — Barrels + mapa declarativo + docs de skill.** Gates: `bun tsc`.
- 6 barrels faltantes (`workspace|thread|issue|artifact/entities/`, `issue/objects/`, `ui/services/`); split das classes de evento in-barrel (`issue/events/index.ts:14,26`, `artifact/events/index.ts:14`, `thread/events/ThreadLifecycleEvents.ts`); mover `BrowserIntegrationEventName` para `ui/enums/`; stub `ui/handlers/internal.ts`; fold `BrowserFrameEnricher` no shape subfolder+Mock.
- **Blind spot do rail**: declarar as edges de leitura por tabela em `shared/context-map.ts` (`issue→thread`, `workspace→{issue,thread}`, `thread→{issue,gateway}`) ou ensinar `tests/architecture/context-map.test.ts` a resolver tabelas de `@codedm/contracts/db` → pgSchema dono.
- Docs: `.claude/skills/bounded-context/registry.yaml` CTX-02 (drop claim `ctx.container`), CTX-01/04 (middlewares opcionais no single-operator); `.claude/skills/test/typescript/SKILL.md:575-630` (purgar seção channel-projection medscall + FCM, adicionar givens workspace/thread/issue, legalizar `tests/integration/`); nota de gatilho de promoção do `RunnerLogger` para core.

## 3) REWRITEs por fase/dependência

| REWRITE | Origem | Fase/dependência |
|---|---|---|
| NEW_ISSUE double-mint: classifier minta `slugKey`/LLM-title e descarta; saga re-minta mecanicamente (`ClassifyMessage.ts:105-106` × `RunTerminalSessionOnClassification.ts:93-119`) | usecases#3 | **Wave de amendment do contrato congelado** `integration.message.classified` (carregar key/title) OU deletar minting morto do classifier + cláusula do prompt (`IssueClassifier.ts:132`) |
| Go emitter sem `x-error-codes` (~54 códigos invisíveis ao gate; console colapsa em UNKNOWN_ERROR) | sdk#8/#9 | **Train de conformidade Go** (`pkg/openapi` + regen + ~54×2 traduções); Lote B (swap `errors.ts`) é pré-requisito para o fix chegar ao runtime |
| `GetMyAccount` stub faker + `UploadAvatar` echo (`ui/usecases/GetMyAccount.ts:1`, `auth/usecases/UploadAvatar.ts:14-23`) | usecases#8 = contexts#19 | Fase account-settings read-model (two-factor/company/currency) + storage |
| Claims de consumo órfãos: `integration.workspace.removed` "BC4/BC5 invalidam refs" e `thread.attached` "warm indexing" — consumidores inexistentes | events#11 | Cluster C15 detach/workspace-invalidation; interim (docblocks) já no Lote F |
| 9 ops SDK TS mortas (owner-lifecycle, avatar, RemoveWorkspace, RestoreIssue, RecordArtifact) | sdk#13 | **Decisão de founder**: strip vs manter como seam de template; `StreamTerminalSession` é deferral sancionado (two-stream fase-5) |
| `ServiceBaseUrls` = `Record<string,string>` aberto (deixou `rust:` sobreviver 3 call sites) | sdk#7 | Generator http-template em `packages/client`; próximo regen train |
| 409 raw do SSE (`StreamTerminalSession.ts:52-54`) — bypassa contrato de error-code + TOCTOU no `has()→register()` | terminal#13 | Micro; decisão de error-shape pré-SSE (muda wire body) — junto do union Zod do Lote C se o founder aprovar |
| `TerminalLLMRunnerBusyError` plain Error sem caller (`TerminalLLMRunner.ts:46-51`) | terminal#14 | Follow-up phase-10: tipar no vocabulário ou registrar como débito no BUILD-LOG |

## 4) SANCTIONED (com citação)

- **Engine phase-10** (subtree ClaudeCliTerminalLLMRunner, arquivo de 940 linhas, `oneshot.ts`, SessionStore in-process sem Redis, RunnerLogger paralelo ao core Logging, suites pure-unit com fakes) — BUILD-LOG:214-230 (forks A1/B/C/D2, `bcc7aa1c`).
- **Seam hermético e2e**: swap `CODEDM_E2E` no registry (`terminal/registry.ts:18-20` + guard `boot.ts:23`), `TestIngressController` (publish em controller, gated), skips honestos 08/09 — BUILD-LOG fase 9 + :228.
- **Proxy pairing medscall**: contexto `external` file-for-file, `ChannelProxy` sem use case/não emitido, split `ForwardRequest`(shared)+`forwardToChannel`(external), `configureClient` go→proxy no console — founder 22-jul, BUILD-LOG:116,130-136.
- **Read-services cross-tabela** (OpenIssuesReader/ChannelConnectivity/WorkspaceUsageQuery) — BUILD-LOG:64; **consumo cross-context de services** (IssueClassifier/ProviderDetector via context-map partnership) — phase-5 doc + `shared/context-map.ts:24,77`.
- **Seam execution-vs-control**: OpenIssue/CompleteIssue sem evento (BUILD-LOG:62), RaiseStop sem evento + gating StopPolicyConfig (BUILD-LOG:65), TAKE_OVER→pause deferido (fase-6 (b)), `ThreadDetachedEvent` 0 raises (fase-6 (e)).
- **Lifecycle bus zero-consumer** — débito registrado (e), BUILD-LOG:219,230; assessment de placement pronto (promover `onLifecycle` ao port + `TerminalLifecycleRecorder` no setup) se o orquestrador quiser fechar hoje.
- **ListenEvents/BrowserFrameEnricher KEEP** + import de variant-schemas S2S via subpath (decision 3, rail `union-parity.test.ts:386-399`) — BUILD-LOG pairing step 2/:131; **GetSession echo** (operator collapse, founder decision 2); **superfície Go verbatim 39/42 hooks sem uso** (jul-22 §3 "zero órfãos").
- **Reads BFF em BCs de domínio** — ver conflito resolvido abaixo (ddd-modeling §7.4/§7.5 + BUILD-LOG:17).

## 5) Conflitos de classificação resolvidos

1. **Placement dos 4 reads BFF cross-context** (GetIssuesOverview/GetIssueDetail/GetSessionChat/ListWorkspaces): usecases#1 = FIX-NOW (mover pra `ui/`, citando BACKEND.md:58 + template) × contexts#6 = SANCTIONED (`ddd-modeling-codedm.md` §7.4:940-983/§7.5:1260-1358 atribui T04/T09-T12/T14 a BC4/BC5; BUILD-LOG:17 "Canon honrado"). **Resolução: SANCTIONED** — a spec ratificada específica do codedm supera o doc genérico; o resíduo obrigatório é o Lote G (declarar as edges de tabela no CONTEXT_MAP, hoje sub-reportadas). Se o founder preferir restaurar o canon BACKEND.md, a relocação é mecânica (paths/opIds inalterados) e cabe no Lote C.
2. **ImportGraphIsolation.test.ts**: terminal#5 elogia como enforcement do port × tests#5 FIX-NOW no placement. **Resolução: FIX-NOW (Lote D)** — o rail é repo-wide, dimensão tests é dona do placement; o conteúdo permanece sancionado.
3. **shared/objects VOs**: core-seam#7 CONFORMANT (lado certo do seam, espelha template) × contexts#18 FIX-NOW (0 consumidores). **Resolução: FIX-NOW (Lote F)** — placement correto ≠ código vivo; core-seam só julgou o lado do seam.
4. **testFakePty.ts / multi-controller files / .example gap**: flagados por 2 dimensões cada, mesma classe — deduplicados nos Lotes D e C.
5. **`shared/testing/mock.ts`**: contexts#18 quer podar × usecases#8/contexts#19 mostram consumo por stubs sancionados. **Resolução:** poda parcial (só `mockMoney/mockMetric/mockSignedMoney`); `faker/mockIsoDate/pick` ficam até o REWRITE account-settings.

## 6) Top-10 riscos/débitos de organização

1. **Bug vivo de boolean query** (`IssueReads.ts:12`) — opt-out explícito se comporta como opt-in; único defeito de correção em produção hoje.
2. **Blind spot Go no contrato de erros** (sdk#8/#9) — ~54 códigos do gateway renderizam como UNKNOWN_ERROR e o gate compile-time não os vê; duas vocabularies coincidem por acidente.
3. **Catch bare no MaterializeIssueFromExecution** — modo de perda silenciosa do sinal needs-you sob falha de DB.
4. **Binding SDK `Client` morto com braço self-call** — a única porta pela qual api-ts poderia se auto-consumir via SDK, viva no registry sem consumidor.
5. **CONTEXT_MAP sub-reporta acoplamento real** — edges por tabela sancionadas não declaradas; erode a garantia "escrever o mapa É a auditoria".
6. **Drift de schema controller×use-case nos 4 contextos da noite** — ~12 schemas duplicados; toda mudança de use case pode divergir do wire silenciosamente até o Lote C.
7. **Cluster auth morto com sanção expirada** — 7 eventos + handler que nunca dispara enganam qualquer leitor futuro de auth.
8. **Test scaffolding no build de produção** (`testFakePty.ts`) + rail repo-wide colocado no lugar errado.
9. **Docs de skill dessincronizados** (test SKILL.md com seção medscall inexistente, CTX-02 stale) — fonte normativa do `bun review` fabricando falsos findings a cada PR.
10. **NEW_ISSUE double-mint** — o título LLM do classifier é computado e jogado fora; o produto nomeia issues pelo fallback mecânico sem ninguém ter decidido isso.

**Leitura geral:** ~83% conformant no agregado; a espinha (BoundedContext.create, expandBindings, outbox-in-tx 15/15, CROSS_CONTEXT_POLICY limpo, seams SDK/native rail-enforced) está canônica, e o phase-10 chegou notavelmente bem organizado. O débito é ~45 itens mecânicos tonight-executáveis concentrados nos 4 BCs da noite (Lotes A-G, cada um commitável com gates `bun tsc`/`bun test`/`bun sdk`), + 8 REWRITEs mapeados dos quais só 2 (Go error-codes, double-mint) tocam contrato.
