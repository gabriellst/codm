# Ecosystem Sync-Up — Drift-Healing Program

**Date:** 2026-07-11 · **Status:** Approved (2026-07-18)
**Scope:** cross-repo program (template-fullstack v1.9 · berzerk-club · medscall). Executed as
per-repo work chunks — each substantial item goes through that repo's normal `/plan` → `/build`
loop (or a direct small fix + tests when trivial). This document is the **program order**, not a
single `/build` plan.
**Evidence:** every item below is a *verified* finding from the 2026-07-10 tri-repo audit
(artifact `59c51e1f`, per-agent journals retained). Commit hashes = the existing fix to
cherry-pick — **port commits, never re-implement** (half-ports are how this drift happened).
**Goal:** all three repos at a pinned, drift-free sync point, so Plan 2's machinery starts from
zero debt.

## Decision gates — ALL RESOLVED 2026-07-11 (user)

- [x] **D1 — Outbox claim canon.** Two working fixes exist for the Go dispatcher starvation bug:
      berzerk's handler-name claim filter (`be89f7727`, no schema change) vs medscall's
      `source`-column discriminator (introduced by `83784a6f` "chore: reorganize" in both
      `packages/api/src` and `packages/channel` — NOT `77963caf`, which is only poll-bound tweaks;
      template's outbox schema *already has* a `source` column + the
      `(source, processed_at, created_at)` `outbox_unprocessed_idx`, so it is schema-ready).
      **DECIDED: name-filter now** (pure port, unblocks template); revisit source-column when
      medscall syncs.
- [x] **D2 — Detectors as canon?** **DECIDED: canon, synced everywhere** — `scripts/detectors` +
      `scripts/skill-evals` join the sync surface (Plan 2 `sync.yaml`); port to berzerk (B-4) and
      selectively to medscall (path-tweaked go-enum-literals/slice-closure) in Wave 1.
- [x] **D3 — `::uuid` vs `::text` outbox id cast.** **DECIDED: reconcile per repo's actual column
      type during the D1 port** (mechanical, no canon needed).
- [x] **D4 — Integration-event envelope dialect.** **DECIDED: the TypeSpec dialect**
      (`entityId`/`occurredAt`). Align `BaseEvent`/`BaseIntegrationEvent` + Go
      `IntegrationEvent[T]` serialization in the template BEFORE R-3 pins the sync points —
      tracked as T-10 below.

## Delta review — REESCRITO 2026-07-18 (workflow wf_72adb2f7: 27 agents Opus, 65 achados, 20/20 verificados adversarialmente)

**PIN DE EXTRAÇÃO NOVO: `f04e8a0f`** (merge do PR #85 — `feat/billing-idempotency` FOI MERGEADO; working tree limpa; 223 commits desde `d9fef8bc`). O pin 7a07d74a (07-15) e o bloco anterior estão obsoletos. A condição que segurava os M-items (aguardar merge) CAIU — M-items desbloqueados (executar na Wave 0 medscall).

### Fronteira L-10 REDEFINIDA (billing↔quota)
Por decisão explícita no medscall (spec 2026-07-06 §Amendments): QuotaOverride (ledger append-only, UNIQUE(idem_key)) + QuotaOverrideRepository + QuotaEntitlement (read-port) + vertical ApplyQuotaOverride migraram billing→quota (a3a2766a, 8cd69fef); tabela `quota_overrides` no schema quota; rota `/quota/overrides`; subscription-existence guard REMOVIDO (X-Operator-Key é o único gate). Acoplamento billing↔quota é **BIDIRECIONAL ACEITO** — única entrada em CONTEXT_IMPORT_EXCEPTIONS do rail: billing importa @quota/*, DrizzleQuotaEntitlement (quota) lê PlanRegistry+SubscriptionAccessDeriver (billing), RequestDowngrade (quota) dirige ChangePlan (billing). **A extração L-10 herda ESTA fronteira** — billing não é portável sem quota; as 2 specs nascem como par acoplado.
Correções materiais: v1.9 NÃO tem contexto billing em src (subscription vive em `tenancy/Store` — ChangeStoreSubscription); o trap "billing pgSchema em contracts" segue válido (estender, não recriar). Migrations do medscall foram squashed pós-4729cb44 — extrair schemas do HEAD, nunca por número de migration.

### Adotar-JÁ (21 achados → itens novos)
Wave 0 template:
- [ ] **T-11 (S)** OtlpLoggingService nunca construído no perfil real de DI — logs não chegam ao Loki; **bug idêntico confirmado no template**. Port de 11dded43 (factory: component←OTEL_SERVICE_NAME + project obrigatórios; demais opcionais).
- [ ] **T-12 (XS)** graph validate-plan PR-19: pular pares depends_on cujos arquivos-alvo são net-new (mata o falso-positivo que este próprio plano documenta).
- [ ] **T-13 (XS)** review.ts: fix RAIZ do silent-drop de não-classificados (jobs/ era sintoma) + regra jobs/ (3860baa8).
- [ ] **T-14 (XS)** cc-bp do medscall (tx-não-threadada; handler-sem-estratégia-de-idempotência) entram como **cc-bp-24/25** (template mantém seu cc-bp-22/23) + CC_BP_SCOPE corrigido (hoje só cobre 01..12 em AMBOS os repos — cobrir todos).
Wave 1 template:
- [ ] **L-11 (S)** `contexts.ts` manifest tipado (CONTEXTS + ContextModule/ContextName) no core; `BoundedContext.name: ContextName`. Pré-req de L-13/L-14. (Verify: o manifest NÃO colapsa ALL_REGISTRIES/arrays — decisão do commit de origem, manter.)
- [ ] **L-12 (M)** PersistenceProbe (`testBed.probe()`) + probe registry derivado de schemas (chaves `<module>.<export>`) + taxonomia Reading-Persisted-State + rail probe-discipline. GENERICIZAR: remover `creditNoteRows` (billing-specific) na extração. LedgerProbe = superseded, não portar.
- [ ] **L-13 (S)** `tests/architecture/` home dos rails (README rung-ladder) + context-boundary DERIVADO do manifest com CONTEXT_IMPORT_EXCEPTIONS (billing↔quota declarada aqui) + rails tx-discipline e console-discipline (d69c7e38, 3d241d10). **Substitui o L-9 antigo** (scaffold por-contexto hand-typed morreu; reconciliation-coverage é billing-domain → fica no L-10).
- [ ] **L-14 (S)** `routers.ts` composition-root `satisfies Record<ContextModule, Router>` + boot limpo (HttpRouter por token DI; Config.env via Zod EnvSchema + superRefine secrets-guard) (0d0fa480, 96fd1eac, 06264589).
- [ ] **L-15 (XS)** react app: `useTimeout` + canon `@tanstack/react-hotkeys` — **DECISÃO: CANONIZAR** (dep ^0.9.1 já presente e órfã; medscall prova o padrão; skill/registry note + exemplo Escape-fecha-painel).
- [x] **L-0.5 DECIDIDO: MESCLAR** — estender a porta CommandQueue do core; `PostgresCommandQueue` entra como driver adicional (scheduling transacional delayed/repeatable; tabela scheduled_commands). No mesmo pacote kernel: `forEachWithConcurrency`, `saveWithOptimisticLock` tipado (eee23c2f), `DomainEventRepository.listByNameSince` (296ebca6).

### Adotar-DEPOIS (39 — destaques e destino)
**Viram ESCOPO do L-10** (não ports isolados): Dispute aggregate (processo OPEN→WON|LOST, detector 2 regimes), GatewayEventSource + reconciliation-contract-as-code (C3), dunning maturado (DeclineClassifier, DunningRetryPolicy, eventos por fase), ReconcilePendingChargesJob + ChargeSettler, Subscription optimistic-lock + invariantes na entidade, OperatorAlert seam (kind/alertKey/runbook), doutrina de reverts (a5361ba5 idemKey per-invoice; 944c0e85), BILLING.md workflow-doc como formato. **Pós-L-12:** ScaleBed/ScalePgDriver (Postgres real) + skill scale layer + flow-journey packages. **Canon react / exemplares BOOTSTRAP:** SSE consumption recipes (invalidation coalescida leading-edge), createAnchorNav, dual-backend SSE, useSession tipado. **Quota kernel completo** (gate+ports+governors, QuotaKey placeholder-vazio no merge root) → dentro do L-10 quota spec.

### NÃO-adotar (5)
Mediators refactor (template já convergiu); LedgerProbe (superseded); OwnerDirectory/owner-context (tenancy do template difere por design); handler bp-03 (já coberto); .env.example reorg (conteúdo product-specific).

### Colisões resolvidas
cc-bp-22/23 → **renumeradas 24/25** no template (T-14) · CommandQueue → **MESCLAR** (L-0.5) · react-hotkeys → **CANONIZAR** (L-15) · L-9 → **substituído por L-13**.

## Wave 0 — Stop the bleeding (live bugs & silent failures; ~2 days)

### Template v1.9
- [ ] T-1 **(S)** Port Go outbox claim filter per D1 — berzerk `be89f7727` (3 files:
      `core/services/outbox/outbox_dispatcher.go`, `mediator/{internal_mediator,mediator}.go` —
      `Mediator.RegisteredEventNames()`). The commit carries NO test (none exists in any repo for
      the Go dispatcher): **the port must write the claim-filter test.** *Verify:* new test — a Go
      dispatcher sharing the DB with TS no longer deletes TS-only events.
- [ ] T-2 **(S)** Merge branch `fix/outbox-dispatcher-hardening` (TS `DrizzleOutboxDispatcher`
      bounded drain + retry spacing, commit `8e072ebba`; ~+74/−15 + 163-line retry test).
      *Verify:* retry test green.
- [ ] T-2b **(S)** **Go twin of T-2** (the fix commit itself says the Go dispatchers ship the same
      unbounded-drain defect): bounded drain iterations + retry spacing + lastError persist in
      template's `core/services/outbox/outbox_dispatcher.go`. Medscall's channel dispatcher gets
      the same via M-8.
- [ ] T-3 **(XS)** Replace walker empty-flag guard with berzerk's pattern guard — `572e155de`
      (`core/pkg/openapi/walker.go`; keeps core enums emitting when `internal/` absent).
- [ ] T-4 **(XS)** Fix `collectUnions` scan scope: `unions.go:38` `template/core-go/` →
      `ownsSchemaSource` (matches sibling `findTypeByName`). Un-breaks the dormant `@union` DSL.
- [ ] T-5 **(XS)** Fix pre-commit hook nx target: nonexistent project `api` → real backend
      project. *Verify:* commit on a red backend test actually fails.
- [ ] T-6 **(S)** review.ts batch: port medscall `7a4f5339`+`d42e367b` (`JSON_FLAGS` allow
      StructuredOutput + `is_error` guard); berzerk `175116680` (never fabricate clean reports;
      missing review ⇒ no report + exit 1) + medscall `a06bb85e` per-batch try/catch + re-run
      hint; berzerk `8ad507d82` (`generated/` skip); model aliases → `claude-sonnet-5` /
      `claude-opus-4-8` (medscall `a06bb85e`).
- [ ] T-7 **(S)** Port the second half of medscall `b0c36edd`: dependency-inlining + cascade path
      prefixes (`api/src/` → `packages/api/typescript/src`, `app/src/` →
      `packages/app/{react,expo,astro}/src`) **+ own-folder-barrel inlining** (same commit).
      Add the smoke assertion: support-file count > 0 for a file with known `@ctx` imports.
- [ ] T-8 **(XS)** Fix self-contradictory `scripts/graph/tests/openapi-naming.test.ts` (assert
      `'_default'` — impl is `scripts/graph/adapters/openapi/naming.ts:24` — add `tags: []` case).
      Guard `scripts/graph/tests/{validate-plan-cmd,plan-cmd}.test.ts` with medscall's
      `existsSync ? describe : describe.skip` pattern (both fail LIVE on absent fixtures).
- [ ] T-9 **(XS)** Fix expo CLI branding bug: scaffolds emit `@template/client-typescript` →
      template's own scope parameter.
- [ ] T-10 **(S)** Per D4: align the integration-event envelope on the TypeSpec dialect
      (`entityId`/`occurredAt`) — reconcile TS `BaseEvent`/`BaseIntegrationEvent` and Go
      `IntegrationEvent[T]` serialization with the contracts bindings; must land before R-3.

### Berzerk-club
- [ ] B-1 **(XS)** Same pre-commit nx `api` fix (T-5).
- [ ] B-2 **(S)** Same review.ts cascade/inlining port (T-7) + model bumps (already has
      JSON_FLAGS, no-fabrication, generated/ skip via `8451a0c98`/`8ad507d82`).
- [ ] B-3 **(S)** Port PR-28 + handoff grammar as ONE unit — template `8ab61c0d4`+`fa6e92d2e`:
      plan-parser `consumes/scopeFence/gate` fields, PR-28 rule + fixture
      `plan-missing-handoff.md` + test, `.claude/commands/{plan,build}.md` grammar sections.
- [ ] B-4 **(S)** Port `scripts/eslint-rules` + classify-edit hook + (per D2) `scripts/detectors`.
- [ ] B-5 **(S)** Registry refresh to template state: cc-bp-21/22, event-raising canon rewrite
      (EVT-C01/C02/C10), CTRL-C10/C12→C15/C16 renumber, drop phantom rust patterns, VO `.input()`
      fix, `docs/CORRECTNESS.md`. **Sub-item:** the 5 documented-stale rules (CTRL-P01
      ctx.session, CTRL-C14, REPO-P18, UC-P15, HDL-03) must be reconciled to berzerk's REAL
      conventions (`ctx.user.id` across all 92 controllers) — do NOT take template wording
      verbatim; afterwards retire the agent-memory ignore-list (graph-aware-review.md).
- [ ] B-6 **(S)** CLI catch-up from template: `route --loader` block + `artifacts/route.test.ts`
      (`562edf946`), `wire.ts` auto-wiring (`725dbe055`), typed `--labels` (replace deprecated
      stub), docs rows (`docs/CLI.md` --loader/Auto-wiring; `docs/FRONTEND.md` §Data Loading &
      Prefetch) + route-skill RTE-P15..17/bp-14..17. During the port, swap the `@template`
      specifier hardcoded in template's code (route.ts:151) to `@berzerk/client-typescript`
      (berzerk's own existing files already emit the right scope).
- [ ] B-7 **(XS)** `emit-wire-ts` zero-union cleanup fix (committed broken orphan union exists in
      generated output — regenerate after).
- [ ] B-8 **(XS)** Same as T-8, BOTH halves: fix `scripts/graph/tests/openapi-naming.test.ts` AND
      guard `validate-plan-cmd/plan-cmd` tests (they fail live in berzerk too).

### Medscall (respect in-flight `feat/billing-idempotency` work — land on a clean branch)
- [ ] M-1 **(S)** Port consumer-group + DLQ `RedisExternalMediator` **with its test** from
      template (`a31df984e` lineage): today `Register()` is a literal no-op — the service cannot
      consume. Adapt import paths to `internal/shared`.
- [ ] M-2 **(XS)** Add projection/projector/middleware rules to `CLASSIFICATION_RULES` in
      review.ts; run `bun review --all` for first-ever coverage of those families.
- [ ] M-3 **(XS)** Port `tagOf` `'_default'` fix + corrected test (ops with only
      internal/external tags currently vanish from the graph).
- [ ] M-4 **(XS)** Adapted walker guard (module prefix `monorepo/api/internal/shared/types`) —
      latent, cheap symmetry.
- [ ] M-5 **(S)** Per-language skill dispatch (detectLang/resolveRegistryPath + review-query
      per-lang loading) so `packages/channel` (Go) stops being invisible to review. Until merged:
      run summaries must state Go is un-reviewed.
- [ ] M-6 **(XS)** review.ts: adopt no-fabrication semantics (keep its own resilience), add
      `generated`+`target` to skip regex (future-proofing), parsePlan T-grammar test block.
- [ ] M-7 **(S)** Backport the graph-core `WorkspaceConfig` abstraction (template
      `core/config.ts`: role/lang/generated + `workspaceForFile`) with a medscall-specific matrix
      (api, app, channel, client) — contracts/astro adapters stay OUT. This is a distinct
      subsystem from M-5's skill dispatch; without it every future `scripts/graph` sync is a
      manual merge (audit graph #1, HIGH). Includes retiring hardcoded `CHANNEL_ROOT` + legacy
      `Service` union.
- [ ] M-8 **(S)** Go twin of T-2b in medscall's channel dispatcher
      (`packages/channel/internal/shared/services/outbox/outbox_dispatcher.go`): bounded drain +
      retry spacing (production repo — same unbounded-drain defect).
- [ ] M-9 **(XS)** Enable `no-raw-enum-render` in medscall's eslint config (the rule file already
      ships there — one-line enable, audit hygiene #0 medscall half).
- [ ] M-10 **(XS)** Rewrite the event-raising canon wording in medscall's flat
      `event/registry.yaml` (still teaches "publish via InternalMediator" — audit skills #1
      medscall half).

**Wave-0 exit:** each repo's full gates green (`tsc`, lint, full test suite; template also
`bun sdk` end-to-end) + the audit's act-now table empty.

## Wave 1 — Best-of-breed lifts INTO template (make the canon worth syncing from)

Ordered by leverage/effort. Each = one `/brainstorm`(light) → `/plan` → `/build` in template.
**Do-not-re-port traps (verified already in v1.9):** Money/SignedMoney/Metric/Tally family ·
SPEC-12 handler framework + review gates · sheet system/CLI machinery · zod-refinement SERVER
half · IntegrationRegistry tier (a) · outbox `source` column · billing pgSchema already exists in
v1.9 contracts (`packages/contracts/db/schema/billing.ts`, read via tenancy's
SubscriptionQueryService — L-10 **extends** it, never recreates) · dormant
`shared.idempotency_keys` table (L-1 builds on it).

- [ ] L-1 **(S)** **IdempotencyGuard** (medscall `03aff446` lineage): `claim/release` primitive +
      `IdempotencyScope` enum + `dedup_records`-on-existing-`idempotency_keys` table + retention
      sweep. The claim-commit-effect discipline goes in the handler skill.
- [ ] L-2 **(S)** Cross-context integration-event relay through the outbox (medscall
      `OUTBOX_SOURCE` relay model) — v1.9 currently dispatches to internalMediator only.
- [ ] L-3 **(S)** Event envelope hardening from berzerk: rehydration parse-through-static-schema
      + typed literal event names; EventEmitter2 fan-out instance-identity dedup + surfaced
      handler errors.
- [ ] L-4 **(M)** Go `@union` SDK half (medscall passes 5–6): `z.discriminatedUnion` rewrite +
      variant-accessor maps keyed on `x-tpl-discriminators`; hook after `safeBuild` — mind the
      `normalizeForKubb` const→enum trap (read pre-normalized spec). Plus medscall's emitter
      regression harness (golden-invariant + byte-idempotency tests) and the ServerEvent
      synthesis if/when template exposes SSE.
- [ ] L-5 **(M)** Wire compiler (medscall `9f843d79`): client-half zod-refinement inlining
      (RefinementFilter + TS-AST free-identifier walk) + kubb ts-morph injection.
- [ ] L-6 **(M)** Berzerk notification-preferences **registry-versioning + hidden fields**
      pattern → generic preferences canon (registry-as-version, `fromJson` normalization,
      `RedactableFieldsOf`); wire into notifications context + skill.
- [ ] L-7 **(M)** Berzerk mobile kit: `mobile-patterns` skill + geometry tokens/primitives
      (ScreenFooter/KeyboardAware/KeyboardBar), perceived-speed lib (`use-refresh-control`,
      `retryQuery`), sheet shape catalogue into sheet skill (+ `--gate` CLI preset; back-port
      SHT-P05 to berzerk). Glass system optional.
- [ ] L-8 **(M)** bk-dash lifts from `feat/bk-dash-polyglot` (later branch): IntegrationRegistry
      tiers (b) platform-descriptor discriminated-union registry + (c) `(type,platform)` behavior
      factories; dashboard discriminated-union read model (`variant()` composer +
      `StoreVisualization`) as Tier-3 exemplar.
- [ ] L-9 **(XS)** Context-boundary guard test pattern (medscall `context-boundary.test.ts`) as a
      per-context scaffold + skill rule.
- [ ] L-10 **(L)** **Billing + quota as generic Tier-2 contexts** (medscall extraction) —
      **COMMITTED GO (user, 2026-07-11)**: ledger + derivers + engine + webhook ingest skeleton;
      ports (`PaymentProvider`, `QuotaCounter`, `ResourceGovernor`); `PlanRegistry`/`QuotaKey` as
      product plugs; keep 2–3 reference adapters (Stripe + sandbox). Depends on L-1; extends the
      existing v1.9 billing pgSchema (trap list). **Biggest item — its own `/brainstorm` → two
      specs (billing, quota) is the expected split**; upstream-check against
      `feat/billing-idempotency` at extraction time.

## Wave 2 — Reconcile downstreams against the updated canon

- [ ] R-1 Berzerk: `git merge upstream/v1.9` (shared history; ONE bulk catch-up), resolve, full
      gates. Then adopt-by-plug what it wants (billing/quota per ECOSYSTEM.md §6-B).
- [ ] R-2 Medscall: manifest-mapped file sync of Tier-1 surface (hand-driven this once; Plan 2
      automates), keeping its layout. Upstream-check: anything in `feat/billing-idempotency`
      newer than L-10's extraction flows up. **Hand-adaptation required (NOT file-syncable):**
      `scripts/graph` core (rides on M-7), the `--labels` block (template's modular `labels.ts`
      won't slot into medscall's pre-modular monolithic `cli.ts` — needs the CLI modularization
      or a targeted rewrite), and the `mechanical:/detect:` annotation backfill in its skill
      registries (classify-edit hook is wired but annotations are absent).
- [ ] R-3 Pin sync points: record template SHA per downstream (consumed by Plan 2's manifest).
- [ ] R-4 Final sweep: re-run the audit's grep-guards; act-now table empty; both downstreams'
      full suites green; write the pins into `sync.yaml` (Plan 2).

## Verification map (program-level)

| Check | Command |
|---|---|
| Template gates | `bun tsc && bun lint && bun run test && bun sdk` |
| Berzerk gates | same, in-repo (982+ tests baseline) |
| Medscall gates | its suite + `bun review --all` (first full-coverage run) |
| No re-drift during program | diff shared surface vs template HEAD at each wave end |
