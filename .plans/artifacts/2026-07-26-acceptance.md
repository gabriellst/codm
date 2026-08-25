# T31 — Aceite da Fase 0 (daemon TS sobre o SQLite compartilhado)

Plano: `.plans/2026-07-26-daemon-sqlite-migration.md` (bloco 4, T31).
Deliverable executável: `packages/api/typescript/scripts/smoke-shared-store.ts`.
Saída do run aceito: `.specs/codedm/phase0-smoke/smoke-shared-store.log`.

## Procedência

| campo | valor |
|---|---|
| branch | `sqlite-shared-store` |
| commit (antes deste) | `0dc1a5a999dd2923ed68899accc68124fb4e62aa` (T30B) |
| host | `Darwin-arm64` |
| bun | `1.3.14` |
| node | `v24.18.0` (nvm — **não** está no PATH nu; armadilha A2) |
| data | 2026-07-27 |

## 1. O invariante, e como o run o provou

**O gateway Go e o daemon TS leem e escrevem UM arquivo SQLite.** Duas travessias cross-process
sobre a MESMA linha, cada uma com controle negativo antes:

```
control 1 — o daemon NÃO vê channel nenhum      channels=[]
CROSSING_1=ok    STATUS_1=CREATED               (gateway INSERT → daemon lê)
                 arquivo: id=<ch> status=CREATED version=1
control 2 — o daemon ainda NÃO reporta CONNECTED  status=CREATED
CROSSING_2=ok    STATUS_2=CONNECTED             (gateway UPDATE na MESMA linha → daemon relê)
                 arquivo: status=CONNECTED version=1→2, count(*) gateway_channels = 1
CONNECTED_LITERAL_REACHED=yes
DAEMON_LAUNCH=bundle
NO_POSTGRES_REACHABLE=ok
RESULT=ok                                        EXIT=0
```

**Variante rodada: a FORTE.** `CONNECTED_LITERAL_REACHED=yes` — a travessia 2 chega no literal
`CONNECTED` pelo seam de T30B, não na variante fraca `CREATED → CONNECTING` do `/connect`. O
incremento de `version` (1 → 2) com `count(*) = 1` é o que prova que foi o `ON CONFLICT ... version
= version + 1` do `repo.Save`, e não uma segunda linha.

### Controle negativo DO PRÓPRIO SCRIPT — rodado

Um smoke que passa de primeira não prova nada até falhar quando deve. Reproduzido o bug que esta
fase mata (os dois processos em data dirs DIFERENTES, com uma edição temporária, revertida):

```
$ bun packages/api/typescript/scripts/smoke-shared-store.ts   # daemon com CODEDM_DATA_DIR próprio
  ok   control 1 — the daemon sees NO channel yet — channels=[]
RESULT=fail — daemon never reported status CREATED (last: <none>)
EXIT=1
```

⇒ o script discrimina. O controle interno (control 1) continua passando, e é a travessia que
reprova — exatamente a polaridade certa.

## 2. Contexto do arquivo no fim do run (asseverado pelo script)

```
codedm.db  codedm.db-shm  codedm.db-wal  codedm.db.lock  daemon.lock   (nenhum subdiretório)
PRAGMA journal_mode                      ⇒ wal
_sqlite_migrations                       ⇒ 2 linhas (uma por arquivo .sql)
__drizzle_migrations                     ⇒ não existe
tabelas drizzle                          ⇒ 25
tabelas whatsmeow_*                      ⇒ 16   (co-tenância POSITIVA, não ruído filtrado)
linhas de outbox com claim PRESO         ⇒ 0    (armadilha A4 — não um zero instantâneo)
```

Locks: `codedm.db.lock` (gateway) e `daemon.lock` (daemon) coexistem no mesmo dir — single-instance
por PAPEL, decisão (c), com os dois processos vivos ao mesmo tempo.

Outbox ao fim do run:

```
gateway      channel.channel_created            done=1
gateway      channel.channel_connected          done=1
integration  integration.channel.connected      done=0
gateway      channel.sync_started               done=1
integration  integration.channel.sync_started   done=0
```

`done=0` na lane `integration` é **correto, não pendência**: o `SqlExternalMediator` do TS recusa
claim quando nenhum handler externo está registrado para o nome (claimar o que não se entrega
queima o orçamento de retry e dead-letta o tráfego do gateway). Nenhum handler TS assina
`integration.channel.connected`/`.sync_started` hoje. A lane em si é provada por teste executável
em T29, caso 2.

## 3. RSS — delta contra o baseline de T01

**Método idêntico ao de T01** (é o que torna o delta comparável): `bun run src/index.ts` com
`CODEDM_DATA_DIR` num dir temporário e `API_PORT` próprio; espera `GET /v1/session` responder 200;
**30s** de regime; três leituras de `ps -o rss= -p <pid>` com **10s** de intervalo; mediana.

```
READY_AFTER_S=2
RSS_SAMPLES_KB=184352,183776,183888
RSS_MEDIAN_KB_AFTER=183888
RSS_MEDIAN_KB_BEFORE=337712        (T01, .plans/artifacts/2026-07-26-baseline.md)
RSS_DELTA_KB=-153824
RSS_DELTA_PCT=-45.5
DATA_DIR_KB_AFTER=508
DATA_DIR_KB_BEFORE=28256
```

~150 MiB a menos (-45,5%), acima da expectativa de 50-100 MB — o PGlite carregava um Postgres em
WASM, o libsql é um addon nativo. As três amostras variam <0,4%, então o número não é ruído.
Informativo, **não** gating.

Suplementar — o runtime que o smoke de fato sobe (`node dist/server.js`, o mesmo bundle do sidecar):

```
NODE_RSS_SAMPLES_KB=159120,159232,159664
NODE_RSS_MEDIAN_KB=159232
```

Registrado à parte de propósito: é outro runtime, então **não** entra no delta contra T01, que foi
medido sob bun.

`DATA_DIR_KB` mudou de substrato (dir do PGlite → um arquivo WAL + sidecars), então os dois números
estão aqui para a comparação ser possível, não porque sejam a mesma medida.

## 4. Sonda de interop de T07B — re-rodada neste host

`bun scripts/probe-sqlite-interop.ts` (exit 0):

```
HOST=darwin-arm64
LIBSQL_CLIENT_VERSION=0.17.4
LIBSQL_DEFAULT_FOREIGN_KEYS=1
LIBSQL_DEFAULT_BUSY_TIMEOUT=0
JOURNAL_MODE=wal
GO_JOURNAL_MODE=wal
WAL_INTEROP=ok
WAL_INTEROP_GO_READ_TS=yes
WAL_INTEROP_TS_READ_GO=yes
TS_OK=300
TS_ERR=0
GO_OK=300
GO_ERR=0
SQLITE_BUSY=0
FINAL_TS_ROWS=300
FINAL_GO_ROWS=300
PRAGMA_STICKY_BUSY_TIMEOUT=5000
PRAGMA_STICKY_FOREIGN_KEYS=0
PRAGMA_STICKY_JOURNAL_MODE=wal
PRAGMA_AFTER_TX_API_BUSY_TIMEOUT=0
PRAGMA_AFTER_TX_API_FOREIGN_KEYS=1
FD_BASELINE=4
FD_AFTER_500_TX_API=1002
FD_AFTER_500_MANUAL=4
FD_MANUAL_OWN_BASELINE=4
FD_MANUAL_OWN_AFTER=4
DIRTY_READ_ON_READ_CLIENT=no
DIRTY_READ_ON_WRITE_CLIENT=yes
READ_AFTER_COMMIT_SAME_PROCESS=yes
READ_AFTER_COMMIT_CROSS_PROCESS=yes
READ_AFTER_COMMIT_CROSS_PROCESS_LAG_MS=0
```

Os três gates do AC — `WAL_INTEROP=ok`, `READ_AFTER_COMMIT_CROSS_PROCESS=yes`,
`READ_AFTER_COMMIT_SAME_PROCESS=yes` — passam. E `FD_AFTER_500_TX_API=1002` contra
`FD_AFTER_500_MANUAL=4` continua sendo o motivo de `client.transaction()`/`db.transaction()`
estarem PROIBIDOS: ~2 fds vazados por chamada e reversão silenciosa de todo pragma por conexão.

## 5. Medição nova deste bloco (não contradiz nenhuma decisão da §3)

`busy_timeout` do client libsql local é uma espera nativa **BLOQUEANTE** — trava o event loop
inteiro. Sonda (dois clients, um arquivo, `busy_timeout = 3000`, `setInterval` de 50ms
atravessando a espera):

```
WAITED_MS=3262   TIMER_TICKS_DURING_WAIT=0   ERROR=LibsqlError: SQLITE_BUSY
```

Zero ticks. Consequência: **dois drivers no mesmo processo não contendem, eles travam** — o
esperador congela o loop de que o detentor precisa para chegar ao próprio `COMMIT` (medido com 4
drivers: 96.418ms de espera, depois `SQLITE_BUSY ×3`). Isso **confirma**, com custo medido, a regra
que `src/shared/index.ts` e `TestBed` já aplicam (um driver memoizado por processo) e é a razão de
o teste de boot concorrente de T28 usar processos de verdade dos dois lados. Nenhuma decisão de §3
foi reaberta.

## 6. Variante da prova — registro obrigatório

| eixo | valor |
|---|---|
| variante | **FORTE** — `CONNECTED_LITERAL_REACHED=yes` |
| como | seam de test-ingress do gateway (T30B, `internal/channel/testseam`), sob `CODEDM_E2E=true` |
| cadeia da escrita | HTTP do gateway → `Dispatch` → `ChannelConnectedHandler` → `uow.Execute` → `repo.Find` → `inst.SetConnected` (ENTIDADE) → `repo.Save` |
| lançamento do daemon | `DAEMON_LAUNCH=bundle` — `node dist/server.js` depois de `bun run build`, supervisionado pelo próprio script |
| escrita pelo script | nenhuma — o script só LÊ o arquivo (`sqlite3`), nunca escreve nele |
