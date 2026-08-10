# O Eixo de Ambiente no Go — base genérica no core, canal roteirizado, harness cross-service — Design Spec

**Date:** 2026-08-10
**Status:** Approved
**Bounded Context:** cross-service: core-go (base), channel (colunas + mock), api-typescript tests/support + app-react tests/support (harness cross-service), e2e, template.config.ts (manifesto)
**Kind:** feature
**Story Points:** 21 — dois serviços, mock de canal novo, dois harnesses (Go-interno + cross-service), migrações de produto e manifesto; decomposição acontece no plano (ondas), não em specs separadas — decisão explícita do founder ("tudo junto").

## Context

A frente do eixo único no TS acabou de fechar (`.specs/2026-08-10-eixo-unico-ambiente-design.md`, branch `feat/eixo-unico-ambiente`): `start({env, port})` herdado por produção/harness/e2e, colunas declaradas `mock/integration/real/e2e`, `CODM_E2E` morto, harness do console bootando o backend real em ~121ms. O Go ficou de fora por decisão declarada (D10 daquela spec): a URL do Go no harness aponta para um stub 501 (`GO_GATEWAY_NOT_IN_HARNESS`), e 3 componentes do console ficaram só-visuais por dependerem de dado gateway-owned (ContactStep/lista de contatos, SessionChatSection/volume de transcript, SetupChecklist+UserProfile/`channelDone`).

O gateway Go (`packages/api/go`, módulos `template/api-go` + `template/core-go` em `packages/api/go/core`) tem fiação única: `cmd/api/main.go` compõe `core.Module + shared.Module + channel.Module` sem eixo de ambiente. A porta em volta do whatsmeow **já existe e é completa**: `gateway.Channel` (`internal/channel/services/gateway/gateway.go:124` — `Connect`, `GetQRChannel(ctx) <-chan QRCodeData`, `SendMessage`, `StreamContactSnapshot`, ~25 métodos) e `gateway.ChannelFactory` (`:181`), com o whatsmeow como implementação anotada (`fx.As(new(gateway.ChannelFactory))` em `module.go:40`). O Go carrega o próprio eixo paralelo: `CODM_E2E` → flag `TestIngress` (`core/config/config.go:63`, recusada sob `EnvironmentProduction`) gateando o `internal/channel/testseam/test_ingress.go` — um ingress HTTP test-only que injeta domain events pelo mediator para alcançar estados que só o telefone produziria. O docblock do testseam documenta uma restrição estrutural real: o emissor OpenAPI do Go anda por path de pacote estaticamente (`pkg/openapi` registra tudo sob `/controllers`), então superfície de teste fora de `controllers/` é o que a mantém fora da SDK pública. O e2e Playwright de hoje **não sobe o gateway** (webServers: só api-ts e vite; o `SqlExternalMediator` do TS documenta "the e2e harness boots no Go process") — o gateway tem zero cobertura de integração automatizada. O config Go já tem um enum `Environment` de **deploy** (DEVELOPMENT/PRODUCTION) — distinto do eixo de fiação, como NODE_ENV × CODM_ENV no TS.

## Problem

1. **O Go não tem eixo de ambiente** — fiação única, `CODM_E2E` como eixo paralelo disfarçado (a doença que o TS acabou de curar), e nenhum mecanismo para um serviço Go declarar bindings por ambiente.
2. **O gateway é intestável de forma automatizada** — o fluxo de QR/pareamento exige telefone; emissão de eventos e projeções não têm harness; o e2e não o sobe.
3. **O TestIngress é uma exceção estranha** (crítica do founder): injeta eventos por HTTP pulando os pipelines de produção, vive num pacote deslocado para não vazar na SDK, e existe só porque não havia canal roteirizável.
4. **O console não testa comportamento gateway-owned** — 3 componentes só-visuais; o stub 501 é honesto mas é um beco declarado, não uma capacidade.
5. **Nada disso pode ser específico do codm/gateway** (crítica do founder): qualquer serviço Go de um fork precisa herdar a base — o template é o produto.

## Goal

Qualquer serviço Go do template ganha o eixo de ambiente como **base do core-go** (tipo, compositor de overlays, fail-closed, rail de validação, testenv) — o serviço só declara suas colunas. O gateway usa essa base para: canal roteirizado (`MockChannelFactory`) que produz QR/pareamento/contatos/mensagens **pelos pipelines reais**, testes Go-internos do contexto channel, presença no e2e (telas de QR do console testáveis pela primeira vez), e participação opt-in no harness do console (`services: ['apiGo']` resolvido pelo manifesto) — destravando os 3 componentes só-visuais. O TestIngress e o CODM_E2E do Go morrem.

## Decisions

1. **A base é do core-go, agnóstica de serviço.** Novo pacote `wiring` em `packages/api/go/core`: o tipo do eixo (`wiring.Env`: `real | integration | e2e` — **3 colunas**; o Go não tem camada TestBed, unit tests constroem direto), o compositor (`wiring.App(env, base fx.Option, overlays map[wiring.Env]fx.Option) fx.Option` — overlays via `fx.Replace`/`fx.Decorate` **partindo de `real`**, a lição da auditoria da frente TS: e2e é real-menos-processos-externos), o fail-closed genérico (`wiring.Refuse(env, deployEnv)` — não-real sob `EnvironmentProduction` recusa o boot, espelhando o falsificador do TS), e o helper de rail (`wiring.Validate` sobre `fx.ValidateApp`, uma chamada por coluna). Zero símbolo codm/channel no pacote.
2. **Seleção por `CODM_ENV`** — a MESMA env var e os mesmos nomes de coluna do TS (coerência cross-service; o manifesto `template.config.ts` já a declara, ganha `consumers: ['apiTs','apiGo']`). O campo entra no config Go ao lado do `Environment` de deploy, nomes distintos, sem colisão.
3. **Cada módulo declara o próprio overlay, colocado.** `channel.Overlay(env)` vive junto de `channel.Module`; `main.go` vira casca (`wiring.App(cfg.Env, core.Module+shared.Module+channel.Module, overlays)`). "Só quem diverge declara": integration troca store (temp dir) e `ChannelFactory` (mock); e2e troca só `ChannelFactory` (store segue real/arquivo — `CODM_DATA_DIR` scratch).
4. **`CODM_E2E` do Go morre; o TestIngress morre com ele.** A flag `TestIngress`, o guard do config e o pacote `testseam` são removidos. A entrada `CODM_E2E` do `template.config.ts` (hoje `consumers: ['apiGo']`) morre — zero consumidores.
5. **O canal roteirizado substitui a injeção de eventos.** `MockChannelFactory`/`MockChannel` (segunda implementação da porta existente, pacote fora de `controllers/` — a restrição do emissor OpenAPI vale para qualquer superfície nova) produz os fatos **pelos pipelines de produção**: pareamento comandado percorre o mapper real de connected; contatos entram por `StreamContactSnapshot` enlatado atravessando o sync real; mensagens inbound pelo ingest real; `SendMessage` devolve resultado determinístico. Núcleo scriptado: `Connect`/`Status`/`GetQRChannel` (frames enlatados)/pareamento/`SendMessage`/`StreamContactSnapshot`/`Logout`/identidade (`GetOwnerRemoteID`/`GetChannelID`/`GetDeviceID`); o resto: no-ops honestos que crescem por demanda. **Semear estado gateway-owned = roteirizar o canal** — não existe "given-ingress" por HTTP.
6. **Determinismo por roteiro declarado no boot, sem plano de controle runtime (YAGNI).** O cenário do mock (QR frames, auto-pareamento após conectar, snapshot de contatos, mensagens a emitir) é declarado na criação — via config/arquivo de cenário passado pelo harness/e2e. NENHUM endpoint de comando nasce nesta spec; se um teste concreto provar necessidade de comando em runtime, ele nasce como maquinário genérico do `testenv` no core (decisão futura com evidência), nunca como exceção do channel.
7. **`testenv` no core-go.** `testenv.Start(t, env, opts)` → fx app com overlay do serviço, `CODM_DATA_DIR` temp, porta efêmera, `t.Cleanup(stop)`, devolvendo `{URL, DB}`. Testes do contexto channel usam-no para QR/pareamento/emissão de eventos com outbox e `sql_external_mediator` **reais** (já herméticos em-processo).
8. **Rail de fiação por coluna.** `wiring_test.go` (por serviço) roda `fx.ValidateApp` para `real`, `integration` e `e2e` — provider faltando quebra no CI, não no boot. Falseador obrigatório: remover um provider transitoriamente → rail vermelho.
9. **O harness do console ganha serviços opt-in pelo manifesto.** `useIntegrationBackend({ services: ['apiGo'] })` — chaves são ids de `REPO.workspaces` do `template.config.ts`; a **receita de boot** de cada serviço participante (comando de build/run, env a passar, health URL, como receber porta e dataDir) é **declarada no manifesto** (contrato antes de implementação — NN-5), e o harness resolve por lookup, zero nome de serviço hardcoded. Default sem `services`: TS-only, os ~121ms atuais intactos.
10. **Store compartilhado pela topologia de produção.** Sob `services: [...]`, o harness cunha um scratch dir; o `start()` do TS ganha a opção declarada `dataDir` (o driver de `integration` usa arquivo nesse dir em vez de mkdtemp); o serviço Go sobe como subprocesso com `CODM_ENV=e2e` + o MESMO `CODM_DATA_DIR` — um arquivo, dois processos, como produção. `reset()` continua funcionando (trunca pelo driver do TS; tabelas do gateway inclusas — verificação no plano).
11. **O stub 501 sobrevive como default e aprende o vocabulário novo.** Sem opt-in, chamada a endpoint Go continua falhando alto — mensagem atualizada para apontar `services: ['apiGo']`. Com opt-in, a URL do Go aponta pro subprocesso real e o teste da fronteira ganha o caso positivo.
12. **O e2e sobe o gateway.** Terceiro webServer no Playwright (`CODM_ENV=e2e` + scratch dir compartilhado + cenário mock); os 12 specs existentes seguem verdes intocados; um spec novo de QR (conectar canal → QR na tela → auto-pareamento → CONNECTED no console) nasce como prova da capacidade.
13. **Os 3 componentes só-visuais migram** para testes de comportamento no harness com `services: ['apiGo']`: ContactStep (lista de contatos real via snapshot do mock), SessionChatSection (volume de transcript real via mensagens roteirizadas), SetupChecklist/UserProfile (`channelDone` real via pareamento roteirizado). Asserções novas, cobertura que hoje não existe — cada uma falseada (RED com pipeline quebrado).
14. **Convenção de commits da frente anterior**: ondas coesas; a base core-go portável separada das aplicações do channel e das migrações de produto.
15. **Princípio de simetria do template (registrado, não escopo):** a base do eixo mora no core de cada linguagem (`core-typescript`: BoundedContext/Registry/Config — já commitado; `core-go`: `wiring` — esta spec); o serviço declara colunas; o harness de teste vira core quando houver um segundo consumidor na mesma linguagem (gatilho para promover o `testing.ts` do TS a `createIntegrationHarness(start)` no core-typescript — hoje YAGNI, um chamador só).

## User Stories

- **Story 1:** Como desenvolvedor de um fork com um serviço Go novo, quero herdar o eixo do core-go declarando só minhas colunas, para nunca reinventar fiação de ambiente.
  - Given o pacote `wiring` do core-go, when componho `wiring.App(env, base, overlays)` com meu overlay, then real/integration/e2e resolvem por lookup e o rail `wiring.Validate` cobre as três colunas (AC-1, AC-8).
- **Story 2:** Como desenvolvedor do gateway, quero testar o fluxo de QR sem telefone, para o pareamento ter cobertura real.
  - Given `testenv.Start(t, integration)` com o canal mock, when o teste conecta um canal e o roteiro auto-pareia, then o mapper real de connected roda, `gateway_connected` aparece no outbox real e o status projeta CONNECTED (AC-3, AC-4).
- **Story 3:** Como desenvolvedor do console, quero testar comportamento gateway-owned no harness, para os 3 componentes só-visuais virarem testes de verdade.
  - Given `useIntegrationBackend({ services: ['apiGo'] })`, when o mock semeia contatos via snapshot e o teste monta o ContactStep, then a lista renderiza dados que atravessaram o sync real do gateway (AC-6, AC-7).
- **Story 4:** Como operador, quero o e2e cobrindo a tela de QR, para regressão de pareamento morrer no CI.
  - Given o gateway no Playwright com canal mock, when o spec conecta um canal pelo console, then o QR aparece e o CONNECTED chega à tela (AC-9).

## Acceptance Criteria

- [ ] AC-1: `wiring` existe no core-go sem nenhum símbolo específico de serviço (grep por `channel|whatsmeow|codm` no pacote → 0); `channel.Overlay` declara as colunas do gateway colocado ao módulo; `main.go` é casca que lê `CODM_ENV`.
- [ ] AC-2: `CODM_E2E` não existe no repo (grep = 0 fora de specs/plans/história); `TestIngress`, o guard do config e o pacote `testseam` removidos; `template.config.ts` sem a entrada; fail-closed novo: gateway com `CODM_ENV` não-real + `ENVIRONMENT=PRODUCTION` recusa boot (teste).
- [ ] AC-3: teste Go-interno do fluxo de QR verde via `testenv`: conectar → frames de QR do roteiro → auto-pareamento → mapper real → `gateway_connected` no outbox → projeção CONNECTED. Falseado: quebrar o mapper → RED.
- [ ] AC-4: teste Go-interno de emissão de eventos verde: mensagem inbound roteirizada atravessa o ingest real e materializa projeção + linha de outbox consumível pelo `sql_external_mediator` real.
- [ ] AC-5: rail `wiring_test.go` com `fx.ValidateApp` pelas 3 colunas, falseado (provider removido → RED).
- [ ] AC-6: `useIntegrationBackend({ services: ['apiGo'] })` sobe o gateway como subprocesso sobre o MESMO arquivo SQLite (provado: seed roteirizado no gateway visível por query do lado TS na mesma run); receita de boot declarada em `template.config.ts`; default sem `services` inalterado (tempo de boot TS-only registrado antes×depois).
- [ ] AC-7: os 3 componentes só-visuais têm testes de comportamento verdes no harness com `services: ['apiGo']`, cada um falseado; as stories só-visuais correspondentes são substituídas/reduzidas conforme a regra de fronteira.
- [ ] AC-8: sem opt-in, endpoint Go no harness falha 501 com mensagem apontando `services: ['apiGo']`; com opt-in, o mesmo endpoint responde do subprocesso real (os dois casos no teste da fronteira).
- [ ] AC-9: e2e com o gateway como terceiro webServer: 12 specs existentes verdes intocados + spec novo de QR verde.
- [ ] AC-10: bateria completa verde (go test, api 1378+, react 259+, tooling, e2e) e `go vet`/lint do Go limpos.

## Risks & Migration

- **`reset()` cross-service**: truncar tabelas gateway-owned (`whatsmeow_*`, projeções do channel) do lado TS entre testes precisa verificação empírica cedo (spike na primeira onda do plano) — o gateway mantém estado em memória (sessões de canal) que um truncate não limpa; o roteiro do mock deve tolerar reset ou o harness re-spawna o subprocesso (medir custo).
- **Porta efêmera do subprocesso**: o harness escolhe porta livre e passa por env (mais simples que parse de stdout) — decisão de plano.
- **Custo de boot do gateway** no opt-in: compilar uma vez por processo de teste (`go build` cacheado) + spawn; medir e registrar; se proibitivo, o plano decide cache de binário.
- **O smoke Go que consumia o testseam** (se existir consumidor vivo): migra para o mock roteirizado na mesma onda que mata o pacote.
- **21 pontos**: o plano fatia em ondas (base core-go → mock+testenv+rails → morte do TestIngress+e2e → cross-service+migrações), cada onda com gate próprio e commit próprio; a base core-go é portável isolada.

## Open Questions

- Nenhuma bloqueante. Formato do cenário do mock (struct de config vs arquivo) e mecânica exata do build/spawn são decisões de plano com os arquivos abertos.
