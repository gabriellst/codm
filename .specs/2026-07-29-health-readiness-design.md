# Frente B1 — health/readiness dos sidecars

**Date:** 2026-07-29
**Status:** Approved
**Bounded Context:** ui/shared (TS) + shared (Go) + tauri
**Kind:** feature
**Story Points:** 13 — três runtimes coordenados (daemon TS, gateway Go, shell Rust), shape novo (primeiro controller público) + fonte de verdade de config migrando de literal duplicado para gerado, sem contrato TypeSpec novo

## Context

Hoje não existe nenhum endpoint de health no repo. O que a shell Rust (`packages/app/tauri/src-tauri/src/sidecars/mod.rs`) faz na prática é pingar endpoints de negócio que só *acontecem* de responder 200 rápido:

- Daemon TS: `GET /v1/session`, endpoint real de sessão, zero I/O quando não há cookie.
- Gateway Go: `GET /api/openapi.json`, os bytes estáticos do spec OpenAPI.

O probe é TCP cru sobre `std::net::TcpStream` (`probe()` em `mod.rs`), 1.5s de timeout por tentativa, budget total de 60s, polling a cada 500ms. A janela principal (`"visible": false` em `tauri.conf.json`) só é revelada quando `note_ready()` conta que todos os sidecars responderam — **mas** `note_ready` também é chamado no branch de give-up (spawn falhou, probe estourou o budget), ou seja, o comportamento é FAIL-OPEN: a janela abre mesmo se um sidecar nunca respondeu, e o operador vê um app quebrado silenciosamente em vez de um erro explícito.

Os caminhos de cada probe estão hardcoded em dois lugares que precisam ficar em sincronia manual: `sidecars()` em Rust (`health_path: "/v1/session"` / `"/api/openapi.json"`) e `SIDECARS` em `packages/app/tauri/config/sidecars.ts` (campo `healthPath`, hoje só documentação — o comentário do próprio arquivo diz "documented here; the Rust supervisor owns the runtime probe"). `config/generate.ts` já lê `SIDECARS` para outras superfícies (CSP `connect-src`, `externalBin`, `bundle.resources`) e escreve dois arquivos committed: `src-tauri/tauri.conf.json` e `src-tauri/capabilities/default.json` — não existe hoje nenhum artefato gerado que o Rust leia em runtime além desses dois JSON.

Nenhum controller do daemon TS é público hoje — todos passam por `OperatorMiddleware` (`packages/api/typescript/src/shared/context-map.ts:26` e o registry da skill controller TS documentam esse padrão como universal).

Candidatos a check de boot, todos em `packages/api/typescript/core/src`:
- `LibsqlDriver` (`db/drivers/LibsqlDriver.ts`) expõe `db: DrizzleClient` (conexão de leitura) e `readMigrations(): Promise<MigrationStatus>` (`{ applied, pending }`) — dá pra checar `SELECT 1` e migração pendente sem novo método.
- `DrizzleOutboxDispatcher` (`services/OutboxDispatcher/DrizzleOutboxDispatcher.ts`) e `SqlExternalMediator` (`services/Mediator/SqlExternalMediator.ts`) guardam o timer do poll num campo privado `#timer`/`timer` — hoje sem getter público de "estou rodando".
- `MailboxDispatcher` (`packages/api/typescript/src/agent/services/MailboxDispatcher/MailboxDispatcher.ts`) é uma classe abstrata com `start()`/`stop()`, mesma lacuna de getter público.

Carve-out relevante: `packages/api/typescript/src/shared/registry.ts:95-120` deixa o driver INERTE sob `EMIT_OPENAPI=true` (a rota de emissão do spec roda sem tocar banco real) — qualquer novo controller/registro de health não pode depender de I/O real nesse modo, ou quebra `bun sdk`/`emit-openapi`.

No Go, `packages/api/go/core/module.go` é o `fx.Module` "shared" que já expõe `*sqlite.SqliteStore` (via `provideSqliteStore`), cujo `DB()` (`core/db/sqlite/store.go:144`) devolve o `*sql.DB` compartilhado com o daemon TS. Controllers Go se registram no grupo `fx.ResultTags("group:\"controllers\"")` (ver `internal/shared/module.go`, `internal/channel/module.go`) e implementam a interface `types.Controller` (`core/types/controller.go`: `Metadata()` + `Handle()`); `Metadata().Middlewares` é por-controller, não há middleware global de auth. O estado da conexão WhatsApp vive em `packages/api/go/internal/channel/enums/channel_status.go` (`ChannelStatus`, alias do enum congelado em `contracts-go/wire`).

## Problem

O boot readiness da shell hoje mede a coisa errada (dois endpoints que respondem rápido por coincidência, não porque o processo está pronto) e falha na direção mais perigosa: quando o probe não confirma prontidão, a janela abre do mesmo jeito. Isso já foi identificado no próprio código-fonte (`note_ready`'s docblock: "the shell painted the console the moment the webview existed, while the daemon was still applying migrations") mas nunca resolvido para o caso de give-up — só para o caso de sucesso. Além disso, os dois lados que precisam concordar sobre o caminho de probe (`/v1/health` vs `/health`, por exemplo) só concordam hoje por disciplina manual entre um arquivo Rust e um arquivo TS.

## Goal

Dar ao daemon TS e ao gateway Go um endpoint de health real que reflete o estado de boot dos componentes que importam (banco, migrações, dispatchers), fazer a shell Rust confiar nesse sinal em vez de um proxy incidental, remover o fail-open (dar visibilidade explícita de erro ao operador em vez de silêncio), e parar de duplicar o caminho do probe à mão.

## Decisions

1. **`GET /v1/health` público no daemon TS.** Primeiro controller do repo sem `OperatorMiddleware` — `middlewares` fica no default (`[]`) herdado de `Controller` (`packages/api/typescript/core/src/types/Controller.ts`). Esse shape (controller deliberadamente sem middleware de auth) é novo e precisa ser documentado na skill `controller` (variante `typescript`) como padrão sancionado, não como omissão.

2. **Gate de boot vs. diagnóstico.** Reprovam o gate (retornam não-ready):
   - DB: `SELECT 1` no driver (`LibsqlDriver.db`, a conexão de leitura exposta).
   - Migrações aplicadas: `LibsqlDriver.readMigrations().pending` vazio.
   - Dispatchers ativos: `DrizzleOutboxDispatcher`, `MailboxDispatcher` e `SqlExternalMediator` com o timer de poll rodando.

   O estado do canal WhatsApp entra no payload como diagnóstico — nunca reprova o gate.

3. **Shape: `HealthCheck` no core, agregado via DI.** Interface `HealthCheck { name: string; check(): Promise<...> }` declarada em `@codedm/core-typescript`. Serviços (driver, cada dispatcher) registram sua própria implementação via `multi-inject` no container tsyringe-neo (mecanismo hoje inexistente no repo — primeiro uso). Um `HealthService` agrega os checks registrados e monta a resposta `{ status, components: { <name>: { status, ... } } }` — o mesmo shape por componente que um futuro painel de diagnóstico consome.

4. **`GET /health` real no Go (fx).** Novo controller no grupo `group:"controllers"` do módulo `shared` (`core/module.go`), implementando `types.Controller`, checando o SQLite compartilhado via `store.DB()` (`SELECT 1`). Estado whatsmeow (`ChannelStatus`) entra no payload só como diagnóstico — nunca gate, porque o WhatsApp se conecta *pelo* app (não é uma precondição de boot do processo).

5. **Rust pinga os endpoints reais; fail-open morre.** `sidecars()` troca `health_path: "/v1/session"` → `"/v1/health"` e `"/api/openapi.json"` → `"/health"`. O branch de give-up (spawn falhou ou o budget de 60s estourou sem 200) deixa de chamar `note_ready`/`reveal_main_window` silenciosamente: a janela abre numa SPLASH de erro explícita — nome do sidecar que falhou, stderr capturado, botão de retry — em vez do dashboard quebrado. App sem nenhuma janela continua impossível: todo caminho (sucesso ou give-up) termina revelando alguma UI (janela principal pronta ou splash de erro).

6. **Health paths saem do hardcode duplo.** `config/sidecars.ts` continua a fonte única (`SIDECARS[].healthPath`, hoje só documentação). Mecanismo verificado: `config/generate.ts` não gera nenhum arquivo `.rs` — ele só escreve dois JSON committed, `src-tauri/tauri.conf.json` e `src-tauri/capabilities/default.json` (ver o cabeçalho do próprio arquivo, "Outputs (committed generated files)"). `renderTauriConf()` passa a incluir os `healthPath` de `SIDECARS` num campo dedicado desse JSON (Tauri aceita config de plugin arbitrária sob `plugins.<nome>`); `sidecars()` em Rust lê esse valor via `app.config()` em vez do literal hardcoded — o mesmo padrão já usado para `IDENTIFIER` (lido em runtime de `app.config().identifier`, conforme o comentário em `generate.ts:13-16`). `bun desktop:generate --check` (já wired em `test:tooling` via `generate.test.ts`) passa a cobrir esse campo como qualquer outro drift do JSON gerado.

## User Stories

**US-1 — Health check do daemon TS**
Given o daemon TS subiu, aplicou as migrações e os três dispatchers (`DrizzleOutboxDispatcher`, `MailboxDispatcher`, `SqlExternalMediator`) estão com o timer de poll ativo,
When um cliente faz `GET /v1/health` sem nenhum header de auth,
Then a resposta é 200 com `{ status: "ok", components: { db: {...}, migrations: {...}, outboxDispatcher: {...}, mailboxDispatcher: {...}, sqlExternalMediator: {...} } }`.

**US-2 — Health check reprova quando um gate falha**
Given as migrações têm arquivos pendentes (ledger `_sqlite_migrations` sem registrar um `.sql` presente no dir),
When um cliente faz `GET /v1/health`,
Then a resposta não é 200 e o componente `migrations` aparece com status de falha no payload.

**US-3 — Diagnóstico do WhatsApp não derruba o gate**
Given todos os gates de boot (DB, migrações, dispatchers) estão OK mas o canal WhatsApp está desconectado,
When um cliente faz `GET /v1/health`,
Then a resposta continua 200, e o estado do canal aparece só como campo de diagnóstico no payload.

**US-4 — Health check do gateway Go**
Given o gateway Go subiu e consegue abrir o SQLite compartilhado (`store.DB()`),
When um cliente faz `GET /health`,
Then a resposta é 200; se o `SELECT 1` falhar, a resposta não é 200 — e o estado whatsmeow nunca influencia esse status.

**US-5 — Shell não abre janela quebrada silenciosamente**
Given o gateway Go não sobe dentro do budget de 60s (processo morre ou nunca responde 200 em `/health`),
When a shell Rust atinge o give-up do probe,
Then a janela abre numa tela de erro explícita nomeando o sidecar, mostrando o stderr capturado, com um botão de retry — nunca revela a janela principal como se estivesse tudo ok.

**US-6 — Caminho do probe vem de uma fonte só**
Given `config/sidecars.ts` declara `healthPath: '/v1/health'` para o role `daemon`,
When alguém roda `bun desktop:generate`,
Then o valor aparece no `tauri.conf.json` gerado e `sidecars()` em Rust lê esse valor em vez de um literal — editar `sidecars.ts` e rodar o generate é suficiente para mudar o caminho probado, sem tocar `mod.rs`.

## Acceptance Criteria

- [ ] AC-1: `GET /v1/health` no daemon TS responde sem que nenhum `OperatorMiddleware` (ou qualquer middleware de auth) esteja na cadeia — request sem cookie/token recebe corpo de resposta, não 401/403.
- [ ] AC-2: Com DB, migrações e os três dispatchers saudáveis, `GET /v1/health` responde 200 com `components` listando `db`, `migrations`, `outboxDispatcher`, `mailboxDispatcher`, `sqlExternalMediator`.
- [ ] AC-3: Forçando `SELECT 1` a falhar (ou migração pendente, ou um dos três dispatchers parado), `GET /v1/health` responde com status HTTP diferente de 200 e o componente correspondente aparece marcado como falho no payload.
- [ ] AC-4: Mudar o estado do canal WhatsApp para desconectado, com todo o resto saudável, não muda o status HTTP de `GET /v1/health` — só o campo de diagnóstico do payload.
- [ ] AC-5: `EMIT_OPENAPI=true` (`bun sdk` / `emit-openapi`) continua terminando com sucesso e sem tocar I/O real — o registro do `HealthCheck` do driver não quebra o carve-out de `shared/registry.ts:95-120`.
- [ ] AC-6: `GET /health` no gateway Go responde 200 quando `store.DB()` aceita `SELECT 1`, e um status diferente de 200 quando a conexão falha; alterar o estado whatsmeow isoladamente não muda esse status HTTP.
- [ ] AC-7: `sidecars()` em Rust não contém mais os literais `"/v1/session"` nem `"/api/openapi.json"` como `health_path` — os dois sidecars probam `/v1/health` e `/health`, lidos de um valor gerado por `bun desktop:generate` (não hardcoded em `mod.rs`).
- [ ] AC-8: `bun desktop:generate --check` detecta drift se `SIDECARS[].healthPath` em `sidecars.ts` mudar e `tauri.conf.json` não for regenerado.
- [ ] AC-9: Simulando o give-up do probe (sidecar não responde 200 dentro do budget), a janela revelada é a splash de erro (nome do sidecar + stderr) com ação de retry, não a janela principal — e nenhum caminho do fluxo termina sem revelar nenhuma janela.

## O que sobe pro template

- **`HealthCheck` vira citizen do core** (`packages/api/typescript/core/src`): interface + `HealthService` de agregação, ao lado dos demais citizens de framework (`Controller`, `Middleware`, `OutboxDispatcher`). Documentar em `docs/BACKEND.md` junto dos outros citizens de infra.
- **Rail sugerido: "driver/dispatcher real registra um `HealthCheck`".** Qualquer novo binding `real` de um driver/dispatcher de longa duração (banco, mediator, dispatcher com timer) ganha a expectativa de também registrar seu `HealthCheck` via multi-inject — candidato a `bad_practice` no registry da skill `service`/`repository` (variante `typescript`): "serviço com ciclo de vida (`start`/`stop`) sem `HealthCheck` correspondente".
- **Skill `controller` (typescript): documentar o shape "controller público" como padrão sancionado.** Hoje o registry assume `OperatorMiddleware` universal; precisa de uma entrada explícita cobrindo quando `middlewares = []` é intencional (health/readiness), para não virar falso-positivo de review.
- **`multi-inject` tsyringe-neo — primeiro uso no repo.** Vale uma nota na skill `service`/`bounded-context` sobre o padrão de registro (um `HealthCheck` por serviço, agregados por token) como referência para o próximo caso de "N implementações, um agregador".
- **Mecanismo de sync `sidecars.ts` → Rust via `tauri.conf.json` gerado** (não `.rs`): documentar em `docs/CLI.md` ou no cabeçalho de `config/generate.ts`/`config/sidecars.ts` que campos runtime-relevantes para o Rust passam por um campo do JSON gerado (`plugins.<nome>`), lido via `app.config()` — mesmo padrão do `IDENTIFIER`. Fecha a lacuna que hoje deixa `healthPath` como "documentação apenas".

## Open Questions

- O shape exato do campo novo em `tauri.conf.json` (nome da chave sob `plugins`, ou outro local válido do schema Tauri 2 para dado arbitrário lido via `app.config()`) não foi confirmado contra o schema `https://schema.tauri.app/config/2` — validar na implementação.
- Código/HTTP status exato para "não-ready" (503 vs 200-com-status-no-body) não foi decidido pelo founder; o AC só exige "diferente de 200 quando falho" — a escolha fica para o `/plan`.
