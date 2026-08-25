# Sync Machinery — Ownership Tiers, Brand Config, Sync Train & Drift Gate

**Date:** 2026-07-11 · **Status:** Approved (2026-07-18)
**Scope:** implements the model in `docs/ECOSYSTEM.md`. Lands ~90% in template-fullstack; thin
adoption commits in the mobile fork + the clinical fork. Prereq: Plan 1 Wave 0 done and sync points pinned (R-3) —
the train must not ship known-divergent files as "canon".
**Research base:** 2026-07-10 deep-research (14 claims, all verified 3-0). Key verified facts used:
repo-file-sync-action's per-target Nunjucks vars + dest-path mapping + one-PR-per-downstream;
`workflow`-scope PAT requirement for syncing `.github/workflows/**`; cruft's `check`-in-CI +
scheduled dual-PR pattern (stolen, hand-rolled — copier/cruft themselves need generated-project
state our forks don't have); Copybara as the deferred ceiling; two-way sync = unsupported
everywhere (Dagster silent-reversion race).

## Phase 1 — Brand parametrization (kills the rebrand-bug class)

- [ ] P1-1 **(S)** `template.config.ts` at repo root (checked in per repo, NOT synced):
      **DECIDED (user, 2026-07-11): template renames its scope (legacy product scope) → `@template`**, and —
      the load-bearing requirement — this kind of identity **must be trivially configurable**:
      changing scope/module/brand is editing ONE file + regen, never a codemod. That elevates
      config-first to a design principle for P1-2: any generator/script/tool that needs a brand
      value MUST read it from the config; a literal is a bug. (Rename lands as part of P1-2's
      de-hardcoding: set the config value, regen `bun sdk`/`bun contracts`, fix package names.)
      ```ts
      export const REPO = {
        scope: '@template',            // '@fork-mobile' | '@fork-clinico' — ONE edit rebrands a fork
        sdkSpecifier: '@template/client-typescript/typescript',
        goModulePrefix: 'template',    // 'fork-mobile' | 'monorepo'
        workspaceRoots: { apiTs: 'packages/api/typescript/src', appReact: 'packages/app/react/src', /* … */ },
        appTargets: ['react', 'expo', 'astro'],
      } as const
      ```
      Go mirror: `packages/api/go/core/repoconfig/` (module prefix const) or generated from the
      TS config — decide in-plan.
- [ ] P1-2 **(M)** De-hardcode the known literal sites (audit-enumerated): CLI generators' SDK
      import emission (react route/component/form + expo sheet — the legacy-scope bug lived here),
      `scripts/review.ts` path prefixes (consume `workspaceRoots`), `scripts/graph/core/config.ts`
      `WORKSPACES` (parametrize roots/scope), Go openapi walker + `ownsSchemaSource` module
      prefixes, `emit-wire-ts` namespace. *Acceptance (post-rename):* (a) grep for the legacy
      scope over the whole repo = **zero hits** (the old scope is fully retired); (b)
      `grep -rn "@template\|template/core-go" scripts packages/api/*/core --include='*.ts'
      --include='*.go'` hits only `template.config.*` + generated output — every brand value
      flows from config, literals are bugs.
- [ ] P1-3 **(S)** Downstream adoption: add each repo's `template.config.ts` values; the mobile fork also
      closes its rebrand gaps (TypeSpec namespace, Go module paths, drizzle default creds —
      audit finding). *Acceptance:* fresh scaffold in each repo emits its own scope everywhere.

## Phase 2 — Manifest + drift gate (makes silent divergence impossible)

- [ ] P2-1 **(S)** `sync.yaml` in template root — the machine-readable shared surface:
      ```yaml
      targets:
        fork-mobile:  { repo: <org>/fork-mobile,  base: <sha-from-plan1-R3> }
        fork-clinico: { repo: <org>/fork-clinico-monorepo, base: <sha> }
      surface:
        - path: scripts/review.ts               # tier: 1
        - path: packages/api/typescript/core/** # tier: 1
        - path: packages/api/go/core/**         # tier: 1
        - path: .claude/skills/**               # tier: 1
        - path: packages/api/typescript/src/billing/**   # tier: 2 (skeleton only)
          exclude: ['**/adapters/**', '**/config.ts']
        - path: scripts/cli/**
          map: { fork-clinico: { 'packages/api/typescript/src': 'packages/api/src' } }  # layout map
      ```
      Tier-3 exemplars and product code are NEVER listed.
- [ ] P2-2 **(M)** `scripts/sync-check.ts`: for each surface file, compare downstream content vs
      template@base (3-way aware: changed-in-template-only = "behind", changed-downstream = DRIFT
      unless the file carries `SYNC-DIVERGENCE:`). Modes: `--check` (exit 1 on unmarked drift,
      grouped report), `--report-json`. Unit tests with fixture trees.
- [ ] P2-3 **(S)** Drift-gate Action in each downstream (`.github/workflows/drift-check.yml`):
      weekly cron + manual dispatch; checks out template@pinned-base (read-only PAT), runs
      `sync-check --check`; on failure opens/updates a single "Drift report" issue. *This
      mechanizes the 57-agent audit into a cron job.*
- [ ] P2-4 **(XS)** `SYNC-DIVERGENCE` / `CONTEXT-ORIGIN` marker conventions documented in
      ECOSYSTEM.md (done) + grep'd by sync-check; add a `bun cli` stamp helper if friction shows.

## Phase 3 — The sync train (propagation)

- [ ] P3-0 **(S)** **Bootstrap downstream CI first** — verified: neither fork-mobile nor
      the clinical fork has ANY `.github/` directory today (template has
      `.github/workflows/correctness.yml`). Create `.github/workflows/gates.yml` in both
      downstreams (tsc + lint + test on PR) — the drift gate (P2-3) and sync-PR validation (P3-3)
      have nothing to run on without it.
- [ ] P3-1 **(S)** Auth — **DECIDED: fine-grained PAT** (GitHub App deferred; solo maintainer)
      with contents+PR write on both downstreams, **`workflow` scope included** (we sync
      `.githooks`+CI files; GitHub refuses workflow-file pushes otherwise — verified failure
      mode). Store as template repo secret.
- [ ] P3-2 **(M)** `.github/workflows/sync-train.yml` in template (push to v1.9/main, paths =
      surface) + `.github/sync.yml` for BetaHuhn/repo-file-sync-action: one group per downstream
      (per-target Nunjucks vars require it — verified limitation) carrying
      `{ scope, sdkSpecifier, goModulePrefix }`; the clinical fork group uses dest-path mapping from
      P2-1's `map`. Template-side: shared files that embed brand strings get `.njk` treatment or
      (preferred) read `template.config.ts` at runtime so most files need NO templating.
- [ ] P3-3 **(S)** Sync-PR CI in downstreams: label `sync-train` PRs, run full gates, comment the
      sync-check delta. Merge stays manual (solo maintainer = you are the review).
- [ ] P3-4 **(S)** End-to-end drill: trivial template change (comment in `scripts/review.ts`) →
      train fires → 2 PRs open with correct branding/paths → merge → drift gate green → bases
      auto-bump (sync-train updates `base` pins via follow-up commit).
- [ ] P3-5 **(XS)** Reverse-flow protocol (manual until Copybara): downstream Tier-1/2 fix →
      `git format-patch` → apply in template → normal train. Documented in ECOSYSTEM.md §7-1.

## Phase 4 — Governance wiring

- [ ] P4-1 **(XS)** `CODEOWNERS` in template per ECOSYSTEM.md §4 (billing/quota = clinical-fork-hat,
      expo/mobile skills = mobile-fork-hat, kernel = template-hat).
- [ ] P4-2 **(S)** House rules into all three `CLAUDE.md`s (upstream-first, whole-commit ports,
      litmus + three legal moves, marker conventions) + a `sync` skill
      (`.claude/skills/sync/SKILL.md`) so agents in any repo know the protocol — including
      "check `sync.yaml` membership before editing" as a hard rule.
- [ ] P4-3 **(XS)** Stamp `CONTEXT-ORIGIN` on existing Tier-3 exemplars in downstreams
      (the mobile fork: contexts copied from template; the clinical fork: n/a predates) — makes provenance
      queryable.
- [ ] P4-4 **(XS)** Remove stale cross-repo docs noise found by the audit (template+mobile-fork
      CLAUDE.md documenting clinical-fork-only `migrate:channel` / `CHANNEL_GLOBAL_API_KEY`).

## Phase 5 — Deferred ceiling (explicit non-goals now)

- **Copybara** only when: structural moves (context-exemplar propagation with import rewrites),
  automatic downstream→upstream PR mirroring, or >5 downstreams. Revisit trigger written here so
  it's a decision, not a drift.
- **Publishing core as versioned packages**: revisit when core interfaces stabilize post-Plan-1
  Wave 1 (the audit shows core still churning weekly — packages would slow the loop today).
- **Copier for FUTURE forks**: new products may be `copier copy`-generated from template so they
  get `copier update` for free; existing forks stay on the train (no `copier adopt` exists —
  verified, issue #2486).

## Acceptance criteria (whole plan)

- [ ] AC-1 A template push touching the surface opens correctly-branded sync PRs in both
      downstreams within one Action run; merging them makes `sync-check --check` exit 0.
- [ ] AC-2 Unmarked manual edit to a synced file in a downstream → next drift run exits 1 and
      opens/updates the drift issue naming the file.
- [ ] AC-3 A `SYNC-DIVERGENCE`-marked file is reported as "ejected", never as drift.
- [ ] AC-4 `grep` acceptance from P1-2 holds in all three repos (no brand literals outside config).
- [ ] AC-5 The Scenario-B flow (ECOSYSTEM.md §6) is executable end-to-end without touching any
      synced file — proven once with a real quota plug in the mobile fork.
- [ ] AC-6 All three CLAUDE.mds carry the house rules; `sync` skill exists and dispatches.

**Estimated:** Phase 1 ≈ 1.5d · Phase 2 ≈ 1.5d · Phase 3 ≈ 1d · Phase 4 ≈ 0.5d → ~4.5 focused days.

---

## Registry design — `sync.yaml` bem-estruturado (refina P2-1) + reverse-flow (P3-5-auto)

> **SUPERSEDED (2026-07-21)** — see "Pull-based sync (LANDED)" below. This section assumed a
> template-side registry (`targets:`) and bidirectional automation (sync-train push + post-commit
> reverse hook). USER DECISION 2026-07-21 inverts the direction: the template is child-agnostic;
> each fork declares the parent in its OWN `sync.yaml`. Kept verbatim for history.

> Adicionado 2026-07-20. O registry é o artefato load-bearing: drift-gate, sync-train E o hook
> de reverse-flow keyam nele. Registry mal-feito = sync mal-feito silenciosamente. A reorg
> de-template (`.plans/2026-07-20-detemplate-reorg.md`) é o pré-requisito — só depois de owner/
> billing/quota estarem no formato genérico é que a fronteira skeleton-vs-plug fica declarável.

### Schema — cada entrada responde 5 dimensões

```yaml
# sync.yaml (raiz do template) — NÃO sincronizado; é o mapa
version: 1
templateRemote: <url-do-template>          # os forks fazem `git remote add upstream <isto>`

targets:
  fork-mobile:
    repo: <org>/fork-mobile
    base: <sha>                            # pin do último sync (Plan 1 R-3)
    brand: { scope: '@fork-mobile', sdkSpecifier: '@fork-mobile/client-typescript/typescript', goModule: 'fork-mobile' }
    layout: {}                             # mesmo layout do template → sem map
  fork-clinico:
    repo: <org>/fork-clinico-monorepo
    base: <sha>
    brand: { scope: '@fork-clinico', sdkSpecifier: '@fork-clinico/client-typescript', goModule: 'monorepo' }
    layout:                                # fork clínico diverge → path map por prefixo
      'packages/api/typescript/src': 'packages/api/src'
      'packages/api/typescript/core': 'packages/channel-adjacent/...'   # ajustar na escrita real

surface:
  - path: packages/api/typescript/core/**            # (1) tier · (2) fronteira · (3) layout(herda) · (4) brand · (5) owner
    tier: 1                                           # 1=verbatim, 2=skeleton, 3=nunca (exemplar)
    owner: template-hat
  - path: scripts/**
    tier: 1
    owner: template-hat
  - path: .claude/skills/**
    tier: 1
    owner: template-hat
  - path: packages/api/typescript/src/owner/**
    tier: 2
    exclude: ['**/config.ts']                         # a granularidade que decide tudo
    brand: [scope]
    owner: template-hat
  - path: packages/api/typescript/src/billing/services/PaymentProvider/**
    tier: 2                                           # adapter = skeleton sincronizado (tua correção)
    brand: [scope]
    owner: clinical-fork-hat
  - path: packages/api/typescript/src/billing/**
    tier: 2
    exclude:                                          # plugs de produto: NÃO sincronizam
      - '**/PlanRegistry.ts'
      - '**/config.ts'
    brand: [scope]
    owner: clinical-fork-hat
  - path: packages/api/typescript/src/quota/services/**
    tier: 2
    exclude: ['**/QuotaKey.ts']                       # vocabulário = plug de produto
    brand: [scope]
    owner: clinical-fork-hat
  - path: packages/app/expo/**
    tier: 2
    brand: [scope]
    owner: mobile-fork-hat

# Tier-3 (examples/**) e tier-4 (produto) NUNCA aparecem aqui — ausência = product-owned.
```

**A dimensão que a maioria erra é `exclude` (2): a fronteira skeleton-vs-plug em granularidade
de sub-diretório.** `billing/services/**` é skeleton sincronizado; `billing/PlanRegistry.ts` no
mesmo contexto é plug. Sem glob include/exclude, o robô ou clobber o plug (destrói produto) ou
não sincroniza o skeleton (perde fix). É a mesma distinção da correção dos gateways: adapter =
skeleton, secrets/ativos/registry = plug.

### As 2 disciplinas anti-apodrecimento (obrigatórias)

- [ ] **RG-1 (S)** `scripts/sync-manifest.test.ts` — o validador que impede o registry de mentir:
  (a) todo `path`/glob resolve a arquivo existente; (b) **todo arquivo dentro de um diretório
  tier-1/2 está classificado** — ou casa o skeleton, ou casa um `exclude`, ou carrega
  `SYNC-DIVERGENCE:` — SEM terceira opção "esquecida" (é o que pega o arquivo novo não-mapeado);
  (c) todo `owner` é um chapéu válido do CODEOWNERS; (d) `layout` map cobre todos os prefixos de
  path usados. Falha vermelho no CI. Mesmo padrão dos rails `tests/architecture` (deriva do
  manifest, falha se a derivação muda) que a W2c portou.
- [ ] **RG-2 (M)** Derivar-do-grafo onde der: `scripts/graph` conhece kinds/imports. Regras
  derivadas em vez de listadas reduzem erro humano — ex.: "arquivo que importa `PlanRegistry`/
  `QuotaKey`/`ProductConfig` é plug (auto-exclude)"; "arquivo sob `core/` é tier-1". O manifesto
  vira parte-declarado (targets/brand/owner) + parte-verificado-contra-grafo (classificação).
  RG-1 consome a derivação como fonte da verdade da classificação.

### Reverse-flow automatizado (P3-5-auto — substitui o P3-5 manual)

- [ ] **P3-5-auto (M)** Hook `.githooks/post-commit` em cada fork (o fork tem o template como
  remote `upstream`, via `templateRemote` do registry): se o commit tocou path de `surface`
  (tier 1/2, respeitando `exclude`) E o commit NÃO carrega o trailer `Sync-Train:` (anti-loop) →
  cria branch `upstream/<slug>` + `gh pr create` no remote `upstream`, com corpo marcando
  **"⚠️ de-brand needed"** (a travessia downstream→template precisa do inverso da parametrização —
  parte manual até o Copybara da Fase 5). Regra na CLAUDE.md (§ house rules): *"tocou sync-surface
  ⇒ o hook abrirá PR upstream; não deixe o fix só local."* **NUNCA auto-merge no template** —
  sempre PR (a SoT revisa; auto-merge de downstream no canon = a race de reversão silenciosa da
  Dagster). Plugs (excluídos) nunca sobem. O drift-gate semanal (P2-3) segue como rede se o hook
  falhar ou alguém commitar fora do Claude.

### AC adicionais
- [ ] AC-7 `sync-manifest.test.ts` falha se um arquivo novo em `core/` ou `billing/services/**`
      não for classificado; passa quando classificado ou marcado.
- [ ] AC-8 Commit num fork tocando `core/` (sem trailer Sync-Train) abre PR `upstream/` no
      template; commit tocando só `PlanRegistry.ts` (plug) NÃO abre.

---

## Pull-based sync (USER DECISION 2026-07-21) — machinery LANDED

> **"O template não sabe dos filhos; os filhos declaram o pai."** Exactly the git fork model,
> pull-based. This supersedes every bidirectional/push assumption above (P2-1's template-side
> `targets:` registry, P3-2's sync-train Action, P3-5-auto's post-commit reverse hook). The
> P1/P2 history stays intact above for the record; what follows is what actually shipped.

### The model

- **The parent is child-agnostic.** No `targets:`, no per-fork brand vars, no push Action.
  The template carries **no `sync.yaml` at all** — it is a ROOT repo, and the gate no-ops
  green on it (`bun sync:check` → "root repo, nothing to check", exit 0).
- **The child declares the parent.** A fork adds ONE file, `sync.yaml` at its root:
  `parent { repo, ref(pinned full sha) }` + `inherited` (globs that must byte-match the
  parent at the pin) + `adapted` (exact files that came from the parent and deliberately
  diverged, each with a mandatory `why`). Everything undeclared is OWNED — absence IS the
  declaration; the tool never touches it.
- **The parent ships the generic tool; forks inherit it.** `scripts/sync/**` rides the
  inherited surface itself — fixing the tool in the template fixes it in every fork on the
  next pull.
- **Reverse flow = explicit PRs to the parent.** No hooks, no automation, no auto-merge —
  the drift gate's fix menu names it as move (c).

### What landed (template-fullstack, scripts/sync/**)

- **`scripts/sync/contract.ts`** — the typed `sync.yaml` contract (`SyncManifest`), manual
  validation with teaching errors (full-sha pins, exact-file adapted paths, mandatory whys,
  unknown-key rejection), and `compileSurface()` — the ONE set-algebra evaluation
  (inherited-globs ∖ adapted) both commands share. No edge-case ifs on path formats.
- **`scripts/sync/check.ts`** (`bun sync:check`) — the drift gate a child runs in CI.
  Set algebra child-tree vs parent@pin: `drift-modified` / `drift-missing` /
  `drift-child-only`, each a named failure with the fix menu (re-pull · reclassify to
  adapted WITH a why · upstream a PR). `adapted` entries are liveness-gated: must exist in
  the child AND differ from the parent — a re-converged file is an `adapted-fossil` (fail,
  reclassify to inherited); a path the parent never had at the pin is `adapted-not-in-parent`
  (fail, delete the entry).
- **`scripts/sync/pull.ts`** (`bun sync:pull [--to <ref>] [--dry-run]`) — advances the pin.
  Fast-forward from a clean base, ONE uniform conflict rule: every touched path's child
  state must equal parent@old-pin (same bytes or same absence); adapted paths the parent
  changed always conflict. Conflicts abort BEFORE any write. Rewrites `parent.ref` via the
  YAML document API (comments survive).
- **`scripts/sync/gitio.ts`** — shared git plumbing; `SYNC_PARENT_PATH` env short-circuits
  the network with a local parent clone (tests/offline), else temp bare clone (removed in
  finally).
- **`scripts/sync/sync.yaml.example`** — the documented contract for forks (the template
  itself stays manifest-less).
- **`scripts/sync/sync.test.ts`** — fixture PAIR of tmp git repos (parent with three
  commits, child forked from commit 1) proving: teaching contract errors (negative
  fixtures), clean check at pin, drift after the pin advances / after a local edit,
  adapted liveness (fossil + missing), pull applies + advances pin + leaves owned/adapted
  alone, conflicts abort atomically, root-repo no-op. In `test:tooling`.
- **package.json** — `sync:check`, `sync:pull`; `./scripts/sync` joined `test:tooling`.

### What this retires / keeps from the phases above

- **Retired:** P2-1 template-side registry (tiers/targets/brand/layout maps), P2-3's
  template-ref checkout in downstream CI (the child's own gate + pin replaces it), P3-1/2/3
  (PAT + sync-train Action + sync-PR plumbing), P3-5-auto reverse hook, RG-1/RG-2 as
  template-side validators (the child's contract validation absorbed the teachable part).
- **Kept, unchanged:** P1 brand parametrization (`template.config.ts` — orthogonal: pull
  copies bytes; brand values flow from config at runtime, so synced files need no
  templating), P3-0 downstream CI bootstrap (now runs `bun sync:check` instead of a
  checkout-diff), Phase 4 governance, Phase 5 ceiling (Copybara only if transformation
  needs outgrow byte-copy + config).
- **Adoption (thin, per fork):** add `sync.yaml` (from `scripts/sync/sync.yaml.example`)
  pinned at the R-3 reconciliation sha; wire `bun sync:check` into the fork's CI.
