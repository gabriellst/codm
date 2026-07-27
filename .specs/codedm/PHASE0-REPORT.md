# PHASE 0 REPORT — o store compartilhado (27-jul-2026)

> Branch `sqlite-shared-store`, **43 commits** off `main@4ac90824`. `main` **intocado**, **zero push**,
> árvore limpa. Contrato: `.specs/codedm/GOAL-agent-abstraction.md` §7 Fase 0. Plano executado:
> `.plans/2026-07-26-daemon-sqlite-migration.md` (34 tasks).

## O resultado

**O split-DB morreu.** Era a causa da lista de channels aparecer DISCONNECTED: o gateway Go escrevia em
Postgres e o daemon TS lia da própria PGlite embutida — dois bancos, um lendo o que o outro não escreveu.

Prova (`packages/api/typescript/scripts/smoke-shared-store.ts`, log commitado em
`.specs/codedm/phase0-smoke/`):

```
CROSSING_1=ok   STATUS_1=CREATED       DAEMON_LAUNCH=bundle
CROSSING_2=ok   STATUS_2=CONNECTED     NO_POSTGRES_REACHABLE=ok
CONNECTED_LITERAL_REACHED=yes          RESULT=ok   exit 0
```

Duas travessias cross-process **na mesma linha**, com controle negativo antes de cada uma: o gateway cria
(daemon lê `CREATED`), o gateway transiciona pelo caminho real da entidade (daemon relê `CONNECTED`).
A corroboração que importa: `version` 1→2 com `count(*) gateway_channels = 1` — é o `ON CONFLICT` do
`repo.Save` na mesma linha, não uma segunda linha. Comparação exata, nunca substring.

**Memória: 337.712 KB → 183.888 KB, −45,5% (~150 MiB).** Método idêntico ao baseline da T01 (mesmo boot,
30s de regime, mediana de 3 amostras 10s apart; spread <0,4%). O heap wasm do Postgres-em-wasm morreu junto.

## Gates (todos re-rodados por mim no HEAD)

| gate | resultado |
|---|---|
| api tsc (`tsconfig.build.json`) | ✅ |
| api tests | ✅ **649 pass, 0 fail** |
| workspace tsc (7 projetos) | ✅ |
| lint (3 projetos) | ✅ |
| test:tooling | ✅ 298 pass |
| go build/vet/test (2 módulos) | ✅ |
| **e2e RUNTIME** | ✅ **5 passed / 2 skipped** — baseline pré-fase restaurado |

## Quatro bugs reais, todos silenciosos

Nenhum apareceria em `tsc` nem em teste unitário. Os três primeiros teriam ido para produção.

1. **Roubo de linha no outbox.** O `DrizzleOutboxDispatcher` do TS filtrava só por `processed_at IS NULL`
   e **não** por `source` (grep: 0 ocorrências). Numa tabela compartilhada ele reivindicaria, despacharia
   pelo próprio mediator e **deletaria** as linhas do gateway Go. Fechado com a partição em 3 lanes
   (`api` / `gateway` / `integration`), claim com lease+token, e tombstone no lugar do delete.

2. **`publish()` fire-and-forget perdendo conclusões de issue** — achado perseguindo um teste "flaky".
   Era `void tryCatchAsync(() => dispatch(event))`, mas todo handler `Publish*IntegrationEvents` republica
   eventos em sequência contando que cada `await publish(...)` entregue antes da próxima linha. Sem o
   await viraram promises soltas resolvendo fora de ordem:
   `publish FIRED integration.issue.completed` → `OpenIssue SAVED` → `CompleteIssue found=false`. E como
   `CompleteIssue` trata "não encontrada" como no-op idempotente, **a conclusão se perdia para sempre**.
   Inversão que vale registrar: com a asserção correta o run **isolado** falhava 100% das vezes enquanto o
   paralelo passava — o barulho reordenava as promises a favor. *O teste flaky escondia o bug.*

3. **Vazamento de fd no libsql, evitado por desenho.** Medido no gate T07C: `client.transaction()` vaza
   ~2 descritores por chamada, linear, **sem platô** — 500 tx → 1002 fds contra baseline 4. O
   `drizzle-orm/libsql` chama exatamente isso, então o dispatcher de outbox teria estourado o limite em
   horas. Além disso os pragmas **não sobrevivem** (busy_timeout volta a 0, foreign_keys a 1). Mecanismo
   enviado: `BEGIN IMMEDIATE` manual num write client dedicado atrás de mutex FIFO + read client separado
   → fds estáveis (4 == baseline) e pragmas grudados. `DIRTY_READ_ON_WRITE_CLIENT=yes` confirma que a
   separação read/write é load-bearing, não estética.

4. **Race de migration entre os dois processos.** Dois appliers sobre um arquivo, cada um com o seu
   ledger, colidiriam. Fechado: ledger único `_sqlite_migrations`, dual-apply simétrico e idempotente,
   com o re-check **dentro** da txn `BEGIN IMMEDIATE` (TOCTOU). Provado por um teste que corre os dois
   appliers sobre um ledger frio.

## O que a disciplina de revisão custou e rendeu

O plano levou **7 rodadas** até passar do bar; cada uma achou defeito que teria queimado a execução:
- `grep -q CONNECTED` **passa em "DISCONNECTED"** — o critério que fecha a fase passaria no próprio sintoma.
- Um gate proibia `client.execute(` enquanto a decisão (a) **exige** `client.execute('BEGIN IMMEDIATE')`.
- `\bnow\(\)` casa com `Date.now()`, então uma task exigia e proibia a mesma coisa.
- `| tee` **come o exit code** (`exit 3 | tee` → 0) — havia gate silenciosamente vacuoso.
- O `openapi.json` do Go é gitignored: uma AC de `git status` nele seria vacuamente positiva.
- `smoke-node-boot.ts` **descarta** um `CODEDM_DATA_DIR` externo (chave explícita vence o spread) e mata o
  filho em ~1,5s — reusá-lo "provaria" o store compartilhado com os dois processos em arquivos diferentes.

A lição operacional, agora regra no §8 do plano: **toda AC é executada antes de ser escrita**, e a task que
fecha a fase é um **script commitado que sai 0**, não uma sequência de shell fixada em markdown — quatro
rodadas tentaram escrever código dentro do documento e cada uma produziu o blocker da seguinte.

## PARKED (com findings, nada omitido em silêncio)

1. **`docker build -f docker/Dockerfile.api` inexecutável neste host.** O daemon Docker não puxa imagem
   alguma (>600s em `resolve image config`; `docker pull alpine:3.20` 90s sem saída) enquanto o `curl` do
   próprio host alcança o registry — problema de rede do daemon, não do Dockerfile. Verificado no lugar:
   `docker compose config` exit 0 e o `dist/` real contém o que o COPY reescrito afirma.
   **Continua não provado: o alvo linux** (o prebuild `@libsql/linux-*-gnu` e o build dentro do builder).
2. **Aviso de portabilidade herdado:** as medições de concorrência e de fd são de `darwin-arm64`. Outros
   triples não foram medidos.

## Estado para a próxima fase

O contrato do agent (`GOAL-agent-abstraction.md`) segue válido e agora **desbloqueado**: a Fase 0 era
pré-requisito declarado ("não abrir o contexto `agent` com esta fase em aberto"). As fases 1–7 do goal
— `ProviderDef` + contract lock, `StreamJsonCodec` + `run()`, virar os consumidores e matar o split
one-shot/PTY, sessão durável + resume, o bounded context `agent`, o servidor MCP com as tools de domínio,
e o frame SSE estruturado — podem começar.
