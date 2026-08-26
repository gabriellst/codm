# Pattern Cohesion Audit & the Pattern Atlas — design

> **Date:** 2026-06-08
> **Question answered:** Is the cross-cutting pattern knowledge in the e-commerce fork's ~40 skills
> cohesive and AI-inferable, or contradictory/ambiguous? And how do we structurally
> represent it so it is "upright easy to understand and maintain"?
>
> **Method:** 53-agent workflow over all 16 backend (TS) + 5 frontend skills + a Go-vs-TS
> cohesion pass. Four phases: discover cross-cutting axes → extract each skill's cell per
> axis → cross-check every axis for contradictions/gaps → synthesize. Every high-severity
> claim cited below was **independently re-verified by grep against the repo** (see §6).

---

## 1. TL;DR verdict

**Locally coherent, globally contradictory.** Each skill's own `registry.yaml` is a competent
playbook — an AI handed *one* skill can scaffold that artifact correctly. But the moment a rule
**spans layers** (where a VO drops `.input()`, which error union a `.refine()` casts to, who
writes a read model, where an event is born), the guidance fractures: the same decision is
restated in 3–6 registries, the copies have **already drifted**, and several "canonical"
examples teach the exact anti-pattern a sibling skill flags as critical.

The headline metric, across the **29 cross-cutting axes** we identified:

| | |
|---|---|
| Axes that are **fully** AI-inferable from current docs today | **1 / 29** |
| Axes only **partially** inferable (right answer requires reading ≥2 skills + guessing which copy wins) | **28 / 29** |
| Total non-trivial findings | **135** — 46 high · 50 med · 39 low |
| …of which **contradictions** | 30 |
| …**gaps** (artifact silent where it must decide) | 34 |
| …**ambiguities** (vague `when:`, AI could pick wrong) | 33 |
| …**divergent-naming** (same concept, N spellings) | 20 |
| …**duplication** (same rule in N registries, drift risk) | 18 |

**Root cause is singular:** the knowledge is **artifact-indexed** (40 files, each owning its
slice of every axis) with **no axis having a single canonical owner**. So every cross-cutting
rule exists as N independent copies with no signal which is authoritative when they disagree —
and they disagree ~25 times. This is not 40 unrelated bugs; it's one structural miss repeated.

**The user's instinct is correct.** The matrix you sketched (`usecases → schema.input()`,
`entities → z.instance`, `controllers → usecase.omit`) is **real**, **load-bearing**, and
**lives nowhere as a first-class artifact** — it must be mentally reconstructed from 16 files
every time. That reconstruction is exactly where AIs (and humans) get it wrong.

---

## 2. The matrix is real — and already half-built in one skill

Your sketch is the **VO-REPR / SCHEMA-DERIVE** axes. They are genuinely scattered:

| Layer | id field | VO field | how it builds its schema |
|---|---|---|---|
| **entity / value-object** | `z.instance(Id)` | `z.instance(VO)` | owns the source schema; migration derived from it |
| **use case** | `z.uuid()` | `VOSchema.input()` *(composite only)* | plain `InputSchema`, **no** `.refine()` |
| **controller** | `z.string()`/`z.uuid()` *(inconsistent)* | `.input()` composites; `z.email()` | `UseCaseInputSchema.omit({injected})` + `.refine()` after omit |
| **event** | `z.uuid()` | `EntitySchema.input()` + `toJSON` | full snapshot, wire-safe |

Tellingly, the **schema** skill already has a pattern literally named **`SCH-C06` "VO schema
usage by layer"** — the team *started* building this matrix inside one skill. But it's invisible
from the other 15, so the other 15 each re-derived (and mis-stated) their cell.

---

## 3. The 15 verified high-severity contradictions

Each was confirmed against the repo. `→` is the prescribed fix.

| # | Contradiction | Skills | Fix |
|---|---|---|---|
| 1 | **`z.nativeEnum` prescribed in `route`** (`RTE-P02/P06`, both flat+react files) — violates the project-wide `z.enum()` ban restated in 5+ skills; global detector `cc-bp-16` omits `z.nativeEnum` so it's never flagged. | route, enum, controller, usecase, entity, vo | Rewrite to `z.enum()`; add `z.nativeEnum` to `cc-bp-16.wrong`. |
| 2 | **`addEvent()` is fictional** — entity `ENT-P15` says aggregates raise via `this.addEvent()`; **0** usages exist. Real TS idiom: the *use case* builds the event inline after `entity.save`. Go genuinely differs (entity-born via `AddDomainEvent`/`PullDomainEvents`) — undocumented as intentional. | entity, usecase, handler, event | Pick TS canon; document the TS↔Go event-birth-site divergence. |
| 3 | **`as DrizzleClient` cast taught in usecase `SKILL.md:248,253`** — the exact cast `repository bp-11` (critical) + `bp-12` forbid, and Non-Negotiable #1 bans. Axis spec even references a `client(tx)` helper that exists nowhere. | usecase, repository, handler, projection, projector | Source tx-threading **once** in repository (`tx ?? this.db`, no cast); back-fix usecase. |
| 4 | **Read-model write taught two ways** — `handler` SKILL shows `readModelRepo.upsert()` directly; `projector` (`PRJTR-07/08/09`) owns it via `find→applyEvent→save`. AI reading handler first never reaches for a Projector. ProjectionRepository rules are **prose-only**, zero registry IDs → `bun review` can't enforce. | handler, projector, projection, repository | Re-frame handler example; add `REP-*` patterns for the ProjectionRepository surface. |
| 5 | **Frontend enum→label/locale contradict the package** — component `CMP-P07/P08` import the **dead** `@/lib/labels` map the enum skill declares dead (i18n is canon); `route bp-11` + `component bp-15` hardcode `{ locale: ptBR }` against the "never hardcode locale / `useLocale()`" rule. No artifact owns enum→**color**. | component, enum, route, form, primitive | Purge `@/lib/labels` examples; rewrite to `useLocale()`+`Intl`; give enum→color a `Record<Enum,…>` home. |
| 6 | **Dialog ownership** — `CMP-P13/P14` + root form `FRM-P11/P12` teach local `useState` + `open/onOpenChange`; the live react variant + store skill mark that **`bp-18` critical** and mandate `useDialogStore.show()/hide()` (commit `ab54b977b` already moved to a store). The dispatch hub teaches what its only live variant bans. | component, form, store | Rewrite root/hub patterns to the store idiom. |
| 7 | **SDK import named 3 ways, 2 don't resolve** — `FRM-01` says `'@sdk'`; `CLAUDE.md:252` says `'@template/monorepo-sdk/app'`; **138 real files** use `'@template/client-typescript/typescript'`. `@sdk` = 0 usages. Also: frontend enum rules physically live only in the **backend** `enum/typescript` registry → the frontend dispatcher never loads them. | form, route, component, store, enum | Normalize the specifier; add a `fetch(` detector; add an enum/react variant. |
| 8 | **`.input()` on a primitive VO** — usecase `UC-P10` uses `CPFSchema.input()`/`EmailSchema.input()` on primitive (`z.string().refine`) VOs; schema `bp-07` lists exactly that as WRONG (typed no-op). The discriminator (`.input()` only on `z.object` composites) is correct in schema but invisible where usecase/controller authors decide. | usecase, schema, controller, vo | Source the VO-REPR layer rule + email-tier rule **once** in schema; fix `UC-P10`. |
| 9 | **Controller `.refine()` union self-contradicts** — mandates `InterfaceErrors` in 3 places but `CTRL-C12` casts `ApplicationErrors`. The **handler** skill prescribes *no* typed error union at all → a handler raising its own invariant has no idiom. | controller, handler, errors, schema | Fix `CTRL-C12`; give handler an `ApplicationErrors` rule; add a layer→union table. |
| 10 | **Naming / registration knowledge has no enforceable home** — ubiquitous-language rules (`platform`/`status`/`*ExternalId`/`XQueryService`) live **only** in `CLAUDE.md:487`'s one-time porting section, never as a review-able `bad_practice`. A per-file reviewer cannot reject `providerId`/`externalStatus`. | repository, query, entity, handler, enum, controller, bc | Promote into standing regex-backed `bad_practices`. |
| 11 | **Repository finder param type contradicts itself** — `REPO-02`/skeleton type finders `id: string`; `REPO-P01/P14/P15` type `id: Id`. Separately, the "external/auth id stays `z.string()`" discriminator lives **only** in `CLAUDE.md` + axis text — no skill states it. | repository, entity, schema, vo, controller, event | Align finder convention; add the foreign-domain-ref vs external-id discriminator with a `userId`-vs-`externalId` example. |
| 12 | **Composition-first discriminated BFF recipe exists ONLY in uncommitted user-memory** — the canonical authoring shape (named fragments + `variant(kind,…)` + single `z.discriminatedUnion('kind')`) returns **0 hits** across all committed skills. A fresh AI cannot reproduce it and would pile `.optional()` — the exact anti-pattern the memory forbids. | query, schema, controller, component | Promote the memory note into committed `query`/`schema` patterns. |
| 13 | **Middleware injects `DrizzleClient`** above the infrastructure boundary (only sanctioned exemption is BFF query use cases), while `MID-P01` says "inject repository ports." Service skill is **fully silent** on Drizzle/tx. | middleware, usecase, handler, repository, query, service | Add an auth-bootstrap carve-out + a `bp` flagging non-auth Drizzle injection; give service a rule. |
| 14 | **`usecase bp-01` reads as a blanket ban on read-named classes extending `Handler`, but `query QRY-P01` requires exactly that.** The only disambiguator (path `<ctx>/usecases` vs `ui/usecases`) is enforced in `scripts/review.ts` routing, not in either skill's text. | usecase, query | Cross-reference: `bp-01` fires only in write contexts; queries are reads **by path**. |
| 15 | **Go duplicates format validation across both layers and self-contradicts** — TS: controller is the sole format-validation site; Go: validate tags on **both** controller request struct and use-case Input struct, and `usecase-go SKILL.md:29` ("not in Execute") contradicts its own Step 1 (lines 47-49). | controller, usecase, handler (Go) | Decide Go placement explicitly; resolve `usecase-go:29` vs Step 1. |

---

## 4. The full Pattern Atlas (hierarchy)

This is the centerpiece deliverable — the matrix you sketched, made complete. Markers:
`[CONTRADICT]` = two skills disagree · `[GAP]`/`SILENT` = no rule where one is needed ·
`[uncovered]` = a real, recurring decision **no skill currently names** (candidate new axes).

```
PATTERN ATLAS — the e-commerce fork (DDD+CQRS polyglot, ~40 skills)

backend (TS + Go; Zod/DDD matrix)
├─ entity (AggregateRoot/BaseEntity/BaseValueObject)
│  ├─ ID-REPR ............... reference id to a DOMAIN aggregate → z.instance(Id); external/auth/platform id → z.string() [DISCRIMINATOR UNSTATED]
│  ├─ ENUM-REPR ............ z.enum(EnumObject); never z.nativeEnum(); never z.enum(['a','b'])
│  ├─ VO-REPR .............. embedded VO field → z.instance(VO); email → z.instance(Email)
│  ├─ SCHEMA-DERIVE ........ entity owns static schema; migration DERIVED from it; no .refine() that will be .omit()'d downstream
│  ├─ OPTIONALITY .......... lifecycle status default set in create(), NEVER schema-level .default() (rehydration hazard)
│  ├─ ERR-VOCAB ............ entity/VO raise DomainErrors via BaseError<DomainErrors>('CODE'); { error } not { message }
│  ├─ VALIDATION-PLACEMENT . self-validate primitives via static schema; cross-field invariant via .refine() (TS) / if-check (Go)
│  ├─ CLASS-BASE ........... AggregateRoot(own tx) vs BaseEntity(child) vs BaseValueObject(identity-less child) [Go: 1 base, comment-only]
│  ├─ EVENT-EMISSION ....... [TS REALITY: entity raises NOTHING — use case builds event inline; ENT-P15 addEvent is fictional] / [Go: AddDomainEvent + PullDomainEvents]
│  ├─ TELL-DONT-ASK ........ guard reads INPUT presence = OK; guard reads ENTITY state = move inside method
│  ├─ WIRE-EXPOSURE ........ entity schema NEVER registerSchemas (full fields + .refine() source leak)
│  └─ [uncovered] CONSTRUCTION-LIFECYCLE (create=new vs ctor=rehydrate), VERSIONING, AGGREGATE-COLLECTION-API, FIELD-DECLARATION
├─ value-object (BasePrimitiveValueObject / BaseValueObject)
│  ├─ ID-REPR / VO-REPR .... z.instance(Id); nested VO → z.instance(VO) [bp-07 vs VO-C11 CONTRADICT on .input().transform]
│  ├─ ENUM-REPR ............ config enum may carry schema .default(Currency.BRL) (wire is authoritative)
│  ├─ CLASS-BASE ........... primitive=z.string().refine; composite=z.object; base import @template/core-typescript [bp-05 stale @shared/objects]
│  └─ [uncovered] VALUE-EQUALITY, SERIALIZATION (toJSON), DOMAIN-FORMATTING (format()), IMMUTABILITY, CONSTRUCTION-PATTERNS
├─ enum (pgEnum-paired)
│  ├─ ENUM-REPR ............ KEY='VALUE' SCREAMING_SNAKE mirror; z.enum(Enum); cc-bp-16 owns global ban [misses z.nativeEnum]
│  ├─ CENTRALIZE-MAPS ...... label → i18n t(`enums.X.VALUE`); lib/labels.ts DEAD; color/variant → Record<Enum,…> in @/lib [NO OWNER]
│  ├─ OPTIONALITY .......... schema enum .default ONLY for config; lifecycle status in create()
│  └─ [uncovered] CONTRACT-OWNERSHIP (contracts wire-enum vs ctx-local), STATE-MACHINE, EXTERNAL-STANDARD-VALUES
├─ errors (4-tier unions: Domain/Application/Interface/Infrastructure)
│  ├─ ERR-VOCAB ............ named code + HTTP status + i18n key; never throw new Error/{message} [Go: flat single union]
│  ├─ WIRE-EXPOSURE ........ frontend translation at app/REACT/src/lib/errors.ts [skill says app/WEB — STALE PATH]
│  └─ [uncovered] REGISTRY-EXTENSION, EMPTY-CATEGORY (=never placeholder), UNIFIED-UNION-EXPORT, DEAD-VOCAB-PRUNING
├─ schema (shared/objects, shared/schemas, ctx/schemas) — DEPENDED_BY controller+usecase
│  ├─ ID-REPR .............. z.instance(Id) idiom OWNED here (entity/VO should reference, not restate)
│  ├─ VO-REPR .............. .input() ONLY on z.object() composites; primitive VO referenced directly (.input() = typed no-op)
│  ├─ SCHEMA-DERIVE ........ compose-over-redeclare; controller = UseCaseInputSchema.omit({injected}) [NOT STATED here]
│  ├─ ERR-VOCAB ............ { error:'CODE' as <layer-union> }; layer→union table MISSING
│  ├─ WIRE-EXPOSURE ........ registerSchemas = shared/* VOs+DTOs ONLY; 3-part wire-safety test
│  └─ [uncovered] WIRE-COERCION (stringTo* at query boundary), PAGINATION-CONTRACT, OPENAPI-DOCS (.example), EXTRACTION-THRESHOLD
├─ usecase (command; Handler<I,O>)
│  ├─ SCHEMA-DERIVE ........ InputSchema/OutputSchema = callable contract; NO .refine() (bp-07); NO format validation (controller did it)
│  ├─ VO-REPR .............. [UC-P10 CONTRADICTS schema bp-07: CPFSchema.input() on a primitive VO]
│  ├─ ERR-VOCAB ............ ApplicationErrors via BaseError; tenant-mismatch → same NOT_FOUND (no existence leak)
│  ├─ TRANSACTION .......... withTransaction at use-case layer; thread tx to repos [SKILL.md teaches stale `as DrizzleClient` cast — bp-12 forbids]
│  ├─ EVENT-EMISSION ....... build event inline after entity.save → domainEventRepository.save(event,tx); NEVER mediator.publish (outbox)
│  ├─ CQRS-SIDE ............ command lives in <ctx>/usecases; List* must NOT extend Handler HERE [identical shape REQUIRED in ui/usecases]
│  ├─ TELL-DONT-ASK ........ [UC-P11 single update({spread}) vs SKILL N per-field calls — no when:]
│  └─ [uncovered] OUTPUT-DTO-SHAPE (z.void/{id}, never entity), ORCHESTRATION-PERF, AUTHZ-IN-USECASE, SAGA
├─ query (BFF/read; ui/usecases, Handler<I,O>) — CQRS read side
│  ├─ CQRS-SIDE ............ read = ui/usecases; extends Handler (correct here); direct Drizzle, no entities
│  ├─ DISC-UNION ........... composition-first BFF: named fragments + variant(kind,…) + z.discriminatedUnion('kind') [OWNED ONLY IN USER MEMORY]
│  ├─ NAME-CONSISTENCY ..... Get<X> singular / List<X> plural [QRY-P14 misattributed; rule is example-only]
│  ├─ INFRA-LEAK ........... BFF EXEMPTION: query use case may inject db:DrizzleClient directly
│  ├─ WIRE-EXPOSURE ........ BFF output = wire DTO by construction; emitted inline, NOT registerSchemas
│  └─ [uncovered] PAGINATION (count OVER + mapWith(Number)), QUERY-SAFETY (ILIKE escape), QUERY-COMPOSITION, OUTPUT-SHAPING
├─ controller (HTTP port; @injectable)
│  ├─ ENUM-REPR / VO-REPR .. z.enum(Enum); VOSchema.input() on composites only; email → z.email()
│  ├─ SCHEMA-DERIVE ........ body: UseCaseInputSchema.omit({injected}); reuse OutputSchema; .refine() AFTER omit
│  ├─ ID-REPR .............. wire id z.string() vs z.uuid() [INCONSISTENT, no rule]
│  ├─ ERR-VOCAB ............ .refine() → InterfaceErrors [CTRL-C12 casts ApplicationErrors — CONTRADICTS]
│  ├─ NAMING ............... [THREE names: XInputSchema / ControllerInputSchema / UpdateXControllerInput]
│  ├─ CQRS-SIDE ............ reads = GET not POST (CTRL-P07)
│  └─ [uncovered] WIRE-INPUT-ENVELOPE (only body/query/params/ctx at root), QUERY-COERCION, RESPONSE-SHAPE, AUTH-IDENTITY-SOURCE, MOCK-FIRST
├─ repository (port + Drizzle impl)
│  ├─ ID-REPR .............. [REPO-02 id:string vs REPO-P01/P14/P15 id:Id — CONTRADICT]
│  ├─ INFRA-LEAK / TRANSACTION  port tx?:Transaction; Drizzle impl redeclares tx?:DrizzleClient; tx ?? this.db, no `as`
│  ├─ ERR-VOCAB ............ tryCatchAsync Result-wrap; !success→undefined / throw
│  ├─ PROJECTION-MUTATION .. ProjectionRepository = findByKey/save/insertIfNew; atomic op needs trigger comment [PROSE ONLY, no registry IDs]
│  └─ [uncovered] CONCURRENCY-VERSIONING, PERSISTENCE-MAPPING (toDomain/toPersistence), UPSERT-STRATEGY
├─ service (abstract port + impl)
│  ├─ ERR-VOCAB ............ re-surface service errors; own invariant → ApplicationErrors
│  ├─ INFRA-LEAK ........... [SILENT: no Drizzle/tx guidance — gap]
│  ├─ TRANSACTION .......... [SILENT: thread tx? or caller's UoW? — gap]
│  └─ [uncovered] STATELESSNESS, GRANULARITY, PROVIDER-FACTORY, GENERIC-PORT, STRATEGY-PROTOCOL, STATIC-REGISTER-HOOK
├─ event (domain InternalMediator / integration ExternalMediator)
│  ├─ NAMING ............... 3-part context.entity.action [snake_case vs camelCase action — INCONSISTENT]
│  ├─ EVENT-EMISSION ....... [EVT-C01 "published via InternalMediator" misleads — outbox-delivered, author never .publish]
│  ├─ WIRE-EXPOSURE ........ integration event crosses wire; full-snapshot via EntitySchema.input()+toJSON, no delta
│  └─ [uncovered] STATIC-METADATA, CONSTRUCTOR-SHAPE (entityId vs ownerId), PAYLOAD-SHAPE, EVENT-PAYLOAD-COMPLETENESS
├─ handler (internal.ts / external.ts; Go _handler.go / _integration_handler.go)
│  ├─ ERR-VOCAB ............ [GAP: no typed-union idiom stated; only logging/propagation]
│  ├─ EVENT-EMISSION ....... reacts to events; publishes integration via ExternalMediator.publish; never publishes domain
│  ├─ ASYNC-INLINE ......... async via outbox default
│  ├─ PROJECTION-MUTATION .. [CONTRADICTS projector: handler.upsert read-model directly vs projector.applyEvent]
│  ├─ VALIDATION-PLACEMENT . [HDL-P06 external idempotency check vs bp-02 entity-owned — no when:]
│  └─ [uncovered] IDEMPOTENCY (redelivery), INGEST-PIPELINE (webhook choreography), ONE-SHOT-STREAM, FAILURE-MODE
├─ projection (free record; schema-driven, no invariants)
│  ├─ ENUM-REPR / OPTIONALITY  flat schema; create() writes literal nulls per event [NOT generic defaults — bp-prj-03]
│  ├─ PROJECTION-MUTATION .. find→applyEvent→save canon; overloaded create()/applyEvent() switch(event.name) [Go: per-event ApplyX]
│  ├─ DISC-UNION ........... plain switch(event.name)+never, NOT Record map
│  └─ [uncovered] ARCHETYPE-SELECTION (A/B1/B2/C/D), DENORM-LEVEL, OVERLOAD-DISPATCH, ARTIFACT-NECESSITY-GATE, SCHEMA-DB-PARITY
├─ projector (one per projection; @injectable, single dep)
│  ├─ PROJECTION-MUTATION .. owns read-model write via find→applyEvent→save; atomic op only with justified trigger
│  ├─ ASYNC-INLINE ......... async via outbox default; inline iff payload depends on projection read [RULE ONLY IN typescript registry, root hub empty]
│  ├─ DISC-UNION ........... switch(event.name)+default:never; bans Record dispatch [INVERSE of frontend CENTRALIZE-MAPS]
│  └─ [uncovered] CARDINALITY (1 per projection), DEPENDENCY-SURFACE (exactly 1 dep), REPLAY-SAFETY, COUPLING-SCOPE
├─ middleware (@singleton — only citizen that is)
│  ├─ ERR-VOCAB ............ identity-parse → BaseInterfaceErrors('UNAUTHORIZED'); flow guard → ApplicationErrors [dual-union, rule unstated]
│  ├─ INFRA-LEAK ........... [AuthMiddleware injects DrizzleClient — CONTRADICTS boundary, no carve-out]
│  ├─ DI-REG ............... @singleton(); registers via middlewares/index.ts default-export ARRAY
│  └─ [uncovered] CTX-ENRICHMENT (spread-merge), MIDDLEWARE-COMPOSITION (override/skip), RESPONSE-PASSTHROUGH, STATUS-SEMANTICS
├─ bounded-context (registry.ts INSTANCE_REGISTRY)
│  ├─ DI-REG ............... {token,instance} env-keyed mock/integration/real for PORTS only; @injectable auto-resolved [Go: no 3-env split]
│  └─ WIRE-EXPOSURE ........ bp-05 mechanical registerSchemas detector (single source)
└─ test (4 layers: unit/repository/usecase-handler/flow)
   ├─ TEST-MODE ............ unit=none, repo/usecase/handler=integration(PGlite), flow=mock; given* seed via repos not use cases
   │                         [handler split integration vs flow-mock unstated; query/middleware mode unprescribed]
   └─ [uncovered] TEST-ISOLATION (reset≠truncate), TEST-LIFECYCLE, ASSERTION-QUALITY, TEST-DOUBLES, DETERMINISM, testId factory

frontend (react / expo / astro)
├─ component (route-scoped, owns its data; <route>/-components/)
│  ├─ DATA-OWNERSHIP ....... each component owns data; no prop-drilling [EXCEPTION: dialog receives fetched entity — FRM-P36]
│  ├─ SDK-CONSUME .......... '@template/client-typescript/typescript'; never raw fetch [NO mechanical detector]; never parallel schema
│  ├─ MUTATION-IDIOM ....... mutateAsync onSuccess→toast / onSettled→invalidate; no try/catch; no per-mutation onError [bp-05b shows onError — CONTRADICTS form bp-29]
│  ├─ CENTRALIZE-MAPS ...... [CMP-P07/P08 @/lib labels DEAD; enum skill mandates i18n — CONTRADICT]
│  ├─ LOCALE-MONEY ......... useLocale()+Intl; useMoney() / formatMoneyValue for BFF union [bp-15 hardcodes ptBR — CONTRADICTS package rule]
│  ├─ DISC-UNION ........... CMP-P18 write-side variant map; read-side deep-access-without-narrow [PROSE ONLY, no registry pattern]
│  ├─ DIALOG-OWNERSHIP ..... [CMP-P13/P14 local useState+open/onOpenChange — CONTRADICTS store/form bp-18]
│  ├─ PRIMITIVES-A11Y ...... Spinner(pending) vs Skeleton(loading); icon-only aria-label; ComponentProps<root>+cn
│  └─ [uncovered] DRY-LOCAL-EXTRACTION, CLASS-COMPOSITION (cn), SLOT-VS-PROPS, I18N-TYPED-KEYS, SKELETON-CONTRACT-PARITY, SCAFFOLD-FIRST
├─ form (TanStack Form + SDK schema)
│  ├─ SDK-CONSUME .......... validators = xMutationRequestSchema [FRM-01 says '@sdk' — WRONG specifier]; .and() to add, never .extend()
│  ├─ DISC-UNION ........... discriminant selector + per-variant member schema; never all-optional flat (FRM-P43/P44)
│  ├─ DIALOG-OWNERSHIP ..... useDialogStore.show()/hide(); no open/onOpenChange [root flat registry FRM-P11/P12 STALE]
│  ├─ MUTATION-IDIOM ....... no onError (MutationCache global); no try/catch (bp-06); combined isPending
│  ├─ CENTRALIZE-MAPS ...... enum-driven <Select enum= i18nPrefix=> (FRM-P38) [vs ENUM-P11 manual SelectValue — CONTRADICT]
│  └─ [uncovered] FORM-DEFAULTS+SUBMIT-GATE, useForm-no-typearg, INPUT-MASKING, WIZARD, NUMERIC-DISPLAY (cents/100), AUTH-FORM-SPECIAL
├─ route (URL contract shell; thin)
│  ├─ ENUM-REPR ............ [RTE-P02/P06 z.nativeEnum — CONTRADICTS project ban, in BOTH flat+react files]
│  ├─ DATA-OWNERSHIP ....... thin shell; defers data to components; layout-loader fetch only (RTE-P10)
│  ├─ SDK-CONSUME .......... .and() not .extend() (.extend clobbers SDK .default/.refine)
│  ├─ LOCALE-MONEY ......... [bp-11 hardcodes ptBR — CONTRADICTS package rule]
│  └─ [uncovered] ROUTE-SHELL-LAYOUT, PAGE-METADATA (breadcrumb/staticData), URL-VS-CLIENT-STATE, LOCALIZED-ROUTING
├─ primitive (@/components/ui; CVA + Base UI)
│  ├─ PRIMITIVES-A11Y ...... data-slot on every root; forwardRef+named fn; tokens from @template/app-styles [size 'default' vs 'md' INCONSISTENT]
│  ├─ CENTRALIZE-MAPS ...... CVA variant maps; enum-driven Select overload [NOT documented in primitive skill — gap vs FRM-P38]
│  └─ [uncovered] FORWARDREF-COMPOSITION, SLOT-MARKERS, REFERENCE-SOURCING (shadcn→Base UI), STORY-COVERAGE, POLYMORPHIC-RENDER
└─ store (Zustand)
   ├─ DATA-OWNERSHIP ....... runtime-resolved non-shareable id → store; user-picked bookmarkable → URL [discriminator unstated]
   ├─ DIALOG-OWNERSHIP ..... useDialogStore canonical; boolean isXOpen sparing escape-hatch [STR-P08 vs bp-05 render shape differ]
   ├─ TELL-DONT-ASK ........ [STR-P03 thin setter vs STR-P09 smart action — no when:]
   └─ [uncovered] DERIVED-STATE, RENDER-SUBSCRIPTION (narrow selector), CLIENT-PERSISTENCE (partialize), STATE-PLACEMENT, STORE-LIFECYCLE

cross-cutting axes spanning families
├─ NAMING ............ ubiquitous language (platform/status/*ExternalId/XQueryService) [ONLY in CLAUDE.md:487 porting section — no enforceable bad_practice]
├─ NAME-CONSISTENCY .. one field name per concept across endpoints [NO owner; emerges only via shared-schema reuse]
├─ LAYOUT ............ barrel semantics differ: silent-registration-fail (controller/handler/projector) vs reuse-only (entity/usecase/repo) [NO unifying table]
└─ DI-REG ............ registration CHANNELS: INSTANCE_REGISTRY / BoundedContext.create slots / middlewares array / routeTree.gen [NO channel map]
```

---

## 5. Proposed structural representation — the **Pattern Atlas**

> **One sentence:** invert the index. Today knowledge is sliced **by artifact** (40 files);
> add the orthogonal slice — **one entry per axis** — generated from the existing registries so
> it never drifts.

### What it is

A cross-cutting, axis-indexed registry that is a **generated VIEW over the existing
`registry.yaml` files**, not a 5th parallel copy. Each axis names exactly **ONE canonical
owner**, the per-artifact rule, the explicit discriminator for every "it depends," the TS↔Go
mapping, and the carve-outs. Every cell carries `source: <skill>#<patternId>` so the rule TEXT
is always inlined from the live registry — the Atlas **cannot itself go stale**.

### Where it lives

```
.claude/atlas/
  axes.yaml          # hand-authored axis metadata: id, name, family, OWNER, discriminator, exceptions, ts_go_map, cells[].source
  ATLAS.md           # GENERATED read-only matrix (rows = axes, cols = artifacts) + one expandable section per axis
  atlas.lock.json    # GENERATED reverse-index (axis → [skill#patternId…]) for drift detection
scripts/atlas.ts     # parses every <skill>/**/registry.yaml, resolves each cell's source, inlines current rule text, emits ATLAS.md + lock
```

### Sample `axes.yaml` entry

```yaml
- id: VO-REPR
  name: Value-object field representation
  family: backend
  owner: schema#bp-07            # SINGLE canonical owner; all other cells reference, never restate
  discriminator: ".input() ONLY on z.object() composite VO schemas; primitive VO (z.string().refine) referenced directly — .input() on it is a typed no-op"
  cells:
    entity:       { rule: "embedded VO field -> z.instance(VO)", source: entity#bp-12 }
    value-object: { rule: "composite -> BaseValueObject; primitive -> BasePrimitiveValueObject", source: value-object#VO-C11 }
    usecase:      { rule: "composite VO -> AddressSchema.input(); primitive VO -> CPFSchema (no .input())", source: usecase#UC-P10, status: VIOLATES_OWNER }
    controller:   { rule: "PhonePlainSchema.input(); CPFSchema direct; email -> z.email()", source: controller#CTRL-P12 }
    event:        { rule: "entity-embed -> EntitySchema.input()+toJSON", source: event#bp-05 }
  exceptions:
    - "email is tiered: z.instance(Email) @entity | EmailSchema.input() @use-case | z.email() @controller"
  ts_go_map: "TS .input()/z.instance(VO)  <=>  Go: hand-mapped struct fields, no schema-composition vocabulary (SCHEMA-DERIVE gap)"
  contradictions:    # AUTO-FILLED by generator from status:VIOLATES_OWNER + text-hash mismatch
    - "usecase#UC-P10 applies .input() to a primitive VO that owner schema#bp-07 forbids"
```

### Why it's more knowledgeable for an AI

- **One lookup** answers "where does `.input()` go," "which union does a controller `.refine()`
  cast," "who writes a read model," "TS event-birth-site vs Go" — instead of loading 16 skills
  and guessing which copy wins.
- Surfaces the **explicit discriminator** for every "it depends" axis (config-enum-default vs
  lifecycle-status, input-presence-guard vs entity-state-guard, Record-dispatch vs
  switch-exhaustiveness) — currently written nowhere.
- Names a **single canonical owner** per axis, so the AI knows which rule to obey on conflict.
- The generator **guarantees** the inlined text matches the live registry — eliminating the
  drift that produced ~25 of these findings.
- Surfaces the **~13 uncovered axes** no skill currently owns.

### Why it can't drift (the whole point)

Rule text is **never duplicated** in the Atlas — only inlined from the sourced pattern ID.
Only `axes.yaml`'s axis-level facts (owner/discriminator) are hand-owned, and those change
rarely. `scripts/atlas.ts` runs in `bun review`/CI; the build **fails** if (a) a referenced
pattern ID vanished, or (b) two cells of one axis cite registries whose sourced rule-text hashes
diverge — catching the next "usecase copy drifted from schema" automatically. The per-skill
registries stay the editing surface engineers already use.

---

## 6. Verification (so you can trust §3)

Re-checked by grep, all **confirmed true**:

| Claim | Check | Result |
|---|---|---|
| route prescribes `z.nativeEnum` | `grep -rn nativeEnum .claude/skills/route/` | 4 hits (`RTE-P02/P06`, flat + react) ✅ |
| usecase teaches `as DrizzleClient` | `usecase/typescript/SKILL.md:248,253` | `(transaction \|\| this.db) as DrizzleClient` ✅ |
| `@sdk` specifier doesn't resolve | `grep -rln "from '@sdk'" packages/app/react/src` | **0** usages; 138 use `@template/client-typescript` ✅ |
| `addEvent()` is fictional | `grep -rn "\.addEvent(" packages/api/typescript/src` | **0** usages; entity SKILL references it ✅ |

---

## 7. Prioritized roadmap

**Phase 1 — stop the bleeding (low effort, high impact): correct the contradictions that
actively teach AIs the wrong thing.** Items 1, 3, 6, 7, 8 in §3 — each is a few-line edit to
a skill file. These are the ones where the "canonical" example is itself the anti-pattern.

**Phase 2 — give every axis ONE owner (med effort, high impact).** For each of the 29 axes,
pick the canonical owner (the crosscheck `fix:` already names it), move the rule there, and
replace the N copies with a one-line reference. This is the structural fix; it's what makes the
remaining ~25 findings stop recurring.

**Phase 3 — build the Atlas (med/high effort, high impact).** Author `axes.yaml`, write
`scripts/atlas.ts`, wire drift-detection into `bun review`/CI. Now the matrix is inferable in
one read and provably can't drift.

**Phase 4 — mechanical hygiene (med effort, med impact).** De-collide cross-skill `bp-NN` IDs
(qualify with skill name or adopt mnemonic IDs); fix stale paths (`app/web`→`app/react`,
`@shared/objects`→`@template/core-typescript`, `@sdk`→real specifier); promote ubiquitous-language
naming into regex-backed `bad_practices`.

**Phase 5 — close the ~13 uncovered axes (high effort, med impact).** Add the recurring-but-
unnamed decisions (OUTPUT-DTO-SHAPE, IDEMPOTENCY, ARCHETYPE-SELECTION, WIRE-INPUT-ENVELOPE,
FORM-DEFAULTS, STATE-PLACEMENT, …) as tagged patterns to their natural owners.

---

*Raw 53-agent output (29 axes × 22 skill extractions × 29 crosschecks) archived at the
workflow task transcript; regenerate via `scripts/cli` equivalent or the workflow at
`$CLAUDE_JOB_DIR/tmp/pattern-atlas.workflow.js`.*
