# Handle Imperativo do Canal Mock — o teste dirige, o Scenario vira piloto automático — Design Spec

**Date:** 2026-08-11
**Status:** Draft (registrado por ordem do founder em 11/08 — brainstorm completo APÓS o PR da feat/eixo-ambiente-go; as Decisions 1–3 abaixo já são dele, fixadas em conversa, e não se reabrem no brainstorm)
**Bounded Context:** channel (mock + testes Go-internos); core-go só se maquinário cego genuinamente genérico emergir (ex.: testenv.Await)
**Kind:** feature
**Story Points:** 5 — redesign da superfície de controle do mock (clock→command), pacote channeltest, migração de 3 testes Go, Scenario reimplementado como piloto sobre o handle; sem migração de dados, sem contrato wire.

## Context

A frente eixo-ambiente-go entregou o `MockChannel` roteirizado pelo `mock.Scenario` — declarativo, fixado no boot (`QRFrames`, `AutoPairAfter`, `Contacts`, `InboundMessages`), encenando fatos pelos pipelines reais (`mapper.MapEvent` → outbox → handlers → projectors). Serve três consumidores: testes Go-internos (via `scriptedOverlays` por teste), e2e Playwright e harness react (via `defaultE2eScenario` no boot do subprocesso). Os testes Go (`qr_pairing_test.go`, `inbound_emission_test.go`, `contact_snapshot_test.go`) compartilham o processo com o mock, mas pagam a restrição do consumidor mais fraco: declaram o mundo inteiro antes do boot, com timing como dado e polls separando causa de efeito. O founder nomeou o incômodo ("achei algo meio ruim; como atingir a ergonomia do TypeScript no Go?") e o incidente do AutoPairAfter (0→2s vazou custo silenciosamente para todos os consumidores — reset-spike estourou timeout, SessionChatSection a 70ms do teto; corrigido com timeouts explícitos em 79143aa1) demonstrou o problema estrutural: timing-como-dado é constante global envenenável. O `fx.Populate` do `testenv.Start` (core/pkg/testenv) já demonstra o mecanismo de expor um objeto do grafo ao teste.

## Problem

1. Classes de teste inexpressáveis no modelo declarativo: falha e desordem mid-flow ("canal caiu DEPOIS do connect", "send falha 2× e passa na 3ª", "mensagem chega NO MEIO do pareamento") — a lacuna de resiliência cross-service da avaliação do harness (nota 7.5, gap nº 2).
2. Timing como dado compartilhado: uma constante de cenário mudada por um consumidor muda o custo de todos (o incidente medido do AutoPairAfter).
3. Ergonomia: causa (struct pré-boot) longe do efeito (poll pós-boot); cada nuance nova de comportamento vira campo especulativo no Scenario em vez de comando sob demanda.

## Goal

Testes Go do contexto channel dirigem o canal mock imperativamente — `gw.EmitQR(ch, ...)`, `gw.Pair(ch)`, `gw.Receive(ch, ...)` — com causa e efeito adjacentes, timing decidido pelo teste, e vocabulário de falha que cresce por demanda. O e2e e o harness react nada perdem: o Scenario declarado sobrevive como piloto automático construído sobre o handle.

## Decisions

1. **(Founder, fixada)** O controle imperativo vive no TIPO CONCRETO do mock — o `gateway.Channel` real (whatsmeow) não ganha um método de teste sequer; a porta não muda. A lição do TestIngress é lei: superfície de controle de teste nunca mora no caminho real.
2. **(Founder, fixada)** Tudo service-owned: handle, `channeltest`, vocabulário — dentro de `internal/channel`. O core-go permanece cego (rail de vocabulário continua valendo); NENHUM tipo abstrato top-level de "Scenario"/"Handle" — a superfície de controle de um mock é vocabulário de domínio, e abstraí-la produz o mínimo denominador comum. O que se compartilha entre serviços é convenção (skill), não tipo.
3. **(Founder, fixada)** Parametrização cross-processo (e2e, harness react) via env var declarada na receita do PRÓPRIO serviço no manifesto (ex.: `CHANNEL_MOCK_SCENARIO=<preset>`) — a gramática do manifesto continua genérica (`env: Record<string,string>`), o vocabulário fica no serviço.
4. O mock perde o relógio próprio: `runPairingClock` e cia. viram execução de comandos; o factory registra instâncias e expõe um controller populável via `fx.Populate` (mesmo mecanismo do ServerAddr). Cada comando emite pelos MESMOS caminhos reais de hoje (mapper.MapEvent/construtores de evento + Save) — a fidelidade de pipeline não regride.
5. O Scenario NÃO morre: reimplementado como piloto automático que dá os mesmos comandos (goroutine interna: EmitQR→sleep→Pair→...), preservando `defaultE2eScenario` e a semântica do e2e/harness byte-compatível. Testes Go migram para o handle (3 arquivos, ficam mais legíveis); consumidores declarativos não mudam.
6. Vocabulário de falha nasce POR DEMANDA de teste concreto (YAGNI): `Drop`/`FailNextSend`/etc. entram um a um quando um teste os exigir, nunca especulativamente.
7. `channeltest.Start(t)` embrulha a cerimônia atual (5 args posicionais) para o caso comum do channel; o `testenv.Start` genérico do core fica como está (a evolução options-struct dele é assunto separado, gatilho: 3º chamador).

## User Stories

- Como desenvolvedor do gateway, quero testar "o canal cai depois do connect e a UI/projeção reagem", para que resiliência cross-service tenha teste.
  - Given `backend, gw := channeltest.Start(t)` e um canal conectado, when `gw.Drop(ch)`, then a projeção de status reflete a queda e os consumidores reais reagem (asserção nas consequências).
- Como desenvolvedor, quero causa e efeito adjacentes no teste de QR, para que o teste leia como o cenário de negócio.
  - Given o handle, when `gw.EmitQR(ch, "f1")` seguido da asserção e então `gw.Pair(ch)`, then cada asserção segue seu comando sem poll de roteiro global.

## Acceptance Criteria

- [ ] AC-1: os 3 testes Go migrados dirigem via handle; nenhum poll de "esperar o roteiro" resta; suíte Go verde; cada teste falseado (comando removido → RED).
- [ ] AC-2: `grep` de método de teste no adaptador whatsmeow e na porta = 0; rail de vocabulário do core verde.
- [ ] AC-3: e2e (13/2-skipped) e harness react (cross-service 5/5) verdes SEM mudança de asserção — o piloto automático preserva a semântica do Scenario.
- [ ] AC-4: o preset por env var declarado na receita do manifesto funciona (um teste react escolhe um preset ≠ default e observa a consequência).
- [ ] AC-5: pelo menos UM vocabulário de falha implementado por demanda de um teste real que hoje é inexpressável (o primeiro candidato: queda pós-connect).

## Open Questions (para o brainstorm pós-PR)

- Shape exato do controller (métodos no factory vs objeto separado por canal); nomenclatura dos presets; se `testenv.Await` genérico entra junto ou separado.
