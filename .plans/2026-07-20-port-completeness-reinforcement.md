# Port Completeness Reinforcement — gates mecânicos contra omissão

**Date:** 2026-07-20 · **Status:** Draft
**Origem:** preocupação do usuário ("vão esquecer jobs/controllers, ports errados shared→contract") + workflow `wf_18da0caa` (harness que provou: até o inventário de 157 artefatos esqueceu sub-arquivos/barrels/o contexto quota inteiro).
**Tese:** `tsc build 0` + testes passando são gates de CORREÇÃO (o-que-existe está certo), NÃO de COMPLETUDE (tudo que deve existir existe) nem de CANON (está no lugar certo). Omissão silenciosa (controller/job faltando, enum no @shared errado) não quebra tsc nem faz teste falhar. E instrução em prosa não segura sob pressão de gate (visto: o refactor capabilities→supportedMethods foi revertido por um agent perseguindo tsc-0). **Só gate mecânico sobrevive.** Este doc transforma completude+canon em gates.

## Ground truth mecânico (via `find`, não via agent — não esquece)
Medscall @f04e8a0f, não-teste: **billing 293 · quota 40 · ui/billing 7 = 338 arquivos** que devem ter correspondente no template (aplicada a regra de enum: cross-boundary→contracts). Breakdown billing chave: 24 events · 20 handlers · 17 usecases · 17 enums · 15 controllers · 8 jobs · 9 entities · GatewayEventSource(9) · BillingWebhookVerifier(8) · 5 famílias de provider (Asaas/MercadoPago/PagarMe/PagBank + Sandbox/Mock) com schemas por provider · 8 repos (iface+Drizzle+Mock+index cada). Quota: 3 controllers · 2 entities · 5 ports · governors · entitlement/override · Usage/Overage.

## Camada 1 — Coverage-diff gate (pega artefato esquecido)
- [ ] **RF-1 (M)** `scripts/port-coverage.ts` + `port-coverage-manifest.json` (gerado por `find` do medscall billing+quota+ui-billing não-teste, path-mapeado ao template; enums cross-boundary → contracts). O teste: para cada entrada do manifesto (não product_specific), existe o arquivo correspondente no template? Faltou → **FALHA nomeando o arquivo**. É o gate que a intuição "vão esquecer" pede — mecânico. Gera-se do `find`, então não pode "esquecer" como um agent. Roda no fim da W2, na W3, e no CI.

## ⚠️ PROMOVIDO — Migração enum→contracts (próximo passo IMEDIATO, não fim-de-W3)
**Cobrado pelo usuário 2026-07-20: parem de adiar.** Assim que a conclusão da W2 fechar (coverage=0), ANTES de qualquer outra coisa: passe dedicado enum→contracts. **Spec FINALIZADA abaixo** (pesquisa read-only 2026-07-20 completa — turnkey).

### Classificação verificada (via DB-mirror + wire + Go)
Autoridade = o que `contracts/db/schema` persiste (inline-mirror hoje) ∪ wire ∪ Go. Confirmado: **sem ciclo vivo** (db/schema NÃO importa de src); mirrors são 13 uniões inline em `billing.ts` + `type QuotaKey = string` em billing.ts/quota.ts.

**MOVER p/ contracts (criar `.tsp` em `contracts/wire/enums/`) — cross-boundary (persistido):** 12 billing — `BillingPlatform, ChargeStatus, CheckoutIntent, CheckoutSessionStatus, CreditNoteReason, CreditNoteStatus, DeclineReason, DisputeStatus, PaymentMethodStatus, PaymentMethodType, PlanName⚠, SubscriptionStatus` + `QuotaKey` (de @shared). = **13 novos .tsp**.
**DELETAR de src (dup):** `src/shared/enums/Language.ts` — `contracts/wire/enums/language.tsp` já existe; imports viram contracts.
**FICA context-local `src/billing/enums` (import RELATIVO, não cross-boundary):** `BillingWebhookSource` (roteamento webhook, não persistido/wire), `InvoiceStatus` (derivado, nunca stored — derive-don't-flip), `RefundBasis`, `RefundSource`. ⚠ o agent CONFIRMA que refund/credit-note table não persiste RefundBasis/RefundSource via `.$type` — se persistir, sobe p/ contracts.
**FICA `@shared/enums` (API-interno, nunca schema/wire):** `IdempotencyScope` (dedup puro — decisão do usuário), `OwnerKind` (só COMMENT em owner.ts, coluna é text plain, wire=0 — fica @shared; vira contracts só se Go passar a ler owner.kind).

### ⚠ PlanName vs PlanTier — FLAG de design, NÃO auto-mesclar
`src PlanName={FREE,STARTER,PRO}` (plano de assinatura billing) ≠ `contracts PlanTier={BASIC,INTERMEDIATE,ADVANCED,UNLIMITED}` (tier de quota, chaveia PLAN_QUOTAS). Value sets e conceitos distintos. Migração cria `plan-name.tsp` FIEL (FREE/STARTER/PRO) — **não funde** com PlanTier (fundir toca PLAN_QUOTAS + plan registry = refactor de design, decisão do usuário). Reportar a redundância "dois eixos de plano" ao usuário como pergunta separada.

### Mecânica (confirmada)
- `.tsp` → `contracts/wire/enums/<kebab>.tsp` (ex.: `billing-platform.tsp`), `namespace TemplateContracts`, `enum X { VAL: "VAL", ... }` com valores FIÉIS de `src/billing/enums/X.ts` (não inventar).
- `bun contracts` regen → emite `generated/typescript/src/wire/enums/*.ts` (`export enum X`) + bindings Go.
- **Mirror-kill:** `contracts/db/schema/billing.ts` troca cada `type X = '...'` por `import type { X } from '../../generated/typescript/src/wire/enums'` (within-package, sem ciclo) e mantém `.$type<X>()`. `type QuotaKey = string` (billing.ts+quota.ts) → import `QuotaKey`.
- **Imports src:** reescrever `@billing/enums`→`@template/contracts-typescript/wire/enums` (só os 12+QuotaKey; os 4 context-local viram relativo `../../enums/X`) e `@shared/enums`→contracts p/ QuotaKey. Escala: ~100 importers @billing/enums, ~81 @shared/enums (subset).
- DELETAR os 13 arquivos src movidos (12 billing + QuotaKey) + Language.ts; barrels `billing/enums/index.ts` e `shared/enums/index.ts` param de reexportar os movidos.

### Gate (landa junto — canon sem gate = débito)
`tests/architecture/enum-placement.test.ts`: **CMPL-01** `grep "^type [A-Za-z]* = '" contracts/db/schema/*.ts` = 0. **CMPL-02** enum consumido por db/schema OU wire NÃO mora em `src/**/enums` (allowlist só os context-local + IdempotencyScope/OwnerKind). Verde final: tsc build 0 · eslint 0 · testes 0 fail · `bun contracts` sem diff · os 2 rails passam.

## Camada 2 — Detectores de canon (pega enum/import/wiring errado) — 12 rails, cada um com violação REAL hoje
Viram rails em `packages/api/typescript/tests/architecture/` (já sendo portado no W2c) + eslint rules. `gate-duro` falha o build; `warn` reporta.

- [ ] **CMPL-01 (gate)** Contracts DB schema NUNCA espelha enum de src como union de string-literais. *Viola hoje:* `contracts/db/schema/billing.ts:22 type BillingPlatform = 'PAGARME'|...` (o mirror smell). Check: `grep -n "^type .* = '" contracts/db/schema/*.ts` = 0.
- [ ] **CMPL-02 (gate)** Enum consumido por DB schema OU wire mora em contracts, não `src/shared`/`src/<ctx>/enums`. *Viola hoje:* `src/shared/enums/QuotaKey.ts`, `Language.ts`.
- [ ] **CMPL-03 (warn→gate)** Import intra-contexto é RELATIVO, nunca `@<ctx>/*`. *Viola hoje:* `billing/jobs/ReconcilePendingChargesJob.ts:10 import ... from '@billing/...'`.
- [ ] **CMPL-04 (gate)** Todo `extends Controller<...>` declara `inputSchema` E `outputSchema`. (guarda de regressão)
- [ ] **CMPL-05 (gate)** Handler subscreve exatamente 1 evento (reconciliar com o padrão internal.ts/external.ts do medscall — decidir se o canon do template é 1-handler-1-evento ou os subhandlers do SPEC-12).
- [ ] **CMPL-06 (gate)** Toda entrada de CONTEXTS tem INSTANCE_REGISTRY nas 3 arrays (mock/integration/real) de ALL_REGISTRIES. *Viola hoje:* RAIL AUSENTE.
- [ ] **CMPL-07 (warn)** Todo dir de artefato scaffoldável tem index.ts barrel. *Viola hoje:* `billing/controllers/` sem index.ts.
- [ ] **CMPL-08 (gate)** Schema↔migration em sincronia (`drizzle:generate` sem diff).
- [ ] **CMPL-09 (warn)** Handler de External*/integration tem estratégia de idempotência (cc-bp-25). *Viola:* `ExternalPixPaidHandler` etc.
- [ ] **CMPL-10 (gate)** Dir que parece BC (registry.ts/index.ts) está no CONTEXTS manifest + wired.
- [ ] **CMPL-11 (gate)** Todo `extends Controller` aparece no mapa `controllers: {}` do BoundedContext. *Viola:* `HandleBillingWebhookController`.
- [ ] **CMPL-12 (gate)** Todo `*Job.ts` é referenciado por um site de wiring (scheduler/CommandQueue). *Viola:* `ReconcilePendingChargesJob`, `RefundReconcileJob` órfãos.

## Camada 3 — Plan-task audit (pega task pulada)
- [ ] **RF-3 (S)** Script que mapeia cada task dos plans L-10 (17 billing + 13 quota) → artefato esperado + test path; "task done" = artefato existe + teste verde (não "agent disse done"). É o critério (7) do /build aplicado ao port.

## Camada 4 — Completeness-critic adversarial (pega o que 1-3 não previram)
- [ ] **RF-4** Fan-out adversarial (o do `wf_18da0caa`, re-rodável) no FIM da W2 e na W6: "o que falta vs. fonte medscall + vs. canon?". Caça omissão, não confirma presença. O crítico já provou valor: pegou o inventário incompleto.

## Schedule (onde cada gate entra)
- **Fim da W2 (billing+quota):** rodar RF-1 (coverage) + RF-4 (crítico) ANTES de declarar billing/quota completos → a "lista do que faltou". Nada marcado done com omissão.
- **W3:** os 12 detectores viram rails/eslint permanentes; RF-1 vira `port-coverage.test.ts` no CI; + a correção enum→contracts (elimina CMPL-01/02) + import-normalization (CMPL-03).
- **W6:** gate final = todos verdes (tsc + testes + coverage + 12 rails + crítico limpo).

## Nota de método
O manifesto é gerado por `find`, os detectores são grep/AST, o crítico é adversarial — três mecanismos independentes, nenhum confiando em memória de agente. É o "no silent caps" aplicado ao port inteiro: se algo é esquecido ou fica no lugar errado, um gate grita — porque a sessão é longa e memória (humana ou de agente) falha.
