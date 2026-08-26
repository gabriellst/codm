# PARE E REPORTE — T1 (`owner` em duas famílias) esbarra em fato medido

> Acionamento do inviolável do contrato de reconciliação: *"se a adequação exigir `if` de caso
> especial, cast ou camada nova, PARE e reporte; provavelmente a abstração do template está errada
> e o codm acabou de prová-lo, e esse achado vale mais que o workaround."*
>
> A T0 (template) está feita e commitada. A T1 **não foi iniciada**. Nada do codm foi modificado
> além deste documento.

---

## Resumo em cinco linhas

1. O codm **apagou o Postgres de propósito** há três semanas, num commit `!` (breaking), com
   medição — não é ausência por acaso.
2. O `owner` **não é um contexto só-TS**: o sidecar Go **escreve** em `owner_owners` pelo arquivo
   SQLite compartilhado.
3. Logo a decisão 3 (*"local é cache de leitura"*) é **falsa para o `owner`** — o lado local tem
   um escritor.
4. A T1 "VERTICAL, só `owner`" não é vertical por **dois** motivos independentes: o pré-requisito
   da família é cirurgia de tipos em **~120 arquivos** do kernel; e a composição **não é fatiável
   por contexto** — `routers.ts` é exaustivo nos 10 e o filtro de perfil é global (§3b).
5. Nada disso reabre a decisão 1. São os fatos que faltavam quando ela foi tomada.

---

## 1. O Postgres do codm foi apagado deliberadamente, com medição

`git log --all -S 'PgDatabaseDriver'` e `--diff-filter=D` levam a:

```
4814f02d  build(contracts)!: point the migration toolchain at SQLite and delete the pg trees (T33)
          Mon Jul 27 10:10:55 2026 -0300
          52 files changed, 302 insertions(+), 23955 deletions(-)
```

Foram apagados: `packages/contracts/db/drizzle.config.ts`, `db/schema/` (10 arquivos pg) e
`db/migrations/` (10 `.sql` pg + `meta/`). Depois disso, `2a3004ef` renomeou
`db/schema-sqlite/` → `db/schema/` — *"e o nome para de citar o dialeto"*.

O commit não foi limpeza estética. A justificativa está na mensagem, e é uma medição:

> "RUN before this commit, not inferred: `bun migrate:dev` printed *"Using 'pg' driver"* then
> *"migrations applied successfully"* — by connecting to a **NEIGHBOURING repo's Postgres** on
> 5432 and doing nothing at all for the SQLite store. With `DATABASE_URL` unset it would still
> dial pg, because the URL is hardcoded in the config."

Ou seja: o caminho pg do codm era um **gate vacuoso** — passava verde conversando com o banco de
outro repositório e não fazendo nada pelo store real. O T33 matou isso, e enunciou o princípio:

> "Applying migrations belongs to boot, in both runtimes, over the same `_sqlite_migrations`
> ledger. **A third applier carrying `__drizzle_migrations` is the split substrate this phase
> kills.**"

Reintroduzir a família pg reintroduz exatamente esse terceiro aplicador: o
`NodePgDriver.runMigrations()` do template **lança `NOT_IMPLEMENTED`**, porque migrações pg lá são
aplicadas fora de banda por `drizzle-kit migrate`, com o ledger `__drizzle_migrations` próprio.

**O briefing não menciona o T33 em nenhum ponto.** A decisão 1 foi tomada sem ele à vista.

## 2. O `owner` é co-possuído pelo sidecar Go — e o Go ESCREVE

Este é o fato decisivo, e não é sobre leitura:

```
packages/api/go/core/db/sqlite/gen/owner.sql.go:39
  INSERT INTO owner_owners (id, name, kind, responsible_user_id, picture_url,
                            timezone, is_disabled, disabled_reason, created_at, updated_at, version)

packages/api/go/core/db/sqlite/gen/owner.sql.go:15   FROM owner_owners
packages/api/go/core/db/sqlite/gen/ui.sql.go:201     FROM owner_owners
```

Gerado por sqlc a partir de `packages/api/go/core/db/sqlite/query/owner.sql`. O arquivo é o mesmo
que o TS abre: `FileLibsqlDriver` aponta para `<CODM_DATA_DIR>/codm.db`, com `LEDGER_DDL`
byte-idêntico ao do `core/db/sqlite/store.go` e um gate que trava a igualdade
(`scripts/db/sync-sqlite-migrations.ts --check`).

### O choque com a decisão 3

> **Decisão 3.** "Nuvem autoritativa, local é cache de leitura. Sem resolução de conflito."

Para o `owner`, **o local não é cache de leitura** — é um escritor. Se `owner` passa a viver em
Postgres no perfil cloud:

- os `INSERT`s do Go em `owner_owners` caem no SQLite e **nunca chegam ao Postgres**;
- a fonte de verdade da tenancy **bifurca**, em silêncio, sem que nenhuma peça isolada esteja
  errada — que é precisamente a doença que a decisão 4 (família como módulo) existe para tornar
  inexprimível, reaparecendo um nível acima;
- "sem resolução de conflito" deixa de ser simplificação de exercício e passa a ser perda de
  escrita.

Não é um `if` que resolve. É uma pergunta de propriedade de dado que precisa de resposta antes de
qualquer linha de código.

## 3. A T1 "vertical" não é vertical

A decisão 17bis escolhe vertical com um argumento explícito de custo:

> "Em vertical o erro custa um contexto; em horizontal custaria dez."

Medido no repo, o `owner` propriamente dito é pequeno — **~6 arquivos** (registry, barrel, o repo
e seu teste, o directory, e uma use case). O domínio (`entities`, `events`, `errors`,
`controllers`, 4 das 5 use cases) precisa de **zero** mudanças.

O problema é o pré-requisito, que é invisível de dentro de `src/owner/`:

| Item | Alcance | Por quê |
|---|---|---|
| Split de `DrizzleTransaction` em cliente de leitura + transação de escrita | **40 arquivos** | hoje um tipo só faz os dois papéis; o template os separa, e é isso que torna "escrevi pela conexão de leitura" um erro de tipo |
| Retipagem de `DrizzleDatabaseDriver` (topo neutro vs meio da família) | **80 arquivos** | cada call site decide se quer o port neutro ou o da família |
| Hierarquia de 3 níveis + família pg do zero no kernel | ~12 novos, 6 movidos | `DatabaseDriver` sem `db`, `PgDatabaseDriver`, `PgDrizzleClient`, `NodePgDriver`, `PGliteDriver` |
| `abstract UnitOfWorkFactory` (não existe no codm) | 4 | `DrizzleUnitOfWorkFactory` hoje não estende nada |
| Árvore pg em `contracts` (config, schema, migrations, resolver, exports) | ~5 novos | inclui autorar `owner_onboardings` em pg, que o template **não tem** |
| Dependências novas | 2 `package.json` | `@electric-sql/pglite`, `pg`, `@types/pg` |

Isto é ~120 arquivos de cirurgia de kernel **antes** de o `owner` poder ter duas famílias. O erro,
aqui, não custa um contexto — custa o kernel. A premissa de custo do 17bis não se sustenta neste
repo.

## 3b. A COMPOSIÇÃO também não é fatiável por contexto — e isso não tem nada a ver com pg

Achado separado, e talvez mais importante que o da família: mesmo removendo o Postgres da conversa,
**a T1 não consegue ser vertical**, porque a composição é global por construção.

`packages/api/typescript/src/routers.ts`:

```ts
export const ROUTERS = { … } satisfies Record<ContextModule, Router>   // EXAUSTIVO nos 10
export const ALL_ROUTERS = Object.values(ROUTERS)
```

e `server.ts:107`:

```ts
const { ALL_ROUTERS } = await import('./routers')
const routers = filterRoutersForCloudProfile(ALL_ROUTERS, Config.env.CODM_PROFILE || undefined)
```

O `import('./routers')` **executa os 10 `BoundedContext.create`** — é o defeito de origem que a
seção "A FORMA" descreve. Daí:

- Para o `owner` virar `ContextDescriptor` composto explicitamente, `routers.ts` precisa **parar**
  de importar `owner/index.ts` pelo efeito colateral. Mas `ROUTERS` é `satisfies
  Record<ContextModule, Router>` — tirar o `owner` **quebra a exaustividade** e o `tsc`.
- Manter o `owner` lá significa que ele continua se auto-executando no import: a composição
  explícita não teria efeito nenhum.
- `filterRoutersForCloudProfile` filtra **a lista inteira**. Apagar `cloud-profile.ts` (decisão 10)
  remove o filtro de todos os 10 de uma vez — não dá para apagá-lo "só para o `owner`".

Não existe estado intermediário coerente. Ou os 10 contextos viram descritores e a composição
explícita passa a montar todos, ou nenhum vira. Qualquer meio-termo exige exatamente o que o
inviolável proíbe: um `if` de caso especial separando "o contexto que já é descritor" do resto.

**Consequência para o sequenciamento:** a T1 e a T2 são, na prática, uma só task. A decisão 17bis
pede um ponto de decisão entre "a forma sobreviveu ao contato?" e a propagação — mas a forma, aqui,
só entra em contato quando os dez contextos entram juntos. O que *pode* ser fatiado é outra coisa:
primeiro a composição (dos 10, família única), depois a família pg. Ver §7.

## 4. Três armadilhas que o porte encontraria, nomeadas

**(a) O `close()` no-op do codm é estrutural para a suíte inteira.**
`LibsqlDriver.close()` documenta a razão: *"If it actually closed the connections (or removed the
temp dir), the first suite's `afterAll` would destroy the database the other 26 still need."* O
`TestBed._destroyFn` chama `close()` em **todo** `afterAll`. O `LibSqlDriver` do template tem
`close()` real com refcount — estritamente melhor engenharia, e **quebraria o codm no import**.
Portar o driver sem portar o harness junto não é opção.

**(b) `SetActiveOwner` não sobrevive ao topo neutro.**
Ele injeta `DrizzleDatabaseDriver` e chama `.transaction()`. No desenho do template, o topo
`DatabaseDriver` **não tem** `transaction()` — só o meio libsql tem, e o meio pg deliberadamente
não. Restam três saídas: reescrever sobre `UnitOfWorkFactory` (a única neutra), duplicar a use
case por família (52 linhas por um `update`), ou pôr `transaction()` no topo — que é o que o codm
faz hoje e exatamente o que a reforma do template desfez.

Pior: essa use case escreve em `sessions`, tabela do contexto **`auth`**. Com duas famílias, o
schema de `auth` teria de existir na árvore pg também — o que arrasta `auth` para dentro de uma
task que a decisão 17bis definiu como "só `owner`".

**(c) O template não tem exemplar de TestBed com duas famílias.**
O `libsql.conformance.test.ts` do template contorna o TestBed inteiro (`new LibSqlDriver({...})`
cru, sem DI). Só o pg é resolvido por container. Então o codm não estaria portando um padrão — 
estaria **inventando** o primeiro, sem referência, justo no ponto onde a decisão 14 (iii) exige
que "o mesmo e2e do `owner` passe nas DUAS famílias, sem `if`, sem fixture condicional".

## 5. O que NÃO é problema (para não superdimensionar)

Em favor do desenho, e medido:

- **A query surface do `DrizzleOwnerRepository` é 100% portável entre dialetos.**
  `select/insert/values/onConflictDoUpdate/delete/eq/limit/$inferSelect` — nada de SQL cru, nada de
  `.all()/.run()`, nada específico de sqlite. O template já traz a prova: seu
  `PgOwnerRepository.ts` tem **o mesmo corpo**, mudando só imports e o tipo do `tx`.
- `DrizzleOwnerDirectory` tem **zero** acoplamento a banco — só rename.
- `MigrationStatus` e `resetAllTables` já são idênticos entre os dois repos.
- O domínio do `owner` não muda em nada.

E o codm está **à frente** do template em quatro pontos que um porte descuidado regrediria:
`DataDirLock` (139 linhas, sem contrapartida), handles tipados sobre o schema real do produto (o
libsql do template é `Record<string, unknown>`), o `enumCheck` que dá `CHECK` no banco (o pg do
template não tem nenhum), e o aviso `MIGRATION_SLOW_WAIT_MS`.

## 6. As perguntas que precisam de resposta

Nenhuma delas reabre as 17 decisões. Todas são fatos que faltavam quando elas foram tomadas.

1. **Quem é dono de `owner_owners` quando há duas famílias?** O sidecar Go escreve nele hoje. Se
   `owner` vai para pg na nuvem, o Go continua escrevendo no SQLite — e a tenancy bifurca. A
   decisão 3 ("local é cache de leitura") não descreve o `owner`.
2. **O T33 é para ser revertido?** Ele apagou o pg com medição de gate vacuoso e nomeou o "terceiro
   aplicador" como a doença. A família pg do template traz esse terceiro aplicador de volta
   (`NodePgDriver.runMigrations()` lança `NOT_IMPLEMENTED`).
3. **A T1 continua "vertical" sabendo (a) que o pré-requisito da família são ~120 arquivos de
   kernel e (b) que a composição não é fatiável por contexto de jeito nenhum (§3b)?** O corte que
   funciona não é por contexto, é por camada: **(T1') composição dos 10, família única** — que
   entrega quase tudo que a T1 nomeia — e só depois **(T2') a família pg**. Isso preserva a
   intenção do 17bis (errar barato antes de propagar), trocando o eixo do fatiamento.
4. **O codm adota a suíte de conformidade?** Nenhuma das 17 decisões diz. O template a define como
   "o contrato de admissão de família"; a decisão 1 dá uma família nova ao codm.

## 7. O caminho que NÃO depende de nenhuma dessas respostas

Vale registrar, porque é trabalho real e desbloqueado: **toda a parte de composição da T1 é
ortogonal à família pg.**

`InfraChoices`/`InfraModules`, `PLANS` exaustivo, `planFor` total, `ContextDescriptor`, a
composição explícita e o apagamento de `cloud-profile.ts` podem ser construídos **hoje**, com
`DatabaseFamily = 'libsql'` como único membro. Isso entrega, sem tocar em banco:

- os três defeitos de origem que a seção "A FORMA" nomeia (o `index.ts` não-importável, a ordem de
  boot dependente da ordem dos imports, e todo contexto registrando mesmo quando não servido);
- os falseadores (a) e (b) do contrato — contexto novo em `CONTEXTS` quebra o `tsc` no
  `PLANS.local`, e o descasamento eixo↔plano lança no boot — que **não dependem** de haver duas
  famílias;
- o `CLOUD_CONTEXTS` some, virando `keyof PLANS.cloud`.

O que fica de fora é só o falseador (c) — "o e2e do `owner` roda nas DUAS composições" — que é
precisamente o que exige a segunda família, e é onde estão as perguntas do §6.

Adicionar `'pg'` ao `DatabaseFamily` depois é **uma linha**, mais os módulos de família. É essa a
propriedade que o desenho promete; construir a composição primeiro é o jeito de cobrá-la.

---

## Estado

- **Template**: T0 feita, bateria 5/5 verde, commitada em `63536017d`. `git status` limpo.
- **codm**: nada modificado além deste documento. `git status` traz os 3 untracked pré-existentes
  do founder (`.plans/2026-08-11-adequacao-design-d3*.md`, `design/codm.pen`), que não foram
  tocados.
- Nada pushed em nenhum dos dois.
