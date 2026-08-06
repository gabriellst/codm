# SP3 — Billing de fundação: assinatura grátis sem Stripe — Design Spec

**Date:** 2026-08-06
**Status:** Draft (aguardando aprovação do founder)
**Bounded Context:** billing (novo, greenfield, montado APENAS no perfil cloud) · toca auth (GetEntitlement) e contracts (enum)
**Kind:** feature
**Story Points:** 5 — um bounded context novo porém pequeno (1 aggregate, 1 handler, 1 query), enum de contrato, e a troca do literal do entitlement; zero integração externa.

## Context

O SP2 entregou identidade (better-auth social no perfil cloud) e entitlement — mas o entitlement é
um **literal hardcoded**: `GetEntitlement.ts` responde `{ active: true, plan: 'free' }` para
qualquer token válido, com um comentário-costura explícito: *"A second plan means this schema
changes"*. As chaves Stripe (test mode) estão **estacionadas** no `.env` e declaradas com
`group: 'parked'` no env registry — inertes por decisão do pivô gratuito.

Decisão do founder neste grilling (2026-08-06, corrigindo uma proposta anterior de "Customer no
Stripe desde o primeiro login"): **nenhum acoplamento com plataforma de pagamento até existir algo
pago**. O usuário nasce com uma assinatura grátis **no nosso próprio modelo**; Stripe (customer,
checkout, webhooks) entra somente no SP que lançar o primeiro plano pago.

Verificado no histórico: o pré-collapse (`f21be114^`) contém apenas auth/owner/shared/ui — **não
há contexto billing para ressuscitar**; este é greenfield (diferente do better-auth do SP2). O
perfil cloud (`src/shared/cloud-profile.ts`, `CLOUD_CONTEXTS = {auth, owner, shared}`) e seu rail
(`tests/architecture/cloud-profile.test.ts`) são o ponto de extensão natural.

## Problem

1. O plano é um literal no código — lançar um segundo plano hoje significa espalhar mudança, não
   trocar dado.
2. Não existe registro de "quem assina o quê": nenhuma tabela diz que o usuário X está no plano
   free desde a data Y — informação que qualquer decisão futura de produto/preço vai querer.

## Goal

Todo usuário nasce com uma assinatura FREE registrada no cloud; o entitlement passa a **ler** essa
assinatura em vez de afirmar um literal. Lançar um plano novo vira: adicionar valor ao enum +
criar o fluxo de upgrade — sem reconstruir fundação.

## Decisions

1. **Contexto `billing` novo, montado APENAS no perfil cloud** (`CLOUD_CONTEXTS` ganha `billing`;
   rail CLOUD-0x atualizado com a fixture negativa preservada). O daemon local nunca monta
   billing.
2. **`PlanKind` como enum de contrato** (`packages/contracts`, cross-boundary) com valor único
   `FREE`. Contrato antes de implementação: o dia do plano pago adiciona valor ao enum e muda o
   schema do entitlement na costura já documentada — uma mudança, um lugar.
3. **Aggregate `Subscription`**: `userId`, `plan: PlanKind`, `status`, `startedAt`. Criada por
   **handler** reagindo à criação do usuário better-auth — todo usuário tem exatamente uma
   assinatura FREE ao nascer. Sem entidade `Plan` persistida: plano é enum + regras em código
   (regra da casa: "fixed tiers / config → code enum, not a persisted aggregate").
4. **`GetEntitlement` lê a assinatura** (token → user → subscription) e responde
   `plan: PlanKind`. **Self-heal**: usuário sem row (corrida/bug de dados) recebe FREE e a row é
   criada — nunca punir usuário por bug nosso; logado como anomalia.
5. **Zero Stripe.** Nenhum customer, nenhuma chamada, chaves seguem `parked`. O SP do primeiro
   plano pago (futuro) cria: customer no momento do upgrade, checkout Stripe-hosted, webhook →
   status da subscription. Este spec só garante que aquele SP encontrará o chão pronto.
6. **Console mostra o plano** na seção de conta (uma linha: "Plano: Free") — consome o
   entitlement que já flui; sem UI de billing além disso.
7. **Medição/quota de uso NÃO entra aqui.** Medir turnos/mensagens exige o pipe de telemetria
   (SP4) — o controle de abuso vira SP próprio pós-SP4, com dados reais. (Re-emenda do roadmap:
   SP3 era "controle de uso"; a fundação vem primeiro.)

## User Stories

- **Story 1:** Como founder, quero que todo usuário nasça com assinatura FREE registrada, para
  ter o modelo pronto quando lançar algo pago e saber desde já quem entrou quando.
  - Dado um signup GitHub/Google novo, quando o usuário é criado, então existe uma Subscription
    FREE ativa para ele (AC-1).
- **Story 2:** Como usuário, quero ver meu plano na conta, para saber o que tenho.
  - Dado o console logado, quando abro a seção de conta, então vejo "Plano: Free" (AC-3).
- **Story 3:** Como founder, quero que o entitlement venha do modelo e não de um literal, para
  que mudanças de plano sejam dados, não caça a strings.
  - Dado um token válido, quando o daemon revalida, então o `plan` retornado vem da Subscription
    do usuário (AC-2).

## Acceptance Criteria

- [ ] AC-1: handler de signup cria Subscription FREE na mesma coreografia de eventos da casa;
      teste cobre criação e idempotência (signup repetido não duplica).
- [ ] AC-2: `GetEntitlement` responde o plano lido da Subscription; teste do self-heal (row
      ausente → FREE criada + log).
- [ ] AC-3: seção de conta do console exibe o plano vindo do entitlement (i18n pt/en).
- [ ] AC-4: rail cloud-profile atualizado — perfil cloud monta auth+owner+billing+shared e NADA
      mais; fixture negativa segue vermelha para contexto intruso.
- [ ] AC-5: nenhuma referência a Stripe em código novo (`grep -ri stripe` no diff = só as chaves
      parked já existentes); `bun tsc`/`bun lint`/suíte verdes; migração espelhada no Go
      (`db:check-go`).

## Fora de escopo (explícito)

Stripe em qualquer forma (customer/checkout/webhook/portal), plano pago, precificação, quota e
medição de uso (pós-SP4), trial, downgrade/upgrade (só existe um plano), UI de billing além da
linha na conta.

## Open Questions

- **Nome do plano na UI/landing** — "Free"/"Grátis" simples ou um nome de marca (ex.:
  "Community")? A landing (SP2.5) e o console devem usar o mesmo nome.
- **`status` da Subscription** — com um único plano gratuito, existe estado além de ACTIVE?
  (Sugerido: enum `SubscriptionStatus { ACTIVE }` — valores novos só quando um fluxo real os
  criar; nunca especular estados.)
