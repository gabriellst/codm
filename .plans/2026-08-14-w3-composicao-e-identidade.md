# W3 — composição explícita, identidade na nuvem, família pg

> **Para workers agênticos:** passos com checkbox (`- [ ]`). Onda 3 de 4 — a estrutural. Depende de
> W1 e W2 fechadas, **de propósito**: uma mudança deste tamanho deve pousar num repo cujos gates já
> sabem reprovar, não o contrário.

**Goal:** Trocar composição-por-efeito-de-import por composição explícita, mover identidade e
tenancy para a nuvem, e dar ao deployment de nuvem a família `pg` — com as quatro testemunhas que
substituem o falseador (c) morto.

**Architecture:** A nuvem é dona de identidade e tenancy (`auth` + `owner`, cloud-only, Postgres); o
desktop é dono do trabalho local (8 contextos, SQLite compartilhado com o sidecar Go); `shared` é o
único contexto que vive nos dois e a única fronteira de família.

**Specs:** `docs/adr/0001-identidade-vem-da-nuvem.md` · `docs/adr/0002-tabela-de-alocacao-por-contexto.md`
· `.specs/2026-08-14-pare-e-reporte-t1-familia-pg.md` · `.specs/2026-08-14-relatorio-t1-linha-eixos.md`
· `CONTEXT.md` · `.plans/2026-08-14-readequacao-codm-template.md` (auditoria das 17 decisões)

## Global Constraints

Iguais às ondas anteriores, mais duas específicas:

- **O contrato dos ADRs não se rediscute.** Divergência real entre ADR e código → PARE COM ACHADO.
- **Esta onda NÃO é fatiável por contexto.** Medido: `routers.ts` é
  `satisfies Record<ContextModule, Router>` e importá-lo executa os 10 `BoundedContext.create`.
  Tirar só um quebra o `tsc`; deixá-lo mantém o efeito colateral. O corte é por CAMADA.

---

## Task 1 — o defeito que bloqueia tudo. Resolver ANTES de escrever qualquer composição.

As decisões 8, 11 e 12 são mutuamente inconsistentes, e o codm prova com um caso:

- **8** — `local: Record<ContextModule, InfraChoices>`, exaustivo. Como `InfraChoices = { db: DatabaseFamily }`
  tem `db` **obrigatório**, todo contexto recebe um `db`.
- **11** — `INFRA` existe só nos contextos com binding por família.
- **12** — amarra bidirecional: escolha no plano sem eixo no contexto **lança**.

Medido: **9 dos 10 contextos têm bindings `Drizzle*`; `external` tem ZERO**. Contagem por contexto:
`shared` 13, `thread` 17, `auth` 8, `agent` 8, `owner` 4, `workspace` 4, `issue` 4, `artifact` 2,
`ui` 2, **`external` 0**.

**PRECISÃO que a verificação de coerência impôs (2026-08-14):** o defeito é **PROSPECTIVO, não um
crash reproduzível hoje**. `InfraModules` (`src/shared/deployment.ts:41`) **não tem consumidor
nenhum** além da própria declaração — a "amarra bidirecional" da decisão 12 ainda não existe em
código. Então nada lança no boot atual; o que existe é uma tabela que, no dia em que o laço de
composição a consumir, torna o boot impossível para um contexto sem família. Isso não enfraquece a
Task: é exatamente por ser prospectivo que dá para resolver ANTES de escrever o laço, em vez de
descobrir depois. Mas o plano não pode alegar um crash que ninguém consegue reproduzir.

- [ ] **Step 1: reproduzir, para não confiar na memória**

```bash
C=/Users/work/Desktop/Projetos/pessoal/codm; cd $C
grep -c 'Drizzle' packages/api/typescript/src/external/registry.ts   # esperado: 0
for c in auth owner shared agent workspace thread issue artifact ui; do
  printf "%s: " $c; grep -c 'Drizzle' packages/api/typescript/src/$c/registry.ts
done
```

- [ ] **Step 2: escolher a saída, e registrar em ADR**

A saída proposta em `.specs/2026-08-14-relatorio-t1-linha-eixos.md` §4.2: o plano mapeia contexto →
`Partial<InfraChoices>` **exaustivo nas CHAVES** (todo contexto presente, `Record` sem `Partial`)
mas permitindo `{}` como escolha — *"este contexto monta e não escolhe eixo nenhum"*.

Preserva as três intenções: contexto novo continua quebrando o `tsc` (a chave é obrigatória),
contexto sem família continua exprimível (`{}`), e a amarra bidirecional continua total.

**Isto é mudança de contrato — não aplique sem decisão do founder.** Se ele escolher outra saída,
o ADR registra qual e por quê.

- [ ] **Step 3: só depois do ADR, seguir para a Task 2.**

---

## Task 2 — a tabela, na forma do ADR 0002

**Entregável:** `src/shared/deployment.ts` REESCRITO. A versão commitada em `f423a750` é
`PLANS.cloud`/`PLANS.local` (por deployment) e ficou superada: com `auth`/`owner` cloud-only,
"local monta todos" é falso. A forma nova é indexada por **contexto**, exaustiva sobre
`ContextModule`, com cada um declarando sob quais **critérios** monta (`when: Partial<Criteria>`) —
nunca "no deployment X", senão `deployment` fica cravado como eixo, que a decisão 6 proíbe.

**Não construir máquina de matching.** Medido: hoje o único critério real é `deployment`
(`releaseTrack` é distribuição, não composição; SO não ramifica no backend TS). `planFor` segue
consulta simples, como a spec autoriza.

- [ ] **Falseador (a), re-executado contra a forma NOVA:** adicionar um contexto a `CONTEXTS` quebra
  o `tsc` na linha da tabela. A propriedade só vale se for medida de novo — a medição antiga era
  contra a forma antiga.

---

## Task 3 — descritores e composição explícita (os 10 juntos)

**Entregável:** `ContextDescriptor = BoundedContextOptions & { infra?: Partial<InfraModules> }`; os
10 `<ctx>/index.ts` param de chamar `BoundedContext.create` no topo e passam a
`export default { … } satisfies ContextDescriptor`; `manifest.ts` substitui `routers.ts`; o laço de
composição vai para `server.ts`; **`cloud-profile.ts` é APAGADO**.

**Atenção medida:** `BoundedContextOptions` do codm tem **12 campos**, não 13, e **não tem
`start`/`shutdown`** (que a decisão 9 nomeia) — ela descreve o kernel do template. O descritor deriva
de `BoundedContextOptions` **do codm**, nunca de uma lista literal.

`shared/registry.ts` é o outlier: exporta `ALL_REGISTRIES`, não `INSTANCE_REGISTRY` — verificado,
os outros 9 exportam `INSTANCE_REGISTRY` e ele é o único desvio.

**O `cloud-profile.ts` tem TRÊS consumidores, não um.** Apagá-lo sem tratá-los quebra o `tsc` num
import pendurado. O AC diz "APAGADO"; o inventário é:
1. `src/server.ts:29` importa `isCloudProfile` e `filterRoutersForCloudProfile`; `:113` filtra os
   routers, e `:135` e `:164` são **dois gates de ciclo de vida** (start/stop do mailbox dispatcher
   e shutdown do agent runtime) — não só o laço de composição.
2. `tests/architecture/cloud-profile.test.ts:3` importa `CLOUD_CONTEXTS`, `isCloudProfile` e
   `filterRoutersForCloudProfile` e assere CLOUD-01..05 (entre elas, que `CLOUD_CONTEXTS` é
   EXATAMENTE `{auth, owner, shared}`). Esse teste **é aposentado ou reescrito** contra a composição
   explícita — o docblock do próprio `cloud-profile.ts` já diz que essas coisas "só morrem quando a
   composição explícita chegar".
Os dois entram no checklist da Task 3.

- [ ] **Falseador (b):** eixo declarado sem escolha no plano, e escolha sem eixo, **lançam no boot**.

---

## Task 4 — identidade vem da nuvem (ADR 0001)

**Entregável:** `CloudSessionMiddleware` novo, resolvendo identidade via SDK própria contra
`GetSession` na nuvem (`baseURL: CODM_CLOUD_URL`), cache em disco com validade offline indefinida,
substituindo o `OperatorMiddleware` (que hoje carimba `OPERATOR_ID` **constante** — o buraco que
originou tudo isto) · `auth` vira cloud-only · `SetCloudToken` + `CloudSession` migram para `shared`
· dois clients TS, o que exige o **perfil como eixo declarado** em `packages/client/lib/discover.ts`
(hoje chaveado só por pasta de serviço).

**O que já sustenta a viabilidade, medido:** fora de `auth/`, o único consumidor de repositório de
auth é `owner/services/DrizzleOwnerDirectory.ts` — e `owner` também vai para a nuvem. O BFF local
não lê tabela de usuário nenhuma (`GetOperatorIdentity` tira nome e foto do **canal conectado**,
lendo `gateway_channels`/`gateway_remotes`; `GetMyAccount` é `TODO(stub)` e devolve faker).

**CORREÇÃO da verificação de coerência: "todo o resto importa apenas `OperatorMiddleware`" era
FALSO.** Existe um terceiro consumidor de `@auth`, não nomeado até agora:
`agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts:5` importa `CloudSession` de
`@auth/services/CloudSession` e a usa em dois pontos — no construtor (`:117`) e no gate de
`claimNext` (`:225`, `if (!this.cloudSession.isEntitled()) return 0`). O ADR já sabia do FATO na
seção de Consequências ("hoje `isEntitled()` gateia uma única coisa"), mas a frase de raio de
alcance omitia o arquivo. **Entra no inventário de migração da Task 4:** quando `CloudSession` for
para `shared`, este import muda junto.

O padrão de chamada já existe e é carregado: `FileCloudSession` já chama a SDK gerada contra
`CODM_CLOUD_URL`. Não invente um segundo mecanismo.

- [ ] **Testemunhas:** local sem token não monta nada além de login · `ownerId` adulterado é rejeitado.

---

## Task 5 — a família pg do deployment de nuvem

**Escopo real, muito menor que o da spec original:** só o lado nuvem precisa de pg — `shared` (os 4
tokens duais: driver, `DomainEventRepository`, `OutboxDispatcher`, `IdempotencyGuard`) mais os
repositórios de `auth` e `owner`. Nenhum outro contexto.

**Adotar a suíte de conformidade do template** como contrato de admissão: os 4 tokens duais de
`shared` são exatamente o que ela certifica, e ela vem com `violator.conformance` provando que sabe
reprovar. Interface a implementar: `FamilyHarness<Driver>` — 3 campos + 8 métodos.

**A objeção do T33 enfraqueceu, mas precisa ser dita, não assumida.** `4814f02d` apagou o pg com
medição de gate vacuoso e nomeou "o terceiro aplicador" como a doença. Com nuvem e local sendo
**deployments separados**, cada um com seu aplicador, não há terceiro aplicador num mesmo processo —
**afirme isso explicitamente no plano da task**, com o mecanismo, antes de reintroduzir pg.

- [ ] **Testemunha:** conformidade verde nas duas famílias, mesma suíte, dois harnesses, sem `if`.

---

## Task 6 — validação por capacidade

As **quatro testemunhas** que substituem o falseador (c) morto (ele exigia o mesmo e2e do `owner`
nas duas famílias, e `owner` passa a existir em uma só):

1. conformidade verde nas duas famílias
2. local sem token não monta nada além de login
3. `ownerId` vem da nuvem — adulterá-lo localmente faz o recurso ser rejeitado
4. perfil cloud sobe com `auth`+`owner`+`shared` e 404 nos outros sete

**`demo-gate`:** portar `scripts/pr/` do template. A tabela do codm é determinada e tem 4 linhas —
`react` e `styles` em `VISUAL_SURFACES`; `astro` e `tauri` em `NON_VISUAL_TARGETS`; `expo` sai.

## Gates

Todos os do codm, exit sem pipe, mais `cd packages/app/react && bun x tsc` (esta onda mexe em
contrato/SDK).

## O que esta onda deliberadamente NÃO faz

- Não mexe no `sqlc` do Go: decisão 13 — o Go é sidecar local-only e segue sqlite. A separação
  core/produto já foi feita no GOAL 1.
- Não cria `UX-FLOWS.md`: decisão 16 — os 10 e2e existentes são a lista de fluxos.

---

## PARE COM ACHADO — Task 5 (família pg) · medido em 2026-08-14

As Tasks 1–4 estão fechadas. A Task 5 **não foi executada**, e a razão é medição, não escolha de
escopo: o plano mandava *"afirmar explicitamente, com o mecanismo, que não há terceiro aplicador,
ANTES de reintroduzir pg"*. Fui afirmar e **a afirmação não se sustenta como escrita**.

### O que se sustenta

**A objeção do `owner` co-possuído pelo Go DISSOLVEU.** A spec `2026-08-14-pare-e-reporte-t1-familia-pg.md`
§2 a chamava de "o fato decisivo": o sidecar Go escreveria em `owner_owners`. Medido agora:
`InsertOwnerIfNew` e `GetOwnerByID` têm **zero chamadores** fora do código gerado. São resíduo de um
porte Go abandonado. A tenancy não bifurca porque o Go nunca escreveu.

**A metade "mesmo processo" do terceiro aplicador também se sustenta.** Nuvem e local são deployments
separados — a W3 acabou de tornar isso verdade no código (`mountedContexts`, oito contextos locais,
três na nuvem). Não há processo onde os três aplicadores coexistam.

### O que NÃO se sustenta

**A outra metade do princípio do T33 continua violada.** O T33 enunciou: *"Applying migrations
belongs to boot, in both runtimes, over the same ledger. A third applier carrying
`__drizzle_migrations` is the split substrate this phase kills."* A separação de deployments responde
"terceiro aplicador no mesmo processo". Não responde **"migração pertence ao boot"**:

| | aplicador | quando | ledger |
|---|---|---|---|
| libsql daqui (`LibsqlDriver.runMigrations`) | no processo | **boot** | `_sqlite_migrations` |
| pg do template (`NodePgDriver.runMigrations`) | — | **nunca** | lança `NOT_IMPLEMENTED` |

A família pg como existe a montante **não tem aplicador de boot**. Adotá-la reintroduz o passo
fora-de-banda (`drizzle-kit migrate`, ledger `__drizzle_migrations`) que o T33 apagou — não por
haver três num processo, mas por não haver nenhum no boot da nuvem.

### E o custo real, que ninguém tinha medido

O esquema inteiro é **`drizzle-orm/sqlite-core`** — toda tabela, em todo arquivo de
`packages/contracts/db/schema/`. `drizzle.config.ts` é `dialect: 'sqlite'`, com **18 migrações
SQLite**, e **não existe árvore pg** (`packages/contracts/db/pg` não existe).

"Família pg na nuvem" portanto não é portar drivers. É:

1. um SEGUNDO tronco de schema em `pg-core` (ou tornar o schema agnóstico de dialeto) para as
   tabelas que a nuvem possui — `auth`, `owner` e a infra de `shared`;
2. um segundo config de drizzle-kit e um segundo ledger de migrações;
3. os ~15 arquivos de kernel pg do template (que a W5 já inventariou como "só no template");
4. a suíte de conformidade como contrato de admissão;
5. **uma decisão sobre o aplicador de boot** — a que este achado trava.

### As perguntas, que a própria spec já listava como sem resposta

A §6 daquela spec diz, textualmente, que *"nenhuma das 17 decisões diz"*. Duas seguem abertas e
agora estão medidas:

1. **O T33 é para ser revertido?** Ou a nuvem ganha um `runMigrations()` pg de boot — que não existe
   em nenhum dos dois repos e precisa ser escrito, sobre um tronco de migrações pg que também não
   existe?
2. **O schema vira agnóstico de dialeto, ou o repo passa a ter dois troncos?** Um segundo tronco
   duplica a fonte de verdade que `packages/contracts` existe para ser.

### O que a §7 daquela spec previa, e que já foi entregue

Ela registrava que *"toda a parte de composição da T1 é ortogonal à família pg"* e podia ser feita
com `DatabaseFamily = 'libsql'` como único membro. Foi: Tasks 1–4 desta onda entregaram a tabela por
contexto, o ADR 0004, os descritores, o laço, a morte do `cloud-profile.ts` e a identidade da nuvem —
sem tocar em banco. O caminho que a spec chamou de desbloqueado está fechado; o que ela chamou de
bloqueado continua bloqueado, agora com o custo medido.

---

## Task 5 — destravada em 2026-08-14 pelas decisões do founder

A task esteve parada desde `b8177d54` com PARE COM ACHADO. As duas perguntas foram respondidas, e
a decisão está em **`docs/adr/0005-o-aplicador-de-migracao-e-propriedade-da-familia.md`**:

1. **Migração do servidor é MANUAL no lado cloud; o SQLite segue automático no boot.** O princípio
   que matou o aplicador fora de banda não é revertido — é **escopado ao substrato que o motivou**
   (dois processos, um arquivo, máquina que ninguém opera). Nada disso se instancia num Postgres
   gerenciado.
2. **Dois troncos, cada um só com as tabelas que existem nele.** O tronco pg **não é espelho**.

### Entregue (commits `64890803`, `6b2dd9ae`)

- ADR 0005.
- `packages/contracts/db/cloud/` — 13 tabelas no dialeto `postgresql` (auth 7, owner 2, kernel 4),
  `drizzle.config.ts` próprio, migração `0000_strong_moonstone.sql` gerada. Os 2 CHECKs de enum e os
  2 índices parciais sobreviveram ao dialeto.
- `migrate:create:cloud` / `migrate:deploy:cloud` — e o comando de APLICAR existe só para a família
  `pg`, que é a Decisão 1 em forma executável.
- `tests/architecture/trunk-parity.test.ts` — TRK-01 escopo · TRK-02 o inverso · TRK-03 paridade do
  kernel · TRK-04 testemunha da comparação. **A fronteira é DERIVADA** de
  `mountedContexts({deployment:'cloud'}) × CONTEXTS[ctx].pgSchema`; nenhuma lista é redigitada.
  Três falseadores rodados, cada um nomeando a violação exata.

### O ACHADO que reordena o resto

**Virar as linhas cloud da `PLACEMENT` para `db: 'pg'` AGORA produziria uma declaração que ninguém
lê.** Nenhum descritor declara `infra` hoje — logo `assertInfraAgreement` não tem eixo que checar, e
o `'pg'` seria decorativo. O `compose.ts` já dizia isso de si mesmo:

> *"A TERCEIRA direção — o plano escolhe uma família e o descritor não declara eixo nenhum — é o
> ESTADO DE HOJE e deliberadamente não lança […] Ela vira erro no dia em que a família `pg` entrar e
> `infra` passar a ser o canal."*

Então **o flip e o porte aterrissam no MESMO diff**, ou o repo ganha exatamente o tipo de gate vazio
que este programa inteiro existe para caçar.

### O que o porte custa — medido, não estimado

| fato | medida |
|---|---|
| família `pg` no core do template | **13 arquivos, 1752 linhas** |
| dependência que falta no codm | `pg@^8.16.3` (o codm tem **zero**) |
| custo de `pg` no binário de desktop | **1,35 MB** contra um sidecar de **70 MB** — ~0,5% |
| forma do módulo `db/` — template | por família: `db/libsql/` · `db/pg/` · `db/drivers/DatabaseDriver.ts` |
| forma do módulo `db/` — codm | **plana**: `db/drivers/{DrizzleDatabaseDriver,LibsqlDriver}.ts` |

**A medição matou uma bifurcação de desenho.** A dúvida era import estático de `pg` vs. uma camada de
carregamento preguiçoso, porque o mesmo entry vira sidecar de desktop (`bun build --compile`) e
imagem de nuvem (Dockerfile). A 0,5% do binário, a camada preguiçosa seria a "camada nova" que o
contrato manda evitar. **Import estático, e ponto.**

**Forma de módulo: adapta-se ao DESTINO.** O codm é plano, então o porte é `db/drivers/PgDriver.ts`
ao lado de `LibsqlDriver.ts` — não a reestruturação em subárvores por família, que mexeria no caminho
libsql que hoje funciona.

### O que falta, em ordem de dependência

- [ ] **5a. `pg` + `@electric-sql/pglite`** em `packages/api/typescript`. O PGlite não é conforto: é
      **o que torna o driver testável** sem um Postgres de pé, e um driver sem testemunha é código
      que a doutrina deste repo recusa.
- [ ] **5b. `db/drivers/PgDriver.ts`** — porte do `NodePgDriver` na forma plana do codm, MAIS o que o
      template não tem: o **`runMigrations()` que confere e recusa** em vez de lançar
      `NOT_IMPLEMENTED` (ADR 0005, decisão 1, corolário). É código novo, não porte.
- [ ] **5c. suíte de CONFORMIDADE** (`db/conformance/`, do template) — o contrato de admissão de uma
      família. É o que permite acrescentar a segunda família sem descobrir em produção que ela não
      cumpre o que a primeira cumpre.
- [ ] **5d. os bindings da família** — `PgUnitOfWork`, `PgOutboxDispatcher`, `PgIdempotencyGuard`,
      `PgDomainEventRepository`, `PgCommandQueue`, `PgHealthService`.
- [ ] **5e. O DIFF ÚNICO:** `DatabaseFamily` ganha `'pg'` · as linhas cloud da `PLACEMENT` viram
      `pg` · `auth`/`owner`/`shared` declaram `infra` · a **terceira direção** do
      `assertInfraAgreement` passa a lançar · e um teste que roda `assertInfraAgreement` sobre o
      manifesto inteiro × os dois critérios, para a checagem de boot ser exercida em CI e não
      descoberta em produção.
- [ ] **5f. corrigir o docblock desatualizado** de `deployment.ts:24`, que afirma *"o sidecar Go
      escreve em `owner_owners` pelo mesmo arquivo SQLite"*. **Medido hoje: falso.**
      `InsertOwnerIfNew` e `GetOwnerByID` existem gerados pelo sqlc e têm **zero callers** fora de
      `gen/`. A objeção de co-propriedade que ajudou a travar esta task já não se sustenta — o que
      sobrava era o aplicador, e é ele que o ADR 0005 resolveu.

### O que esta task deliberadamente NÃO faz

- **Não remove `authentication_*`/`owner_*` do tronco SQLite.** Elas estão em migrações já aplicadas
  (0000 e 0016) e o Go embute cópia byte-a-byte; tirá-las é migração destrutiva, com decisão de dado
  própria. Fica NOMEADO, não feito.

### A implementação de REFERÊNCIA — achada em 2026-08-14, e ela muda o custo

O template **já fez este exercício, na direção inversa**: pegou o driver libsql DAQUI e o conformou
como segunda família ao lado do pg. Existe desenho pronto, e o `CLAUDE.md` deste repo é literal
sobre o que fazer quando isso acontece — *"If a reference implementation exists on disk, read it and
mirror its structure — do not design from first principles."*

- `template-fullstack/.plans/2026-08-13-familias-por-dialeto.md`
- `template-fullstack/.specs/2026-08-13-familias-por-dialeto-design.md`
- `template-fullstack/docs/BACKEND.md` §"Database Families (pg / libsql)" (linha 588)
- `template-fullstack/core/src/db/conformance/README.md`

**Três coisas que só se sabe lendo isso, e que mudam o plano acima:**

1. **A suíte de CONFORMIDADE é o contrato de admissão, e tem PROVA DE NÃO-VACUIDADE.**
   `describeOutboxConformance(harness)` / `describeIdempotencyConformance(harness)` registram a mesma
   árvore de `describe`/`it` contra o `FamilyHarness` que cada família constrói — e existe um
   **`violator.conformance.test.ts`**: um dispatcher deliberadamente quebrado (claim sem filtro de
   `source`) que a suíte TEM de reprovar, nominalmente. *"If that file ever goes green, the violator
   stopped violating anything."* É exatamente a doutrina de testemunha deste programa, já escrita
   por lá. **O porte da conformidade traz o violator junto, ou não é porte.**

2. **A forma de `readMigrations()` foi desenhada para ser honesta nos DOIS lados** (decisão D7 de
   lá): `MigrationStatus { applied, pending }` substituiu um `MigrationJournal` que espelhava o
   `_journal.json` do drizzle-kit — *"that shape mirrored drizzle-kit's own pg-only, build-time
   format and had no notion of 'applied'"*. O codm **já tem** essa forma. Ou seja: o
   `runMigrations()` que **confere e recusa** (ADR 0005) não precisa de API nova — precisa apenas
   USAR `readMigrations()` e lançar quando `pending.length > 0`.

3. **O template reconhece o codm por nome como "one dialect, no pg at all"**, e diz que um fork que
   queira o schema de produto completo num dialeto *"owns writing `db/sqlite/schema/<context>.ts` and
   wiring it into its own `drizzle.config.ts`"*. O tronco cloud entregue hoje é o caso **simétrico**
   disso — cada dialeto carrega só o que precisa — o que confirma que o desenho do ADR 0005 está na
   mesma filosofia da casa, e não inventando uma.

**Divergência real a respeitar no porte:** lá o `CommandQueue` **não tem** implementação libsql,
porque `shared_scheduled_commands` não tem espelho sqlite naquele repo. **Aqui tem os dois** — a
tabela existe no tronco SQLite e agora no tronco cloud. Então o `PgCommandQueue` entra, e o par fica
completo dos dois lados, ao contrário da origem.

### ⛔ PARE COM ACHADO — o porte esbarra numa decisão de HIERARQUIA

Ao começar o 5b, o porte parou num defeito estrutural que **não é improvisável** e cai literalmente
sob o inviolável *"sem gambiarra: se exigir `if` de caso especial, cast ou **camada nova**, PARE e
reporte"*.

**O defeito.** `core/src/db/drivers/DrizzleDatabaseDriver.ts` — a única abstração de driver deste
repo — **não é neutra de vendor**. A assinatura dela nomeia libsql:

```ts
abstract readonly db: DrizzleTransaction              // = LibSQLDatabase<typeof schema>
abstract readonly unitOfWorkFactory: DrizzleUnitOfWorkFactory
abstract transaction<R>(fn: (tx: DrizzleTransaction) => Promise<R>): Promise<R>
```

Um driver `pg` **não consegue estendê-la** — o `.db` dele é um `NodePgDatabase`, não um
`LibSQLDatabase`. Não existe porte que resolva isso: ou entra o cast que a regra 1 do `CLAUDE.md`
proíbe por nome, ou entra o **topo neutro**.

O repo irmão já bateu nisto e decidiu (D1, founder, 2026-08-12): **três níveis** — topo
`DatabaseDriver` só com ciclo de vida (`lifetime`/`create`/`reset`/`runMigrations`/`readMigrations`/
`close`, sem nomear vendor nem ORM), meio por família pinando `.db`, concretos ligados só pelo
registry. E rejeitou explicitamente a saída genérica: *"é isto que dispensa o genérico
`DatabaseDriver<T>`"*.

**O custo, medido — 80 arquivos importam `DrizzleDatabaseDriver`:**

| quem | arquivos | o que aconteceria |
|---|---:|---|
| toca `.db` | **64** | injeta o nível-MEIO da família libsql |
| só ciclo de vida | **16** | injeta o TOPO neutro |

**Duas formas de aterrissar, e elas custam MUITO diferente:**

- **(A) Espelhar o irmão por inteiro.** Topo `DatabaseDriver` novo, `DrizzleDatabaseDriver` renomeado
  para `LibsqlDatabaseDriver`, os 80 arquivos atualizados. É a forma final correta — o irmão até
  registra por que o nome `Drizzle*` deixou de discriminar (*"once both families ran on drizzle,
  `Drizzle` stopped discriminating anything — the ORM is the engine underneath, the DIALECT is the
  axis"*) e escreveu um codemod para isso. **Mexe em 80 arquivos do caminho de persistência vivo.**
- **(B) Aditiva.** Cria o topo `DatabaseDriver` (ciclo de vida) e faz o `DrizzleDatabaseDriver` atual
  **estendê-lo sem mudar de nome nem de assinatura** — ele passa a ser, de fato, o nível-meio da
  família libsql. `PgDatabaseDriver` nasce como irmão. **Zero dos 80 arquivos muda**, nada quebra, e
  o rename fica como commit mecânico separado, decidível depois.

**Recomendação: (B).** Entrega a mesma hierarquia de três níveis do irmão, com raio de explosão zero
sobre o caminho que hoje funciona, e deixa a parte cosmética (o rename dos 64) para um diff que se
revisa sozinho. **Mas continua sendo camada nova, e por isso não avanço sem o aval.**

**Feito enquanto isso, porque não depende da resposta:** o docblock de `DatabaseFamily` foi corrigido
— ele ainda citava a co-propriedade do Go como razão de a família `pg` não ter entrado, e a medição
de hoje derrubou isso (zero callers). Agora ele nomeia a razão real e viva: a hierarquia.

**NÃO feito, deliberadamente:** as dependências (`pg`, `@electric-sql/pglite`, `@types/pg`) foram
instaladas, medidas e **revertidas**. Dependência declarada e não usada é a mesma classe de mentira
que os gates desta sessão caçam — elas entram no diff do porte, não antes dele.

---

## Encerramento da W3 — 2026-08-14

**Task 5 FECHADA.** As três coisas que a travavam caíram, cada uma com registro próprio:

| o que travava | desfecho |
|---|---|
| co-propriedade do dado com o Go | **falso, medido** — `InsertOwnerIfNew`/`GetOwnerByID`: zero callers |
| o aplicador de migração | **ADR 0005** — o aplicador é propriedade da FAMÍLIA |
| a hierarquia de drivers | **ADR 0006** — topo neutro + um nível-meio por família |

### O que aterrissou (10 commits)

`1dd705f9` vereditos da W5 · `64890803` ADR 0005 · `6b2dd9ae` tronco cloud + `trunk-parity` ·
`4d8aa225` plano medido · `5d17fdf5` encerramento W4 · `2b0d2a75` implementação de referência ·
`5405b6ed` **PARE COM ACHADO** da hierarquia · `29d34940` ADR 0006 (101 arquivos) ·
`0c4a9883` família pg · `a3e2db9b` conformidade + violator · `584a2869` outbox + repositório ·
`e5004909` fila de comandos · `8a24a0e6` **`infra` vira canal**

### As testemunhas da onda

| suite | o que prova |
|---|---|
| `DEP-01..10` | a tabela de alocação é exaustiva nos dois eixos |
| `IDN-01..04` | identidade vem da nuvem, e sem ela o daemon recusa |
| `TRK-01..04` | os dois troncos, e a fronteira DERIVADA entre eles |
| `IDC-01..04` × 2 famílias | a trava de idempotência se comporta igual nas duas |
| `OUT-01..03` × 2 famílias | o despachante respeita a lane, consome a sua e não deleta veneno |
| `VIO-01..05` | **a suíte de conformidade MORDE** — 5 violadores reprovados nominalmente |
| `MIG-01..07` · `PGL-01..05` | o driver pg confere-e-recusa; as 13 tabelas rodam em Postgres real |
| `PCQ-01..04` | a fila pg sobrevive à re-registração de job — o `IS DISTINCT FROM` |
| `INF-01..05` | **`infra` é canal, não decoração** |

### Os quatro defeitos que o porte carregava e que NÃO chegaram ao repo

Todos passariam pelo `tsc`, e três deles quebrariam só em produção:

1. **`shared.outbox`** — os quatro impls pg do repo irmão usam nome qualificado por schema; o tronco
   daqui é plano. Cópia de arquivo → *relation does not exist*.
2. **`IS NOT`** como desigualdade nula-segura — é SQLite. No Postgres, `IS DISTINCT FROM`. A linha
   roda em TODO boot da nuvem. Falseado: `syntax error at or near "excluded"`.
3. **`JSON.parse` de um `jsonb`** já desserializado — explodiria no primeiro comando com payload.
4. **`SELECT` sem `FOR UPDATE SKIP LOCKED`** — no libsql o portão FIFO dispensa a trava; em
   Postgres, duas réplicas leem a MESMA linha e entregam duas vezes. Teria passado nos testes de
   uma réplica só e quebrado quando a nuvem escalasse.

### E uma ordem que foi DESCOBERTA, não projetada

`registry base → módulo da família → MIGRAR → compor`. Migrar antes do módulo resolve um token que o
registry base já não liga; migrar depois da composição é tarde, porque montar um contexto com `jobs`
escreve em `shared_scheduled_commands` (*no such table*). **Infra precede composição**, e agora está
escrito onde alguém vai ler.

### O que fica NOMEADO, não feito

- **`authentication_*`/`owner_*` no tronco SQLite.** Estão em migrações aplicadas e o Go embute cópia
  byte-a-byte; removê-las é migração destrutiva com decisão de dado própria.
- **Nenhum contexto da nuvem AGENDA comando hoje** — `CommandQueue` só aparece em `agent` (2) e
  `thread` (14), ambos local-only. A `PgCommandQueue` entrou pelo BOOT (`registerJobs` resolve o
  token), não pelo uso.
- **O rename `Drizzle*` → `Pg*` nos concretos de PRODUTO** (`src/<ctx>/repositories/**`): diff
  mecânico, sem valor de correção, decidível à parte.
