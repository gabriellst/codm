# Post-critic user batch — decisões + observações (2026-07-21)

**Status:** DONE (2026-07-21) · Origem: resposta do usuário ao fechamento da declarative-repo (4 decisões + 6 observações).

## Diretivas do usuário (verbatim-condensado)

Decisões: (1) dead events FICAM — auth Password* viram emissão real via IdentityAuthHooks; billing
External* viram emissão real porque **billing deve estar completo no template como no medscall**
(webhook pipeline); o `before:` hook inline de phone no BetterAuth está péssimo; phone pode deixar
de ser REQUISITO do usuário mas fica no código. (3) locale de error codes: **erro de compilação**
via enum de erros + i18n tipado. (4) candidatos do promote = **alto score** no scoreboard, não só
PERFECT. Observações: (O1) CreateCheckoutSetupSession → contexto billing; (O2) remover
referências/código de frontend servido pelo backend (go embed / TS static); (O3) QuotaKeys.schema
morre → `z.enum(QuotaKey)` inline; (O4) create-template precisa de modelo canônico (schemas/
interfaces das transformações) — resolve também a decisão (2) stamping fechado sobre o manifest;
(O5) shutdown incompleto vs medscall; (O6) UserProfile: VOs com `z.instance` (Timezone, locale
BCP47) em vez de isValidIanaTimezone/BCP47_RE inline; leadToken e disabledAt saem da tabela
(informação inferível de eventos).

## Fases

- **B1 mecânica**: promote `--min-score` (alto score, default 90; docTreeHash vira proveniência,
  não filtro duro) · QuotaKeys.schema → z.enum(QuotaKey) inline (classe morre se ficar vazia) ·
  CreateCheckoutSetupSession (controller+usecase) ui → billing · shutdown completo (guards por
  etapa, removeAllListeners, disconnect, closeDatabase) · varredura frontend-serving (go:embed de
  migrations é legítimo e fica).
- **B2 auth**: before-hook de phone sai do inline → IdentityAuthHooks + Phone VO; phone opcional
  no sign-up (código fica); Password* events emitidos pelos hooks (3 saem do baseline SCW-01a).
- **B3 billing completo (port medscall)**: webhook ingestion pipeline — controllers de webhook →
  verifier/mapper factories (já bound) → use cases → External* events emitidos (5 saem do
  baseline). Fonte read-only: /Users/work/Desktop/Projetos/medscall/software/monorepo.
- **B4 UserProfile**: VOs Timezone + LanguageTag em shared/objects (z.instance nos schemas);
  drop leadToken + disabledAt (colunas + campos + testes; eventos carregam o fato); migração.
- **B5 create-template canônico**: StampPlan tipado (primitivas de transformação derivadas de
  REPO.workspaces) + fechamento sobre template.config.ts (o stamp REGENERA workspaces/env do
  manifest a partir do REPO podado — manifest de stamp nunca declara workspace ausente).
- **B6 i18n de erros tipado**: união de error codes exposta ao app (via SDK/emissão) + locale
  `errors` com `satisfies Record<ErrorCode, string>` — falta de tradução = erro de tsc.

Regras: CLAUDE.md §5 sempre; gates reproduzidos + commit por fase; rails/tooling verdes;
`bun sdk`/`check:generated` quando controller/schema mudar; medscall é READ-ONLY.


## Execução — fechamento (2026-07-21)

- **B1** c5bcb0d41 — z.enum(QuotaKey) inline (classe morta) · promote por alto score (--min-score 90; 27 candidatos reais na fila) · shutdown completo (guards, removeAllListeners, transport stop, closeDatabase) · RegisterSPA removido do Go router.
- **B2** 1241687d9 — before-hook de phone → IdentityAuthHooks + Phone VO; phone opcional; Password* ×3 emitidos (sendResetPassword / onPasswordReset / account.update credencial).
- **B4 + colapso** 705b78f81 — VOs primitivos Timezone/LanguageTag (z.instance; string nua no wire); leadToken+disabledAt dropados (migração 0001); TODA lógica colapsada no IdentityAuthHooks (BetterAuth = wiring puro, diretiva mid-batch).
- **B3** 735516267 — descoberta: o pipeline já era port integral do medscall e os 5 eventos eram mortos LÁ também (seam do relay Lago); emissões colocadas nos mappers (Stripe invoice.*/subscription.*, Asaas dunning/void) com resolve-and-verify; baseline SCW-01a ZERADO.
- **entity_id text** 4971bffb3 — defeito latente provado pelo B3 (ids text do engine × coluna uuid = 22P02); migração 0002; regressão verde.
- **O1** b5751a794 — CreateCheckoutSetupSession ui→billing (rota /v1/billing/...).
- **B6** 8e90f4220 — x-error-codes no openapi → generator no SDK → `satisfies Record<ErrorCode, string>` nos 4 catálogos (react+expo, pt+en, 74 codes todos traduzidos); prova negativa: remover chave = erro de tsc nomeando o code.
- **B5** 426d3cae4 — StampPlan canônico (planStamp puro + applyStamp interpretador; 6 relações declaradas); fechamento do manifest via 4 blocos STAMP-MANAGED com gate de fidelidade byte-a-byte; stamps passam os próprios gates sem install.
- **detect verde** 595260274 — 2 findings meus corrigidos na forma sancionada; baseline do registry-scan re-chaveado (229→150, fósseis de rename); `bun run detect` exit 0 completo.

Residuais: consumer-lists de env keys sobreviventes ainda nomeiam ids de workspaces podados (benigno, compila; filtrar arrays intra-entry no render é follow-up) · OWN_DEV_SERVER poderia ser campo do Workspace · INVALID_LEAD_TOKEN segue registrado (fluxo CaptureLead) apesar do leadToken ter saído da tabela — decidir se o fluxo fica.
