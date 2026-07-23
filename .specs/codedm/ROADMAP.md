# CodeDM — Roadmap (founder, revisado 2026-07-23)

## Decisão estratégica: Windows importa, mas valida-se em dev PRIMEIRO
Continuamos na arquitetura atual (domínio TS + Bun, gateway Go) até o app funcionar como deve em
dev. O porte do domínio para Go (binário único, ConPTY/Windows uniforme) fica como fase final
planejada — viável contexto-a-contexto graças ao contrato congelado. Critério de disparo: dev
validado + decisão de distribuição Windows.

## Fluxo (ordem dos fatos — founder, 2026-07-23)

1. **Alinhamento backend Go+TS** — EM EXECUÇÃO (madrugada 22→23-jul).
   - ✅ Pairing = padrão medscall proxy (contexto `external`, ChannelProxy wildcard, GREEN 96).
   - ✅ Conformidade Go FIX-NOW (7 lotes, GREEN 91) + auditoria 8-dimensões commitada.
   - ✅ Core adequation: `template/core-go` materializado, api-go fino consumindo o kernel
     (GREEN 90) — "just like typescript".
   - ✅ Union-slots piloto `message_received` (13/13, rail à prova de mutação, narrowing nas
     2 origens).
   - ✈ Em voo: upstream pro template (3 bugs + union-slots machinery) ∥ flat-events
     (envelope pre-work + swap dos eventos de forma estável + deleção dos hand-rolled).
   - Restam: lote 7 (mv `pkg/openapi`→core + decisão de markers), schema-handoff (hazard das
     colunas medscall, UoW real, `ChannelStatus`/`ContactKind`), tenancy (session/spoof-guard),
     consolidação de projectors 22→3, consumer XREADGROUP real, dívidas sem fase dona
     (dual-write exactly-once).
2. **Fase 10 — foundation runner** — ⚠ GATE: forks A-D aguardam ratificação do founder
   (A1 recomendado — motor completo; D REVISADO: Bun.Terminal nativo bun≥1.3.5 + spike PGlite em
   `bun build --compile`). Plano: `.plans/2026-07-22-phase10-foundation-terminal-extraction.md`.
   Emendas de contrato pendentes junto (StopKind += AUTH_REQUIRED etc.).
3. **Tauri (fase 11)** — shell desktop: app/{react,tauri}; seam lib/native (isTauri;
   `@tauri-apps/*` proibido fora); expo REMOVIDO; sidecars daemon+gateway via externalBin;
   skill desktop-shell. **Pode andar EM PARALELO à fase 10**: o scaffolding do shell não depende
   do runner real (que só é pré-requisito do teste de fogo). Decisão de transporte desktop
   (HTTP-local vs SQLite-WAL — ver DB-as-mediator) entra no design desta fase.
4. **Testar app** — teste de fogo (WhatsApp pareado real + claude-code real numa issue real).
   PULÁVEL por ora (founder, 23-jul) — fica atrás do runner real da fase 10.
5. **Melhoria do template completo** — template, tooling, skills e método de BOOTSTRAP para
   máxima autonomia; documentar/melhorar a ORQUESTRAÇÃO DE AGENTES (fases-workflow, grade-loops,
   triagem, BUILD-LOG como artefato). Fonte: template/.specs/2026-05-22-codedm-bootstrap-retrospective.md
   (+ adendo com as 32 minúcias) — TODOs priorizados: rail event-liveness, preflight de premissa
   nos evals (SKIP-STALE), StampSelection.contexts, fresh-install gate, gate de branch/SHA no
   source-map, sanitize-map centralizado, promote --at-base, etc.
   **Parcialmente ANTECIPADA (23-jul)**: 3 bugs reais + union-slots machinery + fix do blind spot
   de CI do core-go já subiram pro template (wf_f4e73db9-687); seam `app_middlewares` decidido
   codedm-only (dissolve na tenancy).
6. **Domínio em Go com outros contextos** — o porte final (4-7 fases estimadas): SQLite+sqlc,
   motor de terminal com creack/pty (ConPTY no Windows), contextos sobre o kernel `core-go` já
   materializado; console react + e2e + contrato sobrevivem.
   **RATIFICADO (founder, 23-jul): o domínio Go reescrito vive em CONTEXTOS PRÓPRIOS, distintos
   do `channel`** — o channel permanece o bounded context do gateway (whatsmeow/canais);
   workspace/thread/issue/artifact/terminal nascem como contextos Go novos sobre o core-go.

## DB-as-mediator (ideia do founder — substituir Redis por Postgres/SQLite)
Direção correta e alinhada com o precedente do kernel (PostgresCommandQueue já existe). Nuances a
resolver no design:
- **PGlite é single-process** — o gateway Go NÃO pode abrir o store do daemon TS. Logo o
  "DB compartilhado como transporte" no desktop implica **SQLite em modo WAL** (multi-processo
  seguro) como o store compartilhado: o outbox vira o próprio transporte (Go escreve rows; TS
  consome com o dedup UNIQUE já provado — at-least-once + idempotência = exactly-once). Isso
  converge com o futuro Go-only (SQLite era o destino de qualquer forma) — decisão de migração
  PGlite→SQLite pode ser antecipada ou o transporte interino fica HTTP local (adapter no
  dispatcher do outbox Go), com DB-as-mediator entrando junto do porte. AVALIAR no design da fase
  Tauri: HTTP-local agora (menor delta) vs SQLite-WAL agora (menos peças no total).
- Em modo servidor, Postgres LISTEN/NOTIFY + outbox polling cobre o mesmo papel — Redis sai de
  cena por completo como dependência obrigatória.

## Pendências de ratificação (founder)
- **Forks da extração (GATE da fase 10)**: A (A1 recomendado — motor completo) · B (issueId como
  identidade) · C (fundir no TerminalSessionRegistry) · D REVISADO (Bun.Terminal + spike
  compile/PGlite).
- Emendas de contrato: StopKind += AUTH_REQUIRED (rec sim); idle_evicted domínio-only;
  action_detected só frame SSE.
- Transporte desktop: HTTP-local vs SQLite-WAL (acima).
- Fase dona do dual-write events+outbox (exactly-once) e da atomicidade real do UoW.

## Union types de provider no contrato — IMPLEMENTADO (piloto 23-jul)
Design ratificado 22-jul (declaração única, forma com o dono, união em codegen, união completa em
toda superfície emissora, rail union-parity) — spec normativa: `union-slots-spec.md`.
Estado: **piloto `message_received` ponta a ponta no codedm** (decorators + estampagem + manifest +
scanner multi-slot + `ListenEvents` compondo schemas gerados + rail nos 3 checks à prova de
mutação, narrowing nas 2 origens); **machinery generalizada pro template em voo**
(wf_f4e73db9-687, fixture-based). Migração dos demais eventos: fase flat-events (em voo) +
bloqueados por harmonização de enum (schema-handoff).
