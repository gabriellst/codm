# ADR 0006 — a porta de banco não carrega nome de tecnologia

- **Status:** aceito
- **Data:** 2026-08-14
- **Decisor:** founder (*"devemos fazer da mesma forma que o template faz: temos `PgDatabaseDriver` e
  `LibSqlDatabaseDriver` com `abstract readonly db: LibSqlDrizzleClient` e
  `abstract transaction<Return>(fn: (tx: LibSqlTransaction) => Promise<Return>): Promise<Return>`"*)
- **Precede:** a família `pg` do ADR 0005. Sem esta decisão, aquele ADR não tem onde aterrissar.
- **Espelha:** a decisão D1 do repo irmão (founder, 2026-08-12), com as correções que ele fez sobre
  este molde voltando junto.

## Contexto — o porte da família `pg` parou aqui, e não podia ser improvisado

O ADR 0005 decidiu que a nuvem roda sobre Postgres. Ao começar o porte, ele parou numa parede que
nenhuma quantidade de código de driver resolve.

`core/src/db/drivers/DrizzleDatabaseDriver.ts` era a **única** abstração de driver do repo, e a
assinatura dela **nomeava libsql**:

```ts
abstract readonly db: DrizzleTransaction              // = LibSQLDatabase<typeof schema>
abstract readonly unitOfWorkFactory: DrizzleUnitOfWorkFactory   // um CONCRETO da família libsql
abstract transaction<R>(fn: (tx: DrizzleTransaction) => Promise<R>): Promise<R>
```

Um driver Postgres tem `.db` do tipo `NodePgDatabase`. Não existe porte que reconcilie isso: ou entra
um cast — que a regra 1 do `CLAUDE.md` proíbe pelo nome (*"never widen a type, add `as any` / `as
unknown`"*) — ou a abstração deixa de nomear vendor.

Isto foi levantado como **PARE COM ACHADO** (commit `5405b6ed`) em vez de resolvido na hora, porque
é camada nova, e o programa desta readequação trata camada nova como decisão do dono, não do
executor.

## Decisão — três níveis, e o topo não fala de vendor

```
core/src/db/
├── drivers/DatabaseDriver.ts     TOPO — ciclo de vida + `lifetime` + `unitOfWorkFactory` neutra.
│                                 NÃO expõe `.db`.
├── libsql/                       FAMÍLIA libsql
│   ├── client.ts                   LibSqlDrizzleClient   (handle de LEITURA, token de DI)
│   ├── LibSqlDatabaseDriver.ts     MEIO — pina `.db` + declara `transaction()`
│   │                               e exporta `LibSqlTransaction` (handle de ESCRITA)
│   └── drivers/LibSqlDriver.ts     CONCRETO
└── pg/                           FAMÍLIA pg (ADR 0005)
    ├── client.ts                   PgDrizzleClient
    ├── PgDatabaseDriver.ts         MEIO
    └── drivers/{PgDriver,PGliteDriver}.ts
```

**Quem injeta o quê:** só ciclo de vida (`boot.ts`, `scripts/migrate.ts`) → o **topo**. Toca `.db`
(repositórios, outbox, idempotência, fila, BetterAuth, use cases de leitura) → o **meio da sua
família**. Os concretos são ligados **só** pelo registry.

**A saída genérica foi recusada**, como no irmão: `DatabaseDriver<T>` faria todo consumidor de ciclo
de vida carregar um parâmetro de tipo sobre um cliente que ele nunca toca. Não expor `.db` no topo é
o que dispensa o genérico.

### Duas correções que voltam do repo irmão

O template portou este molde daqui e **registrou os defeitos ao portar**. Eles voltam agora:

1. **Handle de leitura ≠ handle de escrita.** Havia UM alias (`DrizzleTransaction`) servindo ao `.db`
   injetado e ao handle que a transação passa ao callback. Com um tipo só, *"escrevi pela conexão de
   leitura por engano"* é uma troca do MESMO tipo — invisível para o `tsc`, e o defeito aparece como
   corrupção sob concorrência. Agora são `LibSqlDrizzleClient` (classe, identidade de DI) e
   `LibSqlTransaction` (alias, só parâmetro de callback).
2. **`unitOfWorkFactory` neutra.** O topo declarava `DrizzleUnitOfWorkFactory`, um concreto. Nasce
   `UnitOfWorkFactory` abstrata — é literalmente a razão de nenhum driver de outra família conseguir
   estender o topo antigo.

E nasce o eixo **`lifetime`** (`'process' | 'connection'`), que a assinatura de `close()` sozinha não
fala: o que a implementação FAZ ao ser fechada e quem pode cachear a instância. `LibSqlDriver` é
`'connection'` (segura duas conexões vivas, `close()` libera de verdade); o `PGliteDriver` que vem
com a família pg é `'process'`, e é disso que vive o reaproveitamento de snapshot entre suítes. **Não
há default** — família nova é obrigada pelo compilador a declarar o eixo antes de nascer.

## Consequências

1. **`DrizzleDatabaseDriver` deixa de existir por esse nome.** Vira `LibSqlDatabaseDriver`. Junto:
   `DrizzleTransaction`→`LibSqlTransaction`, `DrizzleUnitOfWork*`→`LibSqlUnitOfWork*`,
   `LibsqlDriver`→`LibSqlDriver`. **Medido: 101 arquivos, ~460 ocorrências**, todos dentro de
   `packages/api/typescript`. Foi codemod determinístico, não edição à mão.
2. **O prefixo `Drizzle` deixa de discriminar** no nível de infra. Com duas famílias sobre drizzle, o
   ORM é o motor debaixo e o **DIALETO** é o eixo que importa — a mesma conclusão que o irmão
   registrou ao revogar o `Drizzle*` dele. Os concretos de PRODUTO sob `src/<ctx>/repositories/**`
   **mantêm** o prefixo por ora: renomeá-los é diff mecânico separado, sem valor de correção.
3. **A porta de banco fica falsificável por construção.** Uma abstração que nomeia vendor não pode
   receber uma segunda implementação — o defeito só aparece quando alguém tenta. Agora a tentativa é
   um `extends` que compila ou não compila.
4. **`readMigrations()` não precisa mudar.** A forma `MigrationStatus { applied, pending }` já era
   vendor-neutra, e é ela que faz o "confere e recusa" do ADR 0005 existir sem API nova: conferir é
   ler o status e recusar quando `pending` não está vazio.

## Alternativas descartadas

- **`DatabaseDriver<T>` genérico.** Recusado aqui e no irmão: contamina todo consumidor de ciclo de
  vida com um parâmetro de tipo sobre um cliente que ele nunca vê.
- **Aditiva, sem renomear (a opção que eu havia recomendado).** Criar o topo e deixar
  `DrizzleDatabaseDriver` com o nome antigo funcionaria e tocaria zero arquivos — mas deixaria o
  repo num estado onde o nome mente sobre o que discrimina, e o irmão já pagou para descobrir que
  esse estado não se resolve sozinho. O founder escolheu a forma final.
- **Cast no driver pg.** É o que a regra 1 proíbe por nome, e é exatamente o buraco que uma porta
  abstrata existe para fechar.
