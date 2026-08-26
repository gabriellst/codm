# T07C — GATE DE CONCORRÊNCIA INTRA-CLIENT

**Veredito:**

```
GATE=PASS_MECHANISM_CONFIRMED
```

O mecanismo da decisão (a) — dois clients, `BEGIN IMMEDIATE` manual, `TxGate` FIFO, e
`client.transaction()`/`db.transaction()` **proibidos** — se comporta neste host exatamente
como a decisão fechada afirma. **T08 está liberado.** Nenhuma medição contradiz (a), (b), (c)
ou (d), logo a regra do §8 ("contradição medida ⇒ parar e reportar") **não** foi acionada.

## Procedência

| campo | valor |
|---|---|
| host | `darwin-arm64` |
| `@libsql/client` | `0.17.4` (resolvido por T07, sem pin) |
| addon nativo | `libsql@0.5.29` → `@libsql/darwin-arm64@0.5.29` |
| lado Go | `modernc.org/sqlite v1.38.2`, DSN verbatim de `core/db/sqlite/store.go` |
| sonda | `scripts/probe-sqlite-interop.ts` + `packages/api/go/scripts/probe_sqlite_interop.go` (T07B) |
| saída bruta | `.plans/artifacts/2026-07-26-probe-Darwin-arm64.txt` |
| commit da sonda | `4f022856` |

O plano avisa que os internos citados na decisão (a) (rotação de conexão, `#db = null`) foram
lidos **fora deste checkout**, em `@libsql/client@0.17.4`, e que o executor poderia resolver
outra versão. Resolveu **a mesma**, 0.17.4 — mas o veredito abaixo continua vindo da medição
desta sonda, não daquele trecho.

## Números TRANSCRITOS da sonda (não parafraseados)

```
PRAGMA_STICKY_BUSY_TIMEOUT=5000
PRAGMA_STICKY_FOREIGN_KEYS=0
PRAGMA_STICKY_JOURNAL_MODE=wal
PRAGMA_AFTER_TX_API_BUSY_TIMEOUT=0
PRAGMA_AFTER_TX_API_FOREIGN_KEYS=1
FD_BASELINE=4
FD_AFTER_500_TX_API=1002
FD_AFTER_500_MANUAL=4
DIRTY_READ_ON_READ_CLIENT=no
DIRTY_READ_ON_WRITE_CLIENT=yes
READ_AFTER_COMMIT_SAME_PROCESS=yes
READ_AFTER_COMMIT_CROSS_PROCESS=yes
READ_AFTER_COMMIT_CROSS_PROCESS_LAG_MS=0
```

Contexto medido no mesmo run (fora da tabela de veredito, mas parte da mesma evidência):

```
LIBSQL_DEFAULT_FOREIGN_KEYS=1
LIBSQL_DEFAULT_BUSY_TIMEOUT=0
WAL_INTEROP=ok
JOURNAL_MODE=wal
TS_OK=300  TS_ERR=0  GO_OK=300  GO_ERR=0  SQLITE_BUSY=0
FINAL_TS_ROWS=300  FINAL_GO_ROWS=300
```

## Conferência do veredito, linha por linha da tabela de T07C

| condição | esperado | medido | resultado |
|---|---|---|---|
| `PRAGMA_STICKY_BUSY_TIMEOUT` | `5000` | `5000` | ✅ |
| `PRAGMA_STICKY_FOREIGN_KEYS` | `0` | `0` | ✅ |
| `PRAGMA_STICKY_JOURNAL_MODE` | `wal` | `wal` | ✅ |
| `FD_AFTER_500_MANUAL == FD_BASELINE` | igual | `4 == 4` | ✅ |
| `DIRTY_READ_ON_READ_CLIENT` | `no` | `no` | ✅ |
| `READ_AFTER_COMMIT_SAME_PROCESS` | `yes` | `yes` | ✅ |
| `READ_AFTER_COMMIT_CROSS_PROCESS` | `yes` | `yes` | ✅ |

⇒ primeira linha da tabela satisfeita ⇒ `GATE=PASS_MECHANISM_CONFIRMED`.

**E a segunda linha também** — o estado ideal, em que o custo do caminho proibido fica
medido *no repo* em vez de virar folclore:

| condição extra | esperado | medido | resultado |
|---|---|---|---|
| `FD_AFTER_500_TX_API >= FD_BASELINE + 500` | `≥ 504` | `1002` | ✅ |
| `PRAGMA_AFTER_TX_API_BUSY_TIMEOUT == 0` | `0` | `0` | ✅ |

A linha 3 (`DIRTY_READ_ON_WRITE_CLIENT == no`, que renderia uma nota de divergência de versão)
**não** se aplica: o valor medido é `yes`, exatamente o previsto.
As linhas 4 e 5 (`GATE=FAIL`) **não** se aplicam: nenhuma das suas condições ocorreu.

## O que cada número prova, em uma frase

1. **`BEGIN IMMEDIATE` manual não rotaciona a conexão.** Depois de **200** transações manuais os
   três pragmas continuam nos valores que aplicamos (`5000` / `0` / `wal`). Se a conexão tivesse
   sido trocada, `busy_timeout` teria voltado a `0` — que é justamente o que acontece no caminho
   proibido (`PRAGMA_AFTER_TX_API_BUSY_TIMEOUT=0`, `..._FOREIGN_KEYS=1`, ou seja **os defaults
   crus do libsql**, medidos em `LIBSQL_DEFAULT_*`).

2. **`client.transaction()` vaza, `BEGIN` manual não.** `4 → 1002` fds depois de **500**
   `client.transaction()` (≈ 2 por transação, sem platô: o GC não recolhe), contra `4 → 4`
   depois de 500 transações manuais. É este par de números que justifica proibir
   `db.transaction()` no repo inteiro — e é ele que T09 deve **transcrever no docblock do
   `LibsqlDriver`**, conforme a 2ª linha da tabela de T07C.

3. **O split leitura/escrita é load-bearing, e o risco (ii) da decisão (a) é real.** Com uma
   transação aberta no client de escrita, o client de **leitura** não vê a linha não-commitada
   (`no`) e o client de **escrita** vê (`yes`). Ou seja: uma leitura disparada pelo handle de
   escrita fora de `transaction()` **é** leitura suja cross-request. O guard de T13B (grep +
   `tx-discipline.test.ts`) não é zelo — é o que segura essa propriedade.

4. **A propriedade de que a fase inteira depende vale.** O handle de **leitura**, aberto ANTES
   e nunca reaberto, enxerga o commit: do próprio processo (`yes`) e do **gateway Go**
   (`yes`), com lag **0 ms**. Este é o modo de falha que a fase existe para matar — se fosse
   `no`, o console continuaria mostrando `DISCONNECTED` sobre dado correto, sem erro, sem log e
   sem teste reclamando.

5. **A serialização não custa correção.** 300 transações TS concorrentes (por `TxGate`, numa
   única conexão de escrita) contra 300 transações Go concorrentes, no mesmo arquivo:
   `TS_ERR=0`, `GO_ERR=0`, `SQLITE_BUSY=0`, e as 600 linhas no arquivo, contadas **pelo client
   de leitura**.

## O que este gate NÃO mediu (e continua valendo como risco escrito)

- **Congelamento do event loop sob contenção de escrita** — risco (i) da decisão (a). O driver
  local do libsql é síncrono atrás de assinatura async; a sonda não instrumentou ticks de timer
  durante espera de lock. Continua **aceito e escrito**, com mitigação por transações curtas e
  a proibição de `await` de I/O externa dentro de `uow.transaction` (classe 2 de T13B).
- **Outros triplos.** Tudo aqui é `darwin-arm64`. `linux-x64` e `win32-x64` continuam abertos
  (questão aberta 6 / T31); a sonda é re-executável nesses hosts sem alteração.
- **Cross-build de prebuilds.** `libsql@0.5.29` declara 9 `optionalDependencies` por triplo e o
  `bun install` baixou só a do host (`@libsql/darwin-arm64`). Morde no dia em que a CI fizer
  cross-build — registrado em T25.

## Consequência

Nenhuma das quatro decisões reabre. **T08 pode começar.**
