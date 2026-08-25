# ADR 0005 — o aplicador de migração é propriedade da FAMÍLIA, e cada família tem seu próprio tronco

- **Status:** aceito
- **Data:** 2026-08-14
- **Decisor:** founder
- **Sucede:** não revoga nada. **Escopa** a doutrina escrita em
  `packages/contracts/src/db/sqlite/drizzle.config.ts`, que até aqui valia como se fosse universal.
- **Relacionado:** ADR 0001 (identidade vem da nuvem) · ADR 0002 (tabela de alocação por contexto) ·
  ADR 0004 (eixo de infra é declarado mesmo quando é nenhum)

## Contexto — a Task 5 da W3, e por que ela ficou parada

O ADR 0002 aloca `auth`, `owner` e `shared` na **nuvem**, e os outros oito contextos no **daemon
local**. A tabela `PLACEMENT` já declara isso. O que ela ainda **não** declarava é a consequência
óbvia: o deployment de nuvem não roda sobre o arquivo SQLite do desktop do usuário. Ele roda sobre
Postgres. Portanto a família de banco é um eixo com **dois** valores, e `DatabaseFamily = 'libsql'`
— um tipo de um membro só — era a lacuna.

Adotar a família `pg` esbarrou numa objeção real, e é por ela que esta task ficou aberta em vez de
ser improvisada:

> **`NodePgDriver.runMigrations()` não aplica nada.** No template ele existe e lança
> `NOT_IMPLEMENTED`. Adotar a família `pg` como está entrega um deployment **sem aplicador de
> boot** — e reintroduzir um aplicador fora de banda é exatamente o que o docblock do
> `drizzle.config.ts` deste repo proíbe, com estas palavras:
>
> *"APPLYING is deliberately NOT drizzle-kit's job, and there is no `drizzle:migrate`. […] A third
> applier carrying a ledger of its own (`drizzle-kit migrate` writes `__drizzle_migrations`) is
> exactly the split substrate this arrangement exists to prevent."*

A objeção era honesta e a regra existia. **O que faltava era perceber que a regra tinha uma RAZÃO,
e que a razão é local.**

## A razão da regra, lida de novo

O parágrafo proibitivo não diz *"aplicar fora de banda é ruim"*. Ele diz por quê, uma linha acima:

> *"Two processes share one file, so migrations are applied at BOOT by two idempotent migrators over
> the SAME `_sqlite_migrations` ledger."*

**Dois processos, um arquivo.** O daemon TS e o gateway Go abrem o mesmo `.db` no disco de uma
máquina que ninguém opera. Não há janela de deploy, não há operador, não há ordem garantida de
subida. Nesse substrato, um aplicador que rode fora do boot é um aplicador que pode **nunca** rodar
— e um segundo ledger é a garantia de que os dois migradores discordem em silêncio.

**Nada disso é verdade na nuvem.** Lá há um Postgres gerenciado, um deployment, uma janela, um
operador, e a migração é um passo do deploy como qualquer outro. A premissa que justificava a
proibição simplesmente não se instancia.

Aplicar a conclusão sem a premissa teria sido cargo cult — e o custo seria concreto: um migrador de
boot em cada réplica de um serviço que escala horizontalmente, correndo umas contra as outras sobre
o mesmo schema.

## Decisão 1 — o aplicador é declarado POR FAMÍLIA

| família | aplicador | ledger | quem dispara |
|---|---|---|---|
| `libsql` | **no BOOT**, idempotente | `_sqlite_migrations` | o processo que subir primeiro; o segundo é no-op |
| `pg` | **MANUAL**, fora de banda | `__drizzle_migrations` | passo de deploy, antes de o serviço subir |

O ledger separado, que era o defeito no caso SQLite, aqui é o correto: são **dois bancos
diferentes**, não duas visões do mesmo arquivo. Um ledger compartilhado entre eles seria a
patologia, não a cura.

### O corolário que "manual" NÃO pode significar

**"Manual" descreve quem aplica, nunca quem verifica.** Um driver que sobe alegremente sobre um
schema atrasado troca um erro de deploy — barulhento, imediato, com rollback — por corrupção
silenciosa de dado em produção. Então:

> **O driver `pg` FALHA FECHADO no boot se o schema não estiver na versão que o binário espera.**
> Ele não aplica; ele **confere e recusa**.

É a mesma forma do ADR 0001 (`CloudSessionMiddleware` recusa em vez de carimbar identidade de
consolação) e do ADR 0004 (o eixo é declarado mesmo quando é `none`): a ausência é **afirmada**, não
inferida do silêncio. `runMigrations()` lançando `NOT_IMPLEMENTED` era o oposto — um método que
promete aplicar, não aplica, e cuja falha só aparece se alguém o chamar.

## Decisão 2 — dois TRONCOS, cada um só com as tabelas que existem nele

> *"Acredito que seja necessário duas fontes por serem dois dialetos diferentes com configurações
> diferentes, mas somente pras tabelas que vão existir em tais."* — founder, 2026-08-14

Dois dialetos com configurações diferentes são duas fontes. E — a metade que importa — **o tronco pg
não é um espelho do tronco SQLite.** Ele carrega as tabelas do deployment de nuvem, e só.

Derivado de `PLACEMENT` (nuvem = `auth` + `owner` + `shared`), medido em 2026-08-14:

| tronco | contextos | tabelas |
|---|---|---|
| `db/schema/` (sqlite) | os onze | 29 |
| `db/cloud/schema/` (pg) | `auth` · `owner` · `shared` | **13** |

As 13: as 7 de `auth` (`authentication_users`, `_accounts`, `_sessions`, `_verification_tokens`,
`_user_profiles`, `_device_tokens`, `_device_codes`), as 2 de `owner` (`owner_owners`,
`owner_onboardings`) e as 4 de infra (`shared_events`, `shared_outbox`, `shared_idempotency_keys`,
`shared_scheduled_commands`).

`workspace`, `thread`, `issue`, `agent`, `artifact` e `channel` **não existem no Postgres**. Elas são
o trabalho do usuário na máquina do usuário; copiá-las para a nuvem por simetria criaria tabelas que
ninguém escreve e que, ao existirem, convidariam alguém a escrevê-las.

### Por que as 4 tabelas de infra aparecem NOS DOIS, e isso não é duplicação

`events`/`outbox`/`idempotency_keys`/`scheduled_commands` não são de um contexto de negócio — são o
**kernel**. Todo deployment que roda um `UnitOfWork` e um `OutboxDispatcher` precisa delas, porque
são a mecânica da transação, não do domínio. É a mesma razão pela qual `shared` é o único contexto
**dual** na `PLACEMENT`: ele é a raiz de infra dos dois deployments.

Duas tabelas com o mesmo nome lógico e formas equivalentes em dialetos diferentes não são uma fonte
duplicada — são **a mesma declaração, emitida duas vezes**. O que isso pede é um gate, e ele é a
consequência abaixo.

## Consequências

1. **`DatabaseFamily` ganha `'pg'`.** As linhas `cloud` da `PLACEMENT` (`auth`, `owner`, e a linha
   cloud de `shared`) passam de `db: 'libsql'` para `db: 'pg'`. A linha `local` de `shared` continua
   `libsql` — é literalmente por isso que ela é dual.
2. **`InfraModules` ganha a coluna `pg`.** Pelo mapped type do ADR 0004, acrescentar o membro à união
   **quebra o `tsc`** até que cada eixo declare seu módulo de bindings para ela. Isso é o desenho
   funcionando: é a mesma prova que o falseador do ADR 0004 mediu (eixo novo → 14 erros).
3. **Nasce um segundo `drizzle.config`** (`db/cloud/drizzle.config.ts`, dialeto `postgresql`, saída
   `db/cloud/migrations/`) e um script de autoria separado. O comando de aplicar existe **só** para a
   família `pg`, e o docblock de cada config passa a dizer de qual família fala — a doutrina de um só
   deixa de se apresentar como universal.
4. **Gate de paridade de kernel entre troncos.** As 4 tabelas de infra têm de existir nos dois com a
   mesma forma lógica; divergir em silêncio é o defeito que este ADR cria a possibilidade de ter.
   Sem gate, a primeira coluna acrescentada de um lado só aparece em produção.
5. **Gate de escopo do tronco cloud.** Uma tabela de contexto local aparecendo no tronco pg é erro,
   e é derivável da `PLACEMENT` — logo, verificável.
6. **A família `pg` do kernel entra**: são os 50 itens que a W5 classificou como `NÃO_ENTRA —
   família`, e que agora entram por esta porta. O veredito da W5 estava certo: eles não pertenciam
   àquela onda; pertenciam a esta decisão.

## Alternativas descartadas

- **Manter uma família só, e a nuvem sobre SQLite.** Descartado pelo founder. Um SQLite servindo um
  deployment multi-inquilino com réplicas é o substrato errado pela razão inversa da que torna ele
  certo no desktop: lá o valor é ser um arquivo local; aqui isso é o defeito.
- **Um tronco só, dialeto-agnóstico, emitido para os dois.** Foi a alternativa explicitamente pesada
  e recusada: *"dois dialetos diferentes com configurações diferentes"*. Um schema agnóstico é
  agnóstico até o primeiro `jsonb`, `pgEnum`, índice parcial ou `ON CONFLICT` — e a partir daí vira
  um `if` de dialeto dentro da declaração de tabela, que é a gambiarra que o `CLAUDE.md` proíbe por
  nome.
- **Espelhar as 29 tabelas no tronco pg.** Recusado na mesma frase (*"somente pras tabelas que vão
  existir em tais"*). Tabela que ninguém escreve é convite, não reserva.
- **`runMigrations()` da família pg virar no-op silencioso.** É a forma que este ADR existe para
  proibir: transforma "o operador esqueceu de migrar" em corrupção de dado em vez de recusa de boot.
