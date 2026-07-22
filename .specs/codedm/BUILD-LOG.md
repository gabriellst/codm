# CodeDM BUILD-LOG — build noturno (goal 2026-07-21)

| Fase | Iterações | Estado | Notas |
|---|---|---|---|
| 1 STRIP+COLLAPSE | 2 (cirurgia + fix de 8 leftovers) | ✅ VERDE | 7 commits (d24358cf..5bc55984); gates tsc/test/build/tooling/contracts verificados sem cache. Desvios registrados: billing.subscription_changed mantido como stub de contrato (consumidor Go activity); stubs compiláveis p/ eventos auth mortos; popover de notificações mantido como futura superfície SSE-badge. |
| 2 EMBEDDED PGLITE | 1 (binding swap) + 1 (grader iteration 1) | ✅ VERDE | `real` DrizzleDatabaseDriver trocado de NodePgDriver+Postgres externo para PGlite **file-backed** em `CODEDM_DATA_DIR` (founder decision 3). Migrations aplicam no boot (idempotente, migrator drizzle/pglite). Tests seguem PGlite in-memory. External mediator **inalterado**: `EventEmitter2Mediator` in-process (NÃO há transporte Redis neste repo — a palavra "Redis" em comentários foi corrigida). |

## Decisões da noite
- (fase 1) manter FCM-token e eventos auth como stubs compiláveis em vez de cirurgia profunda — remoção definitiva fica pro contract lock da fase 3, que redefine a superfície.
- (fase 2 / grader iteration 1) O binding `real` é um `useFactory` per-resolve e o tsyringe-neo NÃO memoiza factories → cada `resolve` mintava um `new PGlite(dataDir)` divergente (instâncias vivas sobre o mesmo dir não compartilham estado), matando o write-side event-driven. Fix: memoizar a instância única do driver + `db` via `registerInstance` no boot (`shared/index.ts`, espelha `TestBed.ts:92-93`). Segundo fix: guarda single-instance por lockfile PID **sibling** (`<dataDir>.lock`, fora do pgdata pra não quebrar o initdb do PGlite) — segunda daemon no mesmo dir falha alto com `DataDirLockedError`.

## Fase 2 — boot smoke (reproduzível)

```bash
SCRATCH=$(mktemp -d /tmp/codedm-smoke.XXXX)
cd packages/api/typescript
CODEDM_DATA_DIR="$SCRATCH" API_PORT=3099 bun run src/index.ts &   # boota daemon embedded
curl -s http://localhost:3099/v1/session                          # → HTTP 200
```

Evidência capturada (grader iteration 1, 2026-07-22):
- **Boot 1 (dir vazio):** log `Migrations applied (embedded PGlite)` → `api-ts listening on port 3099`; `GET /v1/session` → **HTTP 200** com o operator-seed constante (`operator@codedm.local`, id `…0001`); **23** arquivos pgdata materializados no dir (`base/`, `global/`, `pg_wal/`, `PG_VERSION`, `postmaster.pid`, …).
- **Boot 2 (mesmo dir populado):** `GET /v1/session` → **HTTP 200**; migrations no-op (nenhuma linha nova em `__drizzle_migrations`); **23** arquivos inalterados → true idempotência.
- **Lockfile:** presente (`<dataDir>.lock` com o PID) enquanto a daemon vive; removido pelo handler `process.once('exit')` no shutdown.
- **Guarda 2-daemon:** segunda daemon no mesmo `CODEDM_DATA_DIR` (porta diferente) **falha alto** com `DataDirLockedError` nomeando o PID detentor, exit 1 — sem divergência silenciosa.
- Gates: `tsc -p tsconfig.build.json` exit 0; `bun test` 369 pass / 0 fail; `bun run build` (2044 módulos); `bun scripts/env/generate.ts --check` ✓ in sync.
