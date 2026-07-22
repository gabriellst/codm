# CodeDM — Roadmap pós-bootstrap (founder, 2026-07-22)

## Decisão estratégica: Windows importa, mas valida-se em dev PRIMEIRO
Continuamos na arquitetura atual (domínio TS + Bun, gateway Go) até o app funcionar como deve em
dev. O porte do domínio para Go (binário único, ConPTY/Windows uniforme) fica como fase final
planejada — viável contexto-a-contexto graças ao contrato congelado. Critério de disparo: dev
validado + decisão de distribuição Windows.

## Fluxo (ordem do founder)
1. **Finalizar UI** — ui-round-1 em execução (8 findings, .specs/codedm/ui-findings/ROUND1.md);
   rounds seguintes conforme teste manual do founder.
2. **Tauri** (fase 11) — shell desktop: app/{react,tauri}; seam lib/native (isTauri; @tauri-apps/*
   proibido fora); expo REMOVIDO; sidecars via externalBin; skill desktop-shell.
   ⚠ Inclui o pré-requisito: EXTRAÇÃO FOUNDATION (fase 10 waves — forks A-D aguardam ratificação;
   D REVISADO: Bun.Terminal nativo (bun≥1.3.5, POSIX) em vez de run-under-Node — spike valida
   PGlite dentro de `bun build --compile`). Sem o runner real, "Testar app" não testa agente real.
3. **Testar app** — teste de fogo: WhatsApp pareado de verdade + claude-code real numa issue real.
4. **Polimento do app + solidificação do framework desktop com Tauri** — o que aprendermos vira
   o toolkit desktop do template (packaging dos sidecars, updater, assinatura, seam nativo).
5. **Melhoria do template completo** — template, tooling, skills e método de BOOTSTRAP para máxima
   autonomia; documentar/melhorar a ORQUESTRAÇÃO DE AGENTES (fases-workflow, grade-loops, triagem,
   BUILD-LOG como artefato). Fonte: template/.specs/2026-07-22-codedm-bootstrap-retrospective.md
   (+ adendo com as 32 minúcias) — TODOs priorizados: rail event-liveness, preflight de premissa
   nos evals (SKIP-STALE), StampSelection.contexts, fresh-install gate, gate de branch/SHA no
   source-map, sanitize-map centralizado, promote --at-base, etc.
6. **Domínio em Go com outros contextos** — o porte final (4-7 fases estimadas): SQLite+sqlc,
   motor de terminal com creack/pty (ConPTY no Windows), contextos sobre o kernel Go já provado;
   console react + e2e + contrato sobrevivem.

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
- Forks da extração: A (A1 recomendado — motor completo) · B (issueId como identidade) ·
  C (fundir no TerminalSessionRegistry) · D REVISADO (Bun.Terminal + spike compile/PGlite).
- Emendas de contrato: StopKind += AUTH_REQUIRED (rec sim); idle_evicted domínio-only;
  action_detected só frame SSE.
- Transporte desktop: HTTP-local vs SQLite-WAL (acima).

## Union types de provider no contrato — DESIGN RATIFICADO (founder, 22-jul noite)
Declaração única no contrato, forma com o dono, união em codegen:
- TypeSpec: @unionSlot(campo, discriminadores) + @variant(valores..., nomeDoTipo, { owner: <id da tabela WORKSPACES> }) — owner validado contra o manifest (inexistente = erro de compilação do contrato).
- Contracts codegen ESTAMPA os comentários @union/@variant no struct Go GERADO → o scanner AST verbatim (pkg/openapi) resolve os nomes nos pacotes do workspace DONO e builda oneOf+discriminator → Kubb → uniões tipadas na SDK.
- Formas das variantes vivem SEMPRE no serviço dono (hoje: apiGo/adapter WhatsApp); consumidores importam o binding gerado, nunca redeclaram.
- RAIL union-parity: resolver por linguagem (v1: Go via scanner; TS via schema zod exportado; futuros = 1 resolver/linguagem, padrão detectLang) — nome não resolvido no dono = gate vermelho; import direto de forma alheia fora do binding = violação.
- Implementação: FILA imediatamente após pairing-conclude + astro-landing aterrissarem.
