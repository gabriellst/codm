# Phase 0 — Daemon TS sai do PGlite e entra no SQLite compartilhado

**Data:** 2026-07-26
**Branch:** `sqlite-shared-store`
**Repo:** `/Users/work/Desktop/Projetos/pessoal/codedm`
**Estado de partida:** commit `149b6aa3` — a metade Go já está pronta e commitada.
**Revisão:** iterações 1, 2, 3, 4, 5, 6 e 7 aplicadas (ver abaixo).

---

## 0g. Iteração 7 — a task que fecha a fase deixa de ser um SCRIPT DE PAPEL

Quatro rodadas de review encontraram um blocker **novo** em T31, toda vez, enquanto os ACs simples
do resto do plano (greps, `bun test`, contagens) passavam. O diagnóstico não é falta de rigor — as
iterações 3-6 rodaram cada linha. É a **forma** da task: T31 **escrevia código dentro de um
documento** — 8 passos de `curl` com portas, cabeçalhos, rotas, chaves de API e orquestração de
shell cravados em markdown. Um script de papel não sobrevive ao contato com a realidade, e a
correção de cada rodada plantava o defeito da seguinte (`$AUTH_HEADER` → `$OWNER_HEADER` →
`$GLOBAL_API_KEY` → …).

**1. T31 foi reescrita como INVARIANTE + RESTRIÇÕES + DELIVERABLE + ARMADILHAS.** A sequência sai
do documento e vira `packages/api/typescript/scripts/smoke-shared-store.ts` (caminho já fixado pela
AC-0.5 do goal), commitado, com a saída do run real em `.specs/codedm/phase0-smoke/`. **Quem
escreve, RODA e itera a sequência é o executor.** Um script que não roda falha; um markdown que não
roda passa. O invariante ficou **uma** afirmação: *o gateway Go e o daemon TS leem e escrevem UM
arquivo*, provada por **duas** travessias cross-process sobre a mesma linha (INSERT + UPDATE), cada
uma com controle negativo antes.

**2. T31 deixou de depender de T30B.** As duas travessias que o gateway faz **desassistido** já
existem e foram medidas: `create` ⇒ `CREATED`/version 1, `connect` ⇒ `CONNECTING`/version 2. T30B
eleva a segunda a `CONNECTED`; o artefato registra qual variante rodou.

**3. [blocker] T30B emitia o seam no OpenAPI — e por isso quebraria `check:generated`.** O emissor
Go é spec-first e **estático**: `pkg/openapi/walker.go:47` faz `packages.Load(cfg, "./internal/...")`
e `controllers.go:13-32` registra tudo que descobre. Ele **não lê o grafo fx** ⇒ o gate
`cfg.TestIngress` no `module.go` tem efeito **zero** sobre a emissão. Medido também que o
`openapi.json` do Go é **gitignorado** (`.gitignore:106`; `git ls-files packages/api/go/public` ⇒ só
`embed.go`), então um AC de git-drift sobre ele seria **vacuamente positivo** — mas a **SDK é
commitada** (815 arquivos) e é gerada a partir daquele spec, então o seam viraria drift em
`packages/client/dist/typescript/src/go/` e reprovaria `scripts/check-generated.ts`. Decisão
escrita em T30B: **o seam fica fora do pacote varrido** (`internal/channel/testseam/`, ou o
`cmd/smoke-connect` já autorizado pelo goal), com AC de emissão **rodado** (0 rotas `_test`, 37
rotas legítimas mantidas, SDK commitada limpa).

**4. Armadilhas medidas que o executor não deve redescobrir** (todas detalhadas em T31 §4):
`smoke-node-boot.ts` **descarta** um `CODEDM_DATA_DIR` externo (a chave explícita de `:50` vence o
spread de `...process.env`) e **mata** o filho (`:73-81`) — é sonda de boot, não supervisor;
`node` não está no PATH nu; o `Dispatch` do evento de conexão faz fan-out para **dois** handlers
(`channel_connected_handler.go:42`, `channel_sync_handler.go:46`, registrados em `module.go:337,346`)
e `internal_mediator.go:69-79` **retorna no primeiro erro** ⇒ o veredito é a **linha**, nunca
`curl -sf`; "zero linhas claimadas" vira **claim preso**; a perna da lane `api` — um `SELECT` sem
comando que causasse a linha — **saiu**, e a partição de lanes fica provada por **T29 caso 1**
(teste executável); e o paste `addr=:3132` foi **removido** (medido: `grep -rn '3132'` no repo ⇒
nenhuma saída; o contrato diz `CHANNEL_PORT=3032`).

**5. [novo, medido] "Sem Postgres no ar" não é verificável por inventário de container neste host.**
`docker ps --format '{{.Image}}'` mostra `postgres:17-alpine` e `redis:alpine` — de
**`medscall-monorepo`**, um repo vizinho — e, pior, `docker compose -f docker/docker-compose.yml ps`
**deste** repo lista os containers **dele**: o projeto default do compose é o basename do diretório
(`docker`) nos dois repos (rótulo `com.docker.compose.project.config_files` colado em T31 §2 R4).
Os dois gates reprovariam o critério que fecha a fase por causa de outro projeto. A restrição
passou a ser **alcançabilidade** — o env que o script monta para os filhos não tem
`DATABASE_URL`/`REDIS_URL` — asseverada **dentro** do script.

**6. [novo, medido] `| tee` mascara o exit code — e o critério que fecha a fase É um exit code.**
RODADO: um script que sai **3** vira `EXIT=0` sob `script | tee f`, e continua `EXIT=3` sob
`script > f`. A linha `bun scripts/probe-sqlite-interop.ts | tee -a <artefato>` da iteração 6
estava nesse buraco: a sonda podia falhar e o AC seguia verde. Corrigido em T31 e virou regra na
§8, ao lado da do `> /dev/null`.

---

## 0f. Iteração 6 — o critério que FECHA a fase estava quebrado nas DUAS direções

> **Registro histórico.** T31 não tem mais "passos" numerados — a iteração 7 (§0g) a reescreveu
> como invariante + restrições + script commitado. As referências abaixo a "passo 7" / "passo 6"
> descrevem a forma **antiga**; o conteúdo técnico (substring, inalcançabilidade, chaves de API)
> continua válido e foi absorvido nas restrições R1/R2 e nas armadilhas de T31.

A iteração 5 fez o AC rodar em bloco. Esta iteração rodou o **passo 7 de T31** — o critério que
declara a fase pronta — e ele reprovou nos dois sentidos possíveis de reprovar.

**1. [A] SUBSTRING: o AC passava exatamente no sintoma que a fase existe para matar.** A linha
era `curl … | grep -q 'CONNECTED'`. RODADO:

```
$ printf '{"status":"DISCONNECTED"}' | grep -q 'CONNECTED'; echo "EXIT=$?"
EXIT=0        # ⚠️ o console mostrando DISCONNECTED — o sintoma de origem — FECHAVA A FASE
```

`DISCONNECTED` contém `CONNECTED`. Toda assertiva sobre esse literal passa a ser **parse de JSON
com igualdade exata** (`jq -e`, comparando o campo `status` com a string `"CONNECTED"`), nunca
`grep` de substring. Formas rodadas, com saída colada, no passo 7 reescrito.

**2. [A] INALCANÇÁVEL: o procedimento fixado (create + connect por `curl`, sem telefone) termina
em `CONNECTING`.** Não é inferência de leitura — foi **executado no HEAD** contra o gateway Go
real, num data dir frio:

```
$ curl -sf -X POST …/api/channel/channels/whatsapp -H "X-Owner-Id: $OPERATOR_ID" -d '{"name":"acceptance-probe"}'
{"id":"2b3a4b6c-…","name":"acceptance-probe","platform":"WHATSAPP","status":"CREATED","createdAt":"2026-07-27T06:13:53Z"}
$ curl -s -X POST …/api/channel/channels/$CH_ID/connect -H "X-Owner-Id: $OPERATOR_ID"
{"id":"2b3a4b6c-…","state":"CONNECTING","qrCode":"2@lSwDQNDAxXk0knj1…"}
$ sqlite3 $DATA_DIR/codedm.db "SELECT id,status,version FROM gateway_channels;"
2b3a4b6c-…|CONNECTING|2
```

`CONNECTED` só nasce de `services/gateway/whatsapp/mapper/connected.go:12-20` (`events.Connected`
do whatsmeow ⇒ `channel.gateway_connected`), que exige **escanear o QR num telefone**. Verificado
que esse é o **único** produtor: `grep -rn 'NewGatewayConnectedEvent' packages/api/go
--include='*.go'` ⇒ 1 site de produção (o mapper) + 3 em `channel_sync_handler_test.go`. Ou seja:
como estava escrito, o critério que fecha a fase **não podia ser satisfeito** numa execução
desassistida.

**3. O que o passo 7 realmente prova — e a redação nova.** A afirmação da Fase 0 **não** é "uma
conta de WhatsApp foi pareada". É **"o split-DB morreu: o gateway Go e o daemon TS leem e
escrevem o MESMO store"**. O passo 7 passa a provar isso, e só isso, em três tempos:
**(1)** controle negativo — o `ui` do daemon lê **zero** channels `CONNECTED`, parseado;
**(2)** o **gateway** (o processo Go, pelo seu próprio HTTP) escreve o estado do channel pela
**sua** cadeia de produção (controller → mediator interno → `ChannelConnectedHandler` →
`entity.SetConnected` → `repo.Save`), nunca por `INSERT` direto do teste — que não provaria nada
sobre dois processos compartilharem store; **(3)** o **daemon**, que nunca escreveu aquela linha,
devolve o channel com `status` **exatamente** `"CONNECTED"`. O mecanismo de (2) é **T30B**
(seam de ingress do gateway, nova task desta iteração), com **fallback explícito** em
`CONNECTING` — ver o passo 7 e o §"Fallback" de T31.

**4. [B] `$AUTH_HEADER` reincidiu como `GLOBAL_API_KEY`.** A iteração 3 ligou `$OWNER_HEADER`
depois do `$AUTH_HEADER` não-ligado da iteração 2. Rodando de verdade apareceu a **terceira**
encarnação do mesmo defeito, e essa nenhuma leitura de controller pegava:

```
$ CHANNEL_GLOBAL_API_KEY="" go run ./cmd/api   # …e mesmo assim:
$ curl -s -X POST …/channels/whatsapp -H "X-Owner-Id: $OPERATOR_ID" -d '{"name":"x"}'
{"code":"UNAUTHORIZED","message":"apikey header is required"}   HTTP=401
```

Causa medida: `config.go:48` é
`getEnvOrDefault("CHANNEL_GLOBAL_API_KEY", os.Getenv("GLOBAL_API_KEY"))` — com
`CHANNEL_GLOBAL_API_KEY` **vazia** ele cai no fallback `GLOBAL_API_KEY`; e o `godotenv` do
`.env` raiz **não remove comentário inline de valor vazio**. Provado por sonda no módulo `core`:

```
$ godotenv.Load("<repo>/.env"); os.Getenv(...)
CHANNEL_GLOBAL_API_KEY="# gateway HTTP apikey guard (TS proxy sends it server-side; fallback: GLOBAL_API_KEY)"
GLOBAL_API_KEY="# generic apikey fallback"
```

⇒ o guard liga com uma chave-lixo. O bloco de setup de T31 passa a ligar **as duas** variáveis.
Com as duas vazias, o `curl` de create devolve **201** (saída colada acima). **Regra derivada
(§8): ligar as variáveis que o controller exige não basta — é preciso ligar também as que o
CARREGADOR DE CONFIG lê como fallback.**

**5. Demais correções desta iteração** (cada uma com o comando rodado colado no lugar):
T26 (`! grep -q DATABASE_URL template.config.ts` era insatisfazível — o tombstone de `:483` cita
`WHATSMEOW_DATABASE_URL`), T20 e T15 (ACs invocando arquivo de teste que **nenhuma** task cria —
`EXIT=1` medido), T09 (saída colada era de uma forma **pré-final** do próprio gate), T18
(contagem de `CODEDM_E2E` inflada por `dist/` stale), T25 e T30 (dois ACs **vacuamente
positivos**), T17 (dois itens numerados `4`), e §8 (o **runtime de `grep`** que as contagens
assumem).

---

## 0e. Iteração 5 — o AC como BLOCO, não como linha

As iterações 3 e 4 rodaram **cada linha** de AC contra o HEAD. Isso matou as formas
factualmente erradas — e não vê a classe que só aparece quando o bloco inteiro roda **numa
sessão de shell só, a partir da raiz do repo**, que é como o agente executor vai rodá-lo.

> **REGRA DESTA ITERAÇÃO: AC se roda em BLOCO, do topo ao fim, a partir da raiz do repo, num
> shell só.** Uma linha que passa isolada pode falhar — ou, pior, **passar sem inspecionar
> nada** — quando herda o estado deixado pela linha anterior.

**1. [B] Vazamento de `cwd` entre linhas de `cd` encadeadas — e em T23 ele faz o portão que
fecha a janela vermelha PASSAR VAZIO.** O bloco de T23 começava com
`cd packages/api/typescript && bun x tsc …` e a linha seguinte era
`cd packages/api/typescript && bun test`. A segunda `cd` roda **de dentro** de
`packages/api/typescript` e falha; tudo depois herda o `cwd` errado. RODADO, de dentro de
`packages/api/typescript`:

```
$ cd packages/api/typescript
cd: no such file or directory: packages/api/typescript          (exit 1)
$ ! grep -rn "pglite\|PGlite" packages/api/typescript --include='*.ts' | grep -v node_modules ; echo "EXIT=$?"
grep: warning: packages/api/typescript: No such file or directory
EXIT=0        # ⚠️ NEGATED GATE PASSED VACUOUSLY
```

Consequências concretas no T23 da iteração 4: (a) `bun tsc` passaria a rodar o script
`"tsc": "bun x tsc --noEmit"` do **próprio** `packages/api/typescript/package.json:11` (o `tsc`
cru cheio de ruído de arquivo de teste que o CLAUDE.md manda evitar) em vez do alvo de
workspace; (b) `cd packages/api/go` falha ⇒ **`go build`/`go vet`/`go test` nunca rodam**;
(c) os quatro gates estruturais repo-wide viram no-op verde. O portão que declara a fase pronta
para o bloco 3 fecharia tendo verificado **nada**. Mesmo defeito em T01, T02, T21, T24, T25,
T26 e T28.

**Forma canônica adotada em todo o plano (e agora regra em §8):**

```bash
cd "$(git rev-parse --show-toplevel)"        # 1ª linha de TODO bloco de AC: ancorar
( cd packages/api/typescript && bun test )   # cwd diferente ⇒ SUBSHELL, nunca `cd` solto
```

Onde várias linhas seguidas dependem do mesmo `cwd` (T04, T24, T25), elas vão **dentro do mesmo
subshell**, porque os caminhos relativos delas dependem dele. Verificado que âncora + subshell
resolve os dois lados: o `cd` interno resolve a partir da raiz e o `cwd` externo não muda.

**2. [B] T18 exigia `! grep -q "EventEmitter2Mediator"` num arquivo que LEGITIMAMENTE é dono do
nome** — a mesma classe do `.execute(` que a iteração 3 escopou. RODADO no HEAD:
`grep -n 'EventEmitter2Mediator' packages/api/typescript/src/shared/registry.ts` ⇒ **5 hits**
(`:15` import, `:110` docblock, `:137`, `:141` docblock, `:145`), dos quais `:137` é
`{ token: InternalMediator, mock: EventEmitter2Mediator, real: EventEmitter2Mediator }` —
passar aquele AC significa **deletar o barramento de eventos interno**. T18 só mata o ternário
de `:114`. Gate reescrito para asseverar **o binding**, e o modo `integration:` do
`ExternalMediator` (que `:141` pina explicitamente, com justificativa) passou a ser **decidido**
em T18 em vez de deixado ao palpite do executor no meio da janela vermelha.

**3. [B] T31 cravava 25 tabelas num arquivo que, no momento do aceite, tem as do whatsmeow
também.** `internal/channel/services/gateway/whatsapp/whatsmeow_store.go:46-67` abre
`"file:" + store.Path() + "?_pragma=…foreign_keys(1)"` e chama `sqlstore.NewWithDB(…).Upgrade(ctx)`;
`internal/channel/module.go:37` o provê, e o passo 6 do próprio T31 força a construção ao criar
+ conectar um channel. Essa co-tenância é **deliverable declarado** do commit `149b6aa3` — o AC
não só errava o número, perdia a chance de asseverar a propriedade. Agora assevera as 25
tabelas drizzle (`AND name NOT LIKE 'whatsmeow_%'`) **e**, em separado, que as do whatsmeow
coexistem. (O `= "25"` de T28 continua válido: lá não há gateway, só os dois appliers.)

**4. [B] T09 exigia zero `__drizzle_migrations` num arquivo que só morre em T11** —
reincidência exata da regra-irmã da iteração 4 (que varreu T09-a1, T10 e T15 e deixou este de
pé). RODADO no HEAD: 1 hit, `core/src/db/drivers/PGliteDriver.ts:129` (comentário). Corrigido
com `| grep -v PGliteDriver`, nomeando a task que o mata.

**5. [M] T04 asseverava um literal que a implementação correta não vai conter.** `store.go:44-46`
define `migrationsTable = "_sqlite_migrations"` e **toda** query monta o nome com `fmt.Sprintf`
(`:149`, `:184`, `:220`). RODADO no HEAD, dentro do span de `applyOne`:

```
grep -oE 'BeginTx|_sqlite_migrations' | head -2  →  BeginTx,                  (falha hoje E depois)
grep -oE 'BeginTx|migrationsTable'    | head -2  →  BeginTx,migrationsTable,  (passa HOJE, sem a correção)
grep -oE 'BeginTx|SELECT 1 FROM'      | head -2  →  BeginTx,                  (falha hoje, passa com a correção)
```

`migrationsTable` **não discrimina** — o `INSERT` da ledger que já existe casa. A forma adotada
é `BeginTx|SELECT 1 FROM`, e T04 passou a **mandatar** que a re-checagem in-tx reuse o texto de
`migrationApplied` (`SELECT 1 FROM %s WHERE name = ?`); sem esse mandato o AC só seria
satisfazível por sorte.

**6. [L] T25** ganhou as duas linhas de resíduo `PGlite` que faltavam na tabela
(`template.config.ts:379` e `packages/app/tauri/sidecars/build.ts:10`) — o padrão que T11 já
seguia: o gate vai a zero **por construção**, não por descoberta.

**7. [L] T27** — `grep -q PADRÃO f1 f2` sai 0 no **primeiro** hit; com só um dos dois arquivos
editado o AC passava (demonstrado: dois arquivos, um casando ⇒ exit 0). RODADO: os dois sites
hardcoded existem (`smoke-node-boot.ts:78`, `run-e2e.ts:125`), logo os dois precisam mudar.
Split em duas chamadas.

**8. [L] T17** — os dois ACs estruturais (`grep -q "source"`,
`! grep -qE "leaseUntil: *null|lease_until *= *NULL"`) RODADOS no HEAD dão **0** e **0**: o
positivo passa em qualquer prosa que contenha a palavra e o negativo não pega uma soltura de
lease escrita com outra grafia (`.set({ leaseUntil: undefined })`, `.set({` multi-linha). Ficam
como rede barata, com nota dizendo em voz alta que **a prova é o caso 8 de T29**.

**9. [L] Decisão (a)** dizia "lido no fonte (não inferido)" sobre
`node_modules/@libsql/client/lib-esm/sqlite3.js` — pacote que **não está neste checkout**
(RODADO: `ls node_modules/@libsql` ⇒ No such file or directory; `grep -c libsql bun.lock` ⇒ 2,
ambos declarações de peer **opcional**, de `db0` e de `drizzle-orm@0.45.2`). Reescrito para
dizer o que é verdade: medido numa sessão de sonda sobre `@libsql/client@0.17.4`, **fora** deste
checkout, e **T07C re-valida o mecanismo na versão que T07 de fato resolver** (T07 recusa pinar
versão de propósito).

**10. [L] T19** imprimia uma contagem em vez de comparar (`grep -c`). Virou assertiva.

**O que NÃO mudou:** as decisões (a)–(d) continuam fechadas; nada nesta iteração as reabre.

---

## 0d. Iteração 4 — ACs invalidados por TASKS IRMÃS, e o runtime do próprio AC

A iteração 3 rodou todo comando contra o HEAD e colou a saída. Isso matou os ACs *factualmente*
errados, mas deixou passar duas classes que só aparecem quando se pergunta **"em que momento da
execução este comando roda, e com o quê"**:

- **AC invalidado por uma task irmã.** A iteração 3 já tinha corrigido o caso T21/T18 (uma
  contagem absoluta invalidada por uma task **anterior**). A direção **contrária** não foi
  varrida: um AC que roda em Tnn e exige zero de algo que só morre em Tmm, com `mm > nn`. Três
  ocorrências (T09-a1, T10, T15).
- **AC que depende de um binário ausente.** `node` não está no PATH deste host — três invocações
  de T07 saíam 127.

**A regra desta iteração:** todo AC é lido **duas** vezes — uma pelo que ele afirma, outra pela
**posição dele na ordem de execução** e pelo **ambiente** em que vai rodar. Se o comando exige um
estado que outra task produz, ou um binário que não está no PATH, ele não é um AC — é uma
armadilha.

**O que mudou:**

1. **[blocker] T22** — o gate era `! grep -rn "'shared\.\|'owner\.\|'thread\.\|'issue\."` sobre
   `tests/` + `src/`. RODADO: **41 hits**, dos quais **21 são nomes de domain event** (os 4 de
   `owner/events/`, os 2 de `issue/events/`, os 9 de `thread/events/`, `owner/events/index.test.ts:12-15`,
   `redis-bridge.integration.test.ts:211,214`) em arquivos que T22 nunca toca. Passar exigiria
   renomear todo evento do repo — é a mesma classe [B2] que a iteração 3 varreu, e viola o §8
   ("escopar pelo receptor ou pelo diretório dono, nunca pelo nome nu"). Substituído por dois
   gates: file-local nos 2 arquivos do probe (HEAD: 26 hits, 4 chaves distintas, nenhuma delas
   nome de evento) e repo-wide **na superfície de chamada** (HEAD: 8, todos dentro daqueles 2).
   De quebra, a enumeração agora inclui as formas **indexada** e **de tipo**
   (`after['shared.events']`, `{ 'shared.events': number }`), que um grep pela chamada não vê.
2. **[blocker] T31** — a task que FECHA A FASE omitia um header **obrigatório** do gateway Go:
   `create_whatsapp_channel.go:15` declara `X-Owner-Id … validate:"required,uuid"` (17 linhas de
   `X-Owner-Id` no Go; 11 controllers de `internal/channel/` exigem), e `session.go:22-26` só
   estampa o header quando há cookie de sessão. Sem ele o `curl -sf` sai != 0, `CH_ID` fica
   vazio, e o AC `source='integration' … >= 1` falha **em cascata** — o mesmo modo de falha do
   `$AUTH_HEADER` que a iteração 3 tinha corrigido. Ligado `OWNER_HEADER` a partir de
   `src/auth/operator.ts:15` (`OPERATOR_ID = '00000000-0000-4000-8000-000000000001'`, UUID
   válido), extraído por comando (não digitado), com guard `test -n`.
3. **[blocker] T09 (a1)** — o gate `! grep -rn '\.transaction(' core/src/db/ core/src/services/UnitOfWork/`
   reprovava a implementação **correta**: `LibsqlDriver.test.ts` e `DrizzleUnitOfWork.test.ts`
   moram nesses dois diretórios e seus testes são `uow.transaction(...)`, que casa `\.transaction(`
   e não é excluído por nenhum dos dois `grep -v`. Somados `uow\.transaction(`, `\.test\.` e
   `PGliteDriver`; e o item ficou marcado **runnable only after T13** (a última linha viva,
   `DrizzleUnitOfWork.ts:14`, só morre lá), com um AC **file-local** ao lado que T09 consegue
   provar sozinha.
4. **[medium] T10 / T15 — ACs invalidados por task POSTERIOR.** T10 exigia 1 call site de
   `acquireDataDirLock(`; HEAD dá **2**, porque `PGliteDriver.ts:102` só é deletado em **T11**.
   T15 exigia zero `(db|tx|client).execute(` em `core/src` inteiro; HEAD dá **2**, e a própria
   nota da task admitia que um deles morre em **T16**. Corrigidos: `grep -v PGliteDriver` no
   primeiro, escopo `core/src/db` (o diretório que T15 possui) no segundo — a forma `core/src`-wide
   fica em T23, que é onde ela pode passar.
5. **[medium] T11 — os 11 arquivos de resíduo `PGlite` que nenhuma task nomeava.** RODADO: **103
   linhas em 24 arquivos**; 13 arquivos já tinham dono, **11 não** (18 linhas). O gate
   `! grep -rn "PGlite"` só falharia em T23, no fim da janela vermelha não-bissectável, como
   descoberta. Agora estão tabelados em T11 — com a observação de que `src/shared/index.ts:55`
   **não é cosmético** (descreve a serialização de migrations que a memoização de T12 substitui)
   e de que `TestBed.ts:168` e `require-emit-env.ts:20` são **strings de erro**, não comentários.
6. **[medium] T07 — `node` não existe neste ambiente.** `which node` ⇒ *not found* (só `bun`, em
   `/Users/work/.bun/bin/bun`). As três invocações viraram `bun --print` / `bun -e`, com o índice
   de `process.argv` **verificado** (`bun -e "…" 0.15.9` ⇒ argv = `[bun, "0.15.9"]`, logo
   **argv[1]**) e a comparação semver executada em 4 valores.
7. **[medium] D1 — a propriedade que a fase inteira depende e ninguém media.** T07B medía
   `DIRTY_READ_ON_READ_CLIENT` (o client de leitura não vê **demais**) mas nada media que ele
   **vê o suficiente**: read-after-commit. O sintoma que motivou a fase ("console mostra
   DISCONNECTED") é servido 100% pelo handle de leitura. Acrescentada a **sonda (8)** —
   `READ_AFTER_COMMIT_SAME_PROCESS`, `READ_AFTER_COMMIT_CROSS_PROCESS`,
   `…_LAG_MS` — com linha própria de `GATE=FAIL` em T07C, ACs `= "yes"` no gate, teste permanente
   nº 5 em T09 e re-execução em T31.
8. **[medium] D1 — leitura por `this.db` DENTRO de um callback de transação.** A classe 1 de T13B
   greppa só `this\.db\.(insert|update|delete)\(`; um `this.db.select(` dentro do span lê o estado
   **pré-transação** sem erro nenhum. É exatamente o jeito de errar o claim de T16
   (`SELECT ids / UPDATE lease / SELECT rows`): o segundo `SELECT` no handle de leitura devolve
   linhas **sem lease** e a mesma linha vai para dois ciclos. Criada a **classe 3B** em T13B
   (varredura de `this.db.` dentro de span de `transaction(`, `CLASSE_3B_ACHADOS` no artefato),
   com a regra normativa escrita no docblock de `transaction()` (T09) e no passo 2 de T16.
   Universo medido: 20 `this.db.select(` em 7 arquivos, **todos** query use case do BFF, nenhum
   sob tx — a classe está limpa hoje e o guard existe para que continue.
9. **[low] T23** — o resumo dizia "0 (transaction)" enquanto o corpo do próprio gate (4) já
   listava **4 arquivos**. RE-RODADOS os quatro gates e colada a tabela: 20 / 0 / 3 / **4**.
10. **[low] T12** — `grep -oE 'dbFileName\s*=\s*"…"'` usava `\s`, que o §8 do próprio plano
    proíbe em AC. Passa neste host, mas a regra existe para não depender de qual `grep` está no
    PATH. Convertido para `[[:space:]]*`; os dois rodados, os dois devolvem `codedm.db`.
11. **[low] T09** — o `awk '/close[[:space:]]*\(/,/^\t}/'` abria o range no **primeiro** `close(`
    do arquivo, que sob a própria spec é o `migClient.close()` do `finally` de `runMigrations()`.
    Ancorado em `/^\tclose[[:space:]]*\(/` (verificado que a forma ancorada isola só o método).
12. **[low] §7** — o item 11 estava impresso antes do 10. Reordenado; a numeração é referenciada
    por T18/T30 e pelo texto das decisões, então os números **não** mudaram.

**O que NÃO mudou:** as decisões (a)–(d) continuam fechadas; nada nesta iteração as reabre.

---

## 0c. Iteração 3 — o que foi EXECUTADO (não só escrito)

A iteração 2 escreveu ACs corretos em intenção e errados em execução. **A regra desta iteração:
todo grep, todo comando e toda contagem que aparece neste plano foi RODADO contra o checkout
antes de virar AC, e a saída real está colada ao lado.** Onde o comando só pode rodar depois de
uma task criar o arquivo, isso está dito com todas as letras (`runnable only after Tnn`).

**1. [B1] O AC de T02 afirmava uma forma emitida que o gerador NÃO produz.**
`packages/contracts/codegen/emit-wire-go.ts:71-79` (`toGoEnumIdent`) devolve o valor **verbatim**
quando ele já é um identificador Go válido — **não** faz uppercase. Rodado:

```
$ grep -nE '^\t[A-Za-z]+[a-z_]+ [A-Za-z]+ = "' packages/contracts/generated/go/wire/enums.go | head -4
96:	ChatPresenceTypecomposing ChatPresenceType = "composing"
258:	GroupRolemember GroupRole = "member"
341:	MembershipActionjoined MembershipAction = "joined"
488:	SpecialPlatformEventTypeqr_code_updated SpecialPlatformEventType = "qr_code_updated"

$ cat packages/contracts/generated/typescript/src/wire/enums/chat-presence-type.ts
export enum ChatPresenceType {
	composing = 'composing',
	...
```
Logo `OutboxSource { api, gateway, integration }` emite **`OutboxSourceapi`**, não
`OutboxSourceAPI`, e **`api = 'api',`**, não `API = 'api',`. Prova de que a forma antiga era
natimorta (proxy com os mesmos 3 valores lowercase):
```
$ grep -hoE 'ChatPresenceType[A-Z]+ +ChatPresenceType = "(composing|recording|paused)"' …/enums.go | sort -u | wc -l
0        # a forma do plano da iteração 2
$ grep -hoE 'ChatPresenceType(composing|recording|paused) ChatPresenceType = "…"' …/enums.go | sort -u | wc -l
3        # a forma corrigida
```
T02 reescrita (prosa **e** AC). **Os valores de string não mudam** — `api`/`gateway`/`integration`
continuam sendo o que os dois lados já escrevem (`outbox.go:35`, `module.go:28`), então mexer no
casing dos valores para "ficar bonito no Go" está **proibido**: quebraria o Go commitado.

**2. [B2] O gate repo-wide de T23 (e o de T15) proibia `.execute(` e `.rows` — e casava ~150
linhas legítimas.** Rodado:
```
$ grep -rn '\.execute(\|\.rows' packages/api/typescript/core/src packages/api/typescript/src --include='*.ts' | grep -vc node_modules
151
```
São `useCase.execute(`, `this.query.execute(` (todo controller de `ui/`), `handler.execute(`,
`mw.execute(`, `batch.rows` (o `OwnerBatch` do dispatcher), `this.rows` (mocks de repositório).
O que o gate **quer** dizer é a API do **cliente drizzle/pg**: `db.execute()` e o `result.rows`
que ela devolve. Forma corrigida, **rodada**:
```
$ grep -rnE '\b(db|tx|client)\.execute\(|\b(result|res|rs)\.rows\b' packages/api/typescript/core/src packages/api/typescript/src --include='*.ts' | grep -v node_modules
packages/api/typescript/core/src/db/drivers/utils.ts:19:			await db.execute(sql`
packages/api/typescript/core/src/services/CommandQueue/PostgresCommandQueue.ts:291:		await this.db.execute(sql`
packages/api/typescript/core/src/services/CommandQueue/PostgresCommandQueue.ts:325:		return result.rows
count: 3
```
**3 hits, e os 3 são exatamente os pg-ismos que T15 e T16 deletam** — logo o gate vai a 0 por
construção, sem isentar nada. (Correção de detalhe: o plano citava `db.execute()` em
`PostgresCommandQueue.ts:291,307,325`; o real é `:291` e `:307`; `:325` é o `result.rows`.)

**3. [B3] Os dois ACs de T16 eram mutuamente insatisfazíveis.** T16 exigia
`grep -rq 'Date.now()'` **e** `! grep -rnE '\bnow\(\)'`. O `\b` fica entre o `.` e o `n`, então
`\bnow\(\)` **casa** `Date.now()`. Rodado:
```
$ printf 'const now = Date.now()\n' > /tmp/b3.ts && grep -nE '\bnow\(\)' /tmp/b3.ts
1:const now = Date.now()          # ⇒ o AC negativo falharia sempre que o positivo passasse
```
Forma correta (a mesma que T23 já usava, endurecida para cobrir início de linha), **rodada** no
diretório real:
```
$ grep -rnE '(^|[^.A-Za-z_])now\(\)' packages/api/typescript/core/src/services/CommandQueue | wc -l
5     # exatamente os 5 now() de SQL cru: :293 :297 :311 :312 :320
$ grep -rnE '\bnow\(\)' packages/api/typescript/core/src/services/CommandQueue | wc -l
9     # a forma antiga: os 5 + 4 linhas de Date.now()
$ printf 'const now = Date.now()\nconst p = performance.now()\n' > /tmp/b3c.ts && grep -cE '(^|[^.A-Za-z_])now\(\)' /tmp/b3c.ts
0     # Date.now() e performance.now() NÃO casam
```
T16 e T23 passam a usar **a mesma** forma `(^|[^.A-Za-z_])now\(\)`, e agora concordam.

**4. [D1] A subseção "Uma conexão, não um pool" estava factualmente errada em três afirmações,
e o bloqueador real nunca foi visto.** Uma sonda dedicada (12 scripts, `@libsql/client@0.17.4` +
`drizzle-orm@0.45.2`) mediu o driver e derrubou a premissa: `client.transaction()` **entrega a
conexão nativa** ao objeto Transaction e zera `#db`, então o próximo `execute()` abre uma
conexão **nova**. Consequências medidas: leituras durante tx aberta **nunca são sujas** (leem
committed, 0-1ms, sem bloquear); não existe `BEGIN` aninhado (a segunda tx pega conexão nova e
morre em `SQLITE_BUSY`); e — o achado que muda o design — **cada `client.transaction()` VAZA uma
conexão nativa** (a Transaction nunca fecha `#database`; `close()` só emite ROLLBACK). Medido
linear: 500 tx → 1002 fds, 5000 tx → 10002 fds, sem platô. `drizzle-orm/libsql/session.cjs:86`
chama `client.transaction()`, ou seja **`db.transaction()` — exatamente o que
`DrizzleUnitOfWork.ts:16` usa hoje — está no caminho que vaza**. Segundo achado: o driver local
é **síncrono**; um `BEGIN IMMEDIATE` esperando o gateway Go congelou o event loop por 816ms com
**0 ticks de timer**. A decisão (a) foi reescrita com o mecanismo fechado (dois clients + BEGIN
manual + mutex FIFO), a decisão (c)(5) perdeu a história de "aplicar pragmas uma vez", e T09,
T12, T13, T13B e a questão aberta 9 foram refeitas em cima disso. Detalhe completo na decisão
(a), subseção **"Duas conexões, BEGIN manual, e por que `db.transaction()` está proibido"**.

**5. [D2] Crash-loop ilimitado no outbox — decidido e escrito.** A decisão (d) removia
`attempts < MAX_ATTEMPTS` do claim e só incrementava `attempts` numa falha **tratada**; um evento
que **mata o processo** voltaria a cada 30s para sempre. O `CommandQueue` documenta a semântica
**oposta** e o porquê (`PostgresCommandQueue.ts:286-306`: "attempts = execuções INICIADAS",
incrementado no claim, "an unbreakable crash loop with no dead-letter"). O Go tem o mesmo buraco
(`sqlite_outbox_dispatcher.go:249` incrementa em `finalizeFailure`). Fechado como decisão com
mecanismo, guarda e risco aceito — ver decisão (d), subseção **"Crash-loop: `attempts` no claim"**.

**6. [D3] A ordenação owner-sequencial só vale DENTRO de um lote de claim.** A decisão (d)
afirmava a propriedade sem qualificador. Qualificada, com os dois cenários em que ela não vale
(>50 pendentes por lane; evento escrito por handler **durante** o mesmo flush) e o que acontece
em cada um.

**7. Defeitos mecânicos restantes, todos rodados.**
- **T21** cravava `= "31"` num grep que **T18 invalida** (o `TestIngressController` troca
  `externalMediator.publish(` por um `INSERT` na lane). Medido hoje: `31`. Passa a ser expresso
  como **delta** e como **auto-consistência** (grep == linhas da tabela de auditoria), nunca como
  absoluto de memória.
- **T09** mandava um docblock citando `PGliteDriver.ts:20-22` enquanto **T11** e **T23** exigem
  que a string `PGlite` **não sobreviva** em `packages/api/typescript`. Resolvido: o docblock cita
  o **mecanismo e a decisão**, não o arquivo morto; os gates ficam absolutos.
- **T09** cravava `grep -c 'createClient(' = "2"`, que reprova a implementação correta (um helper
  `openClient()` chamado duas vezes tem **1** ocorrência). Trocado por asserção sobre o que
  importa: existem dois handles distintos.
- **`awk '/x\s*\(/,…'` não é ERE POSIX** e neste macOS **não casa**. Rodado:
  ```
  $ printf 'runMigrations () {\n30000\n}\n' > /tmp/a.ts; awk '/runMigrations\s*\(/,/^\t}/' /tmp/a.ts
                       # vazio — o range nunca abre
  $ awk '/runMigrations[[:space:]]*\(/,/^\t}/' /tmp/a.ts
  runMigrations () { … # a classe POSIX funciona
  ```
  As 5 ocorrências (T09 ×3, T18 ×2) passaram para `[[:space:]]*`.
- **T31** usava `$AUTH_HEADER` **não ligada** — `curl -H ""` → 401 → o critério que **fecha a
  fase** falharia pelo motivo errado. Verificado no repo: **não existe header de auth**.
  `OperatorMiddleware.ts:17-24` estampa a identidade do operador **incondicionalmente** e
  `packages/e2e/utils/given/api.ts:36-44` documenta "no sign-up, no cookies… the API stamps the
  operator identity server-side", injetando **só** `Origin`. T31 passa a ligar `ORIGIN_HEADER` e
  a **fixar** a rota de connect do gateway em vez de mandar "escolher uma".

---

## 0b. Iteração 2 — o que a segunda revisão mudou

A revisão da iteração 1 confirmou no repo tudo que era load-bearing (o seam de driver, o diff
das duas schemas, as contagens, o filtro sync/async do adapter, os dois caminhos de packaging,
o inventário completo de pg-ismos, o TOCTOU Go, a armadilha do `close()`). Reprovou por **dois
problemas de design** e **cinco defeitos mecânicos de AC**. Correções aplicadas:

**1. `@libsql/client` com URL `file:` é UMA conexão, não um pool — e o plano dizia o
contrário.** A decisão (c) afirmava "a conexão TS é simplesmente um **terceiro** pool" (era
falso: `whatsmeow_store.go` abre um segundo `*sql.DB` de verdade; o TS abre um único
`libsql` Database). Com uma conexão só, duas `client.transaction()` sobrepostas emitem `BEGIN`
dentro de tx aberta, e um statement disparado por `this.db` enquanto há tx interativa
**entra silenciosamente nela** — o que destrói a garantia "o claim commita ANTES de qualquer
dispatch" sobre a qual a decisão (d) inteira está construída. O repo já documenta essa exata
classe de falha para o antecessor (`PGliteDriver.ts:20-22`), e é por isso que o
`PGliteUnitOfWork` finge transação. Mudanças: decisão (a) ganha a subseção **"Uma conexão, não
um pool"** com a mitigação **decidida** (o `TxGate`, um mutex assíncrono no `LibsqlDriver`);
decisão (c) tem a frase errada corrigida; **T07B ganha as duas sondas intra-client** (probes 5 e
6); **T07C (nova)** é o gate que consome essas sondas **antes** de T08 — porque uma resposta
ruim invalida a escolha de adapter, e descobrir isso em T13B seria descobrir **dentro** da
janela vermelha, depois de um commit único de 16 tasks e não-bissectável; **T09 ganha a
implementação do `TxGate`** com AC e teste próprios (antes nenhuma task era dona disso).

**2. O protocolo de lease quebrava a ordenação owner-sequencial.** `DrizzleOutboxDispatcher.ts:153,172`
declara a invariante ("Group by ownerId for owner-sequential processing" / "when a tenant event
fails, remaining events for that tenant are skipped"). Hoje a ordem se restabelece sozinha no
ciclo seguinte porque a linha que falhou e as puladas voltam **todas** a ser claimáveis, e
`orderBy(ownerId, createdAt)` põe a que falhou primeiro. Com o lease da decisão (d), a linha que
falha **retém** o lease por 30s (backoff) enquanto o skip o **soltava** — logo, no ciclo
seguinte (e `flush()` recursa na hora) a **sucessora pulada** ficava elegível e a
**predecessora que falhou** não: evento posterior do owner X entregue antes do retry do
anterior. Regressão de correção invisível a todos os ACs. **Decidido:** o skip **não toca o
lease** — as linhas puladas ficam leaseadas com o **mesmo** `claimed_by`/`lease_until` da que
falhou (é literalmente o mesmo claim), então o lote do owner volta **junto** e em ordem de
`created_at`. O ramo de skip vira **no-op no SQL**. T29 ganha o caso 8 que prova isso.

**3. Cinco defeitos mecânicos de AC (a classe que o §8 diz ter varrido).**
- **T02** apontava para caminhos gerados **inexistentes** (`generated/typescript/*OutboxSource*.ts`,
  `generated/go/*outbox_source*.go`). O layout real é um arquivo kebab-case por enum em
  `generated/typescript/src/wire/enums/` e **um único** `generated/go/wire/enums.go`. Sob zsh um
  glob sem match **aborta o comando** — as duas asserções eram natimortas. Retargetadas (e as
  aspas corrigidas: o TS gerado usa `'` simples, o Go usa `"`).
- **T02 AC #2** ("zero literal de lane solto no Go") só podia passar **deletando dois
  comentários explicativos** (`core/module.go:27`, `core/services/outbox/outbox.go:33`) que
  documentam justamente a partição de lanes desta fase. Reescrito para ignorar linhas de
  comentário e para **exigir** que os dois comentários continuem existindo.
- **Três ACs de git-drift invertidos ou que nunca falham** (T02, T25, T26). `git diff --quiet`
  sai **0** quando **não** há diff (verificado neste checkout), então
  `git diff --quiet … || echo "OK"` imprimia "OK" só quando o gerado **estava** drifted, e não
  falhava em nenhum caso; e `git status --porcelain … | grep -q . && echo … && false` sai
  **não-zero exatamente no caso que deveria passar**. Os três viraram
  `test -z "$(git status --porcelain -- <path>)"`.
- **`busy_timeout` era questão aberta E AC duro ao mesmo tempo**, e nenhum dos lados tinha
  mecanismo declarado (o Go roda migration no **mesmo** `*sql.DB` cujo DSN fixa 5000; o TS ia
  aplicar `applyPragmas` com 5000 em todo handle enquanto `runMigrations` queria 30000 — em
  qual conexão?). **Q5 fechada dentro da decisão (c):** os dois lados abrem um handle
  **curto e dedicado** para migration (Go: segundo `sql.Open` com DSN `busy_timeout(30000)`,
  fechado ao fim; TS: segundo client libsql, fechado ao fim), e o handle de regime fica 5000 nos
  dois. Mecanismo escrito em T04 e T09.
- **Resíduo Postgres que o AC de T26 derrubaria, sem dono em nenhuma task:**
  `core/src/db/config.ts` (um `createDrizzleConfig` com `dialect: 'postgresql'` hardcoded,
  exportado pelo barrel e **sem nenhum consumidor** no tree) e
  `packages/e2e/scripts/cleanup-stale-dbs.ts` (importa `pg`, lê `DATABASE_URL`, dropa DBs de
  teste Postgres; wired no script raiz `test:e2e:cleanup` e documentado no CLAUDE.md). T11 e T26
  passam a nomeá-los.

**4. Três lacunas menores fechadas.** T18 não especificava o protocolo de **finalize** da lane
`integration` (só o de claim), então linha ingerida com sucesso ficaria sendo re-claimada a cada
expiração de lease — agora reusa explicitamente a tabela de desfechos e T29 assevera o estado
final. A carve-out `CODEDM_E2E` (que troca o `ExternalMediator` real por `EventEmitter2Mediator`
"porque não há socket Redis") **nunca era revisitada** — com o binding real virando
`SqlExternalMediator` (in-process + polling de arquivo, zero socket) a justificativa evapora e o
e2e nunca exercitaria a ingress nova; T18 agora **remove a carve-out** e reaponta o
`TestIngressController` para escrever a linha `source='integration'`. E T31 citava
`GetHomeDashboardController` como nome de arquivo (o arquivo é `GetHomeDashboard.ts`; rota e
`path` estavam certos), T07 fixava `@libsql/client@^0.17.4` sem que o pacote exista neste
checkout (só peer declarations em `bun.lock`) — agora **assevera a versão resolvida** — e a
sobra de Redis (serviço + volume no compose, `RedisExternalMediator` + `ioredis` sem binding
depois de T18) virou follow-up **nomeado** na §7 em vez de silêncio.

---

## 0. Iteração 1 — o que a revisão mudou

A revisão anterior aprovou as quatro decisões e confirmou a maior parte da lição de casa
(a escolha de adapter e seus dois filtros, o TOCTOU do applier Go, a partição de lanes do
outbox, o diff de identificadores das duas schemas, as contagens de `insert`/`defaultNow`).
O que reprovou foi **executabilidade**, em três eixos. Correções aplicadas:

**1. Pg-ismos que nenhum compilador pega.** O plano tratava bem o que o `tsc` acusa e o que é
estrutural (50 defaults ausentes, partição de lanes), mas a varredura original tinha sido um
grep por casts `::` — então escaparam quatro construções que só falham em **runtime**:
- **T16 reescrita.** Deixou de ser "só muda o transporte da query": o SQL cru do
  `claimDueBatch` tem `now()` × 5, `interval '1 millisecond'`, `FOR UPDATE SKIP LOCKED` (o
  mesmo construto que o plano chamava de HARD BREAK no dispatcher, mas não listava aqui) e
  `UPDATE … FROM`. Relógio passa a vir de `Date.now()` bindado, não de SQL — as colunas são
  `timestamp_ms`, então `unixepoch()`/`CURRENT_TIMESTAMP` seriam o conserto errado.
- **T20 ganhou o item 0: `ilike()`.** É tipado como dialect-neutral pelo drizzle, **compila**
  contra sqlite-core e emite `ILIKE`, que o SQLite recusa. Não estava em lugar nenhum do plano.
- **T23 ganhou um gate repo-wide** para a classe inteira (`ilike|FOR UPDATE|SKIP LOCKED|interval
  '|now()|::cast|unixepoch|UPDATE…FROM|db.execute|.rows`), porque o gate antigo grepava só
  nomes de pacote (`pglite|pg-core|node-postgres`) e não pegaria nenhum destes.

**2. Dois bugs que o próprio plano introduziria.**
- **T09 `close()`.** O plano mandava "fechar o client de verdade; em modo temp file, remover o
  dir". `bun test` roda todas as suites em **um processo** e o `TestBed` memoiza o driver num
  `static`, com **toda** suite chamando `close()` no `afterAll` — a suite #1 destruiria o banco
  das outras 26, e dentro da janela vermelha isso apareceria só em T23, como cascata. `close()`
  volta a ser no-op/refcounted, com teste de regressão. O texto "arquivo temporário por suite"
  virou **por processo**, que é a vida real do objeto.
- **T12 memoização.** `useFactory` é invocado a **todo** resolve (o próprio `registry.ts`
  documenta isso). Sob PGlite um resolve extra custava um banco em memória; sob `LibsqlDriver`
  custa um `mkdtemp` vazado em disco e um banco **não migrado** entregue a quem resolve fora do
  `TestBed`. Os três caminhos (teste/real/`EMIT_OPENAPI`) passam a ser memoizados.

**3. O que o plano não auditava nem media.**
- **T13B (nova).** A troca de transação **falsa** (`PGliteUnitOfWork` chama `fn(this.db)`, sem
  `BEGIN`) por **real** (`BEGIN IMMEDIATE`) é mudança de semântica em todo o write path de
  produção, e T13 só provava o mecanismo. T13B audita as três classes de dependência
  (`this.db` dentro de callback de UoW, I/O sob o write lock, statement concorrente com tx
  interativa aberta) e amplia o `tx-discipline.test.ts`, que hoje declara `core/` fora de escopo.
- **T07B (nova).** As medições citadas nas decisões (a) e (c) não existiam no repo — o §8 manda
  parar diante de contradição medida, mas ninguém tinha como medir. A sonda vira script
  commitado, re-executável por T09, T31 e pela questão aberta 6 (linux/win32).
- **T25 ampliada.** Faltavam as três mudanças de **contrato** que a mudança exige:
  `--external` não tem slot em `SidecarDecl.build`; não há slot para node_modules staged nem
  para o cwd do sidecar (o loop de staging só materializa subpaths de `bootEnv`); e
  `bun desktop:generate` + `bun test:tooling` (drift gate do `template.config.ts`) nunca eram
  rodados.
- **T26 ampliada.** Remover o Postgres do compose deixava `DATABASE_URL` declarado em
  `REPO.env`, com `env-model.test.ts` gateando a paridade schema ↔ registry ↔ `.env.example`.

**4. Higiene de AC.** Globs citados (zsh aborta sem match), `wc -l | tr -d ' '` (BSD emite
espaço), e todo AC que só imprimia virou comparação de valor: T02, T03 (a invocação de
`drizzle:generate` estava **errada** — o script já embute `--config` do schema **pg**), T04,
T05, T12, T21, T30, T31. T31 ganhou variáveis ligadas, comandos de boot dos dois sidecars e a
rota real da lista de channels (`GET /v1/ui/home`, de `GetHomeDashboardController`).

**5. Consistência.** DDL da ledger agora **byte-idêntica** à do Go; `DrizzleDatabaseDriver.ts`
entrou nos Arquivos de T09; a decisão (d) nomeia `dispatch()` (o seam real) em vez de
`publish()`; a decisão (c) declara **intencional** a permanência do `codedm.db.lock` do Go; e
o §4 resolve a fronteira do bloco 2 (T07/T07B têm commit próprio; a janela vermelha é T08–T23)
e registra o dano colateral de T07 no checkout principal.

---

## 1. Contexto

O console mostra a lista de channels como `DISCONNECTED`. A causa não é a UI nem o
gateway: são **dois bancos**. O gateway Go já escreve num arquivo SQLite
(`<CODEDM_DATA_DIR>/codedm.db`) enquanto o daemon TS lê de um PGlite embarcado no
mesmo data dir. Cada lado enxerga um universo diferente, então nenhuma escrita do
gateway aparece nas queries de BFF do daemon.

O que já está feito e commitado em `149b6aa3` (não refazer, não regredir):

- Os 5 repositórios de channel do gateway estão sobre o `SqliteStore` compartilhado.
- `whatsmeow` roda num segundo pool `modernc` com FK ON sobre o **mesmo arquivo**.
- `pgx` e `redis` estão em zero nos dois `go.sum`.
- Um smoke de boot provou read-after-write via HTTP sem nenhum Postgres no ar.

**Objetivo desta fase:** o daemon TS passa a abrir o **mesmo arquivo** SQLite, com
o mesmo journal, o mesmo protocolo de outbox e a mesma ledger de migrations que o
Go — matando o split-DB na origem.

**Escopo desta fase:** apenas a troca de substrato de persistência do daemon TS e
o que ela obriga a mudar (packaging, boot, locks, outbox). Nenhuma feature nova,
nenhum bounded context novo, nenhuma mudança de contrato HTTP.

---

## 2. Verificação das premissas do scout

O scouting anterior entrou como **input a verificar**. Verifiquei tudo no repo.
Correções que mudam o plano:

| # | Afirmação do scout | Verificado | Correção |
|---|---|---|---|
| 1 | "as duas schemas exportam identificadores IDÊNTICOS (diff vazio)" | **Quase.** `diff` dos `export const` mostra 9 linhas só no lado pg | As 9 são os *handles* de `pgSchema` (`sharedSchema`, `ownerSchema`, `threadSchema`, `issueSchema`, `workspaceSchema`, `terminalSchema`, `artifactSchema`, `authSchema`, `gatewaySchema`). **Todos os identificadores de TABELA são idênticos.** E `grep` mostra **zero** importadores desses handles em `packages/api/typescript` — exceto `PersistenceProbe`, que os lê em runtime via `getTableConfig(table).schema`. Ver T22. |
| 2 | "schema-sqlite tem ZERO defaults db-side onde pg tem 50" | **Impreciso, e a imprecisão importa** | `schema-sqlite` tem **30** `.default(...)` — booleans, `version`, `attempts`, `max_attempts`, contadores. O que ele tem **zero** é o equivalente de `defaultNow()`/`defaultRandom()`: `grep -c "defaultNow\|defaultRandom\|\$defaultFn\|CURRENT_TIMESTAMP\|unixepoch" schema-sqlite/*.ts` → **0**. O lado pg tem exatamente **36 `defaultNow()` + 14 `defaultRandom()` = 50**. Logo o buraco é só de *timestamps e ids*, não de defaults em geral. Isso permite a resolução cirúrgica de T03/T21. |
| 3 | "32 insert sites em 21 arquivos" | **31 sites em 20 arquivos** (excluindo `*.test.ts`) | Enumerados em T21. A diferença é ruído de contagem, não de escopo. |
| 4 | "49 arquivos importam contracts/db" | **47** em `packages/api/typescript` | Irrelevante para o plano — nenhum precisa mudar (identificadores de tabela idênticos). |
| 5 | "`.for('update', {skipLocked})` é um HARD BREAK a portar" | Existe em `DrizzleOutboxDispatcher.ts:141` | **Discutível como "port": some.** A decisão (d) reescreve o claim inteiro para o protocolo de lease do Go — a linha é deletada, não traduzida. |
| 6 | "decidir sync vs async" | **Não há latitude** | `drizzle-orm/better-sqlite3/session.cjs:59-62` constrói `new BetterSQLiteTransaction("sync", ...)`; `drizzle-orm/libsql/session.cjs:85-103` é `async transaction()` com `await transaction(tx)`. `DrizzleUnitOfWork.ts:13-17` passa callback async e **todo** repositório abaixo dele é async. Só libsql é viável. |
| 7 | "`PGliteUnitOfWork` FAKE transactions" | Confirmado — `PGliteDriver.ts:24-32` chama `fn(this.db)` direto | Consequência: **nenhum teste existente exercita rollback**. Um adapter sync commitaria cedo e nada quebraria em CI. T13 + T28 fecham isso. |
| 8 | "`NodePgDriver` já está morto" | Confirmado — `grep -rn NodePgDriver` só acha o próprio arquivo, o re-export em `drivers/index.ts` e **dois comentários** em `registry.ts:66,126` | Deleção pura em T11. |

Confirmados sem ressalva: o seam de driver (`DrizzleDatabaseDriver` com 7 membros abstratos,
um único binding em `src/shared/registry.ts:124-127`), `client.ts:1-4` como a linha que vira o
dialeto da árvore inteira, `db.execute()` em `PostgresCommandQueue.ts:291,307,325`,
`truncateAllTables` em PL/pgSQL usado por **27** suites via `TestBed.reset()`, e
`DrizzleIdempotencyGuard.ts:32` inserindo sem `createdAt` contra
`schema-sqlite/infrastructure.ts:69` que é `notNull` sem default.

---

## 3. As quatro decisões — FECHADAS

Estas decisões estão **encerradas**. O agente que executa este plano não as reabre;
se algo medido em execução as contradisser, o procedimento é parar e reportar, não
escolher outra coisa.

### (a) ADAPTER — `@libsql/client` + `drizzle-orm/libsql` (async)

**Decisão.** Adotar `@libsql/client` com o driver `drizzle-orm/libsql`. **Rejeitar**
`bun:sqlite` e `better-sqlite3`. O addon nativo do libsql é **staged, não embutido**:

- caminho **node** (`bun build --target=node`): copiar para
  `dist/node_modules/{libsql,@libsql/<triple>}` — exatamente a mesma manobra de staging
  que `scripts/build.ts` já faz hoje para o PGlite, resolvida pelo walk-up do Node a
  partir de `dist/server.js`;
- caminho **sidecar Tauri** (`bun build --compile`): staged como bundle resource **e** o
  supervisor Rust precisa chamar `.current_dir()` apontando para esse diretório, porque
  um binário bun compilado resolve módulos externos a partir do **CWD**, nunca do
  diretório do executável.

**Por quê (dois filtros independentes, cada um sozinho decisivo).**

*Filtro 1 — arquitetura.* Os sessions de `better-sqlite3` e `bun-sqlite` do drizzle são
`resultKind: "sync"`: invocam o callback sincronamente. `DrizzleUnitOfWork.transaction`
entrega um callback **async**, e todo repositório abaixo é async. Sob adapter sync o
`COMMIT` acontece **antes** do corpo rodar — bug de correção silencioso. Não é um patch
nos dois call sites do dispatcher: seria reescrever todo o write path (repositórios, use
cases, handlers) para síncrono. `libsql` é o único driver SQLite do drizzle com session
async, então `DrizzleUnitOfWork.ts:13-17` e os callbacks do dispatcher portam **sem
alteração**.

*Filtro 2 — packaging.* O daemon é buildado de **duas** formas e ambas estão vivas:
`scripts/build.ts:66-77` (`bun build --target=node`, consumido por `packages/e2e/playwright.config.ts:28`,
por `docker/Dockerfile.api` stage 2 em `gcr.io/distroless/nodejs22-debian12`, e pelo script
`smoke:node`) e `template.config.ts:194` + `packages/app/tauri/sidecars/build.ts:44`
(`bun build --compile`). `bun:sqlite` só funciona no compilado; `better-sqlite3` só funciona
sob node (crash de N-API/JSC no compilado). `libsql` roda nos dois.

**~~Bônus grátis~~ — RETIRADO na iteração 3.** A iteração 2 celebrava que
`@libsql/core/lib-esm/util.js:3-6` mapeia `mode "write"` → `BEGIN IMMEDIATE` e que
`drizzle-orm/libsql/session.cjs:86` chama `client.transaction()` sem argumento — logo paridade
automática com `_txlock=immediate` do DSN Go (`store.go:94`). **Esse caminho está proibido**: é
exatamente ele que vaza uma conexão nativa por transação (ver a subseção abaixo). A paridade com
`BEGIN IMMEDIATE` continua valendo — mas porque **nós** emitimos a string, explicitamente, em
`LibsqlDriver.transaction()`. Deixa de ser bônus e vira AC (T09).

#### Duas conexões, BEGIN manual, e por que `db.transaction()` está PROIBIDO

> **Esta subseção substitui integralmente a "Uma conexão, não um pool" da iteração 2, que estava
> factualmente errada em três afirmações e não via o bloqueador real.** As três afirmações
> derrubadas estão listadas ao final, para que ninguém as reintroduza lendo uma versão antiga.

**O mecanismo do driver — MEDIDO numa sonda, não inferido, e não lido NESTE checkout.**

> ⚠️ **Procedência (corrigido na iteração 5).** As iterações 2-4 diziam "lido no fonte" e citavam
> `node_modules/@libsql/client/lib-esm/sqlite3.js:155-159`. **O pacote não existe neste
> checkout** — RODADO: `ls node_modules/@libsql` ⇒ `No such file or directory`;
> `ls node_modules/libsql` ⇒ idem; `grep -c libsql bun.lock` ⇒ **2**, e as duas ocorrências são
> declarações de **peer opcional** (`db0@0.3.4` e `drizzle-orm@0.45.2`, `"@libsql/client":
> ">=0.10.0"`), não uma dependência instalada. O trecho abaixo foi lido e medido numa **sessão
> de sonda dedicada** (12 scripts) sobre **`@libsql/client@0.17.4`**, **fora** deste checkout.
> Como **T07 recusa pinar versão de propósito**, o executor pode resolver outra — e os internos
> citados (rotação de conexão, `#db = null`) são específicos de versão. Por isso o gate é
> empírico: **T07C re-mede o mecanismo na versão que T07 de fato resolver**, e é ele, não este
> trecho, que dá o direito de entrar em T08. Trate o código abaixo como **explicação do porquê**,
> e os números de T07C como **a prova**.

`@libsql/client@0.17.4`, `lib-esm/sqlite3.js:155-159` (transcrito da sonda):

```js
async transaction(mode = "write") {
    const db = this.#getDb();
    executeStmt(db, transactionModeToBegin(mode), this.#intMode);
    this.#db = null;                       // ⚠️ a conexão foi ENTREGUE à Transaction
    return new Sqlite3Transaction(db, this.#intMode);
}
#getDb() { if (this.#db === null) { this.#db = new Database(this.#path, this.#options) } … }  // :205
```

Ou seja `client.transaction()` **rouba** a conexão nativa e zera `#db`; o próximo
`client.execute()` abre uma conexão **nova**, silenciosamente. Daí decorre tudo:

**1. Reads NUNCA foram o problema (a iteração 2 tinha medo do risco errado).** Com a rotação,
uma leitura no mesmo client durante uma tx interativa roda em **outra** conexão e devolve estado
**committed**, em 0-1ms, sem bloquear e sem ver o que a tx escreveu. Também não existe `BEGIN`
aninhado: a segunda `transaction()` pega conexão nova e o `BEGIN IMMEDIATE` dela falha na hora
com `SQLITE_BUSY`.

**2. O bloqueador real: `client.transaction()` VAZA uma conexão nativa por chamada.**
`Sqlite3Transaction.close()` só emite `ROLLBACK` — nunca fecha `#database`. A conexão roubada
fica inalcançável e abandonada. Medido, perfeitamente linear e **sem platô** (o GC não dá conta):

| transações | fds abertos |
|---|---|
| 0 | 4 |
| 500 | 1002 |
| 1000 | 2002 |
| 3000 | 6002 |
| 5000 | 10002 |

E `drizzle-orm/libsql/session.cjs:86` é literalmente `await this.client.transaction()` — logo
**`db.transaction()`, que é o que `DrizzleUnitOfWork.ts:16` usa hoje, está no caminho que vaza**.
Um dispatcher claimando a cada 30s mais escritas HTTP estoura o soft limit de 1024 fds de um
container em horas. (Na máquina de medição `ulimit -n = 1048576` — o limite alto foi o que
**escondeu** a severidade localmente. Não confie no seu laptop para isto.)

**3. Segundo achado não previsto: o driver local do libsql é SÍNCRONO.** `executeStmt` é chamada
nativa bloqueante atrás de assinatura async. Medido: um `BEGIN IMMEDIATE` esperando um writer
externo por 816ms congelou o event loop por completo — **0 ticks de timer** no intervalo
(esperado ~40 se o loop estivesse vivo). Consequência que precisa estar escrita: **um client de
leitura dedicado NÃO mantém o HTTP vivo durante contenção de escrita** — nada é despachado
enquanto o loop está bloqueado. Com `busy_timeout = 5000`, o pior caso é uma **parada de 5s do
daemon inteiro**. Ver "Riscos aceitos" (i).

---

**DECISÃO FECHADA — o mecanismo.** *Nunca* chamar `client.transaction()` nem `db.transaction()`.
Dirigir `BEGIN IMMEDIATE` **à mão** num client de **escrita** dedicado, atrás de um **mutex
FIFO**, com um **segundo client** dedicado a **todas as leituras**.

`BEGIN` manual via `client.execute()` **não rotaciona** a conexão (só `transaction()` zera
`#db`), logo: **vazamento zero**, os pragmas **grudam para sempre**, e a conexão de escrita é
estável. O client de leitura separado passa a ser **obrigatório** — sem a rotação, uma leitura
disparada no client de escrita **entraria** na tx aberta e viraria leitura suja entre requests.
É o único ponto em que o medo da iteração 2 vira real, e ele é **criado pela correção**.

```ts
// packages/api/typescript/core/src/db/drivers/LibsqlDriver.ts
import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'

// busy_timeout e foreign_keys são POR CONEXÃO; journal_mode é propriedade do ARQUIVO.
const PRAGMAS = [
  'PRAGMA journal_mode=WAL',
  'PRAGMA busy_timeout=5000',
  'PRAGMA foreign_keys=OFF',   // o libsql liga FK por default (medido: foreign_keys=1)
] as const

async function openClient(url: string, busyTimeoutMs = 5000): Promise<Client> { … }

/** Mutex assíncrono FIFO: uma transação de escrita aberta por processo. */
class TxGate {
  #tail: Promise<unknown> = Promise.resolve()
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(fn, fn)
    this.#tail = result.then(() => {}, () => {})
    return result
  }
}

export class LibsqlDriver extends DrizzleDatabaseDriver {
  #writeClient!: Client
  #readClient!: Client
  #gate = new TxGate()
  #write!: LibSQLDatabase   // SÓ dentro de transaction(); nunca para leitura HTTP
  readonly db!: LibSQLDatabase   // o membro abstrato existente = o client de LEITURA

  /** O ÚNICO caminho de escrita. Substitui db.transaction(). */
  transaction<T>(fn: (tx: LibSQLDatabase) => Promise<T>): Promise<T> {
    return this.#gate.run(async () => {
      await this.#writeClient.execute('BEGIN IMMEDIATE')
      try {
        const out = await fn(this.#write)
        await this.#writeClient.execute('COMMIT')
        return out
      } catch (e) {
        try { await this.#writeClient.execute('ROLLBACK') } catch {}
        throw e
      }
    })
  }
}
```

**Adaptação ao seam existente (para não mexer em 58 arquivos).** Medido:
`grep -rl DrizzleClient packages/api/typescript --include='*.ts' | grep -v node_modules | wc -l`
→ **58 arquivos**, e há **um único** binding (`registry.ts:116`,
`useFactory: c => c.resolve(DrizzleDatabaseDriver).db`). Portanto o membro abstrato **`db`
continua existindo e passa a ser o client de LEITURA** — os 58 sites não mudam de linha. O handle
de escrita **não é exposto**: só chega às mãos de alguém como o `tx` que `transaction()` passa.

**Regra de propriedade — greppável, ao contrário da prosa da iteração 2:**
> **Query use cases e controllers leem por `DrizzleClient` (= `driver.db`, o client de leitura).
> Use cases escrevem por `uow.transaction`. Escrita fora de `transaction()` é PROIBIDA.**

Medido hoje, o universo dessa proibição é **4 linhas** (não 58):
```
$ grep -rnE "this\.db\.(insert|update|delete)\(" packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v '\.test\.'
src/owner/usecases/SetActiveOwner.ts:45
core/src/services/CommandQueue/PostgresCommandQueue.ts:277
core/src/services/CommandQueue/PostgresCommandQueue.ts:333
core/src/services/CommandQueue/PostgresCommandQueue.ts:374
count: 4
```
As 3 do CommandQueue são reescritas em T16 de qualquer forma; a de `SetActiveOwner` é item
explícito de T13B classe (1). Este número é o AC de escopo da proibição, não uma estimativa.

**Consequências de tipo, a escrever no código (não descobrir no `tsc`):**
- `DrizzleTransaction = Parameters<Parameters<DrizzleClient['transaction']>[0]>[0]`
  (`DrizzleUnitOfWork.ts:5`) **deixa de descrever o handle** — o handle **é** o db de escrita.
  Vira `type DrizzleTransaction = LibSQLDatabase<typeof schema>`.
- `DrizzleUnitOfWork.transaction()` deixa de ser `this.db.transaction(...)` e passa a ser
  `this.driver.transaction(fn)`. **É edição de arquivo — T13 deixa de ser "confirmar que porta
  sem mudança".**
- Repositórios que só fazem `select/insert/update` sobre o `tx` compilam **sem alteração**.
- Qualquer `tx.rollback()` teria que virar `throw`. **Verificado: não existe nenhum.**
  ```
  $ grep -rn "\.rollback()" packages/api/typescript --include='*.ts' | grep -v node_modules
  (nenhuma saída)
  ```

**Por que o `TxGate` continua obrigatório — pelo motivo CERTO.** Não é para evitar `BEGIN`
aninhado (não existe) nem leitura suja (a rotação já evitava, e agora o client de leitura evita).
É para impedir que dois `BEGIN IMMEDIATE` sobrepostos virem `SQLITE_BUSY`, e para tornar a ordem
**determinística e observável**. Os statements são síncronos, mas os `await` entre eles cedem o
loop — medido: dois `db.transaction()` concorrentes ⇒ um cumprido, outro rejeitado com
`SQLITE_BUSY`. Com o gate, medido: 3 transações concorrentes ⇒ `fulfilled,fulfilled,fulfilled`,
intercalação `A-start > A-end > B-start > B-end > C-start > C-end` (FIFO estrito), e **fds
constantes em 6 depois de 2000 transações** (contra 4→10002 com `db.transaction()`).

**As três afirmações da iteração 2 que foram MEDIDAS COMO FALSAS — não reintroduzir:**
1. *"um statement disparado por `this.db` enquanto uma tx interativa está aberta entra
   silenciosamente NESSA tx"* — **falso** com `client.transaction()`: a rotação o joga em outra
   conexão; leituras veem committed, escritas tomam `SQLITE_BUSY` na hora. A analogia com
   `PGliteDriver.ts:20-22` **não transfere** (PGlite trava; libsql rotaciona). *Vira verdade* sob
   o mecanismo novo — e é exatamente por isso que o client de leitura separado é obrigatório.
2. *"duas `client.transaction()` sobrepostas emitem `BEGIN` DENTRO de uma tx já aberta"* —
   **falso**. Não há `BEGIN` aninhado; a segunda pega conexão nova e falha com `SQLITE_BUSY`.
3. *"aplicar os pragmas uma vez no startup"* — **quebrado** pela rotação. Ver decisão (c)(5).

**Escape hatch — RETIRADO.** A iteração 2 nomeava "um pool de N clients" como saída se a
serialização doer. Com as medições, o pool é **pior**: multiplica o congelamento de event loop
(item 3) e, se qualquer client do pool usar `client.transaction()`, **reintroduz o vazamento**.
A questão aberta 9 foi reescrita para dizer isso.

**As medições desta seção e da (c) são REPRODUTÍVEIS.** Duas famílias, com donos diferentes:
- **Intra-driver** (rotação, vazamento de fd, sobrevivência de pragma, leitura suja, freeze do
  event loop): medidas na sonda desta iteração e **re-asseveradas como teste** em T09 — não como
  script solto, porque são invariantes permanentes do driver, não uma medição de host.
- **Interop cross-process** (libsql ↔ `modernc`, WAL, `SQLITE_BUSY` sob carga): **não** foram
  re-verificadas nesta iteração e continuam valendo só como folclore até T07B rodar. Pior: os
  números antigos foram medidos **através** de `client.transaction()`, ou seja numa conexão cujo
  `busy_timeout` a rotação já tinha zerado — trate-os como **inválidos**, não como
  "não verificados". T07B commita a sonda; T07C é o portão.

**Riscos aceitos.**

**(i) CONGELAMENTO DO EVENT LOOP SOB CONTENÇÃO DE ESCRITA — alto, inevitável, aceito
explicitamente.** O driver local do libsql é síncrono: um `BEGIN IMMEDIATE` esperando o gateway
Go bloqueia **todo** o HTTP, todos os timers e o dispatcher, até `busy_timeout`. Medido: 816ms de
espera ⇒ **0 ticks** de timer. Com `busy_timeout = 5000`, o pior caso é uma parada de **5
segundos do daemon inteiro**. O client de leitura dedicado **não** mitiga isto — nada é
despachado enquanto o loop está parado; qualquer texto que sugira "as leituras continuam sendo
servidas durante contenção" é falso e foi removido. Mitigações **escritas**, não implícitas:
transações de escrita curtas; **nenhum `await` de I/O externa dentro de `uow.transaction`** (é a
classe 2 de T13B, e este risco é o motivo dela existir); e, se o regime mostrar paradas visíveis,
baixar para ~2000ms com retry no nível do use case em vez de um bloqueio longo — decisão a tomar
com medição de T31, **não** dentro do bloco 2.

**(ii) A proibição de escrever por `driver.db` é convenção, não tipo.** O split leitura/escrita é
load-bearing: uma leitura pelo handle de escrita fora de `transaction()` volta a ser leitura suja
cross-request. Guardado por grep (T13B) + `tx-discipline.test.ts` ampliado, e o universo é de 4
linhas hoje. Endurecer o tipo de `#write` para omitir query builders fora do callback fica como
melhoria, não como bloqueio.

**(iii) `BEGIN`/`COMMIT` manual passa por fora da contabilidade de transação do drizzle** —
`tx.rollback()` e savepoints aninhados deixam de existir. Verificado: **zero** call sites de
`.rollback()` hoje, então o custo é nulo agora e a proibição precisa estar no docblock para
continuar nula.

**(iv) O `TxGate` serializa TODAS as escritas do daemon numa fila única.** Correto (o SQLite já
admite um writer só), mas uma transação lenta bloqueia a cabeça da fila para **todo** o resto,
incluindo o claim do outbox. Combinado com (i), uma rajada de escrita do gateway Go pode
represar a fila. É o motivo de (i) exigir transações curtas.

(v) acoplamento a CWD no sidecar — auditar caminhos relativos
(`core/src/utils/paths.ts` deriva `API_ROOT` do bundle, portanto é cwd-independente);
fallback é desligar `build.kind: 'bun-compile'` do daemon. (vi) prebuilds cross-triple:
`libsql` tem 9 `optionalDependencies` e `bun install` baixa só a do host — morde no dia
em que a CI fizer cross-build (T25 registra o gap). (vii) libsql é um **fork** do SQLite;
o interop WAL com `modernc.org/sqlite` foi provado em `darwin-arm64` apenas (T31 registra
a pendência para linux/win32). (viii) binário compilado ~63 MB. (ix) mexer no lockfile
compartilhado exige rodar no **checkout principal**, não num worktree.

### (b) MIGRATIONS — dual-apply simétrico sobre UMA ledger

**Decisão.**

1. **Fonte de verdade:** `packages/contracts/db/schema-sqlite/migrations/*.sql` (saída do
   drizzle-kit). Toda cópia de runtime (dir do `//go:embed`, resource do Tauri) é
   **gerada** dali, nunca editada à mão, e há gate de igualdade byte-a-byte.
2. **Uma ledger:** DDL **byte-idêntico** nos dois lados —
   `CREATE TABLE IF NOT EXISTS _sqlite_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)`.
   Este é **verbatim** o que o Go já cria (`store.go:147-150`); o TS **copia essa string**, não
   uma variante. Como o `CREATE TABLE IF NOT EXISTS` é no-op para quem chegar segundo, quem
   vence a corrida define a forma — logo "uma ledger" só é verdade se as duas strings forem
   iguais. Há AC de igualdade literal em T09. Chaveada pelo **nome de arquivo completo, com
   `.sql`** — exatamente a string que o Go grava. O TS fica **proibido** de usar
   `drizzle-orm/*/migrator`; `__drizzle_migrations` **nunca** pode existir no arquivo
   compartilhado (asserção em teste).
3. **Produção:** os dois processos rodam o **mesmo applier idempotente** no boot, em qualquer
   ordem. O primeiro aplica; o segundo aplica zero. Não é modelo de dono.
4. **Correção de race obrigatória (aditiva, nos dois lados):** por arquivo —
   `BEGIN IMMEDIATE` → re-`SELECT 1 FROM _sqlite_migrations WHERE name=?` → se presente,
   `COMMIT` e pula → senão executa os statements (split em `--> statement-breakpoint`) e
   insere a linha da ledger → `COMMIT`. O check pré-loop continua como fast path lock-free;
   o re-check dentro da tx é o autoritativo. `busy_timeout` da conexão de migration sobe
   para **30000**.
5. **Conjunto a aplicar** derivado identicamente dos dois lados por
   `readdir(migrationsDir) | filter(.sql) | sort()` — **não** por `meta/_journal.json`. O
   journal fica como bookkeeping do drizzle-kit, fora do runtime (o que é exatamente por que
   o dir do `//go:embed` legitimamente não tem `meta/`).
6. **Testes:** modos `mock` e `integration` usam o **mesmo applier** contra um **arquivo
   temporário em disco** (não `:memory:`), para que WAL, `BEGIN IMMEDIATE` e multi-conexão
   sejam de fato exercitados.

   **A unidade de vida do arquivo é o PROCESSO, não a suite.** `bun test` roda **todos** os
   arquivos de teste em **um único processo** com estado de módulo compartilhado (verificado:
   mesmo PID, contador em escopo de módulo incrementa entre arquivos). `TestBed` guarda o
   driver num `private static databaseDriver` (`TestBed.ts:79-92`) e chama `runMigrations()`
   **uma vez por processo**; o isolamento entre suites vem de `reset()` no `beforeEach`, não de
   um arquivo novo. Logo: **um** `mkdtemp` por processo, memoizado junto com o driver — nunca
   um por suite, e nunca destruído por uma suite. Ver a semântica de `close()` em T09, que é
   onde essa distinção vira bug se for lida errado.
7. **`reset()`** troca o `truncateAllTables` PL/pgSQL por varredura SQLite numa tx:
   `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlite_migrations'`
   → `DELETE FROM "<t>"`, mais `DELETE FROM sqlite_sequence` quando existir. **Excluir
   `_sqlite_migrations` é load-bearing.**
8. **`readMigrations()`** (sem consumidor fora dos drivers) é repropositado para devolver
   `{ applied, pending }` lido da ledger, de forma que os ACs asseverem um valor em vez de
   grepar log.
9. **Distribuição:** o script de contracts copia os `.sql` para
   `packages/api/go/core/db/sqlite/migrations/`; um gate assevera igualdade byte-a-byte.

**Por quê.** O modelo de dono ("Go aplica, TS verifica") foi rejeitado por um fato duro:
o harness e2e sobe **só** o daemon TS (`src/shared/registry.ts`, carve-out `CODEDM_E2E`:
"the Go gateway is NOT booted"). Um TS verify-only precisaria de um segundo caminho de apply
exercitado apenas em teste — exatamente o tipo de mode split que esconde bug. Simetria só é
segura se o check for atômico com o apply: o loop Go commitado lê a ledger **fora** da
transação (`store.go:167` vs `BeginTx` em `store.go:203`), então dois boots concorrentes
ambos veem "não aplicada", serializam no `BEGIN IMMEDIATE`, e o perdedor re-executa
`CREATE TABLE`/`ALTER TABLE ADD` e morre. A migration `0000` tem **25 `CREATE TABLE` e
zero `IF NOT EXISTS`**; a `0001` é `ALTER TABLE shared_outbox ADD claimed_by` /
`ADD lease_until` — re-execução é erro fatal, não no-op. Mover o check para dentro da tx
custa ~6 linhas por lado e torna a ordem de boot irrelevante para sempre.

**Riscos aceitos.** Toca código Go já commitado (aditivo, coberto por `store_test.go`);
se alguém deixar só o pré-check em algum dos lados o TOCTOU volta silencioso (por isso T28
é um teste de boot **concorrente**, não sequencial); um `drizzle-kit migrate` apontado à mão
para o arquivo compartilhado criaria `__drizzle_migrations` e reaplicaria tudo (mitigado
pela asserção de ledger banida e por manter o `url` do `drizzle.config.ts` no `.scratch/`);
três cópias em disco do mesmo SQL derivam se o passo de cópia for pulado — e como a ledger é
chaveada por **nome**, um arquivo divergente de mesmo nome seria silenciosamente pulado (o
gate de bytes fecha isso); `busy_timeout` 30s na migration significa que um writer travado
segura o boot por 30s em vez de falhar em 5s — aceito, e logado.

### (c) LOCK — single-owner do ARQUIVO morre; nasce single-instance por PAPEL

**Decisão.**

1. **Deletar** toda semântica de exclusividade **de arquivo de banco** — nenhum lado pode
   segurar um lock cujo *escopo declarado* seja "eu sou o dono deste `.db`", porque isso é
   exatamente o que impede o segundo processo de existir.
2. O TS mantém um PID lockfile mas **retarget** de `<dataDir>.lock` (irmão) para
   `<dataDir>/daemon.lock` (dentro do dir, escopado por papel). O
   `<dataDir>/codedm.db.lock` do Go não colide com esse nome, então o Go **não precisa
   mudar** para shippar; renomear para `gateway.lock` por simetria é follow-up opcional.

   > **Tensão intencional — NÃO "consertar" o lock Go.** O Go continua com
   > `codedm.db.lock` (`store.go:80`), um nome derivado do `.db`, o que **lê** como o
   > single-owner-de-arquivo que o item (1) proíbe. É deliberado: o que importa é o
   > **conjunto de detentores**, não o nome. Só o gateway toma esse lock e só o daemon toma
   > `daemon.lock`; os dois papéis nunca disputam o mesmo caminho, então a propriedade
   > "single-instance por papel" já vale hoje, sem tocar Go. Renomear é cosmético e fica de
   > follow-up. O agente que executa este plano **não** deve mexer em `store.go:80`.
3. O lock é assunto **de boot** — só em `src/boot.ts`. O novo driver SQLite **não** adquire
   lock no construtor como `PGliteDriver.ts:102` faz.
4. `DataDirLockedError` mantém classe, `code = 'DATA_DIR_LOCKED'` e o contrato de
   `instanceof`, mas o **significado** estreita de "o arquivo de banco é de dono exclusivo"
   para "já existe um segundo daemon deste papel rodando". Mensagem e docblock reescritos.
5. **Pragmas TS**, executados em **toda** conexão ao abrir, nesta ordem exata, antes de
   qualquer query: `PRAGMA busy_timeout = 5000` **primeiro**, depois
   `PRAGMA journal_mode = WAL`, depois `PRAGMA foreign_keys = OFF`. `synchronous` fica
   intocado.

   > **Correção da iteração 3 — "aplicar os pragmas uma vez no startup" estava QUEBRADO, e a
   > frase "nenhum pragma de transação — o drizzle→libsql já emite `BEGIN IMMEDIATE`" está
   > RETIRADA.** `client.transaction()` rotaciona a conexão nativa (ver decisão (a)), e pragma é
   > **por conexão**. Medido:
   >
   > | momento | `busy_timeout` | `journal_mode` | `foreign_keys` |
   > |---|---|---|---|
   > | client novo, defaults | 0 | `delete` | 1 |
   > | depois de aplicar os pragmas | 5000 | `wal` | 0 |
   > | **depois de UMA `transaction()`** | **0** | `wal` | **1** |
   > | client novo no mesmo arquivo | 0 | `wal` | 1 |
   >
   > Só `journal_mode` sobrevive, e sobrevive porque é propriedade **do arquivo**, não da
   > conexão. `busy_timeout` e `foreign_keys` voltam ao default silenciosamente.
   >
   > **Isto é resolvido pela decisão (a), não por um pragma a mais:** como o mecanismo **proíbe**
   > `client.transaction()` e emite `BEGIN IMMEDIATE` por `client.execute()`, a conexão **nunca
   > rotaciona** e os pragmas grudam pela vida do client. Aplicar no `openClient()` volta a ser
   > suficiente — mas **só** sob esse mecanismo. Quem "simplificar" `transaction()` de volta para
   > `db.transaction()` perde os pragmas **e** vaza fds, sem nenhum erro visível. Por isso T09
   > tem um teste que assevera `busy_timeout` e `foreign_keys` nos **dois** clients **depois de N
   > transações**, e não só no boot.
   >
   > Corolário: `BEGIN IMMEDIATE` deixa de ser cortesia do drizzle e passa a ser string nossa —
   > a paridade com `_txlock=immediate` do DSN Go (`store.go:94`) vira AC de T09, não suposição.
6. **`busy_timeout` dividido — 30s em migration, 5s em regime — via handle DEDICADO nos dois
   lados** (fecha a questão aberta 5, que era simultaneamente "aberta" e AC duro). Pragma é
   **por conexão**, então "subir para 30s durante a migration" só é expressável abrindo outro
   handle; alterar o handle de regime contradiria a paridade de 5s com o Go:
   - **Go:** `applyMigrations` **não** roda no `*sql.DB` do gateway (cujo DSN fixa
     `busy_timeout(5000)`, `store.go:94`). Roda num **segundo `sql.Open` curto**, com o mesmo
     DSN a menos de `_pragma=busy_timeout(30000)`, `Close()` no fim (`defer`). O pool de regime
     permanece intocado em 5000.
   - **TS:** `runMigrations()` abre um **terceiro client libsql, curto**, para o mesmo arquivo
     (`openClient(url, 30_000)` — mesma ordem de pragmas, só o `busy_timeout` difere), roda o
     applier nele e **fecha** no `finally`. Os **dois** clients de regime (escrita e leitura)
     permanecem em 5000 e **nunca** são re-pragmados. Este handle **não** passa pelo `TxGate` (é
     o único usuário do arquivo pelo lado TS naquele instante) e usa o mesmo `BEGIN IMMEDIATE`
     manual — **não** `client.transaction()`, que vazaria uma conexão por arquivo de migration.
   - Um handle curto e extra durante o boot é seguro e barato — em WAL o custo de abrir é
     abrir; e ele morre antes de qualquer query de aplicação. Espera >5s é logada nos dois
     lados (decisão (b)(4)).

**Por quê.** Hoje os dois lados tomam lock exclusivo e só não colidem porque os caminhos
diferem — e o motivo do caminho TS ser irmão está escrito em `DataDirLock.ts:26-30`: o
`initdb` do PGlite aborta se achar arquivo estranho no dir. Esse motivo **desaparece nesta
mudança**. Deixar como está seria depender de uma coincidência cuja causa foi removida.
Manter exclusividade de arquivo converteria o bug "dois processos, dois bancos" em "dois
processos, um banco, o segundo se recusa a subir" — mesmo sintoma `DISCONNECTED`, erro mais
alto. WAL é precisamente o mecanismo que substitui isso, e foi **medido**: 300 transações TS
(libsql, `BEGIN IMMEDIATE`, `busy_timeout=5000`) simultâneas a 300 transações Go (modernc, DSN
exato do gateway) → `ok=300/err=0` dos dois lados, `FINAL rows ts=300 go=300`, zero
`SQLITE_BUSY`, zero escrita perdida.

O valor original do lock nunca foi exclusividade de arquivo — era pegar operador subindo
duas cópias **do mesmo processo** no mesmo data dir (dispatchers de outbox duplicados,
schedulers duplicados). Esse valor sobrevive e vira o lock por papel.

Sobre os pragmas, a ordem é load-bearing, não estilo: `busy_timeout` primeiro porque
`PRAGMA journal_mode=WAL` **pode contender** quando o writer Go segura o arquivo, e o default
medido do libsql é `0` (falharia na hora em vez de esperar). `journal_mode` precisa ser
asseverado mesmo persistindo no header do arquivo porque no `TestBed` é o **TS** que cria o
arquivo, e o libsql default é `delete` — ou seja, sem WAL, sem segurança multi-processo.
`foreign_keys=OFF` é o sutil: libsql liga FK por default (medido: `{"foreign_keys":1}`),
enquanto `store.go:87-88` diz explicitamente que o pool de domínio Go mantém FK **desligado**
para a migration squashed poder criar tabelas em qualquer ordem. Pragmas são **por conexão** —
o repo já depende disso: `whatsmeow_store.go:27-29` documenta um segundo pool com FK ON sobre
o mesmo arquivo.

> **Correção (iterações 2 e 3) — o lado TS não é "um terceiro pool", e também não é "uma
> terceira conexão".** A iteração 1 dizia "pool" (falso: os dois handles Go são `*sql.DB` de
> verdade, com N conexões cada; `createClient({url:'file:...'})` é um `Database` embarcado). A
> iteração 2 corrigiu para "uma terceira conexão" — também errado depois da decisão (a). O
> enunciado correto é **"a terceira e a quarta conexões"**: o `LibsqlDriver` abre **dois**
> clients de vida longa sobre o mesmo arquivo — um de **escrita** (dono do `BEGIN IMMEDIATE`,
> atrás do `TxGate`) e um de **leitura** (todo HTTP/BFF) — mais um **quinto** handle curto e
> efêmero durante `runMigrations()` (item 6 abaixo), que morre antes de qualquer query de
> aplicação. O que continua valendo aqui é o ponto de pragma: pragma é **por conexão**, então
> ambos os clients TS podem ter FK OFF sem afetar ninguém — e os dois **têm** que ser
> pragmados individualmente (`openClient()`), porque não há herança entre conexões.

**Riscos aceitos.** Perder exclusividade de arquivo remove a última barreira contra dois
**builds diferentes** abrirem o mesmo data dir — a mitigação passa a ser a checagem de ledger
da decisão (b). Filesystem de rede (iCloud/SMB/NFS) quebra WAL silenciosamente via `-shm` —
detectar e falhar alto. `-wal` e `-shm` passam a existir no data dir: qualquer coisa que trate
o dir como "formato PGlite" ou que faça backup só de `codedm.db` captura snapshot rasgado.
Dois sites de limpeza de lock viram no-op silencioso após o retarget (`run-e2e.ts:125`,
`smoke-node-boot.ts:78`) — T27. `busy_timeout` é teto, não garantia: o claim loop do
dispatcher TS é writer bem mais quente do que qualquer coisa que o Go roda hoje.

### (d) OUTBOX COMPARTILHADO — um consumidor claimante por lane

**Decisão.** `shared_outbox.source` congelado como enum de **3 valores** em
`packages/contracts` (Contract Lock da Phase 0). Os três valores ficam **exatamente** como já
estão commitados nos dois lados; **zero** churn de constante Go.

| lane | escrito por | claimado por (único consumidor) | despachado para |
|---|---|---|---|
| `api` | `DrizzleDomainEventRepository` (TS) — eventos de domínio **e** de integração | **só** `DrizzleOutboxDispatcher` (TS) | `integration.*` → `ExternalMediator.dispatch` TS (fan-out in-process); senão `InternalMediator` |
| `gateway` | `SqliteDomainEventRepository` (Go) — só eventos de domínio | **só** `SqliteOutboxDispatcher` (Go) | `InternalMediator` Go |
| `integration` | `SqlExternalMediator.Publish` (Go) — egress Go→TS | **só** o consumidor de ingress TS, filtrado por `name IN (<handlers externos registrados>)` | handlers externos TS via `handler.execute(envelope)` |

O bug de roubo é fechado por **um predicado** no TS (`AND source = 'api'`) mais um **novo
`SqlExternalMediator` TS** (gêmeo do Go) que passa a ser dono da lane `integration`. O
`SqlExternalMediator` Go vira **declaradamente egress-only** (construção explícita
`WithoutIngress` em `module.go`, fazendo `drainOnce` devolver 0 e `Register` falhar alto) em
vez de ser egress-only por acidente de `handlerNames()` estar vazio. Se um dia o Go precisar
de ingress, ele ganha a **própria lane** (`integration:gateway`) e o TS publica lá — migração
nomeada, nunca sobreposição numa lane.

**Qual método exatamente fica proibido de escrever.** A interface `ExternalMediator` TS expõe
**`dispatch(event)`** — é esse o seam que o `DrizzleOutboxDispatcher` chama
(`DrizzleOutboxDispatcher.ts:195` escolhe `this.externalMediator` para nomes `integration.*` e
despacha). Portanto a restrição se enuncia sobre `dispatch()`, não sobre um `publish()`
hipotético: o `SqlExternalMediator` **TS implementa `dispatch()` como fan-out in-process puro —
zero `INSERT` em `shared_outbox`** (diferente do `Publish` do Go, que insere). Motivo: eventos
de integração TS já viajam na lane `api`, gravados por `saveIntegrationEvent`
(`DrizzleDomainEventRepository.ts:219,231`); uma segunda linha entregaria em dobro. Se a classe
também expuser `publish()` (alias/legado), a mesma proibição vale — a restrição é sobre **todo**
caminho de saída da classe, e o AC de T18 grepa os dois nomes.

**Protocolo de claim exato** (SQL idêntico nos dois lados, a menos da lane e do filtro de nome
exclusivo da lane `integration`). Uma tx `BEGIN IMMEDIATE`, **commitada antes de qualquer
dispatch**:

```sql
UPDATE shared_outbox SET claimed_by = :token, lease_until = :now + 30000
 WHERE id IN (SELECT id FROM shared_outbox
               WHERE source = :lane AND processed_at IS NULL
                 AND (lease_until IS NULL OR lease_until < :now)
                 [AND name IN (:handlerNames)]
               ORDER BY created_at LIMIT 50);
SELECT id, name, owner_id, payload, attempts FROM shared_outbox
 WHERE claimed_by = :token ORDER BY created_at;
COMMIT;
```

- `token` = uuid v4 por ciclo; lease = 30_000 ms; batch = 50 (já é o `BATCH_SIZE` do TS).
- O TS **remove** `attempts < MAX_ATTEMPTS` do claim: o estado terminal passa a ser o único
  predicado `processed_at IS NOT NULL`. **Mas `attempts` passa a ser incrementado NO CLAIM** —
  ver a subseção "Crash-loop" abaixo, que é o que impede isso de virar redelivery infinita.
- O TS mantém dispatch sequencial por owner como agrupamento **em memória pós-claim**;
  `ORDER BY created_at` é a ordem de claim nos dois lados. **A garantia é intra-lote** — ver a
  subseção "O que 'sequencial por owner' garante, e o que NÃO garante".
- O TS **não pode** despachar dentro de uma transação de escrita — commit-antes-de-dispatch é o
  que impede a escrita de outbox do próprio handler de deadlockar contra o write lock segurado.
  Sob a decisão (a) isto ficou **mais** forte, não menos: as escritas do daemon passam por um
  mutex FIFO de um só detentor (`TxGate`), então despachar de dentro do claim faria o handler
  esperar por uma transação que só termina quando ele terminar — deadlock determinístico, não
  probabilístico. O claim é `driver.transaction(...)`; o dispatch acontece **depois** que ela
  retorna.

#### Crash-loop: `attempts` é incrementado NO CLAIM (decisão fechada, iteração 3)

**O buraco.** A tabela de desfechos incrementa `attempts` **só** numa falha *tratada* (o handler
lança e nós capturamos). Um evento cujo dispatch **mata o processo** — OOM, `process.exit`, panic
no spawn de terminal — nunca chega ao `finalize`. Sem `attempts < MAX` no claim, essa linha é
re-claimada a **cada** expiração de lease, mata o processo de novo, e assim **para sempre**, a
cada 30s. Não há dead-letter, não há escape.

**Não é hipótese: o repo já pagou esse preço e documentou a lição.**
`PostgresCommandQueue.ts:301-306`, verbatim:

> *"The claim ALSO counts the attempt (attempts + 1): incrementing only on a returned error
> missed hard crashes (OOM mid-execute), which re-claimed at attempts=0 after every lease
> expiry — **an unbreakable crash loop with no dead-letter**. `attempts` therefore means
> 'executions STARTED'."*

E `:286-289` mantém um sweep de dead-letter separado exatamente para a linha que queimou o
orçamento sem nunca voltar. **T16 preserva essa semântica literalmente** para o `CommandQueue` —
seria incoerente o outbox, no mesmo processo e no mesmo arquivo, adotar a semântica oposta.

**O Go tem o mesmo buraco.** `sqlite_outbox_dispatcher.go:249` faz `attempts := r.attempts + 1`
dentro do `finalizeFailure`; o claim (`:189`) só **lê** `attempts`. Ou seja: adotar "o protocolo
Go verbatim" aqui significaria **importar um bug**, não herdar correção.

**Decisão.** O `UPDATE` de claim passa a incrementar, na mesma linha em que leaseia:

```sql
UPDATE shared_outbox SET claimed_by = :token, lease_until = :now + 30000, attempts = attempts + 1
 WHERE id IN (SELECT id FROM shared_outbox
               WHERE source = :lane AND processed_at IS NULL
                 AND (lease_until IS NULL OR lease_until < :now)
                 AND attempts < 5                      -- ⚠️ VOLTA, com significado novo
                 [AND name IN (:handlerNames)]
               ORDER BY created_at LIMIT 50);
```

`attempts` passa a significar **"entregas INICIADAS"**, exatamente como no `CommandQueue`. Com
isso:
- os desfechos de falha **param de incrementar** (`UPDATE … SET last_error = :err` apenas) — o
  contador já foi cobrado no claim; incrementar duas vezes cortaria o orçamento pela metade;
- o predicado `attempts < 5` volta ao claim, mas **não** é mais o predicado terminal (isso
  continua sendo `processed_at IS NOT NULL`): ele é o **teto de crash-loop**;
- uma linha que queime o orçamento sem nunca ser finalizada fica **presa** (nem claimável, nem
  terminal). Isso é **intencional e visível**, mas precisa de coleta: o mesmo **sweep de
  dead-letter** que o `CommandQueue` já tem (`:286-299`) é replicado para `shared_outbox` —
  `processed_at IS NULL AND attempts >= 5 AND lease_until < :now` ⇒ `processed_at = :now,
  claimed_by = NULL, last_error = 'poison: exceeded attempts without finalize'`. Roda no começo
  do ciclo de claim, antes do `UPDATE` acima. Sem esse sweep a linha vira lixo invisível.

**Simetria com o Go — nomeada, não silenciosa.** Isto **diverge** do Go commitado. A divergência
é deliberada e o Go deve ser alinhado **numa fase seguinte** (questão aberta 11), não nesta: o
escopo aqui é o substrato do daemon TS, e mudar a semântica de `attempts` do dispatcher Go é
mudança de comportamento em código já testado. Enquanto isso, o TS é o lado **correto** e o
comentário do claim TS tem que dizer isso explicitamente, citando `PostgresCommandQueue.ts:301-306`
como precedente — senão a próxima pessoa "corrige" o TS de volta em nome da simetria.

**Risco aceito.** `attempts` no claim significa que um evento entregue com sucesso na 5ª tentativa
depois de 4 crashes **não é retentado uma 6ª vez** — o orçamento é de entregas iniciadas, não de
falhas. Aceito: é a mesma troca que o `CommandQueue` já faz, e o modo de falha oposto (crash-loop
infinito matando o daemon do usuário a cada 30s) é incomparavelmente pior.

#### O que "sequencial por owner" garante, e o que NÃO garante (qualificação, iteração 3)

A decisão dizia "ordenação owner-sequencial" sem qualificador. **A garantia é INTRA-LOTE:** dentro
de um mesmo claim, os eventos de um owner são entregues em ordem de `created_at`, e uma falha
pula os sucessores **daquele owner naquele lote**, que voltam juntos porque compartilham o lease.

**Fora do lote, a ordem NÃO é garantida.** Dois cenários concretos, ambos alcançáveis:

1. **Mais de 50 pendentes na lane.** `LIMIT 50` corta o lote. Se A (owner X) entra no lote 1 e
   falha, ele fica leaseado 30s. B (owner X, `created_at` posterior) ficou **fora** do lote 1 e
   não carrega o lease de A — no ciclo seguinte, com A ainda leaseado, **B é claimado e entregue
   antes do retry de A**. O no-op do skip não cobre este caso: ele só preserva o lease de linhas
   que **estavam no mesmo `UPDATE` de claim**.
2. **Evento escrito por um handler durante o mesmo flush.** O handler de A grava B na lane `api`
   (é o caminho normal de `saveIntegrationEvent`) **depois** que o lote foi claimado. B nasce sem
   lease. Se A depois falhar, B é elegível no próximo ciclo enquanto A cumpre backoff — mesma
   inversão.

**Decisão: aceitar, documentar, não sobre-construir.** Fechar isto de verdade exigiria escopo de
lease **por owner** (leasear o owner, não as linhas) ou uma coluna de sequência por owner —
divergência estrutural do protocolo Go que esta fase adota. O que a fase entrega é a garantia
intra-lote, que é o que basta para o sintoma que ela existe para matar. O que **não** é
aceitável é a frase sem qualificador: o docblock de `DrizzleOutboxDispatcher` (`:153,172`) tem
que dizer **"ordem preservada dentro de um lote de claim; lotes distintos podem inverter quando a
lane tem mais de `BATCH_SIZE` pendentes ou quando um handler escreve durante o flush"**. T17
tem AC de grep para essa qualificação e T29 caso 8 prova **só** a garantia intra-lote — nomeando,
no próprio teste, que é isso que está sendo provado.

| desfecho | SQL |
|---|---|
| sucesso | `UPDATE … SET processed_at = :now, claimed_by = NULL WHERE id = :id` — **tombstone**. O TS **para de deletar**. |
| retry (`attempts < 5`, o valor **já incrementado no claim**) | `UPDATE … SET last_error = :err WHERE id = :id` — lease **deliberadamente retido** = backoff natural de 30s. **Não** incrementa `attempts` (o claim já cobrou). O TS para de limpar `processedAt` no erro. |
| dead-letter (`attempts >= 5` pós-claim) | `UPDATE … SET last_error = :err, processed_at = :now, claimed_by = NULL WHERE id = :id` |
| skip (ordenação por owner, só TS) | `UPDATE … SET last_error = 'skipped: predecessor failed' WHERE id = :id` — **e nada mais**. **Não** toca `claimed_by` nem `lease_until`: a linha conserva exatamente o mesmo lease da que falhou. Escrever `last_error` é o único delta da iteração 3 sobre o "no-op" da iteração 2, e existe só para o operador distinguir "pulado" de "falhou". |
| crash | expiração de lease (≤30s) → re-claimável, **com `attempts` já cobrado** (é isso que dá teto ao crash-loop) |
| poison (crashou até queimar o orçamento) | sweep no início do ciclo: `UPDATE … SET processed_at = :now, claimed_by = NULL, last_error = 'poison: exceeded attempts without finalize' WHERE processed_at IS NULL AND attempts >= 5 AND lease_until < :now` |

> ⚠️ **A linha do skip NÃO toca `attempts` — e agora isso tem uma consequência a mais.** Como o
> `attempts` foi incrementado **no claim**, uma linha pulada **já** teve a tentativa cobrada sem
> nunca ter sido despachada. É o preço explícito de "sequencial por owner": um lote de 5 eventos
> de um owner cuja primeira linha falha 5 vezes leva os 4 sucessores a dead-letter junto. Aceito
> — é o mesmo significado de "não entregue fora de ordem" — mas tem que estar no docblock, e o
> `last_error` dos pulados fica `'skipped: predecessor failed'` para que o operador consiga
> distinguir isso de uma falha própria. (Esta é a **única** escrita que o ramo de skip faz, e ela
> **não** toca `claimed_by`/`lease_until`, então a propriedade "o lote do owner expira junto"
> continua intacta.)

**Por que o skip é no-op (e não "solta o lease") — a ordenação owner-sequencial depende
disso.** `DrizzleOutboxDispatcher.ts:153,172` declara a invariante: agrupa por `ownerId` e,
quando um evento do owner falha, **pula os restantes daquele owner** para preservar ordem. Hoje
isso se auto-corrige porque a linha que falhou e as puladas voltam **todas** a ser claimáveis no
ciclo seguinte, e o `orderBy(ownerId, createdAt)` recoloca a que falhou na frente. Com lease, um
skip que soltasse `claimed_by`/`lease_until` **quebraria** a invariante: a sucessora pulada
ficaria elegível imediatamente (e `flush()` recursa na hora) enquanto a predecessora que falhou
segue leaseada por 30s de backoff — entregando um evento **posterior** do owner X antes do retry
do **anterior**. Regressão de correção, silenciosa.

Como skip e falha vêm do **mesmo claim**, elas já carregam o **mesmo** `claimed_by` e o **mesmo**
`lease_until`. Portanto "manter o lease" é literalmente **não fazer nada**: o lote inteiro do
owner expira junto, é re-claimado junto, e o `ORDER BY created_at` restabelece a ordem. O preço é
que uma linha sã espera até 30s atrás de uma predecessora doente — que é precisamente o
significado de "sequencial por owner". A alternativa (soltar o lease da falha **e** das puladas,
expressando backoff por outro campo) foi rejeitada: exigiria uma coluna `next_attempt_at` nova,
divergindo do protocolo Go que esta decisão adota **verbatim**.

O caso **falha + skip no mesmo owner** é o caso 8 obrigatório de T29 — sem ele nenhum AC deste
plano enxerga a regressão.

**Dois requisitos de ingress que o scout não viu, ambos load-bearing.**

1. **Revival de datas.** O ingress TS precisa ler `payload` como **TEXT cru** e fazer
   `JSON.parse(raw, reviveIsoDates)` ele mesmo. O `text({ mode: 'json' })` do drizzle faz parse
   **sem reviver**, então strings RFC3339 continuam strings e **todo** input de use case com
   `z.date()` rejeita. Precedente exato: `RedisExternalMediator.ts:242` já faz
   `JSON.parse(data, reviveIsoDates)` e o comentário em `:329-336` diz literalmente que
   "downstream use-case inputs e.g. `IngestChannelMessage.receivedAt` reject a string".
2. **Envelope.** Manter `adaptWireEnvelope` (pass-through para o shape de outbox, defesa
   grátis) e despachar via `handler.execute(envelope)` — de modo que o ingress seja uma
   implementação de `ExternalMediator`, não uma extensão do `DrizzleOutboxDispatcher`.

**Latência.** Capar o poll da lane `integration` no TS em **2s**, igualando a estratégia WAL
do Go (`sqlite_wal_polling_strategy.go:28-33`: 50ms→2s). SQLite não tem push cross-process.
Com o cap atual de 30s, um `integration.channel.connected` do gateway poderia ficar meio
minuto parado — o que o usuário lê como o mesmo `DISCONNECTED` que esta fase existe para matar.

**Retenção.** Adicionar job diário no `CommandQueue` TS deletando linhas de `shared_outbox`
com `processed_at < now - 7d` — hoje **nada** poda tombstone em nenhum dos lados.

**Por quê.** A partição de lanes é escolhida para que "uma linha tem exatamente um claimante
possível" seja propriedade **do valor de schema**, não de quem por acaso registrou handler.
É exatamente a propriedade que o TS viola hoje. Lanes direcionais
(`integration:api`/`integration:gateway`) foram rejeitadas **por ora** porque com a topologia
real — Go publica ~20 eventos de integração e consome zero, TS consome e distribui os seus
in-process — dobrariam linhas e forçariam todo publisher a enumerar seus subscribers. Mas
"um consumidor por lane" não fica como convenção: declarar o mediator Go egress-only converte
propriedade incidental em propriedade **imposta**, por ~5 linhas Go aditivas, e nomeia a saída
de emergência para o dia em que o Go precisar de ingress. O protocolo é o do Go **verbatim**
(não um meio-termo negociado) porque o do Go já está commitado, já testado, e já correto nos
dois eixos em que o TS está errado: o lease sobrevive a crash (claim-por-`processedAt` não) e
`processed_at` como único predicado terminal impede que os dois lados discordem sobre se a
linha terminou. Parar de deletar importa além da simetria: o re-persist Go é
`INSERT … ON CONFLICT(id) DO NOTHING`, então id deletado é id re-inserível — delete +
entrega at-least-once = re-dispatch de fato já tratado.

**Riscos aceitos.** O reviver de datas é o item de maior risco: errar significa que todo evento
de integração Go→TS falha em `z.date()`, tenta 5×, vai para dead-letter — e o console **continua
`DISCONNECTED`**, agora com outbox cheio (T29 tem teste dedicado). Declarar o mediator Go
egress-only toca código commitado e transforma um futuro handler de ingress em falha de
boot/compile em vez de no-op silencioso — intencional, mas precisa estar documentado no
construtor. Fan-out consumido pelos **dois** processos deixa de ser expressável (aceitável: não
existe nenhum hoje). A lane `api` carrega domínio **e** integração num só dispatcher: handler
externo lento passa a atrasar entrega de evento de domínio (pré-existente, mas mais visível).
Tombstones acumulam até o job de poda; a janela de 7d é chute pendente de medição real.

---
## 4. Ordem de execução e onde a árvore fica vermelha

A troca de dialeto é intrinsecamente **big-bang**: no instante em que
`core/src/db/client.ts` deixa de estender `NodePgDatabase`, tudo que é tipado contra
`PgTable` quebra ao mesmo tempo (`saveWithOptimisticLock`, `PersistenceProbe`,
`db.execute`, `.for('update')`, os casts `::timestamptz`). Não existe caminho incremental
type-safe: `db.insert(table)` de um `NodePgDatabase` exige `PgTable`, então nenhuma
assinatura "dialect-neutral" compila **antes** do flip.

Portanto:

| bloco | tasks | árvore |
|---|---|---|
| **0 — Baseline** | T01 | verde |
| **1 — Preparação dialect-agnostic** | T02–T06 | **verde entre cada task** |
| **1b — Dependências, sonda e gate** | T07, T07B, **T07C** | **verde** — rodam no checkout principal, commit próprio cada uma |
| **2 — O FLIP** | T08–T23 | **VERMELHA de T08 até T23**. É a única janela vermelha do plano e é deliberada. |
| **3 — Packaging e boot** | T24–T27 | verde entre cada task |
| **4 — Verificação e aceite** | T28, T29, T30, **T30B**, T31 | verde entre cada task |

> **T30B (iteração 6) é a única task NOVA depois do bloco 2 e ela toca APENAS o Go** (controller
> test-only fora do pacote varrido pelo emissor + flag de config + declaração de env). Ela existe
> porque o literal `CONNECTED` era **inalcançável** sem ela numa execução desassistida (§0f item
> 2). **T30B NÃO bloqueia T31** (iteração 7): o invariante de T31 são **duas travessias
> cross-process**, e `create` ⇒ `CREATED` seguido de `connect` ⇒ `CONNECTING` já são duas — as duas
> MEDIDAS no HEAD. T30B eleva a segunda travessia a `CONNECTED`; o artefato é obrigado a registrar
> qual variante rodou (`CONNECTED_LITERAL_REACHED=yes|no`).

**T07, T07B e T07C NÃO fazem parte do commit único do bloco 2.** Cada uma tem commit próprio e
deixa a árvore verde (trocar deps não quebra tipo nenhum enquanto `client.ts` ainda estende
`NodePgDatabase`; a sonda é um script isolado; o gate não escreve código). A fronteira vermelha
começa **em T08**.

> **Por que o gate T07C existe e por que ele é ANTES de T08.** O bloco 2 é **um** commit de 16
> tasks, não bissectável. Tudo que pode **invalidar uma das quatro decisões** tem que ser medido
> **fora** dele — senão o §8 ("contradição medida ⇒ parar e reportar") vira letra morta, porque
> parar no meio do bloco 2 significa reverter tudo. A concorrência intra-client da decisão (a)
> (uma conexão só; `TxGate`) é exatamente esse tipo de risco: se `client.transaction()`
> concorrente ou `execute()` durante tx interativa se comportarem diferente do previsto, o
> mitigante muda de forma (mutex → pool de clients) e o `LibsqlDriver` de T09 sai diferente.
> Medir isso em T13B — dentro da janela — seria descobrir tarde e caro.

> **Efeito colateral do T07 no checkout principal, a assumir conscientemente.** Remover
> `@electric-sql/pglite` do lockfile compartilhado **quebra o daemon de qualquer outra branch
> do checkout principal que ainda esteja no PGlite**, até esta branch mergear. Não há como
> evitar: o lockfile é do workspace. Mitigação e regra: (i) fazer T07 **imediatamente antes**
> de entrar no bloco 2, não no começo da fase; (ii) não deixar T07 commitado e parado — o
> intervalo entre T07 e o merge é a janela de dano; (iii) quem precisar voltar para outra
> branch nesse intervalo roda `git checkout <branch> -- bun.lock packages/api/typescript/core/package.json && bun install`.

**Regra do bloco 2.** Dentro da janela vermelha, cada task tem um AC **local e mecânico**
(grep, inspeção de assinatura, teste unitário isolado) porque `bun tsc` global não vai
passar. O `tsc`/`lint`/`test` global é o AC de **T23**, e T23 é a fronteira: nada do bloco 3
começa antes de T23 passar.

**Commits.** Um commit por task nos blocos 0, 1, 1b, 3 e 4 — **incluindo T07, T07B e T07C, que
têm commit próprio cada**. Só o bloco 2 (**T08–T23**, e nada além disso) é **um único commit** (a
árvore não é bissectável no meio dele de qualquer forma). Não usar `git add -A`; stage por
arquivo. Nunca `git stash` atravessando um regen de contracts/SDK.

**Worktree.** T07, T07B e T07C **têm que rodar no checkout principal** — T07 mexe no lockfile
compartilhado do workspace e T07B/T07C dependem das deps que T07 instala. As demais tasks podem
rodar em worktree.

---

## 5. Tasks

### BLOCO 0 — Baseline

#### T01 — Congelar o baseline e medir o RSS "antes"

**Arquivos:** nenhum código. Cria `.plans/artifacts/2026-07-26-baseline.md` (novo).

> **`.plans/artifacts/` NÃO existe no repo** (verificado) — criar aqui com `mkdir -p`. É o
> destino de **todos** os artefatos deste plano: baseline (T01), sonda de interop (T07B),
> auditoria de transação (T13B), auditoria de inserts (T21) e aceite (T31). Sem ele, os `test -s`
> desses ACs falham por diretório ausente e parecem falha de conteúdo.

**O que muda.** Registrar, antes de qualquer edição: (i) que os gates estão verdes no HEAD;
(ii) o **RSS de regime** do daemon TS com PGlite, que é o número de comparação do aceite
final. Medir subindo o daemon com `CODEDM_DATA_DIR` num dir temporário, esperar
`GET /v1/session` responder, aguardar 30s de regime, e ler `RSS` via
`ps -o rss= -p <pid>` três vezes com 10s de intervalo, anotando a **mediana** em KB.
Anotar também o tamanho em disco do data dir PGlite (`du -sk`).

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5) — 1ª linha de todo bloco de AC
( cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit )   # exit 0
( cd packages/api/typescript && bun test )                                    # exit 0
( cd packages/api/go && go build ./... && go vet ./... && go test ./... )      # exit 0
bun test:tooling                                                              # exit 0 (baseline dos gates declarativos)
mkdir -p .plans/artifacts
test -s .plans/artifacts/2026-07-26-baseline.md
grep -qE 'RSS_MEDIAN_KB=[0-9]+' .plans/artifacts/2026-07-26-baseline.md
```

---

### BLOCO 1 — Preparação dialect-agnostic (árvore permanece verde)

#### T02 — Contract lock do `OutboxSource`

**Arquivos:**
- `packages/contracts/wire/` (TypeSpec) — declarar o enum `OutboxSource { api, gateway, integration }`.
- regenerar `packages/contracts/generated/{typescript,go}` via `bun run codegen:wire`.
- `packages/api/go/core/services/outbox/outbox.go:35` e `packages/api/go/core/module.go:28` —
  passam a **referenciar** a constante gerada em vez de literal, mantendo os mesmos valores
  de string.

**O que muda.** Nada de comportamento. O objetivo é que os três valores de lane virem um
tipo cross-boundary congelado, para que a decisão (d) seja verificável por tipo e não por
convenção. **Nenhum valor de string muda.**

**Layout do gerado — VERIFICADO neste checkout, não presumido** (a iteração 1 apontava para
caminhos inexistentes, e sob zsh um glob sem match **aborta o comando** antes do `grep`, então
os dois ACs eram natimortos):

- **TS:** um arquivo **kebab-case por enum** em
  `packages/contracts/generated/typescript/src/wire/enums/` → o alvo é
  `enums/outbox-source.ts`, **não** `generated/typescript/*OutboxSource*.ts`. **Aspas simples.**
- **Go:** **todos** os enums vivem num **único** arquivo,
  `packages/contracts/generated/go/wire/enums.go` (não existe `*outbox_source*.go`). **Aspas
  duplas**, mais um `ParseOutboxSource`.

> **⚠️ CORREÇÃO DA ITERAÇÃO 3 — a forma emitida que a iteração 2 afirmava NÃO EXISTE.** O plano
> dizia `OutboxSourceAPI OutboxSource = "api"` (Go) e `API = 'api'` (TS). **O gerador não faz
> uppercase.** `packages/contracts/codegen/emit-wire-go.ts:71-79` (`toGoEnumIdent`) e
> `emit-wire-ts.ts:30-40` (`toTsEnumMember`) devolvem o valor **verbatim** quando ele já é um
> identificador válido — só uppercaseiam valores *pontuados* (`sync.foo` → `FOO`). Emissão:
> `` `\t${e.name}${toGoEnumIdent(v)} ${e.name} = "${v}"` `` (`emit-wire-go.ts:87`) e
> `` `\t${toTsEnumMember(v)} = '${v}',` `` (`emit-wire-ts.ts:48`).
>
> Verificado no gerado que já está commitado (enums com valores lowercase):
> ```
> $ grep -nE '^\t[A-Za-z]+[a-z_]+ [A-Za-z]+ = "' packages/contracts/generated/go/wire/enums.go | head -4
> 96:	ChatPresenceTypecomposing ChatPresenceType = "composing"
> 258:	GroupRolemember GroupRole = "member"
> 341:	MembershipActionjoined MembershipAction = "joined"
> 488:	SpecialPlatformEventTypeqr_code_updated SpecialPlatformEventType = "qr_code_updated"
>
> $ cat packages/contracts/generated/typescript/src/wire/enums/chat-presence-type.ts
> export enum ChatPresenceType {
> 	composing = 'composing',
> 	recording = 'recording',
> 	paused = 'paused',
> }
> ```
> Logo a forma real é **`OutboxSourceapi`/`OutboxSourcegateway`/`OutboxSourceintegration`** e
> **`api = 'api',`**. Feio, e **assim mesmo**: o casing dos identificadores gerados é assunto do
> emissor, não desta fase.
>
> **PROIBIDO "consertar" mudando os VALORES do enum** para `API`/`GATEWAY`/`INTEGRATION` só para
> o identificador ficar bonito. Os três valores são strings de **wire já commitadas nos dois
> lados** (`packages/api/go/core/services/outbox/outbox.go:35` `const OutboxSource = "gateway"`;
> `core/module.go:28` `const integrationOutboxSource = "integration"`) e são o discriminador de
> linhas que **já existem em bancos de usuário**. Mudar o valor é migração de dados, não cosmética.
>
> Prova de que o AC da iteração 2 era natimorto — mesmo teste, sobre um enum-proxy que já tem 3
> valores lowercase:
> ```
> $ grep -hoE 'ChatPresenceType[A-Z]+ +ChatPresenceType = "(composing|recording|paused)"' …/enums.go | sort -u | wc -l
> 0      # forma da iteração 2 → o `test … = "3"` falharia sempre
> $ grep -hoE 'ChatPresenceType(composing|recording|paused) ChatPresenceType = "(composing|recording|paused)"' …/enums.go | sort -u | wc -l
> 3      # forma corrigida
> ```

**AC.** Todo comando abaixo **assevera** (compara um valor / usa `grep -q` / falha por exit
code). Nenhum "imprima e olhe".

```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5): todo caminho abaixo é relativo à raiz
# 1) o enum existe nas duas bindings, com exatamente 3 valores — nos caminhos REAIS do gerado,
#    e na forma que o EMISSOR de fato produz (identificador = valor verbatim, SEM uppercase).
#    Runnable only after this task regenerates: hoje `outbox-source.ts` ainda não existe.
#    As duas linhas foram VALIDADAS contra `chat-presence-type.ts` / `ChatPresenceType`, que já
#    têm 3 valores lowercase e a mesma forma emitida (⇒ 3 e 3; a forma antiga dava 0).
TSE=packages/contracts/generated/typescript/src/wire/enums/outbox-source.ts
GOE=packages/contracts/generated/go/wire/enums.go
test -f "$TSE"
test "$(grep -hoE "^	(api|gateway|integration) = '(api|gateway|integration)',$" "$TSE" | sort -u | wc -l | tr -d ' ')" = "3"
test "$(grep -hoE 'OutboxSource(api|gateway|integration) OutboxSource = "(api|gateway|integration)"' "$GOE" | sort -u | wc -l | tr -d ' ')" = "3"
grep -q 'func ParseOutboxSource' "$GOE"
# 1b) guard anti-"embelezamento": os VALORES continuam minúsculos nos dois lados.
#     Se alguém trocar para API/GATEWAY/INTEGRATION, isto falha — e tem que falhar: é migração
#     de dados, não cosmética (linhas com esses valores já existem em bancos de usuário).
! grep -qE 'OutboxSource = "(API|GATEWAY|INTEGRATION)"' "$GOE"
# 2) nenhum literal de lane solto em CÓDIGO Go de produção.
#    `grep -vE ':[0-9]+:[[:space:]]*//'` descarta linhas de comentário — os dois comentários que
#    casam (core/module.go:27 e core/services/outbox/outbox.go:33) DOCUMENTAM a partição de lanes
#    desta fase e não podem ser deletados para o AC passar.
#    RODADO NO HEAD (o "antes" desta task) — 2 hits, e são exatamente as 2 linhas que ela troca:
#      packages/api/go/core/module.go:28:const integrationOutboxSource = "integration"
#      packages/api/go/core/services/outbox/outbox.go:35:const OutboxSource = "gateway"
#    Depois de apontarem para a constante gerada, o count vai a 0 sem deletar nenhuma prosa.
test "$(grep -rn '"gateway"\|"integration"' packages/api/go --include='*.go' \
  | grep -v generated | grep -v _test.go | grep -vE ':[0-9]+:[[:space:]]*//' | wc -l | tr -d ' ')" = "0"
#    e os dois comentários explicativos CONTINUAM lá (guard contra "passar deletando prosa")
grep -q 'own ("gateway") slice' packages/api/go/core/module.go
grep -q 'dispatcher claims "gateway"' packages/api/go/core/services/outbox/outbox.go
# 3) gates que ESTA task dispara e que o plano antes não rodava.
#    ⚠️ SUBSHELL obrigatório (iteração 5): na iteração 4 estas 4 linhas eram `cd X && …` soltos —
#    o 1º `cd` levava o shell para packages/api/go, o 2º e o 3º falhavam ("no such file or
#    directory") e NEM tsc NEM os testes de arquitetura rodavam. RODADO: ver §0e item 1.
( cd packages/api/go && go build ./... && go vet ./... && go test ./... )
( cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit )
( cd packages/api/typescript && bun test tests/architecture/enum-placement.test.ts tests/architecture/union-parity.test.ts )
bun test:tooling      # da raiz (a âncora do topo do bloco); union-parity roda TAMBÉM aqui — o codegen de wire é gated por ele
# 4) o gerado está commitado, não drifted.
#    ATENÇÃO: `git diff --quiet` sai 0 quando NÃO há diff — a forma `git diff --quiet … || echo OK`
#    da iteração 1 estava INVERTIDA e nunca falhava. `git status --porcelain` também pega untracked.
test -z "$(git status --porcelain -- packages/contracts/generated)"
```

---

#### T03 — Auditoria dos defaults, parte 1: os 36 timestamps

**Arquivos:** `packages/contracts/db/schema-sqlite/{artifact,auth,channel,terminal,issue,infrastructure,owner,workspace,thread}.ts`.

**Decisão desta task (a pergunta "defaults no schema ou valores no código?").**

A lacuna medida é **50 colunas**: 36 `defaultNow()` + 14 `defaultRandom()` no lado pg, zero
equivalente no `schema-sqlite`. A resolução é **dividida por classe de coluna**, e a divisão
é a decisão:

- **Os 36 timestamps → `$defaultFn(() => new Date())` no `schema-sqlite`.** Não uma cláusula
  `DEFAULT` em SQL.
- **Os 14 ids → valor explícito no código, no site de insert** (T21). Nenhum default de
  nenhum tipo.

**Por que `$defaultFn` e não `DEFAULT (unixepoch()*1000)` no SQL:**

1. `$defaultFn` é **client-side do drizzle** — o valor entra no `INSERT` gerado. Logo:
   **nenhuma migration nova**, nenhuma mudança no arquivo `.sql`, nenhuma re-sincronização
   do dir de `//go:embed`, **nenhuma mudança no lado Go**. Uma cláusula `DEFAULT` obrigaria
   uma migration `0002` e um re-sync, para benefício zero do Go (que já escreve
   `created_at` explicitamente em todos os seus inserts).
2. A migration Go é squashed e congelada. Adicionar cláusulas `DEFAULT` nela é justamente o
   tipo de divergência entre os dois writers que esta fase existe para eliminar.
3. `$defaultFn` também torna a coluna **opcional no tipo de insert inferido**, que é
   precisamente o que faz os 31 sites de insert voltarem a compilar sem 31 edições cegas.

**Por que os ids NÃO ganham `$defaultFn(randomUUID)`:** ids de domínio são cunhados pelo
agregado. Um `$defaultFn` esconderia silenciosamente um repositório que esqueceu de passar
o id, trocando um erro de compilação por uma linha órfã em produção. Ids ficam explícitos.

**Colunas a tratar (enumeração fechada — 36):**

| arquivo (schema-sqlite) | colunas |
|---|---|
| `artifact.ts` | `recordedAt`, `createdAt` |
| `channel.ts` | `createdAt`, `updatedAt` |
| `auth.ts` | `createdAt`/`updatedAt` × 5 tabelas (10) |
| `terminal.ts` | `lastTurnAt`, `createdAt`, `updatedAt` |
| `issue.ts` | `createdAt`, `updatedAt`, `raisedAt`, `updatedAt` (stop policy) |
| `infrastructure.ts` | `events.occurredAt`, `outbox.createdAt`, `idempotencyKeys.createdAt`, `scheduledCommands.createdAt`, `scheduledCommands.updatedAt` |
| `owner.ts` | `createdAt`, `updatedAt` |
| `workspace.ts` | `addedAt`, `createdAt`, `updatedAt` |
| `thread.ts` | `createdAt`, `updatedAt`, `createdAt` (transcript), `consumedAt`, `askedAt` |

A referência canônica é `grep -n "defaultNow()" packages/contracts/db/schema/*.ts` — a
lista tem que bater 1:1 por nome de coluna e tabela.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
# 36 $defaultFn no schema-sqlite, um por defaultNow() do pg
test "$(grep -rho '\$defaultFn' packages/contracts/db/schema-sqlite/*.ts | wc -l | tr -d ' ')" = "36"
test "$(grep -rho 'defaultNow()' packages/contracts/db/schema/*.ts | wc -l | tr -d ' ')" = "36"
# nenhum $defaultFn foi parar numa coluna de id (0 linhas casadas)
test "$(grep -rn '\$defaultFn' packages/contracts/db/schema-sqlite/*.ts | grep -icE "\bid\b" | tr -d ' ')" = "0"
# e, o ponto todo: NENHUMA migration nova é gerada.
# ATENÇÃO: NÃO usar `bun run drizzle:generate --config=…`. O script de packages/contracts já
# embute `--config=db/drizzle.config.ts` (que é o config PG); passar outro --config apenas
# ANEXA um segundo flag e o drizzle-kit usa o primeiro — o AC "passaria" contra o schema errado.
# A invocação correta é a que o próprio docblock do config sqlite prescreve:
( cd packages/contracts && bun x drizzle-kit generate --config=db/schema-sqlite/drizzle.config.ts 2>&1 | grep -qi "No schema changes" )
test "$(git status --porcelain -- packages/contracts/db/schema-sqlite/migrations | wc -l | tr -d ' ')" = "0"
```

---

#### T04 — Go: fechar o TOCTOU do applier de migrations

**Arquivos:** `packages/api/go/core/db/sqlite/store.go` (`applyMigrations` ~146-179,
`migrationApplied` ~181-193, `applyOne` ~197-230), `packages/api/go/core/db/sqlite/store_test.go`.

**O que muda.**
1. `applyOne` passa a re-checar a ledger **dentro** da transação `BEGIN IMMEDIATE` que ele já
   abre em `BeginTx`, antes de executar qualquer statement; se a linha existe, commita e
   devolve "pulou".
   **A re-checagem REUSA o texto de `migrationApplied` (`store.go:184`), verbatim:**
   `tx.QueryRowContext(ctx, fmt.Sprintf("SELECT 1 FROM %s WHERE name = ?", migrationsTable), name)`.
   Não é preferência de estilo — é o que torna o AC de ordenação abaixo **satisfazível e
   discriminante** ao mesmo tempo (ver iteração 5, item 5: `_sqlite_migrations` literal não
   aparece em lugar nenhum de `applyOne` porque o nome vem sempre do `const` via `fmt.Sprintf`,
   e `migrationsTable` já casa hoje por causa do `INSERT` da ledger, logo não discrimina).
   Extrair um helper `migrationAppliedTx(ctx, q rowQuerier, name)` compartilhado entre
   `migrationApplied` e `applyOne` é aceitável **desde que o literal `SELECT 1 FROM` fique
   dentro do span de `applyOne`** (inline ou por chamada com a query montada ali); se preferir
   o helper puro, ajuste o AC para asseverar `BeginTx` seguido do nome do helper.
2. O check pré-loop em `applyMigrations` permanece como fast path lock-free (barato, não
   autoritativo) — documentar isso em comentário para que ninguém o "limpe" depois.
3. **`busy_timeout` de 30s para migration — em um handle DEDICADO, com mecanismo explícito.**
   O `*sql.DB` do gateway tem `busy_timeout(5000)` **fixado no DSN** (`store.go:94`), e pragma é
   por conexão: não dá para "subir para 30s durante a migration" nesse mesmo pool sem ou
   (a) pegar um `db.Conn(ctx)` e mexer nele — que volta ao pool contaminado — ou (b) mudar o
   valor globalmente, o que contradiz a paridade de 5s da decisão (c). **Mecanismo escolhido
   (decisão (c)(6)):** `applyMigrations` faz um **segundo `sql.Open`** para o mesmo `dbPath`,
   com o DSN idêntico ao de regime **a menos de** `_pragma=busy_timeout(30000)`, roda o applier
   nele e `defer migDB.Close()`. O pool de regime **não é tocado**, e o handle de migration
   morre antes de qualquer query de aplicação. O boot loga quando a espera passa de 5s.
4. O conjunto a aplicar continua vindo de `readdir | filter .sql | sort` — confirmar que é
   isso que `store.go:154-164` já faz e **não** trocar para `meta/_journal.json`.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
( cd packages/api/go && go build ./... && go vet ./... && go test ./core/db/sqlite/... -run Migration -v )
# ⚠️ TODO caminho abaixo é RELATIVO À RAIZ (iteração 5). Na iteração 4 estas linhas eram
#    `core/db/sqlite/store.go` e só funcionavam porque o `cd packages/api/go` da linha anterior
#    VAZAVA — o mesmo mecanismo que fazia o gate de T23 passar vazio. Com o subshell acima o cwd
#    volta para a raiz, então os caminhos ficam completos.
S=packages/api/go/core/db/sqlite/store.go
# a re-checagem está DENTRO da tx: em applyOne, o SELECT da ledger vem DEPOIS do BeginTx.
# Assertivo: a ordem das duas primeiras ocorrências dentro do span da função.
#
# ⚠️ FORMA CORRIGIDA NA ITERAÇÃO 5. A iteração 4 pedia `BeginTx|_sqlite_migrations`, literal que
# a implementação CORRETA não contém: `store.go:44-46` define
# `migrationsTable = "_sqlite_migrations"` e TODA query monta o nome com `fmt.Sprintf`
# (`:149`, `:184` `SELECT 1 FROM %s WHERE name = ?`, `:220`). RODADO no HEAD, no span de applyOne:
#   grep -oE 'BeginTx|_sqlite_migrations' | head -2  →  "BeginTx,"                 falha hoje E depois
#   grep -oE 'BeginTx|migrationsTable'    | head -2  →  "BeginTx,migrationsTable," PASSA HOJE (o INSERT
#                                                                                  da ledger já casa) ⇒ não discrimina
#   grep -oE 'BeginTx|SELECT 1 FROM'      | head -2  →  "BeginTx,"                 falha hoje, passa com a correção
# A forma escolhida é a 3ª, e o item 1 desta task MANDA reusar o texto de migrationApplied —
# sem esse mandato o AC só seria satisfazível por sorte.
test "$(awk '/func .*applyOne/,/^}/' "$S" | grep -oE 'BeginTx|SELECT 1 FROM' | head -2 | tr '\n' ',')" \
   = "BeginTx,SELECT 1 FROM,"
# busy_timeout de migration em 30000 E num handle SEPARADO (o DSN de regime segue em 5000)
grep -q "busy_timeout(30000)" "$S"
grep -q "busy_timeout(5000)"  "$S"        # o DSN de regime NÃO mudou
# o handle de migration é um sql.Open próprio e é fechado — dois sql.Open no arquivo, um deles com defer Close
# (RODADO no HEAD: `grep -c 'sql.Open(' …store.go` ⇒ 1. Vai a 2 por esta task.)
test "$(grep -c 'sql.Open(' "$S" | tr -d ' ')" = "2"
awk '/func .*applyMigrations/,/^}/' "$S" | grep -q 'sql.Open('
awk '/func .*applyMigrations/,/^}/' "$S" | grep -qE 'defer .*\.Close\(\)'
# o conjunto continua vindo de readdir|filter|sort, não de meta/_journal.json
! grep -q '_journal.json' "$S"
```
Mais o teste novo de T28 (boot concorrente), que é o AC **real** desta task e roda no bloco 4.

---

#### T05 — Go: `SqlExternalMediator` declaradamente egress-only

**Arquivos:** `packages/api/go/core/services/mediator/sql_external_mediator.go`,
`packages/api/go/core/module.go` (~28, ~188), teste correspondente.

**O que muda.** Construtor novo/variante `WithoutIngress` (ou flag no construtor existente,
`module.go:188`) que faz `drainOnce` devolver 0 imediatamente e `Register` **falhar alto**
(erro no boot, não no-op). Docblock no construtor dizendo explicitamente: *se o gateway
precisar de ingress, a saída é a lane própria `integration:gateway` com o TS publicando lá —
não remover esta guarda e não compartilhar a lane `integration`.*

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
( cd packages/api/go && go build ./... && go vet ./... && go test ./core/services/mediator/... -v )
# ⚠️ CAMINHOS COMPLETOS a partir da raiz (iteração 5). Antes eram `core/module.go` e só
#    resolviam pelo vazamento de cwd da linha anterior — o mesmo bug de T23.
M=packages/api/go/core/services/mediator/sql_external_mediator.go
grep -q "WithoutIngress" packages/api/go/core/module.go
grep -q "WithoutIngress" "$M"
# Register falha alto (devolve error, não no-op) — assertivo
grep -qE "func \(.*\) Register\(.*\) error" "$M"
( cd packages/api/go && go test ./core/services/mediator/... -run Ingress -v )   # teste novo: Register devolve erro
```

---

#### T06 — Gate de paridade das migrations (contracts ↔ dir do `//go:embed`)

**Arquivos:** `packages/contracts/package.json` (script novo, ex. `db:sync-go`),
`scripts/` (script do gate), `packages/api/go/core/db/sqlite/sqlc.yaml` (remover a nota do
`cp` manual, apontar para o script).

**O que muda.** Um script copia `packages/contracts/db/schema-sqlite/migrations/*.sql` para
`packages/api/go/core/db/sqlite/migrations/` e um gate assevera igualdade **byte-a-byte** dos
`.sql` (o `meta/` fica **só** no lado contracts — é bookkeeping do drizzle-kit, e sua ausência
no dir do embed é correta por decisão (b)(5)).

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
bun run --cwd packages/contracts db:sync-go
diff -q packages/contracts/db/schema-sqlite/migrations/0000_flaky_carmella_unuscione.sql \
        packages/api/go/core/db/sqlite/migrations/0000_flaky_carmella_unuscione.sql
diff -q packages/contracts/db/schema-sqlite/migrations/0001_careful_firebrand.sql \
        packages/api/go/core/db/sqlite/migrations/0001_careful_firebrand.sql
# o único delta permitido entre os dirs é o meta/
diff -rq packages/contracts/db/schema-sqlite/migrations packages/api/go/core/db/sqlite/migrations \
  | grep -v "^Only in .*migrations: meta$" | wc -l | tr -d ' ' | grep -q '^0$'
git status --porcelain packages/api/go/core/db/sqlite/migrations | wc -l | tr -d ' ' | grep -q '^0$'
# NOTA: `wc -l` do BSD/macOS emite espaços à esquerda — sem o `tr -d ' '` o `grep '^N$'`
# nunca casa e o AC "falha" mesmo estando tudo certo. Vale para todo AC deste plano.
```

---
### BLOCO 1b — Dependências, sonda e gate (árvore VERDE; commit próprio cada; checkout principal)

> T07, T07B e T07C **não** fazem parte do commit único do bloco 2 e **não** abrem a janela
> vermelha: trocar deps não quebra tipo enquanto `client.ts` ainda estende `NodePgDatabase`, a
> sonda é um script isolado e o gate só escreve um artefato. A janela vermelha começa em **T08**
> — e T07C é a última coisa que pode impedi-la de começar.

#### T07 — Dependências (RODAR NO CHECKOUT PRINCIPAL)

**Arquivos:** `packages/api/typescript/core/package.json`, `packages/api/typescript/package.json`,
`bun.lock`.

**O que muda.**
- **Adicionar** `@libsql/client` em `core`. **Não pinar um range de cor de memória** — instalar
  com `bun add @libsql/client` e **registrar a versão que o resolvedor devolveu**. Motivo: o
  pacote **não existe neste checkout** (`node_modules/@libsql` ausente; as únicas strings
  `libsql` em `bun.lock` são declarações de *optional peer* — `drizzle-orm@0.45.2` declara
  `@libsql/client >=0.10.0`). Qualquer caret citado no plano seria folclore; o piso real é o
  peer `>=0.10.0` do drizzle.
- **Remover** `@electric-sql/pglite` de `core`.
- **Remover** `pg` de `core` e de `api/typescript` (morre junto com `NodePgDriver`).
- `drizzle-orm` fica como está (`^0.45.2` já traz `drizzle-orm/libsql`).

**Por que no checkout principal:** lockfile compartilhado do workspace; um `bun install` dentro
de worktree materializa `node_modules` local e diverge (regra de worktree do CLAUDE.md).

**AC.** Assevera a versão **resolvida**, não um range escrito à mão.
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
grep -q '"@libsql/client"' packages/api/typescript/core/package.json
! grep -q '@electric-sql/pglite' packages/api/typescript/core/package.json
! grep -rq '"pg":' packages/api/typescript/package.json packages/api/typescript/core/package.json
bun install --frozen-lockfile   # exit 0
test -d node_modules/@libsql
test -d node_modules/libsql                                    # o addon nativo, não só o wrapper
# versão resolvida ≥ o peer declarado pelo drizzle (0.10.0) — e registrada no baseline
# ⚠️ `node` TROCADO POR `bun` NA ITERAÇÃO 4. `node` **não está no PATH** deste ambiente
# (`which node` ⇒ "node not found"; só `bun` em /Users/work/.bun/bin/bun). As três invocações
# `node -p` / `node -e` saíam 127, `RESOLVED` vinha vazio e `test -n "$RESOLVED"` reprovava —
# um AC de dependência falhando por causa do runtime do próprio AC. Verificado que o
# substituto funciona neste host:
#   $ bun --print "require('drizzle-orm/package.json').version"   → 0.45.2   (exit 0)
#   $ bun -e "console.log('OK_BUN_E')"                            → OK_BUN_E
# (`node` existe sob ~/.nvm/versions/node — v22.23.1 / v24.16.0 / v24.18.0 — e é por isso que
#  `scripts/smoke-node-boot.ts` resolve o binário por conta própria via CODEDM_NODE_BIN/nvm/PATH.
#  Um AC não pode depender de um shell com nvm carregado.)
RESOLVED="$(bun --print "require('@libsql/client/package.json').version")"
test -n "$RESOLVED"
# (índice do argv sob `bun -e`: VERIFICADO — `bun -e "…" 0.15.9` ⇒ process.argv =
#  ["/Users/work/.bun/bin/bun","0.15.9"], logo o argumento é **argv[1]**, não argv[2].)
bun -e "const [a,b]=[process.argv[1].split('.').map(Number),[0,10,0]];process.exit((a[0]>b[0]||(a[0]===b[0]&&a[1]>=b[1]))?0:1)" "$RESOLVED"
echo "LIBSQL_CLIENT_VERSION=$RESOLVED" >> .plans/artifacts/2026-07-26-baseline.md
bun -e "const {createClient}=require('@libsql/client');console.log('LIBSQL_OK')" | grep -q LIBSQL_OK
```

---

#### T07B — Commitar a sonda de interop WAL + concorrência (RODAR NO CHECKOUT PRINCIPAL)

**Arquivos:** `scripts/probe-sqlite-interop.ts` (novo),
`packages/api/go/scripts/probe_sqlite_interop.go` (novo, `//go:build ignore` ou `package main`
sob `cmd/`), `scripts/README.md` (uma linha apontando a sonda).

**Por que existe.** As decisões (a) e (c) citam medições — `foreign_keys` default do libsql,
`busy_timeout` default do libsql, e "300 tx TS concorrentes com 300 tx Go → `ok=300/err=0`,
`FINAL rows ts=300 go=300`, zero `SQLITE_BUSY`" — que **não existem em lugar nenhum do repo**
(`grep -rl libsql` fora de `node_modules` acha só este plano, o `drizzle.config` sqlite e uma
spec). O §8 manda parar e reportar se uma medição contradisser a decisão, mas sem a sonda
commitada o executor **não tem como produzir a contradição**. Além disso a questão aberta 6
(linux/win32 não provados) só é fechável se a sonda for re-executável noutro host.

**O que a sonda tem que fazer, exatamente (é um entregável, não um exercício):**

1. **Defaults do libsql.** Abrir client novo num arquivo temp e imprimir
   `PRAGMA foreign_keys` e `PRAGMA busy_timeout` **antes** de qualquer pragma nosso.
   Formato de saída, uma chave por linha: `LIBSQL_DEFAULT_FOREIGN_KEYS=<0|1>`,
   `LIBSQL_DEFAULT_BUSY_TIMEOUT=<n>`.
2. **Interop WAL.** TS (libsql) cria o arquivo, aplica os pragmas da decisão (c) na ordem, cria
   uma tabela e escreve; Go (`modernc`, **o DSN exato do gateway**, `store.go:94`) abre o mesmo
   arquivo, lê a linha do TS, escreve a sua; TS lê a do Go. Saída:
   `WAL_INTEROP=ok|fail`, `JOURNAL_MODE=<modo>`.
3. **Concorrência CROSS-PROCESS.** 300 transações TS simultâneas a 300 transações Go, no mesmo
   arquivo. **Explicitar:** as 300 do lado TS são disparadas **concorrentemente sobre UMA única
   instância de client** (`Promise.all` de 300 `client.transaction()`), porque é assim que o
   daemon roda — uma conexão só. Saída:
   `TS_OK=<n> TS_ERR=<n> GO_OK=<n> GO_ERR=<n> SQLITE_BUSY=<n> FINAL_TS_ROWS=<n> FINAL_GO_ROWS=<n>`.
4. **Host.** Primeira linha sempre `HOST=<platform>-<arch>`.

**5. Sobrevivência de PRAGMA à rotação de conexão (substitui o probe intra-client #1 da
   iteração 2).** A pergunta da iteração 2 ("`transaction()` concorrente enfileira, erra ou
   aninha?") **já foi respondida e está fechada na decisão (a)**: erra com `SQLITE_BUSY`, não
   aninha. A pergunta que **sobra** — e que decide se o mecanismo da decisão (a) é válido neste
   host — é se os pragmas **grudam** quando não se usa `client.transaction()`. Procedimento: abrir
   client, aplicar os pragmas, ler os três; rodar **N=200 transações via `BEGIN IMMEDIATE`
   manual por `client.execute()`**; reler os três. Emitir:
   `PRAGMA_STICKY_BUSY_TIMEOUT=<n> PRAGMA_STICKY_FOREIGN_KEYS=<0|1> PRAGMA_STICKY_JOURNAL_MODE=<modo>`.
   **Esperado sob o mecanismo: `5000`, `0`, `wal` — inalterados.** Se o `busy_timeout` voltar a
   `0`, a conexão rotacionou apesar do `BEGIN` manual e a decisão (a) está errada neste host.
   Emitir também o **contraste** com o caminho proibido, para que o custo fique medido no repo e
   não em prosa: mesma sequência usando `client.transaction()`, campos
   `PRAGMA_AFTER_TX_API_BUSY_TIMEOUT=<n> PRAGMA_AFTER_TX_API_FOREIGN_KEYS=<0|1>`
   (**esperado `0` e `1` — a prova de que o caminho do drizzle perde os pragmas**).

**6. Vazamento de descritor por `client.transaction()` (substitui o probe intra-client #2).**
   Também aqui a pergunta antiga (`joined|queued|error|timeout`) está fechada: com
   `client.transaction()` a leitura vê **committed** (não `joined`) porque a conexão rotaciona —
   e sob o mecanismo da decisão (a) a leitura nem toca o client de escrita. A pergunta que
   **importa** é o vazamento. Procedimento: contar fds do arquivo (`lsof -p $PID`, ou
   `/proc/self/fd` no linux), rodar 500 `client.transaction()`, recontar; depois repetir com 500
   `BEGIN IMMEDIATE` manuais. Emitir:
   `FD_BASELINE=<n> FD_AFTER_500_TX_API=<n> FD_AFTER_500_MANUAL=<n>`.
   **Esperado: `FD_AFTER_500_TX_API` ≈ baseline + 1000 (vaza 2 por tx) e `FD_AFTER_500_MANUAL`
   == baseline (não vaza).** É o número que justifica a proibição de `db.transaction()` no repo
   inteiro; sem ele a proibição vira folclore de novo.

**7. Leitura suja no client de ESCRITA (o risco que a correção CRIA).** Sob o mecanismo, o client
   de escrita não rotaciona — logo uma leitura disparada nele durante a tx **vê o não-commitado**.
   Provar os dois lados: abrir tx manual no client de escrita, inserir a sentinela, e ler a mesma
   linha (a) pelo client de **leitura** e (b) pelo client de **escrita**. Emitir:
   `DIRTY_READ_ON_READ_CLIENT=<yes|no> DIRTY_READ_ON_WRITE_CLIENT=<yes|no>`.
   **Esperado: `no` e `yes`.** O `yes` não é bug — é a prova de que o split leitura/escrita é
   load-bearing e de que a regra de propriedade da decisão (a) precisa do guard de T13B.

**8. VISIBILIDADE DEPOIS DO COMMIT, no client de LEITURA (acrescentado na iteração 4 — é a única
   propriedade de que a fase inteira depende e que ninguém estava medindo).** As sondas (2) e (7)
   provam interop de arquivo e ausência de leitura suja; **nenhuma** prova o inverso, que é o que
   o usuário vê: que o handle de leitura **enxerga** um dado já commitado. O sintoma que motivou
   esta fase (“o console mostra DISCONNECTED”) é servido **100% pelo client de leitura**, via
   `driver.db` — se ele servir estado velho, o gate pode passar com o produto ainda quebrado.
   Duas medições, os dois writers:
   - **Mesmo processo.** Escrever a sentinela por `BEGIN IMMEDIATE`/`COMMIT` no client de
     escrita; **depois** do `COMMIT` retornar, ler pelo client de leitura (sem reabrir, sem
     `PRAGMA`, sem sleep). Emitir `READ_AFTER_COMMIT_SAME_PROCESS=<yes|no>`.
   - **Cross-process.** O lado Go (`modernc`, o DSN de `store.go:94`) commita uma linha; o
     client de **leitura** do TS, **já aberto antes** do commit do Go, lê. É esta a forma que o
     daemon roda — o client de leitura tem vida longa e nunca reabre. Emitir
     `READ_AFTER_COMMIT_CROSS_PROCESS=<yes|no>`. Registrar também quantos ms de espera foram
     necessários, se algum: `READ_AFTER_COMMIT_CROSS_PROCESS_LAG_MS=<n>` (esperado `0`).
   **Esperado: `yes` e `yes`, com lag `0`.** Um `no` em qualquer um dos dois derruba a decisão
   (a) do mesmo jeito que um `DIRTY_READ_ON_READ_CLIENT=yes` — só que na direção contrária (o
   split isola **demais**), e a saída seria abrir o handle de leitura por request em vez de
   mantê-lo vivo. É por isso que os dois campos são condição de PASS em T07C.

A sonda **não** importa nada de `core/src` — roda direto sobre `@libsql/client` e `modernc`,
para continuar executável fora do bloco 2 (árvore vermelha) e em qualquer branch.

**Consumidores.** T09 re-roda o passo (1) para justificar a ordem dos pragmas e **transforma
(5)(6)(7)(8) em testes permanentes do driver** (são invariantes do mecanismo, não do host);
**T07C é o gate que lê (5)(6)(7)(8) e libera (ou barra) T08**; T31 re-roda (2)+(3)+(8) no host
de aceite; a questão aberta 6 fecha rodando em `linux-x64` e `win32-x64`.

> **Sobre os números pré-existentes de (2) e (3).** As medições de interop citadas nas decisões
> (a) e (c) ("300 tx TS × 300 tx Go, `ok=300/err=0`, zero `SQLITE_BUSY`") vieram de uma sessão
> cujos scripts não estavam no repo **e** que, pelo achado da iteração 3, quase certamente rodou
> `client.transaction()` — ou seja, numa conexão cujo `busy_timeout` a rotação já havia zerado.
> Trate-as como **inválidas**, não como "não verificadas": o que quer que tenham medido, não foi
> o regime que este plano vai shippar. A sonda de (3) tem que rodar sobre o **mecanismo novo**
> (`BEGIN IMMEDIATE` manual, dois clients) para valer alguma coisa.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
test -f scripts/probe-sqlite-interop.ts
bun scripts/probe-sqlite-interop.ts > /tmp/probe.out; test $? -eq 0
grep -qE '^HOST=' /tmp/probe.out
# os defaults que a decisão (c) afirma
grep -q 'LIBSQL_DEFAULT_FOREIGN_KEYS=1' /tmp/probe.out
grep -q 'LIBSQL_DEFAULT_BUSY_TIMEOUT=0' /tmp/probe.out
# o interop e a concorrência que a decisão (a)/(c) afirmam
grep -q 'WAL_INTEROP=ok'   /tmp/probe.out
grep -q 'JOURNAL_MODE=wal' /tmp/probe.out
grep -q 'SQLITE_BUSY=0'    /tmp/probe.out
grep -q 'TS_ERR=0'         /tmp/probe.out && grep -q 'GO_ERR=0' /tmp/probe.out
grep -q 'FINAL_TS_ROWS=300' /tmp/probe.out && grep -q 'FINAL_GO_ROWS=300' /tmp/probe.out
# as sondas (5)(6)(7) EXISTEM e emitiram valor — o veredito é de T07C, aqui só a medição
grep -qE '^PRAGMA_STICKY_BUSY_TIMEOUT=[0-9]+'        /tmp/probe.out
grep -qE '^PRAGMA_STICKY_FOREIGN_KEYS=[01]$'         /tmp/probe.out
grep -qE '^PRAGMA_STICKY_JOURNAL_MODE=[a-z]+$'       /tmp/probe.out
grep -qE '^PRAGMA_AFTER_TX_API_BUSY_TIMEOUT=[0-9]+'  /tmp/probe.out
grep -qE '^PRAGMA_AFTER_TX_API_FOREIGN_KEYS=[01]$'   /tmp/probe.out
grep -qE '^FD_BASELINE=[0-9]+'                       /tmp/probe.out
grep -qE '^FD_AFTER_500_TX_API=[0-9]+'               /tmp/probe.out
grep -qE '^FD_AFTER_500_MANUAL=[0-9]+'               /tmp/probe.out
grep -qE '^DIRTY_READ_ON_READ_CLIENT=(yes|no)$'      /tmp/probe.out
grep -qE '^DIRTY_READ_ON_WRITE_CLIENT=(yes|no)$'     /tmp/probe.out
# sonda (8) — visibilidade pós-commit no handle de leitura (iteração 4)
grep -qE '^READ_AFTER_COMMIT_SAME_PROCESS=(yes|no)$'  /tmp/probe.out
grep -qE '^READ_AFTER_COMMIT_CROSS_PROCESS=(yes|no)$' /tmp/probe.out
grep -qE '^READ_AFTER_COMMIT_CROSS_PROCESS_LAG_MS=[0-9]+$' /tmp/probe.out
# a saída medida vira artefato do baseline
cp /tmp/probe.out .plans/artifacts/2026-07-26-probe-$(uname -s)-$(uname -m).txt
```
**Se qualquer um destes falhar, aplica-se a regra do §8: parar e reportar** — é exatamente
para isso que a sonda existe. Não "ajustar a decisão" sozinho.

---

#### T07C — GATE DE CONCORRÊNCIA INTRA-CLIENT (o portão que libera T08)

**Arquivos:** `.plans/artifacts/2026-07-26-tx-concurrency-gate.md` (novo). Nenhum código de
produção.

**Por que esta task existe, e por que é AQUI.** A decisão (a) foi fechada sobre três fatos:
arquitetura (`libsql` é o único driver SQLite do drizzle com session async), packaging (roda nos
dois alvos de build) e — o que a iteração 3 mediu — **o comportamento de conexão do driver**:
`client.transaction()` rotaciona a conexão, vaza um fd por chamada, e derruba os pragmas. O
mecanismo que responde a isso (dois clients + `BEGIN IMMEDIATE` manual + `TxGate`) foi medido
**neste host**, mas nada disso está no repo ainda. Este gate confirma o mecanismo **fora** do
commit único T08–T23, que não é bissectável — o direito de "parar e reportar" do §8 é inútil
quando parar custa reverter 16 tasks.

> **O que este gate NÃO é mais.** Na iteração 2 ele decidia entre "mutex" e "pool de clients". Essa
> bifurcação **morreu**: o pool é pior (multiplica o congelamento de event loop e, se qualquer
> client usar `client.transaction()`, reintroduz o vazamento). O gate agora tem uma só pergunta:
> **o mecanismo da decisão (a) se comporta neste host como foi medido?** Sim ⇒ segue. Não ⇒ §8.

**O que fazer.** Ler os campos das sondas 5, 6, 7 e **8** de T07B e escrever o veredito no
artefato — **e nada mais; esta task não escreve código**:

| leitura | veredito | consequência |
|---|---|---|
| `PRAGMA_STICKY_BUSY_TIMEOUT == 5000` **e** `PRAGMA_STICKY_FOREIGN_KEYS == 0` **e** `PRAGMA_STICKY_JOURNAL_MODE == wal` **e** `FD_AFTER_500_MANUAL == FD_BASELINE` **e** `DIRTY_READ_ON_READ_CLIENT == no` **e** `READ_AFTER_COMMIT_SAME_PROCESS == yes` **e** `READ_AFTER_COMMIT_CROSS_PROCESS == yes` | `GATE=PASS_MECHANISM_CONFIRMED` | O mecanismo da decisão (a) vale neste host: `BEGIN` manual não rotaciona, não vaza, o client de leitura nunca vê sujeira **e enxerga o que já foi commitado — pelos dois writers**. Segue para T08. |
| tudo acima **e**, além disso, `FD_AFTER_500_TX_API >= FD_BASELINE + 500` **e** `PRAGMA_AFTER_TX_API_BUSY_TIMEOUT == 0` | `GATE=PASS_MECHANISM_CONFIRMED` **+ o custo do caminho proibido está MEDIDO** | Estado ideal: o artefato prova *no repo* por que `db.transaction()` está banido. Transcrever os dois números no docblock do `LibsqlDriver` (T09). Segue para T08. |
| `DIRTY_READ_ON_WRITE_CLIENT == no` | `GATE=PASS_MECHANISM_CONFIRMED` **+ nota** | O client de escrita **também** isola — provavelmente a versão do libsql mudou o comportamento de conexão. O split leitura/escrita **continua** (não depender de detalhe interno de versão), mas registrar a divergência no artefato: o risco (ii) da decisão (a) fica menor do que o escrito. |
| `READ_AFTER_COMMIT_SAME_PROCESS == no` **ou** `READ_AFTER_COMMIT_CROSS_PROCESS == no` | `GATE=FAIL` | **O modo de falha que a fase existe para matar.** O split isola **demais**: o handle de leitura de vida longa serve estado velho, e o console volta a mostrar `DISCONNECTED` mesmo com o dado commitado — sem erro, sem log, sem teste reclamando. Não é reparável no T09; a saída é abrir o handle de leitura por request (ou por snapshot explícito), o que reabre a decisão (a). **Parar e reportar (§8).** |
| `PRAGMA_STICKY_BUSY_TIMEOUT != 5000` **ou** `FD_AFTER_500_MANUAL > FD_BASELINE` **ou** `DIRTY_READ_ON_READ_CLIENT == yes` **ou** qualquer campo ausente/incoerente | `GATE=FAIL` | **Parar e reportar (§8).** Qualquer um dos três significa que `BEGIN IMMEDIATE` manual **também** rotaciona/vaza neste host, ou que o client de leitura não isola — e aí o `LibsqlDriver` de T09 sai **diferente** e a decisão (a) reabre. **Não** entrar no bloco 2 nesse estado. Um pool de clients **não** é a saída (ver questão aberta 9); a saída é reabrir a escolha de adapter. |

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
G=.plans/artifacts/2026-07-26-tx-concurrency-gate.md
test -s "$G"
# o veredito é o único estado PASS; FAIL barra o bloco 2 por definição
grep -qE '^GATE=PASS_MECHANISM_CONFIRMED$' "$G"
# os números medidos foram TRANSCRITOS, não parafraseados
grep -qE '^PRAGMA_STICKY_BUSY_TIMEOUT=[0-9]+'       "$G"
grep -qE '^PRAGMA_STICKY_FOREIGN_KEYS=[01]$'        "$G"
grep -qE '^FD_BASELINE=[0-9]+'                      "$G"
grep -qE '^FD_AFTER_500_MANUAL=[0-9]+'              "$G"
grep -qE '^DIRTY_READ_ON_READ_CLIENT=(yes|no)$'     "$G"
grep -qE '^READ_AFTER_COMMIT_SAME_PROCESS=(yes|no)$'  "$G"
grep -qE '^READ_AFTER_COMMIT_CROSS_PROCESS=(yes|no)$' "$G"
# e o veredito é COERENTE com os números transcritos (não "PASS" escrito à mão sobre número ruim)
test "$(grep -m1 -oE '^PRAGMA_STICKY_BUSY_TIMEOUT=[0-9]+' "$G" | cut -d= -f2)" = "5000"
test "$(grep -m1 -oE '^PRAGMA_STICKY_FOREIGN_KEYS=[01]'   "$G" | cut -d= -f2)" = "0"
test "$(grep -m1 -oE '^FD_AFTER_500_MANUAL=[0-9]+' "$G" | cut -d= -f2)" \
   = "$(grep -m1 -oE '^FD_BASELINE=[0-9]+'         "$G" | cut -d= -f2)"
test "$(grep -m1 -oE '^DIRTY_READ_ON_READ_CLIENT=(yes|no)' "$G" | cut -d= -f2)" = "no"
# ⚠️ AS DUAS LINHAS QUE FALTAVAM (iteração 4): sem elas o gate podia dar PASS com o handle de
# leitura servindo estado velho — exatamente o sintoma que motivou a fase.
test "$(grep -m1 -oE '^READ_AFTER_COMMIT_SAME_PROCESS=(yes|no)'  "$G" | cut -d= -f2)" = "yes"
test "$(grep -m1 -oE '^READ_AFTER_COMMIT_CROSS_PROCESS=(yes|no)' "$G" | cut -d= -f2)" = "yes"
# o artefato da sonda que embasa o veredito existe neste host (sem glob solto: zsh aborta sem match)
test "$(find .plans/artifacts -name '2026-07-26-probe-*.txt' | wc -l | tr -d ' ')" -ge 1
```

> **Regra dura:** T08 **não começa** enquanto este AC não passar. É o único ponto do plano em
> que uma medição pode reabrir a decisão (a) — e é de propósito que ele esteja **antes** do
> commit único.

---

### BLOCO 2 — O FLIP (janela vermelha única, T08→T23, um único commit)

> A partir de T08 o `bun tsc` global **não passa** e isso é esperado. Cada task abaixo tem AC
> local (grep / assinatura / teste isolado). O gate global é T23.

#### T08 — O flip: exports do contracts + `client.ts`

**Arquivos:** `packages/contracts/package.json` (mapa `exports`),
`packages/api/typescript/core/src/db/client.ts`.

**O que muda.**
- `packages/contracts/package.json`: `"."` e `"./db"` passam a apontar para
  `./db/schema-sqlite/index.ts`. Adicionar `"./db-pg": "./db/schema/index.ts"` **apenas** se
  algum consumidor legítimo restar (não deve restar — verificar com o grep do AC).
  `"./db/migrations"` passa a resolver o dir `schema-sqlite/migrations`.
- `packages/contracts/db/migrations.ts`: fallback muda de `<dir>/migrations` para
  `<dir>/schema-sqlite/migrations` (ou o módulo é movido para dentro de `schema-sqlite/`).
  `CODEDM_MIGRATIONS_DIR` continua sendo o override.
- `core/src/db/client.ts`:
  ```ts
  import type { LibSQLDatabase } from 'drizzle-orm/libsql'
  import * as schema from '@codedm/contracts/db'
  export abstract class DrizzleClient extends (LibSQLDatabase<typeof schema> as any) {}
  ```
  (manter a forma de classe abstrata que o tsyringe usa como token; a shape final é
  `LibSQLDatabase<typeof schema>`).

**Nota verificada:** os identificadores de **tabela** são idênticos entre as duas schemas, então
os 47 arquivos que importam `@codedm/contracts/db` continuam resolvendo. O que **some** são os
9 handles de `pgSchema` — e o grep confirma zero importadores diretos (só o `PersistenceProbe`
os toca em runtime, T22).

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
grep -q 'schema-sqlite' packages/contracts/package.json
# nenhum consumidor de handle de pgSchema
! grep -rn "sharedSchema\|ownerSchema\|threadSchema\|issueSchema\|workspaceSchema\|terminalSchema\|artifactSchema\|authSchema\|gatewaySchema" \
  packages/api/typescript --include='*.ts' | grep -v node_modules
# client.ts não menciona mais node-postgres
! grep -q 'node-postgres\|NodePgDatabase' packages/api/typescript/core/src/db/client.ts
grep -q 'drizzle-orm/libsql' packages/api/typescript/core/src/db/client.ts
```

---

#### T09 — `LibsqlDriver` (o novo `DrizzleDatabaseDriver`)

**Arquivos:** `packages/api/typescript/core/src/db/drivers/LibsqlDriver.ts` (novo),
`packages/api/typescript/core/src/db/drivers/index.ts`,
`packages/api/typescript/core/src/db/drivers/DrizzleDatabaseDriver.ts` (a classe abstrata de 7
membros: a assinatura de `readMigrations()` muda e o tipo `MigrationJournal` é renomeado para
`MigrationStatus` — **é edição de arquivo, não só de prosa**),
`packages/api/typescript/core/src/db/drivers/LibsqlDriver.test.ts` (novo).

**O que muda.** Implementar os 7 membros abstratos de `DrizzleDatabaseDriver`:

- **construtor** — recebe `{ schema, migrationsDir, dbPath? }`. `dbPath` ausente ⇒ arquivo
  **temporário de processo** (`mkdtempSync` + `codedm-test.db`), **nunca** `:memory:` (decisão
  (b)(6): memória é por-conexão e não exercitaria WAL nem o segundo writer).
  **Não adquire lock** (decisão (c)(3)).
- **DOIS clients de vida longa (decisão (a))** — `openClient(url, busyTimeoutMs = 5000)` é
  chamado **duas** vezes: `#writeClient` (dono do `BEGIN IMMEDIATE`, atrás do `TxGate`) e
  `#readClient`. O membro abstrato **`db` é o de LEITURA** — é o que `registry.ts:116` entrega ao
  token `DrizzleClient`, e é por isso que os **58** arquivos que injetam `DrizzleClient` não
  mudam nenhuma linha. O handle de escrita **não é exposto**: só chega às mãos de alguém como o
  `tx` que `transaction()` passa para o callback.
- **pragmas** — dentro de `openClient`, imediatamente após abrir e antes de qualquer query, nesta
  ordem exata: `PRAGMA busy_timeout = <n>`, `PRAGMA journal_mode = WAL`,
  `PRAGMA foreign_keys = OFF`. **Os dois clients de regime são pragmados individualmente** —
  não há herança entre conexões. O parâmetro `busyTimeoutMs` existe por **um** motivo: o handle
  curto de migration (abaixo) o chama com `30000`. Os handles de regime **nunca** são
  re-pragmados — e, sob este mecanismo, **não precisam ser**, porque a conexão nunca rotaciona
  (ver decisão (c)(5)).
- **`transaction<T>(fn)` — o ÚNICO caminho de escrita, e `client.transaction()` está PROIBIDO.**
  Implementar exatamente a forma da decisão (a): `#gate.run(async () => { execute('BEGIN
  IMMEDIATE'); try { fn(this.#write); execute('COMMIT') } catch { execute('ROLLBACK'); throw } })`.
  **Nunca** `client.transaction()` nem `db.transaction()` — esse caminho vaza uma conexão nativa
  por chamada (medido: 500 tx ⇒ +1000 fds, linear, sem platô) **e** derruba `busy_timeout` para 0
  e `foreign_keys` para 1, silenciosamente. `drizzle-orm/libsql/session.cjs:86` é literalmente
  `await this.client.transaction()`, então a proibição vale para o método do drizzle também.
- **`TxGate`** — mutex assíncrono FIFO em escopo de driver (uma `Promise` encadeada, ~10 linhas,
  sem dependência nova). Serializa `transaction()`. **Motivo correto, a escrever no docblock:**
  não é para evitar `BEGIN` aninhado (não existe) nem leitura suja (o client de leitura resolve);
  é para impedir que dois `BEGIN IMMEDIATE` sobrepostos virem `SQLITE_BUSY` e para tornar a ordem
  determinística. Leituras (o client de leitura) **não** passam pelo gate.
  **Docblock obrigatório:** citar a decisão (a) e transcrever os números de **T07C**
  (`FD_AFTER_500_TX_API`, `PRAGMA_AFTER_TX_API_BUSY_TIMEOUT`) como justificativa do banimento.
  **NÃO citar `PGliteDriver.ts:20-22` nem a palavra `PGlite`** — o arquivo é deletado em T11 e os
  gates de T11/T23 exigem que a string não sobreviva em `packages/api/typescript`; um docblock
  que a cite faz T23 falhar no fim da janela vermelha, longe da causa. Além disso a analogia era
  **falsa** (PGlite trava; o libsql rotacionava). Descrever o mecanismo, não o ancestral.
  **E não escrever o token banido em prosa** (iteração 4): o AC (a1) deste arquivo e o gate (4)
  de T23 são line-based e casam **comentário** também — escrever ``client.transaction()`` ou
  ``db.transaction()`` dentro do docblock reprova o próprio arquivo. A regra do T23 vale
  (“reescrever o comentário, não afrouxar o gate”): nomear o caminho banido por descrição — “o
  método `transaction()` do cliente libsql / da sessão do drizzle
  (`drizzle-orm/libsql/session.cjs:86`)” — em vez de pelo literal.
- **`writeStatementsOnlyThroughTx` — regra de propriedade dentro do callback (iteração 4).**
  O docblock de `transaction()` tem que declarar, em uma frase: **todo statement emitido dentro
  do callback usa o parâmetro `tx`; nenhum usa `this.db`.** Não é estilo — `this.db` é o client
  de **leitura**, que está fora do `BEGIN IMMEDIATE`: uma escrita por ele vira transação
  implícita fora do `TxGate` (classe 1 de T13B, proibição dura), e uma **leitura** por ele
  observa o estado **pré-transação** sem erro nenhum. É esta segunda forma que o T16 pode
  cometer em silêncio — o claim é `SELECT ids / UPDATE lease / SELECT rows` numa única tx, e um
  `SELECT` disparado no handle de leitura devolveria linhas **não leaseadas**, entregando a
  mesma linha a dois ciclos. O guard automatizado está em T13B (classe 3, varredura de
  `this.db.select(` dentro de span de `transaction(`); aqui fica a declaração normativa que
  aquele guard aplica.
- **`runMigrations()`** — applier próprio, **proibido** usar `drizzle-orm/libsql/migrator`.
  Cria a ledger com a string **literalmente igual** à do Go (decisão (b)(2)):
  `CREATE TABLE IF NOT EXISTS _sqlite_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)`.
  Deriva o conjunto de `readdir(migrationsDir).filter(f => f.endsWith('.sql')).sort()`; por
  arquivo, numa tx aberta com **`BEGIN IMMEDIATE` manual via `migClient.execute()`** (**não**
  `client.transaction()` — mesma proibição de sempre; aqui ela vazaria uma conexão **por arquivo
  de migration**): re-`SELECT` da ledger → se presente pula e commita → senão executa os
  statements separados por `--> statement-breakpoint` → `INSERT` na ledger → `COMMIT`.

  **`busy_timeout` 30000 em QUAL conexão — mecanismo explícito (decisão (c)(6)).** Não são os
  clients de regime: os dois têm que ficar em 5000 (paridade com o Go), e re-pragmá-los
  ida-e-volta deixaria uma janela em que o valor está errado para o resto da árvore.
  `runMigrations()` abre um **terceiro client libsql, curto**, para o mesmo arquivo, via
  `openClient(url, 30_000)`, roda o applier inteiro nele e **fecha** (`try/finally`). Esse client
  **não** passa pelo `TxGate` (é o único usuário do arquivo pelo lado TS nesse instante) e morre
  antes de qualquer query de aplicação. Logar quando a espera passar de 5s.
- **`readMigrations()`** — repropositado: devolve `{ applied: string[], pending: string[] }`
  lido da ledger + do dir. Atualizar a assinatura em `DrizzleDatabaseDriver.ts:17` e o tipo
  `MigrationJournal` (renomear para `MigrationStatus`).
- **`reset()`** — chama o helper de T15, **por dentro de `this.transaction(...)`** (é uma escrita;
  a regra de propriedade não abre exceção para o harness de teste).
- **`unitOfWorkFactory`** — `DrizzleUnitOfWorkFactory` **real** (não mais o fake do PGlite), e ele
  passa a receber o **driver**, não o `DrizzleClient` — ver T13, que deixou de ser "porta sem
  mudança" por causa disto.
- **`DrizzleDatabaseDriver` ganha `abstract transaction<T>(fn): Promise<T>`** — é membro novo da
  classe abstrata (que hoje tem 7). Sem ele o `DrizzleUnitOfWork` não teria como escrever, já que
  `db` virou o handle de **leitura**.
- **`close()`** — **⚠️ NÃO fechar o client e NÃO remover o dir temporário.**

##### `close()` — a armadilha que detonaria 26 das 27 suites

O `PGliteDriver.close()` é `// no-op: singleton lifecycle is process-scoped, not per-suite`
(`PGliteDriver.ts:151-152`), e isso **não é preguiça, é o contrato**. Verificado:

- `bun test` roda **todos** os arquivos de teste num **único processo**, com estado de módulo
  compartilhado (mesmo PID; contador de escopo de módulo incrementa entre arquivos).
- `TestBed` memoiza o driver num `private static databaseDriver` (`TestBed.ts:79-92`) e roda
  `runMigrations()` **uma única vez** para o processo inteiro.
- **Toda** suite registra `_destroyFn = async () => { await databaseDriver.close() }`
  (`TestBed.ts:104-105`), invocado no `afterAll` de cada uma (`TestBed.ts:178`).

Ou seja: se `close()` de fato fechar o client e `rm -rf` o temp dir, o `afterAll` da **primeira**
suite destrói o banco que as **outras 26** ainda vão usar — elas rodam contra um handle fechado.
E como isso acontece dentro da janela vermelha (T08–T23, gate global adiado para T23), a falha
não aparece como "T09 está errado": aparece como uma cascata confusa de 26 suites quebradas em
T23, muito longe da causa.

**Regra desta task:**

1. `close()` é **idempotente e não-destrutivo por padrão** — mantém a semântica do PGlite: o
   ciclo de vida do client é **do processo**, não da suite. A implementação mínima aceitável é
   um no-op com o mesmo comentário explicando por quê.
2. Se for desejável fechar de verdade (ex.: shutdown do daemon real), então **refcount**:
   `close()` decrementa e só fecha em zero; e o `rm -rf` do temp dir vai para
   `process.on('exit')`, **nunca** para `close()`.
3. O temp dir é criado **uma vez por processo** e memoizado junto com o driver — não um por
   suite. Ver decisão (b)(6).

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
# ledger correta, com DDL byte-idêntica à do Go
grep -q 'CREATE TABLE IF NOT EXISTS _sqlite_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)' \
  packages/api/typescript/core/src/db/drivers/LibsqlDriver.ts
grep -q 'CREATE TABLE IF NOT EXISTS %s (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)' \
  packages/api/go/core/db/sqlite/store.go
# ⚠️ `grep -v PGliteDriver` ACRESCENTADO NA ITERAÇÃO 5 — reincidência exata da regra-irmã da
#    iteração 4 ("um AC não pode exigir trabalho de uma task POSTERIOR"). Aquela varredura
#    corrigiu T09-a1, T10 e T15 e deixou ESTA linha de pé. RODADO no HEAD, forma da iteração 4:
#      $ ! grep -rn "libsql/migrator\|__drizzle_migrations" packages/api/typescript --include='*.ts' | grep -v node_modules
#      packages/api/typescript/core/src/db/drivers/PGliteDriver.ts:129:  // migrations in `drizzle.__drizzle_migrations` and runs ONLY the pending ones, so re-running on
#    ⇒ 1 hit, num comentário de um arquivo que só é DELETADO em T11 (duas tasks depois). O AC
#    reprovaria T09 com a implementação correta. A forma repo-wide ABSOLUTA (sem exclusão) já
#    existe em T23, que roda depois de T11 — RODADO lá: o único `__drizzle_migrations` em
#    `packages/` é essa mesma linha, então T23 vai a zero pela deleção, sem exclusão nenhuma.
! grep -rn "libsql/migrator\|__drizzle_migrations" packages/api/typescript --include='*.ts' | grep -v node_modules | grep -v PGliteDriver
# ordem dos pragmas: busy_timeout(5000) ANTES de journal_mode ANTES de foreign_keys — assertivo
test "$(grep -o 'busy_timeout\|journal_mode\|foreign_keys' packages/api/typescript/core/src/db/drivers/LibsqlDriver.ts | head -3 | tr '\n' ',')" \
   = "busy_timeout,journal_mode,foreign_keys,"
# nunca :memory:
! grep -q ':memory:' packages/api/typescript/core/src/db/drivers/LibsqlDriver.ts
# --- decisão (a): o mecanismo. Estes são os ACs que impedem a regressão silenciosa. ---
D=packages/api/typescript/core/src/db/drivers/LibsqlDriver.ts
# (a1) NENHUMA chamada a client.transaction()/db.transaction() sobrevive no seam de banco.
#      É o caminho que vaza um fd por transação E derruba os pragmas.
#
#      ⚠️ CORRIGIDO NA ITERAÇÃO 4 — a forma anterior contradizia os testes que a PRÓPRIA T09 e a
#      T13 prescrevem. `LibsqlDriver.test.ts` mora em `core/src/db/drivers/` e seus testes de
#      mecanismo 1-3 são `Promise.all` de 20/500/200 **`uow.transaction()`**;
#      `DrizzleUnitOfWork.test.ts` mora em `core/src/services/UnitOfWork/` e seus 3 testes são
#      `uow.transaction(async tx => …)` — e `uow.transaction(` casa `\.transaction(` sem ser
#      excluído por nenhum dos dois `grep -v`. O AC reprovava a implementação CORRETA, e o teste
#      do UoW não tem como evitá-lo (é o teste do próprio seam). Daí os dois `grep -v` novos.
#
#      ⚠️ E é RUNNABLE ONLY AFTER T13 — o `grep -v PGliteDriver` cobre o arquivo que só morre em
#      T11, mas `DrizzleUnitOfWork.ts:14` (`return this.db.transaction(async tx => {`) só é
#      reescrito em T13.
#
#      ⚠️ SAÍDA RE-RODADA NA ITERAÇÃO 6. A iteração 5 colou aqui DUAS linhas dizendo "forma final"
#      — mas a segunda (`PGliteDriver.ts:20`) é justamente a que o `grep -v PGliteDriver` da forma
#      final REMOVE, ou seja, a saída colada era de uma forma PRÉ-final do próprio gate. A forma
#      final, RODADA no HEAD, devolve UMA linha só:
#        $ grep -rn '\.transaction(' packages/api/typescript/core/src/db/ packages/api/typescript/core/src/services/UnitOfWork/ \
#            | grep -v 'driver\.transaction(' | grep -v 'this\.transaction(' \
#            | grep -v 'uow\.transaction('   | grep -v '\.test\.' | grep -v 'PGliteDriver'
#        packages/api/typescript/core/src/services/UnitOfWork/DrizzleUnitOfWork.ts:14:		return this.db.transaction(async tx => {
#        (1 linha ⇒ pipeline exit 0 ⇒ o `!` reprova, CORRETAMENTE, até T13 rodar)
#      Para registro, a forma SEM `grep -v PGliteDriver` (a da iteração 4) devolve 2 linhas — a de
#      cima mais `core/src/db/drivers/PGliteDriver.ts:20` (comentário; DELETADO em T11).
#      Rodar este item ao fechar T13; até lá vale o AC file-local logo abaixo, que é o que T09
#      consegue provar sozinha.
! grep -nE '(this\.)?(db|client)\.transaction\(' $D          # file-local: roda JÁ, em T09
! grep -rn '\.transaction(' packages/api/typescript/core/src/db/ packages/api/typescript/core/src/services/UnitOfWork/ \
  | grep -v 'driver\.transaction(' | grep -v 'this\.transaction(' \
  | grep -v 'uow\.transaction('   | grep -v '\.test\.' | grep -v 'PGliteDriver'
# (a2) BEGIN IMMEDIATE é string NOSSA, emitida por execute() — não cortesia do drizzle
grep -q "BEGIN IMMEDIATE" $D
grep -q "COMMIT"          $D
grep -q "ROLLBACK"        $D
# (a3) DOIS clients de regime distintos (escrita + leitura) e o membro `db` é o de LEITURA.
#      NÃO contar ocorrências de `createClient(` — um helper `openClient()` chamado 2× tem UMA,
#      e a implementação correta é justamente essa. Asseverar os handles, não a sintaxe.
grep -qE '#?(writeClient|_writeClient)' $D
grep -qE '#?(readClient|_readClient)'   $D
grep -qE 'readClient|read client|cliente de leitura' $D
# (a4) TxGate existe e o docblock explica o motivo CERTO (SQLITE_BUSY/ordem), não o antigo
grep -q 'TxGate' $D
grep -qiE 'SQLITE_BUSY|FIFO|serializ' $D
# (a5) o docblock NÃO cita o ancestral morto — T11/T23 exigem zero "PGlite" no workspace,
#      e a analogia era factualmente falsa (PGlite trava; o libsql rotacionava a conexão).
! grep -qi 'pglite' $D
# (a6) os números de T07C foram transcritos como justificativa do banimento
grep -qE 'FD_AFTER_500_TX_API|fd|descritor' $D
# o handle de migration é SEPARADO e fechado; os de regime ficam em 5000
grep -q 'busyTimeoutMs' $D
grep -q '5000'  $D
grep -q '30000' $D
# NOTA POSIX: `\s` NÃO é ERE e neste macOS o awk NÃO casa (range nunca abre ⇒ o `grep -q`
# recebe entrada vazia ⇒ AC falha sempre). Usar [[:space:]]. Verificado:
#   $ printf 'runMigrations () {\n30000\n}\n' > /tmp/a.ts
#   $ awk '/runMigrations\s*\(/,/^\t}/' /tmp/a.ts            # (vazio)
#   $ awk '/runMigrations[[:space:]]*\(/,/^\t}/' /tmp/a.ts   # runMigrations () { …
awk '/runMigrations[[:space:]]*\(/,/^\t}/' $D | grep -q '30000'
awk '/runMigrations[[:space:]]*\(/,/^\t}/' $D | grep -qE 'finally|\.close\(\)'
# close() NÃO destrói: nem rm do temp dir, nem client.close() incondicional
! grep -nE 'rmSync|rm\(' $D | grep -q 'close'
# ⚠️ ANCORADO NA ITERAÇÃO 4. A forma anterior (`/close[[:space:]]*\(/`) abre o range no PRIMEIRO
# `close(` do arquivo — que, sob a própria spec desta task, é o `migClient.close()` do `finally`
# de `runMigrations()` (o AC-irmão logo acima greppa exatamente por ele). O range de awk
# re-dispara, então a união PROVAVELMENTE ainda contém o corpo do método — mas a assertiva podia
# passar (ou falhar) por um motivo que não tem nada a ver com a semântica de `close()`.
# Ancorar no início de linha + indentação de membro. Verificado neste host:
#   $ printf 'class A {\n\tmigClient.close()\n\tclose (): void {\n\t\t// no-op: process-scoped\n\t}\n}\n' > /tmp/t2.ts
#   $ awk '/close[[:space:]]*\(/,/^\t}/'   /tmp/t2.ts   → inclui a linha do migClient
#   $ awk '/^\tclose[[:space:]]*\(/,/^\t}/' /tmp/t2.ts  → só o método (3 linhas)
# (o estilo `^\t}` é o do repo: PGliteDriver.ts tem 11 fechadores nessa forma.)
awk '/^\tclose[[:space:]]*\(/,/^\t}/' $D | grep -qiE 'no-op|refcount|process-scoped'
# o membro abstrato novo existe (sem ele o UoW não tem como escrever)
grep -q 'abstract transaction' packages/api/typescript/core/src/db/drivers/DrizzleDatabaseDriver.ts
# a assinatura do abstrato acompanhou
grep -q 'MigrationStatus' packages/api/typescript/core/src/db/drivers/DrizzleDatabaseDriver.ts
! grep -q 'MigrationJournal' packages/api/typescript/core/src/db/drivers/DrizzleDatabaseDriver.ts
# teste isolado do driver (novo, roda mesmo com a árvore vermelha)
( cd packages/api/typescript && bun test core/src/db/drivers/LibsqlDriver.test.ts )
```
O teste do driver assevera, num arquivo temporário: 25 tabelas criadas; `journal_mode` = `wal`;
`foreign_keys` = 0; `busy_timeout` = 5000 **nos DOIS clients de regime, depois de
`runMigrations()` ter rodado** (prova que o handle de 30000 era outro e não vazou); segunda
chamada a `runMigrations()` aplica **zero** (`readMigrations().pending.length === 0`);
`__drizzle_migrations` **não existe** em `sqlite_master`; **o caso de regressão do `close()` —
depois de `await driver.close()` uma query subsequente no mesmo driver ainda funciona** (é este
assert que impede alguém de "melhorar" o `close()` e derrubar as 26 suites).

**Mais os quatro testes de MECANISMO da decisão (a).** Eles são o que impede que alguém
"simplifique" `transaction()` de volta para `db.transaction()` — uma mudança que não quebra
nenhum tipo, não quebra nenhum teste funcional, e vaza fds até o daemon do usuário morrer.
Rodam contra o arquivo temporário do próprio driver:

1. **`TxGate` serializa.** `Promise.all` de 20 `uow.transaction()` concorrentes, cada uma com um
   `INSERT` e um `await sleep(5)`: 20 linhas, **zero erro**, e a ordem de entrada/saída
   registrada é estritamente FIFO (sem intercalação `A-start > B-start > A-end`). Sem o gate
   isto reprova com `SQLITE_BUSY` (medido: 2 tx concorrentes ⇒ 1 cumprida, 1 rejeitada).
2. **Estabilidade de descritores (o teste que trava a regressão).** Contar fds do arquivo do
   banco, rodar **500** `uow.transaction()`, recontar: **o número não muda**. Medido no
   mecanismo: 6 antes e 6 depois de 2000 transações. No caminho proibido: 4 → 10002 em 5000
   transações, linear e sem platô. Se o ambiente de CI não expuser `lsof`, ler
   `/proc/self/fd` no linux e **pular com `skip` explícito e mensagem** no resto — nunca
   silenciosamente.
3. **Pragmas grudam.** Depois de **N=200** `uow.transaction()`, reler `busy_timeout` e
   `foreign_keys` nos **dois** clients: ainda `5000` e `0`. Este é o teste que pega a regressão
   que **nenhum outro pega**, porque perder os pragmas não gera erro — gera `SQLITE_BUSY`
   esporádico em produção meses depois.
4. **Leitura suja.** Abrir uma escrita por `driver.transaction()`, e **de dentro dela** ler o
   mesmo registro pelo `driver.db` (o client de leitura): tem que devolver o valor **anterior**
   (committed). É o assert que prova que o split leitura/escrita está de pé; se alguém apontar
   `db` para o client de escrita, isto reprova.
5. **Visibilidade pós-commit no handle de leitura (sonda 8 de T07B, virada teste permanente —
   iteração 4).** O teste 4 prova que o client de leitura **não vê demais**; este prova que ele
   **vê o suficiente**, que é a propriedade de que o produto depende. `await
   driver.transaction(tx => insert(sentinela))` e, **na linha seguinte** (sem sleep, sem reabrir
   client, sem `PRAGMA`), `driver.db.select(...)` devolve a sentinela. Sem este assert, um
   “split” que isolasse demais passaria os testes 1-4 inteiros e o console voltaria a mostrar
   `DISCONNECTED` — o sintoma que motivou a fase. O par cross-process fica em T07B/T31 (precisa
   do binário Go); aqui fica o in-process, que é o que roda em toda suite.

---

#### T10 — `DataDirLock` por papel

**Arquivos:** `packages/api/typescript/core/src/db/drivers/DataDirLock.ts`,
`packages/api/typescript/src/boot.ts`.

**O que muda.**
- `lockPathFor(dataDir)` passa de `` `${dataDir}.lock` `` para
  `path.join(dataDir, 'daemon.lock')`. Reescrever o docblock de `:26-30` — o motivo antigo
  (initdb do PGlite) morreu com o PGlite; o motivo novo é escopo por papel.
- **`lockPathFor` passa a ser EXPORTADA** (hoje é `function lockPathFor` privada,
  `DataDirLock.ts:31` — verificado) e reexportada pelo barril de `drivers/`. É **T27** que
  consome: os dois limpadores de lock (`run-e2e.ts:125`, `smoke-node-boot.ts:78`) hardcodam o
  caminho hoje e precisam importar este, não redigitá-lo. Sem esta exportação o AC de T27 não
  tem como ser satisfeito sem duplicar a regra em três lugares.
- `DataDirLockedError`: **mantém** classe, `code = 'DATA_DIR_LOCKED'` e `instanceof`. Mensagem
  reescrita de "Only one api-ts process may own an embedded PGlite data dir" para "Another
  CodeDM **daemon** is already running on this data dir (pid N). The Go gateway sharing this
  dir is expected and fine."
- `resolveDataDir` mantém o `mkdirSync` e a expansão de `~`.
- `boot.ts:20` continua sendo o **único** call site de `acquireDataDirLock`.
- Remover a carve-out de idempotência same-pid se ela existir só para servir o
  `acquireDataDirLock` do construtor do `PGliteDriver` (que morre em T11) — mas **só** se
  nenhum outro caminho depender dela.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
grep -q "join(dataDir, 'daemon.lock')" packages/api/typescript/core/src/db/drivers/DataDirLock.ts
! grep -q 'PGlite' packages/api/typescript/core/src/db/drivers/DataDirLock.ts
grep -q "DATA_DIR_LOCKED" packages/api/typescript/core/src/db/drivers/DataDirLock.ts
# lockPathFor EXPORTADA (T27 importa). RODADO no HEAD: `DataDirLock.ts:31` é
# `function lockPathFor(dataDir: string): string {` — PRIVADA. Por isso o AC ancora em `export`:
# um `grep -q lockPathFor` nu passaria HOJE, sem que a exportação existisse.
grep -qE '^export function lockPathFor' packages/api/typescript/core/src/db/drivers/DataDirLock.ts
grep -q 'lockPathFor' packages/api/typescript/core/src/db/drivers/index.ts
# um único call site
# ⚠️ `grep -v PGliteDriver` ACRESCENTADO NA ITERAÇÃO 4 — sem ele este AC falha QUANDO T10 RODA,
# por ordenação de tasks (o espelho do defeito T21/T18, na direção contrária: um AC anterior
# invalidado por uma task POSTERIOR). RODADO no HEAD, forma antiga ⇒ **2**:
#   core/src/db/drivers/PGliteDriver.ts:102   `if (options.dataDir) acquireDataDirLock(...)`
#   src/boot.ts:20                            `acquireDataDirLock(resolveDataDir(...))`
# O `PGliteDriver.ts` só é DELETADO em T11, que roda DEPOIS de T10. A linha é código morto do
# ponto de vista desta task (o driver já foi substituído em T09/T12), então excluí-la é honesto —
# e o gate de T11/T23 (`! grep -rn 'PGlite' packages/api/typescript`) garante que a exclusão não
# esconde nada depois. Forma final RODADA no HEAD ⇒ 1 (só `src/boot.ts:20`).
test "$(grep -rn 'acquireDataDirLock(' packages/api/typescript --include='*.ts' | grep -v node_modules | grep -v 'DataDirLock.ts' | grep -v '\.test\.' | grep -v PGliteDriver | wc -l | tr -d ' ')" = "1"
# o nome do lock do daemon não colide com o do gateway
! grep -rn "codedm.db.lock" packages/api/typescript --include='*.ts'
```

---

#### T11 — Deleções

**Arquivos a DELETAR:**
- `packages/api/typescript/core/src/db/drivers/PGliteDriver.ts`
- `packages/api/typescript/core/src/db/drivers/NodePgDriver.ts` (já morto — só o próprio
  arquivo, o re-export e dois comentários em `registry.ts:66,126` o mencionam)
- `packages/api/typescript/core/src/db/types/jsonb.ts` (`customType` de pg-core; único
  consumidor é o barrel `core/src/db/index.ts:9`)
- `packages/api/typescript/core/src/bun-file-assets.d.ts` e
  `packages/api/typescript/src/bun-file-assets.d.ts` (declarações ambient de `*.wasm`/`*.data`
  que existiam **só** para o embed dos assets do PGlite)
- **`packages/api/typescript/core/src/db/config.ts` — resíduo pg MORTO, adicionado na iteração
  2.** É um `createDrizzleConfig()` que constrói um `defineConfig` do drizzle-kit com
  `dialect: 'postgresql'` hardcoded e lê `DATABASE_URL` (`:5,11,29`). Verificado: **zero
  consumidores** no repo — o único hit de `createDrizzleConfig` é a própria definição. É
  exportado pelo barrel (`core/src/db/index.ts:5`, `export * from './config'`), então sobrevive
  a qualquer grep de import. Sem esta deleção o AC de T26 (`! grep -rn 'DATABASE_URL'
  packages/api/typescript`) falha no bloco 3 como **mistério**, longe da causa.

**Arquivos a EDITAR:** `core/src/db/drivers/index.ts` (remover os dois re-exports, exportar
`LibsqlDriver`), `core/src/db/index.ts` (remover `export * from './types/jsonb'` **e**
`export * from './config'`), `src/shared/registry.ts` (limpar os comentários de `:66` e `:126`).

##### Os 11 arquivos de RESÍDUO TEXTUAL que nenhuma outra task nomeia (iteração 4)

O gate `! grep -rn "PGlite\|NodePg\|pglite" packages/api/typescript` aparece **duas vezes** — no
AC desta task e no de T23 — e até a iteração 3 **nenhuma lista de Arquivos** cobria a maior parte
do que ele exige. Consequência: o gate só falharia em T23, no fim da janela vermelha
não-bissectável, como uma descoberta de ~11 arquivos. A varredura foi **RODADA no HEAD**:

```
$ grep -rn "PGlite\|NodePg\|pglite" packages/api/typescript --include='*.ts' --include='*.json' \
  | grep -v node_modules | wc -l
     103
$ … | awk -F: '{print $1}' | sort -u | wc -l
      24
```

Desses 24, **13 já têm dono**: `PGliteDriver.ts` (31 linhas) + `NodePgDriver.ts` (5) +
`bun-file-assets.d.ts` ×2 (5) são **deletados aqui**; `src/shared/registry.ts` (15) e
`core/src/db/drivers/index.ts` (2) são editados aqui; `DataDirLock.ts` (8) → T10;
`core/src/db/client.ts` (2) → T08; `scripts/build.ts` (12) e `scripts/smoke-node-boot.ts` (2)
→ T24/T25; `tests/kernel/PostgresCommandQueue.test.ts` (1) → T16;
`tests/support/PersistenceProbe.ts` (1) → T22; `core/package.json` (1, a dep
`@electric-sql/pglite`) → T07.

**Os 11 restantes (18 linhas) passam a ser desta task, enumerados** — cada um é reescrita de
prosa, exceto o primeiro:

| arquivo | linhas | natureza |
|---|---|---|
| `src/shared/index.ts` | `:43 :48 :55 :65` | **NÃO é cosmético.** `:55` descreve a lógica de serialização das migrations (“each mint a SEPARATE `new PGlite(dataDir)`”) — é exatamente o invariante que a **memoização de T12** substitui. Reescrever o texto para o mecanismo novo (um `LibsqlDriver` memoizado por caminho), não trocar a palavra. |
| `src/index.ts` | `:36 :52` | comentário do passo de migração early/serializado |
| `core/src/utils/Config.ts` | `:27 :28 :30` | docblock do `CODEDM_DATA_DIR` (“embedded, file-backed PGlite data directory”) |
| `scripts/require-emit-env.ts` | `:9 :20` | prosa + **string de mensagem de erro** (`:20`) |
| `scripts/emit-openapi.ts` | `:8` | docblock |
| `core/src/types/Registry.ts` | `:32` | comentário sobre modo `real` |
| `tests/support/TestBed.ts` | `:168` | **string de `throw new Error(...)`** — “requires integration mode (PGlite)” |
| `tests/kernel/DrizzleIdempotencyGuard.test.ts` | `:2` | comentário de cabeçalho |
| `tests/kernel/DomainEventListByNameSince.test.ts` | `:2` | comentário de cabeçalho |
| `src/ui/registry.ts` | `:8` | comentário (“against the pglite driver”) |
| `src/terminal/…/E2eStubTerminalLLMRunner.ts` | `:10` | docblock do harness Playwright |

Com esta lista, o gate de T23 vai a zero **por construção** e não por descoberta.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
! test -e packages/api/typescript/core/src/db/drivers/PGliteDriver.ts
! test -e packages/api/typescript/core/src/db/drivers/NodePgDriver.ts
! test -e packages/api/typescript/core/src/db/types/jsonb.ts
! test -e packages/api/typescript/core/src/bun-file-assets.d.ts
! test -e packages/api/typescript/src/bun-file-assets.d.ts
! test -e packages/api/typescript/core/src/db/config.ts
! grep -q "from './config'" packages/api/typescript/core/src/db/index.ts
! grep -rn "createDrizzleConfig\|dialect: 'postgresql'" packages/api/typescript --include='*.ts' | grep -v node_modules
! grep -rn "PGlite\|NodePg\|pglite" packages/api/typescript --include='*.ts' --include='*.json' | grep -v node_modules
! grep -rn "drizzle-orm/pg-core\|drizzle-orm/node-postgres" packages/api/typescript --include='*.ts' | grep -v node_modules
```

---

#### T12 — Binding no `registry.ts`

**Arquivos:** `packages/api/typescript/src/shared/registry.ts` (~37, 55, 81-102, 124-127).

**O que muda.**
- `pgliteDriver` → `libsqlDriver` para `mock` e `integration` — **memoizado, não
  `useFactory: () => new LibsqlDriver(...)` cru** (ver abaixo, é o ponto desta task).
- `getRealDatabaseDriver()` memoizado continua, mas constrói
  `new LibsqlDriver({ schema, migrationsDir, dbPath: join(resolveDataDir(Config.env.CODEDM_DATA_DIR), 'codedm.db') })`.
  **O nome do arquivo tem que ser exatamente o `dbFileName` do Go** (`codedm.db`) — é o ponto
  inteiro da fase.
- Sob `EMIT_OPENAPI` continua caindo no driver temporário (sem lock, sem tocar o data dir real)
  — **mas também memoizado**.
- `migrateEmbeddedDatabase()` mantém nome e contrato; só o docblock muda ("PGlite" → "shared
  SQLite", e o texto sobre o migrator do drizzle sai).
- **O binding do `DrizzleClient` NÃO muda de forma — muda de significado (decisão (a)).**
  `registry.ts:116` é
  `useFactory: c => c.resolve(DrizzleDatabaseDriver).db` e continua exatamente assim; o que muda
  é que `driver.db` passa a ser o **client de LEITURA**. Medido: são **58** arquivos injetando
  `DrizzleClient` e **1** binding — manter o nome do membro é o que torna a mudança de 1 linha em
  vez de 58. Acrescentar comentário no binding dizendo isso, senão a próxima pessoa aponta `db`
  para o handle de escrita "porque é o principal" e reabre a leitura suja cross-request sem
  nenhum teste reclamando (exceto o teste 4 de T09, que é justamente o guard).

##### Por que `mock`/`integration` também precisam de memoização agora

O próprio `registry.ts` documenta o fato duro (comentário `SINGLETON`, ~:70): **tsyringe-neo
invoca `useFactory` em TODO resolve, sem cache** — é exatamente por isso que só o binding
`real` foi memoizado à mão em `getRealDatabaseDriver()`. Sob PGlite, um resolve extra em
`mock`/`integration` cunhava um banco **em memória** barato e descartável, então o custo era
invisível. Sob `LibsqlDriver` **não é mais**: cada resolve extra faz um `mkdtemp` — um
**diretório e um arquivo reais em disco que ninguém remove** (e não pode remover, pela regra de
`close()` em T09) — e devolve um banco **vazio e não migrado** para qualquer coisa que resolva
fora do `registerInstance` do `TestBed`. Dois modos de falha, ambos silenciosos: vazamento de
temp dir por resolve, e queries contra um schema inexistente em código que não passou pelo
`TestBed`.

O mesmo vale para a carve-out do `EMIT_OPENAPI`: ela resolve o driver **uma vez por controller**
durante o codegen — hoje N PGlites de memória, depois N temp dirs em disco.

**Regra:** os três caminhos (`mock`/`integration`, `real`, `EMIT_OPENAPI`) usam a **mesma**
forma de memoização em escopo de módulo já usada por `getRealDatabaseDriver()` — um
`let ...Singleton: LibsqlDriver | undefined` por caminho, `useFactory` devolvendo o memo. Não
inventar mecanismo novo; copiar o padrão que já está no arquivo, com o comentário explicando o
custo novo do `mkdtemp`.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
R=packages/api/typescript/src/shared/registry.ts
grep -q "codedm.db"    $R
grep -q "LibsqlDriver" $R
! grep -q "PGlite"     $R
# nenhum `useFactory: () => new LibsqlDriver` cru sobrou (todos passam por um memo)
test "$(grep -cE 'useFactory: \(\) => new LibsqlDriver' $R | tr -d ' ')" = "0"
# há memo para cada caminho: teste/real/emit
test "$(grep -cE '^let .*Singleton' $R | tr -d ' ')" -ge 2
# o path que o TS abre é o mesmo que o Go abre — ASSERTIVO, não leitura humana
# (⚠️ `\s` → `[[:space:]]` na iteração 4: `\s` não é ERE. PASSA neste host — o grep do PATH
#  aqui honra `\s` — mas a regra do §8 existe justamente para o AC não depender de QUAL grep
#  está no PATH. Os dois RODADOS, os dois devolvem `dbFileName = "codedm.db"`.)
test "$(grep -oE 'dbFileName[[:space:]]*=[[:space:]]*"[^"]+"' packages/api/go/core/db/sqlite/store.go | grep -oE '"[^"]+"' | tr -d '"')" = "codedm.db"
```

---

#### T13 — `DrizzleUnitOfWork`: reapontar para `driver.transaction()`

> **⚠️ Esta task DEIXOU de ser "confirmar que porta sem mudança" (iteração 3).** As iterações 1 e
> 2 diziam "idealmente nada no código". Isso valia enquanto o plano assumia que
> `db.transaction()` era o caminho — e esse caminho está **proibido** pela decisão (a) porque
> vaza uma conexão nativa por chamada e derruba os pragmas. `DrizzleUnitOfWork.ts:16` é
> literalmente `return this.db.transaction(async tx => …)`, ou seja **o UoW é hoje o principal
> consumidor do caminho banido**. É edição de arquivo, e um AC de `git diff --stat` vazio
> reprovaria a implementação correta.

**Arquivos:** `packages/api/typescript/core/src/services/UnitOfWork/DrizzleUnitOfWork.ts`
(edição), `core/src/services/UnitOfWork/DrizzleUnitOfWork.test.ts` (novo).

**O que muda — três edições, todas pequenas e todas obrigatórias.**

1. **`DrizzleTransaction` deixa de ser derivado.** Hoje (`:5`):
   `export type DrizzleTransaction = Parameters<Parameters<DrizzleClient['transaction']>[0]>[0]`.
   Isso descrevia o handle que **o drizzle** passava. Sob o mecanismo, o handle **é** o db de
   escrita, então vira `export type DrizzleTransaction = LibSQLDatabase<typeof schema>`.
2. **`DrizzleUnitOfWork` passa a receber o driver, não o client.** `constructor(private db:
   DrizzleClient)` → `constructor(private driver: DrizzleDatabaseDriver)`, e
   `transaction(fn)` vira `return this.driver.transaction(fn)`. Idem em
   `DrizzleUnitOfWorkFactory`. (O `DrizzleClient` injetado é o handle de **leitura** — o UoW não
   pode escrever por ele.)
3. **Docblock** dizendo por que `db.transaction()` não pode voltar, com o número: 500 tx ⇒
   +1000 fds, e `busy_timeout` 5000 → 0 depois da primeira.

**Repositórios não mudam.** Eles recebem o `tx` e fazem `select/insert/update` — a superfície é a
mesma. Verificado que **não existe** nenhum consumidor de `tx.rollback()` (que sumiria com o
`BEGIN` manual):
```
$ grep -rn "\.rollback()" packages/api/typescript --include='*.ts' | grep -v node_modules
(nenhuma saída)
```

**Teste novo (o item de maior valor desta task):**
1. `uow.transaction(async tx => { insert; throw })` ⇒ a linha **não** existe depois.
2. `uow.transaction(async tx => { insert; await sleep(50); insert })` ⇒ **as duas** linhas
   existem depois (prova que o commit esperou o callback async — é este o teste que um adapter
   sync reprovaria).
3. **Read-your-writes dentro da tx:** ler pelo `tx` **dentro** do callback devolve o valor
   novo; ler pelo `driver.db` (leitura) **no mesmo instante** devolve o antigo. Prova os dois
   lados do split de uma vez.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
F=packages/api/typescript/core/src/services/UnitOfWork/DrizzleUnitOfWork.ts
( cd packages/api/typescript && bun test core/src/services/UnitOfWork/DrizzleUnitOfWork.test.ts )
# o caminho banido não sobrevive neste arquivo…
! grep -q 'this\.db\.transaction(' $F
# …e o novo está lá
grep -q 'driver\.transaction(' $F
# DrizzleTransaction deixou de ser derivado do método `transaction` do client
! grep -q "Parameters<Parameters<DrizzleClient\['transaction'\]>\[0\]>\[0\]" $F
grep -qE 'DrizzleTransaction *= *LibSQLDatabase' $F
```

---

#### T13B — AUDITORIA: a troca de transação FALSA por transação REAL

**Arquivos:** varredura sobre `packages/api/typescript/src/**` **e**
`packages/api/typescript/core/src/**`; `packages/api/typescript/tests/architecture/tx-discipline.test.ts`
(ampliação de escopo); `.plans/artifacts/2026-07-26-tx-audit.md` (novo, o registro da varredura).

**Por que esta task existe (o buraco que T13 não fecha).** Hoje o binding `real` é
`filePgliteDriver`, cujo `unitOfWorkFactory` é `PGliteUnitOfWorkFactory` — e ele **finge**:
`PGliteDriver.ts:24-32` chama `fn(this.db)` direto, **sem `BEGIN`, sem `COMMIT`, sem rollback**.
Ou seja, **toda** "transação" em produção hoje é uma sequência de statements soltos. Depois de
T09/T12 cada use case passa a rodar dentro de um `BEGIN IMMEDIATE` de verdade, numa conexão
libsql única. Isso não é um detalhe de driver: é **mudança de semântica em todo o write path**,
e nenhum teste existente a cobre (justamente porque a transação era falsa).

T13 prova que o mecanismo funciona (rollback + await do callback async). O que T13 **não** faz é
auditar o código que dependia — sem saber — da semântica falsa. Três classes de dependência:

1. **ESCRITA por `this.db` (que agora é o handle de LEITURA) — proibição DURA, não auditoria.**
   Antes: `tx === this.db` e tudo dava no mesmo. Sob a decisão (a), `this.db` é o client de
   **leitura**: uma escrita por ele roda numa conexão que **não** detém o write lock, então ou
   toma `SQLITE_BUSY` na hora (com uma tx nossa aberta) ou abre uma transação implícita **fora**
   do `TxGate`. Em ambos os casos é bug, e em nenhum é erro de tipo.
   **O universo é conhecido e pequeno — RODADO no HEAD, 4 linhas:**
   ```
   $ grep -rnE "this\.db\.(insert|update|delete)\(" packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v '\.test\.'
   src/owner/usecases/SetActiveOwner.ts:45
   core/src/services/CommandQueue/PostgresCommandQueue.ts:277
   core/src/services/CommandQueue/PostgresCommandQueue.ts:333
   core/src/services/CommandQueue/PostgresCommandQueue.ts:374
   count: 4
   ```
   As 3 do `CommandQueue` são reescritas por T16 de qualquer forma. Sobra **`SetActiveOwner.ts:45`**
   — o único achado real desta classe — que passa a escrever por `uow.transaction`.
   **Zero justificativas admissíveis:** nesta classe não existe "aceito com justificativa".
2. **Trabalho de handler dentro do escopo da tx — subiu de "auditar" para RISCO PRINCIPAL.**
   Com transação falsa, um handler lento dentro de um `withTransaction` não segurava nada. Agora
   segura o **único** write lock do arquivo, compartilhado com o gateway Go — **e**, pela medição
   da decisão (a), o driver local do libsql é **síncrono**: esperar por lock congela o event loop
   inteiro (medido: 816ms de espera ⇒ **0 ticks** de timer). Toda I/O externa (HTTP, spawn de
   terminal, cliente de LLM) dentro de um span de tx vira contenção cross-process **e** parada do
   daemon. Esta classe é a razão de o risco (i) da decisão (a) ser aceitável — ele só é aceitável
   se as transações forem curtas, e é **aqui** que isso é verificado, não em prosa.
3. **Leitura pelo handle de ESCRITA — o risco que a CORREÇÃO cria.** Sem a rotação de conexão do
   `client.transaction()`, uma leitura disparada no client de escrita durante uma tx aberta vê o
   **não-commitado**, e o valor vaza para outra request. Como o handle de escrita nunca é
   exposto (só chega como o `tx` do callback), a classe se reduz a duas regras verificáveis:
   nenhum `tx` guardado/retornado para fora do callback, e **nada** fora do `LibsqlDriver`
   alcança `#writeClient`. É guard de **encapsulamento**, não de disciplina.

3b. **LEITURA pelo handle de LEITURA, de DENTRO de uma tx — a simétrica, que faltava
   (iteração 4).** A classe 3 acima guarda o handle de escrita vazando **para fora**. O buraco
   é o inverso e é mais fácil de cometer: um `this.db.select(...)` **dentro** do callback de
   `driver.transaction()`. Não dá erro, não dá tipo errado, não vaza nada — simplesmente lê o
   estado **pré-transação**, porque `this.db` é uma conexão que não está no `BEGIN IMMEDIATE`.
   O grep de classe 1 (`this\.db\.(insert|update|delete)\(`) **não** pega isso, e o guard de
   encapsulamento tampouco.
   **Por que importa concretamente:** o claim de T16 é `SELECT ids` → `UPDATE lease_until` →
   `SELECT rows WHERE id IN (:ids)`, os três “numa única tx”. Se qualquer um dos dois `SELECT`
   for emitido em `this.db` em vez do `tx` do callback, ele enxerga as linhas **sem lease** e o
   claim entrega a mesma linha a dois ciclos — silenciosamente. O mesmo vale para o claim de
   T17.
   **Universo medido no HEAD:** `grep -rnE "this\.db\.select\(" packages/api/typescript/src
   packages/api/typescript/core/src --include='*.ts' | grep -v '\.test\.'` ⇒ **20 linhas, em 7
   arquivos**, e **todas** são query use case do BFF (`ui/usecases/GetHomeDashboard.ts` ×3,
   `GetSetupChecklist.ts` ×2, `thread/usecases/GetSessionChat.ts` ×5,
   `GetThreadSettings.ts` ×1, `issue/usecases/GetIssueDetail.ts` ×4,
   `GetSessionIssues.ts` ×1, `ui/services/BrowserFrameEnricher/BrowserFrameEnricher.ts` ×4) —
   **nenhuma dentro de um span de transação**. Ou seja: a classe está limpa hoje, e o guard
   existe para que continue limpa depois de T16/T17 escreverem os dois claims.
   **O que fazer:** estender a varredura do `tx-discipline.test.ts` para, dentro de cada span de
   `transaction(` / `withTransaction(`, sinalizar `this\.db\.` (qualquer método — `select`,
   `insert`, `update`, `delete`, `execute`, `run`) como violação. Dentro de um callback de
   transação **só o parâmetro `tx` é handle legítimo**; é a mesma frase que T09 manda escrever
   no docblock de `transaction()`.

   > **A medição saiu daqui, e a PERGUNTA mudou (iterações 2 e 3).** A iteração 1 mandava
   > "provar, não presumir" — provar **dentro** da janela vermelha, depois do commit único ter
   > começado. A medição foi para as sondas 5-7 de **T07B** e o veredito para **T07C**, ambos
   > **antes** de T08; T13B **aplica** o veredito, não re-mede. E a pergunta da iteração 2
   > (`INTRA_STMT_BEHAVIOR=joined|queued|error`) **não existe mais**: ela pressupunha
   > `client.transaction()`, que a decisão (a) baniu. O que se transcreve agora é
   > `GATE=`, `DIRTY_READ_ON_READ_CLIENT` e `FD_AFTER_500_MANUAL`.

**O `tx-discipline.test.ts` existente NÃO cobre isso.** O docblock dele escopa explicitamente a
varredura a `packages/api/typescript/src` e declara o sub-pacote `core/` **fora de escopo por
construção**; e ele só inspeciona spans de `withTransaction(`. Os callbacks passados direto a
`uow.transaction(...)` e todo o `core/` ficam invisíveis.

**O que fazer.**

1. **Transcrever o veredito de T07C (não re-medir).** Copiar `GATE=`,
   `DIRTY_READ_ON_READ_CLIENT`, `DIRTY_READ_ON_WRITE_CLIENT` e `FD_AFTER_500_MANUAL` de
   `.plans/artifacts/2026-07-26-tx-concurrency-gate.md` para
   `.plans/artifacts/2026-07-26-tx-audit.md`.
2. **Ampliar `tx-discipline.test.ts`:** incluir `core/src/**` no escopo da varredura e reconhecer
   `\.transaction(` (o seam do UoW) além de `withTransaction(`. Atualizar o docblock — a frase
   "core/ está fora de escopo por construção" deixa de ser verdade nesta fase, porque agora é o
   `core/` que hospeda o dispatcher e o command queue, os dois writers mais quentes.
   **E acrescentar a regra da classe 3B (iteração 4):** dentro de cada span de tx, qualquer
   `this.db.<método>` é violação — o único handle legítimo ali é o parâmetro `tx`. É a mesma
   frase que T09 manda escrever no docblock de `transaction()`; aqui ela vira teste.
3. **Varredura de I/O sob tx (classe 2).** Enumerar todo span de tx que contenha `await` de algo
   que não seja repositório (`fetch`, `spawn`, cliente de LLM, `ForwardRequest`). Cada ocorrência
   vira: mover para fora da tx (padrão claim-before-call / fire-after-commit já documentado no
   docblock do guard) ou justificar por escrito no artefato. **Esta é a classe de maior valor
   agora** — ver o risco (i) da decisão (a): o driver é síncrono, então I/O sob tx não custa
   contenção, custa **parada do daemon**.
4. **Registrar tudo** no artefato: arquivo, linha, classe (1/2/3/3B), veredito (corrigido / aceito
   com justificativa). Zero achados também é um resultado válido — mas tem que estar escrito.
   **Classe 1 não admite "aceito com justificativa"** e o AC abaixo é incondicional por isso.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
A=.plans/artifacts/2026-07-26-tx-audit.md
G=.plans/artifacts/2026-07-26-tx-concurrency-gate.md
test -s "$A"
grep -qE '^CLASSE_1_ACHADOS=[0-9]+$' "$A"
grep -qE '^CLASSE_2_ACHADOS=[0-9]+$' "$A"
grep -qE '^CLASSE_3_ACHADOS=[0-9]+$' "$A"
grep -qE '^CLASSE_3B_ACHADOS=[0-9]+$' "$A"   # this.db.* dentro de span de tx (iteração 4)
# o veredito vem de T07C, transcrito — e bate com o artefato do gate (não foi re-medido "no olho")
grep -qE '^GATE=PASS_MECHANISM_CONFIRMED$'       "$A"
grep -qE '^DIRTY_READ_ON_READ_CLIENT=(yes|no)$'  "$A"
test "$(grep -hoE '^DIRTY_READ_ON_READ_CLIENT=.*' "$A")" = "$(grep -hoE '^DIRTY_READ_ON_READ_CLIENT=.*' "$G")"
test "$(grep -hoE '^FD_AFTER_500_MANUAL=.*'      "$A")" = "$(grep -hoE '^FD_AFTER_500_MANUAL=.*'      "$G")"
# CLASSE 1 é proibição DURA — incondicional, sem `if`. O universo medido no HEAD é de 4 linhas
# (3 delas reescritas por T16), então zerar é trabalho conhecido, não descoberta.
grep -q '^CLASSE_1_ACHADOS=0$' "$A"
# e a única sobrevivente real do grep de classe 1 foi de fato corrigida
! grep -nE "this\.db\.(insert|update|delete)\(" packages/api/typescript/src/owner/usecases/SetActiveOwner.ts
# nenhuma escrita por handle de leitura sobrou em lugar nenhum (o grep de classe 1, repo-wide)
! grep -rnE "this\.db\.(insert|update|delete)\(" packages/api/typescript/src packages/api/typescript/core/src \
    --include='*.ts' | grep -v '\.test\.'
# o guard passou a enxergar core/ e o seam do UoW
! grep -q 'out of scope by construction' packages/api/typescript/tests/architecture/tx-discipline.test.ts
grep -q "core/src" packages/api/typescript/tests/architecture/tx-discipline.test.ts
grep -q "transaction(" packages/api/typescript/tests/architecture/tx-discipline.test.ts
# …e passou a enxergar a CLASSE 3B: qualquer `this.db.` dentro de um span de tx (iteração 4).
# Forma tolerante às duas escritas (literal `'this.db.'` ou regex `/this\.db\./`) — verificado:
#   $ printf "const A = /this\\\\.db\\\\./\nconst B = 'this.db.'\n" > /tmp/g2.ts
#   $ grep -cE 'this\\?\.db' /tmp/g2.ts   → 2
grep -qE 'this\\?\.db' packages/api/typescript/tests/architecture/tx-discipline.test.ts
# o universo de leitura pelo handle de leitura fora de tx é CONHECIDO e permanece legítimo —
# RODADO no HEAD: 20 linhas em 7 arquivos, todas query use case do BFF, nenhuma sob tx.
# Este AC só documenta a contagem; quem julga "sob tx ou não" é o guard acima, não o grep.
test "$(grep -rnE 'this\.db\.select\(' packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v '\.test\.' | wc -l | tr -d ' ')" -le "20"
( cd packages/api/typescript && bun test tests/architecture/tx-discipline.test.ts )
```

---

#### T14 — `saveWithOptimisticLock`: genéricos para SQLite

**Arquivos:** `packages/api/typescript/core/src/db/saveWithOptimisticLock.ts`.

**O que muda.** Trocar os genéricos de pg-core pelos de sqlite-core, preservando **toda** a
garantia de tipo que o arquivo tem hoje (é o ponto dele):

| hoje | vira |
|---|---|
| `PgTable` | `SQLiteTable` |
| `PgInsertValue<T>` | `SQLiteInsertValue<T>` |
| `PgUpdateSetSource<T>` | `SQLiteUpdateSetSource<T>` |
| `ColumnsOf<T> = T['_']['columns'][keyof …]` | idêntico, só re-parametrizado |

`onConflictDoUpdate({ target, set, setWhere })` existe em sqlite-core com a mesma forma, e
`.returning({ version })` também — a checagem `result.length === 0` →
`OPTIMISTIC_LOCK_CONFLICT` fica intacta.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
! grep -q 'pg-core' packages/api/typescript/core/src/db/saveWithOptimisticLock.ts
grep -q 'sqlite-core' packages/api/typescript/core/src/db/saveWithOptimisticLock.ts
grep -q 'setWhere' packages/api/typescript/core/src/db/saveWithOptimisticLock.ts
grep -q 'OPTIMISTIC_LOCK_CONFLICT' packages/api/typescript/core/src/db/saveWithOptimisticLock.ts
( cd packages/api/typescript && bun test core/src/db/saveWithOptimisticLock.test.ts )   # criar se não existir
```

---

#### T15 — `truncateAllTables` → sweep SQLite

**Arquivos:** `packages/api/typescript/core/src/db/drivers/utils.ts`,
`packages/api/typescript/core/src/db/drivers/LibsqlDriver.test.ts` (**o caso `reset`** — o arquivo
nasce em T09; esta task ACRESCENTA o caso; **criar se não existir**).

> **Por que a Arquivos ganhou o arquivo de teste (iteração 6).** O AC abaixo roda
> `bun test … LibsqlDriver.test.ts -t "reset"`, e T09 não prescreve nenhum caso chamado `reset`
> (a lista de asserts de T09 cobre pragmas, ledger, fds e o `close()` não-destrutivo). Um `-t`
> que não casa **não é vácuo neutro, é falha**: MEDIDO neste host, contra um arquivo de teste
> real e existente —
> `$ bun test src/ui/usecases/GetUserInfo.test.ts -t "zzz-no-such-test"` ⇒
> `error: regex "zzz-no-such-test" matched 0 tests. Searched 1 file (skipping 3 tests)`,
> **`EXIT=1`**. Logo o AC de T15 reprovaria por um caso que ninguém escreveu. Ou a task **cria**
> o caso (é o que fica declarado aqui, no mesmo padrão do `# criar se não existir` de T14), ou o
> AC sai.

**O que muda.** Deletar o bloco `DO $$ … pg_tables … TRUNCATE … CASCADE` (que usa
`db.execute`, inexistente em sqlite-core) e substituir por `resetAllTables(db)`, numa única
transação:

```sql
SELECT name FROM sqlite_master
 WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlite_migrations';
-- por tabela: DELETE FROM "<t>";
-- se sqlite_sequence existir: DELETE FROM sqlite_sequence;
```

**Excluir `_sqlite_migrations` é load-bearing:** `runMigrations()` roda **uma vez por
processo** (`TestBed.ts:85-89`), então um reset que apagasse a ledger deixaria todo teste
subsequente rodando contra um schema que ninguém recriou.

`readMigrationJournal`/`readMigrationSql` saem daqui (o applier do `LibsqlDriver` lê o dir
direto, decisão (b)(5)).

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
! grep -q 'pg_tables\|TRUNCATE\|DO \$\$' packages/api/typescript/core/src/db/drivers/utils.ts
grep -q '_sqlite_migrations' packages/api/typescript/core/src/db/drivers/utils.ts
# ⚠️ ESCOPADO (iteração 3). A forma `! grep -rn '\.execute('` casava 22 linhas LEGÍTIMAS só em
# core/src (Controller.ts, RateLimitMiddleware, MockCommandQueue, os 6 mediators — todas
# `handler.execute(...)`/`mw.execute(...)`, nada a ver com banco) e 111 em src/. O que o gate quer
# é a API do CLIENTE drizzle/pg.
#
# ⚠️ RE-ESCOPADO NA ITERAÇÃO 4 — de `core/src` para `core/src/db`, o DIRETÓRIO QUE ESTA TASK
# POSSUI. A forma de iteração 3 exigia zero em `core/src` inteiro e a própria nota admitia que
# um dos 2 hits só morre em T16, que roda DEPOIS. Ou seja: o AC de T15 reprovava por trabalho
# de outra task. RODADO no HEAD, os dois escopos:
#   $ grep -rnE '\b(db|tx|client)\.execute\(' packages/api/typescript/core/src --include='*.ts'
#     core/src/db/drivers/utils.ts:19                             await db.execute(sql`   ← T15
#     core/src/services/CommandQueue/PostgresCommandQueue.ts:291  this.db.execute(sql`    ← T16
#   $ grep -rnE '\b(db|tx|client)\.execute\(' packages/api/typescript/core/src/db --include='*.ts'
#     core/src/db/drivers/utils.ts:19                                                     ← T15
# A forma `core/src`-wide continua existindo — em **T23 gate (3)**, que é onde ela pode passar,
# porque lá T15 e T16 já rodaram.
! grep -rnE '\b(db|tx|client)\.execute\(' packages/api/typescript/core/src/db --include='*.ts' | grep -v node_modules
# teste: reset preserva a ledger.
# ⚠️ O caso `reset` é DELIVERABLE DESTA TASK (ver Arquivos): `-t` que não casa sai 1, não 0.
#    MEDIDO: `bun test <arquivo-real> -t "zzz-no-such-test"` ⇒ "matched 0 tests" + EXIT=1.
( cd packages/api/typescript && bun test core/src/db/drivers/LibsqlDriver.test.ts -t "reset" )
```

---

#### T16 — `PostgresCommandQueue` → `SqliteCommandQueue`

**Arquivos:** `packages/api/typescript/core/src/services/CommandQueue/PostgresCommandQueue.ts`
→ renomear para `SqliteCommandQueue.ts`; `core/src/services/CommandQueue/index.ts`;
`src/shared/registry.ts` (binding); `tests/kernel/PostgresCommandQueue.test.ts` → renomear.

> **⚠️ Esta task NÃO é troca de transporte.** É reescrita do SQL. Uma versão anterior deste
> plano dizia "só muda o transporte da query" — está **errado**, e o erro é do tipo caro: os
> pg-ismos abaixo **não geram erro de compilação**, geram `no such function` / `syntax error`
> em **runtime**, no boot do daemon.

**O inventário completo de pg-ismos no SQL cru de `claimDueBatch()` (`:291-325`).** São
**cinco** classes, e o plano anterior listava só a primeira:

| # | pg-ismo | onde | por que quebra |
|---|---|---|---|
| 1 | `db.execute(...)` + `result.rows` | `:291`, `:307`, `:325` | não existem em sqlite-core (que tem `run`/`all`/`get`/`values` e devolve array direto) — **erro de compilação**, o único que o `tsc` pega |
| 2 | **`now()` × 5** | `:293` (×2: `dead_at`, `updated_at`), `:297`, `:311`, `:312` | SQLite **não tem** `now()`. Runtime: `no such function: now` |
| 3 | `now() + (LEASE_MS * interval '1 millisecond')` | `:320` (mais `updated_at = now()` na mesma linha) | SQLite não tem tipo `interval` nem aritmética de data assim |
| 4 | `FOR UPDATE SKIP LOCKED` dentro da CTE `due` | `:317` | não existe em SQLite — **é o mesmo construto que o plano chama de HARD BREAK no dispatcher**, e estava faltando aqui |
| 5 | `UPDATE … sc SET … FROM due WHERE sc.id = due.id RETURNING …` | `:323-325` | forma `UPDATE…FROM` do Postgres |

**Regra de substituição — relógio vem do JS, não do SQL.** As colunas `run_at`, `lease_until`,
`created_at`, `updated_at`, `dead_at` são `integer{ mode: 'timestamp_ms' }` no `schema-sqlite`.
Portanto **não** trocar `now()` por `unixepoch()` nem por `CURRENT_TIMESTAMP` (unidades
erradas: segundos e texto ISO, respectivamente, contra colunas de **epoch-ms**). O correto é
**bindar `Date.now()` do JS** — um único `const now = Date.now()` por ciclo, passado como
parâmetro. Isso também alinha com o lado Go, que já escreve epoch-ms explícito, e mantém o
tempo estável dentro do ciclo (`now()` do pg era estável por statement; um `unixepoch()` por
referência não seria).

**Reescrita, statement por statement:**

1. **Dead-letter sweep (`:291-299`)** — `db.execute` → `db.run`; `dead_at = now()` /
   `updated_at = now()` → `dead_at = ${now}` / `updated_at = ${now}`; `leaseUntil < now()` →
   `leaseUntil < ${now}`. Estrutura do `WHERE` inalterada.
2. **Claim (`:307-325`)** — a CTE `due` + `UPDATE…FROM` + `FOR UPDATE SKIP LOCKED` **saem
   inteiros**. Substituir pela mesma forma já adotada em T17 para o outbox (é o protocolo que
   o repo passa a ter em um só lugar):
   ```sql
   -- (a) selecionar os ids elegíveis
   SELECT id FROM shared_scheduled_commands
    WHERE dead_at IS NULL
      AND run_at <= :now
      AND (lease_until IS NULL OR lease_until < :now)
      AND (repeat_every_ms IS NOT NULL OR attempts < max_attempts)
      AND name IN (:names)
    ORDER BY run_at LIMIT :batch;
   -- (b) leasear + contar a tentativa, por id
   UPDATE shared_scheduled_commands
      SET lease_until = :now + :leaseMs, attempts = attempts + 1, updated_at = :now
    WHERE id IN (:ids);
   -- (c) reler as linhas leaseadas
   SELECT id, name, input, attempts, max_attempts, repeat_every_ms
     FROM shared_scheduled_commands WHERE id IN (:ids);
   ```
   Os três statements rodam numa **única** tx `BEGIN IMMEDIATE` — **via `driver.transaction()`,
   nunca `db.transaction()`** (decisão (a): esse caminho vaza uma conexão nativa por chamada, e o
   claim loop é o chamador mais frequente do daemon — seria o maior vazador do processo).
   **E os TRÊS usam o parâmetro `tx` do callback — nenhum usa `this.db` (iteração 4).** Não é
   estilo: `this.db` é o handle de **leitura**, fora do `BEGIN IMMEDIATE`. Um `SELECT` de (a) ou
   (c) emitido nele lê as linhas **sem o lease** que (b) acabou de gravar — o claim entrega a
   mesma linha a dois ciclos, sem erro, sem tipo errado, sem teste reclamando. É a classe 3B de
   T13B, e é a forma mais fácil de errar esta reescrita justamente porque o arquivo hoje usa
   `this.db` em todo lugar. Ela é o que substitui o `FOR UPDATE SKIP LOCKED`: com `BEGIN IMMEDIATE` só um writer entra por vez, e
   o `lease_until` — não o lock — continua sendo o que sobrevive a crash. A semântica
   documentada em `:301-306` (**`attempts` = "execuções INICIADAS"**, incrementado no claim, não
   no erro) é **preservada literalmente** — é a proteção anti-crash-loop e não pode ser perdida
   na tradução. **É também o precedente que a decisão (d) adota para o outbox** (subseção
   "Crash-loop: `attempts` no claim"): depois desta fase os dois claimantes do processo têm a
   mesma semântica de `attempts`, e o comentário deste arquivo é a fonte citada por ambos.

   **As três escritas fora de tx (`:277`, `:333`, `:374`) também saem aqui.** São
   `this.db.update(...)`/`this.db.delete(...)` — classe 1 de T13B — e `this.db` agora é o handle
   de **leitura**. Passam a rodar por `driver.transaction()` como todo o resto.
3. **`runOne` (`:337`)** já usa o query builder (`db.update(...).set({ leaseUntil: null, updatedAt: new Date() })`)
   — esse caminho não tem pg-ismo e porta sem mudança.
4. **Borda de tipo.** No SQL cru os timestamps voltam como **number**. Converter para `Date` na
   fronteira do `ClaimedRow`, não deixar `number` vazar onde o tipo declara `Date`.
5. **Comentários.** Os docblocks de `:59` e `:301-306` citam `FOR UPDATE SKIP LOCKED`
   nominalmente. Reescrever para `BEGIN IMMEDIATE` + lease, preservando o **porquê** (a razão do
   `attempts` no claim é a parte que importa).

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
Q=packages/api/typescript/core/src/services/CommandQueue
! test -e $Q/PostgresCommandQueue.ts
test -e $Q/SqliteCommandQueue.ts
# (1) transporte — ESCOPADO ao cliente de banco (iteração 3).
#     `! grep -rn '\.rows'` casaria `batch.rows`/`this.rows`, que são propriedades de domínio.
#     Forma corrigida, RODADA: em $Q hoje dá 2 hits, ambos mortos por esta task
#     (PostgresCommandQueue.ts:291 `this.db.execute(` e :325 `return result.rows`).
! grep -rnE '\b(db|tx|client)\.execute\(|\b(result|res|rs)\.rows\b' $Q
# (2)(3)(4)(5) — os pg-ismos de RUNTIME, que nenhum compilador pega
#
# ⚠️ CORREÇÃO DA ITERAÇÃO 3 — a forma antiga `! grep -rnE '\bnow\(\)'` era INSATISFAZÍVEL junto
# com o `grep -rq 'Date.now()'` logo abaixo: o `\b` fica entre o `.` e o `n`, então `\bnow\(\)`
# CASA `Date.now()`. Rodado:
#   $ printf 'const now = Date.now()\n' > /tmp/b3.ts && grep -nE '\bnow\(\)' /tmp/b3.ts
#   1:const now = Date.now()                      ← os dois ACs não podiam passar juntos
# Forma correta (a MESMA usada pelo gate repo-wide de T23 — agora as duas concordam), rodada
# no diretório real:
#   $ grep -rnE '(^|[^.A-Za-z_])now\(\)' $Q | wc -l   → 5   (os 5 now() de SQL: :293 :297 :311 :312 :320)
#   $ grep -rnE '\bnow\(\)'              $Q | wc -l   → 9   (os 5 + 4 linhas de Date.now())
#   $ printf 'const now = Date.now()\nconst p = performance.now()\n' > /tmp/b3c.ts
#   $ grep -cE '(^|[^.A-Za-z_])now\(\)' /tmp/b3c.ts   → 0   (Date.now()/performance.now() ilesos)
! grep -rnE '(^|[^.A-Za-z_])now\(\)' $Q
! grep -rn "interval '" $Q
! grep -rn 'FOR UPDATE' $Q
! grep -rn 'SKIP LOCKED' $Q
! grep -rnE 'UPDATE[^;]*\bFROM\b' $Q
# nem os "consertos" errados de relógio (unidade incompatível com timestamp_ms)
! grep -rnE 'unixepoch|CURRENT_TIMESTAMP' $Q
# o relógio vem do JS — e este AC agora CONVIVE com o negativo acima (era o defeito [B3])
grep -rq 'Date.now()' $Q
# a semântica anti-crash-loop sobreviveu: attempts incrementado NO CLAIM
grep -rq 'attempts + 1' $Q
grep -rqiE 'executions STARTED|execuções INICIADAS' $Q   # o PORQUÊ segue escrito, não só o código
# e a escrita fora de tx (classe 1 de T13B) sumiu deste arquivo — as 3 linhas :277 :333 :374
! grep -rnE 'this\.db\.(insert|update|delete)\(' $Q
( cd packages/api/typescript && bun test tests/kernel/SqliteCommandQueue.test.ts )
```
O teste tem que cobrir, além do que já cobria: um comando `run_at` no futuro **não** é claimado
(prova que a comparação de epoch-ms está certa e não invertida por unidade); dois ciclos de
claim concorrentes não entregam a mesma linha duas vezes; lease expirado re-claima e
`attempts` avança; comando não-repetível com `attempts >= max_attempts` e lease expirado vira
dead-letter em vez de re-claim.

---
#### T17 — `DrizzleOutboxDispatcher`: lane + lease (a reescrita crítica)

**Arquivos:** `packages/api/typescript/core/src/services/OutboxDispatcher/DrizzleOutboxDispatcher.ts`.

**O que muda** — reescrita do claim para o protocolo Go **verbatim** (decisão (d)):

0. **Sweep de poison, no início do ciclo** (decisão (d), subseção "Crash-loop"). Antes do claim:
   `UPDATE shared_outbox SET processed_at = :now, claimed_by = NULL, last_error = 'poison: exceeded attempts without finalize'
    WHERE source = 'api' AND processed_at IS NULL AND attempts >= 5 AND lease_until < :now`.
   Sem ele, a linha que queimou o orçamento crashando fica presa (nem claimável, nem terminal) e
   invisível. Espelha o sweep que `PostgresCommandQueue.ts:286-299` já tem, pelo mesmo motivo.
1. `claimBatch()` (~131-168):
   - **adicionar** `source = 'api'` ao predicado (hoje `grep source` neste arquivo dá **0** —
     é este o bug de perda de dados);
   - **`attempts < MAX_ATTEMPTS` PERMANECE no claim, e o `UPDATE` de claim INCREMENTA `attempts`.**
     ⚠️ Isto **inverte** o que as iterações 1 e 2 mandavam ("remover `attempts < MAX_ATTEMPTS`").
     Motivo em decisão (d), subseção "Crash-loop: `attempts` no claim": sem isso, um evento cujo
     dispatch **mata o processo** nunca chega ao `finalize`, é re-claimado a cada 30s e mata o
     daemon para sempre. `attempts` passa a significar **"entregas INICIADAS"**, idêntico ao
     `CommandQueue` (`PostgresCommandQueue.ts:301-306`, que documenta o incidente que gerou a
     regra). O predicado **terminal** continua sendo só `processed_at IS NOT NULL`; `attempts < 5`
     é **teto de crash-loop**, não estado terminal;
   - predicado final: `source = 'api' AND processed_at IS NULL AND attempts < 5 AND (lease_until IS NULL OR lease_until < :now)`;
   - **remover** `.for('update', { skipLocked: true })` (`:141`) — não existe em sqlite-core e
     o lease o substitui;
   - claim = `UPDATE … SET claimed_by = :token, lease_until = :now + 30000, attempts = attempts + 1`
     (token uuid v4 por ciclo), seguido de `SELECT … WHERE claimed_by = :token ORDER BY created_at`;
   - `ORDER BY created_at` é a ordem de claim (não mais `ownerId, createdAt`); o agrupamento por
     owner vira **pós-claim em memória**, como já é feito logo abaixo;
   - a tx do claim roda por **`driver.transaction()`** (nunca `db.transaction()` — decisão (a)) e
     **commita antes** de qualquer dispatch. Sob o `TxGate` isso deixou de ser boa prática e virou
     obrigação de vida: despachar de dentro do claim faria o handler esperar pelo mutex que a
     própria transação segura — deadlock determinístico.
2. `finalize()` (~224-260):
   - sucesso: `UPDATE … SET processed_at = :now, claimed_by = NULL` — **parar de deletar**
     (`tx.delete(outbox)` sai);
   - falha com `attempts < 5` (o valor **já incrementado no claim**): `UPDATE … SET last_error`
     — **manter o lease** (backoff natural de 30s), **e NÃO incrementar `attempts`** (o claim já
     cobrou; incrementar de novo cortaria o orçamento pela metade); parar de setar
     `processedAt: null`;
   - falha com `attempts >= 5`: `+ processed_at = :now, claimed_by = NULL`;
   - **skip: só `last_error`.** O ramo de skip escreve
     `UPDATE … SET last_error = 'skipped: predecessor failed' WHERE id = :id` e **nada mais** —
     não toca `claimed_by`, não toca `lease_until`, não toca `attempts`. A linha pulada conserva
     o **mesmo lease** da que falhou (vieram do mesmo `UPDATE` de claim, mesmo token, mesmo
     `lease_until`), então o lote do owner expira junto. Escrever `last_error` é o único delta da
     iteração 3 sobre o "no-op" da iteração 2, e existe para o operador conseguir distinguir
     "pulado" de "falhou" — a propriedade de ordenação é idêntica.

   > **Isto é correção, não simplificação — leia antes de "consertar".** A invariante declarada
   > em `:153,172` é ordenação **sequencial por owner**. Soltar o lease no skip (o que a
   > iteração 1 mandava fazer) faz a **sucessora pulada** voltar a ser claimável no ciclo
   > seguinte — e `flush()` recursa **na hora** — enquanto a **predecessora que falhou** segue
   > leaseada por 30s de backoff. Resultado: evento posterior do owner X entregue **antes** do
   > retry do anterior. Mantendo o lote inteiro do owner leaseado junto, ele expira junto, é
   > re-claimado junto e o `ORDER BY created_at` restabelece a ordem. Ver decisão (d) e o caso 8
   > de T29.
3. `flush()` recursivo: **re-verificar** que ainda termina. Terminação passa a ter **duas**
   garantias independentes: o lease (linha falha **e suas puladas** ficam leaseadas 30s; linha
   morta vira tombstone) **e** o `attempts < 5` que voltou ao claim. Com o skip sem soltar lease,
   nenhuma linha do lote volta ao pool imediatamente. Adicionar um teto de iterações defensivo e
   logar se bater.
4. **Qualificar a invariante de ordenação no docblock (`:153,172`) — decisão (d).** O texto atual
   promete "owner-sequential" sem qualificador, e isso é **falso fora do lote de claim**. Passa a
   dizer, explicitamente, que a ordem é preservada **dentro de um lote** e que dois casos a
   invertem: (i) mais de `BATCH_SIZE` pendentes na lane, e (ii) evento escrito por um handler
   **durante** o mesmo flush. Sem essa qualificação a próxima pessoa lê a invariante como
   garantia global e constrói em cima dela.
5. Constantes: `LEASE_MS = 30_000`, `BATCH_SIZE = 50` (já é), `MAX_ATTEMPTS = 5` (já é) —
   alinhadas com `sqlite_outbox_dispatcher.go:19,22,24`.
   <!-- iteração 6: este item vinha numerado `4`, colidindo com o item de docblock acima. -->


**AC.**
> **⚠️ O QUE ESTES GREPS PROVAM, E O QUE NÃO PROVAM (iteração 5).** Os dois ACs estruturais mais
> importantes deste bloco são **redes baratas, não cobertura**:
> - `grep -q "source" $F` — RODADO no HEAD ⇒ **0** ocorrências, então ele *detecta* o predicado
>   de lane hoje. Mas passa em **qualquer** prosa que contenha a palavra: um comentário
>   `// the source lane` satisfaz o AC sem que o `WHERE` exista.
> - `! grep -qE "leaseUntil: *null|lease_until *= *NULL" $F` — RODADO no HEAD ⇒ **0**. Um
>   negativo que já vale zero no HEAD não pode *pegar* nada: um ramo de skip que solte o lease
>   com outra grafia (`.set({ leaseUntil: undefined })`, `.set({` quebrado em várias linhas,
>   `leaseUntil : null`) passa direto.
>
> **A prova de que o skip preserva o lease é o CASO 8 de T29** (falha + skip no mesmo owner,
> asseverando a ordem de entrega no ciclo seguinte) — não estes greps. Se T29 caso 8 não estiver
> escrito, esta task **não está pronta**, mesmo com o bloco abaixo inteiro verde.

```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
F=packages/api/typescript/core/src/services/OutboxDispatcher/DrizzleOutboxDispatcher.ts
grep -q "source" $F                       # rede barata; RODADO no HEAD: 0 ocorrências
grep -q "claimed_by\|claimedBy" $F
grep -q "lease_until\|leaseUntil" $F
! grep -q "for('update'" $F
! grep -q "tx.delete(outbox)" $F
# ⚠️ INVERTIDO na iteração 3: `attempts` VOLTA ao claim e é INCREMENTADO lá (anti-crash-loop,
# decisão (d)). O AC antigo (`! grep -q "attempts} < "`, "attempts saiu do claim") reprovaria a
# implementação correta e está REMOVIDO.
grep -qE 'attempts *\+ *1|attempts = attempts \+ 1' $F   # o claim cobra a tentativa
grep -q "poison" $F                                      # o sweep de poison existe
grep -qiE 'executions STARTED|entregas INICIADAS' $F     # o significado está escrito
# o ramo de skip NÃO solta o lease (seria a regressão de ordenação owner-sequencial).
# `leaseUntil: null` / `lease_until = NULL` só existiria no skip — sucesso e dead-letter zeram
# APENAS claimed_by.
# ⚠️ REDE BARATA, NÃO COBERTURA (iteração 5): RODADO no HEAD ⇒ 0 hits, ou seja o negativo já vale
# zero HOJE e portanto não pode pegar uma soltura escrita com outra grafia. A PROVA é T29 caso 8.
! grep -qE "leaseUntil: *null|lease_until *= *NULL" $F
# a razão está escrita no arquivo, para ninguém "simplificar" o no-op de volta
grep -qiE 'owner-sequential|sequencial por owner' $F
# …E a invariante está QUALIFICADA (decisão (d)): a garantia é intra-lote. Sem isto o docblock
# promete ordem global, que é falsa quando a lane tem >BATCH_SIZE pendentes.
grep -qiE 'within a claim batch|dentro de um lote|intra-lote|per claim batch' $F
# a escrita passa pelo seam do driver, nunca pelo caminho banido do drizzle
! grep -q 'db\.transaction(' $F
( cd packages/api/typescript && bun test core/src/services/OutboxDispatcher/ )
```
Mais o teste de lanes de T29 (**em especial o caso 8**, falha + skip no mesmo owner), que é a
prova real.

---

#### T18 — `SqlExternalMediator` TS (ingress da lane `integration`)

**Arquivos:** `packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts` (novo),
`core/src/services/Mediator/index.ts`, `src/shared/registry.ts` (binding do `ExternalMediator`
real: `RedisExternalMediator` → `SqlExternalMediator`).

**O que muda.** Gêmeo TS de `packages/api/go/core/services/mediator/sql_external_mediator.go`:

- `drainOnce()` claima com o **mesmo** protocolo de T17, mas lane `integration` **e** filtro
  `AND name IN (:handlerNames)` — onde `handlerNames` são os nomes de handler externo
  registrados. Sem handler registrado ⇒ devolve 0 sem claimar (espelha `:213-216` do Go).
- **`finalize()` — o mesmo protocolo de desfecho, não só o de claim.** A iteração 1 especificava
  só o claim; sem finalize a linha ingerida com **sucesso** continuaria com `processed_at IS
  NULL` e voltaria a ser claimada a **cada** expiração de lease, para sempre. O mediator reusa
  **a mesma tabela de desfechos da decisão (d)**, verbatim, exatamente como o gêmeo Go já faz
  (`sql_external_mediator.go:364,376,387`):
  - sucesso → `UPDATE … SET processed_at = :now, claimed_by = NULL WHERE id = :id` (tombstone);
  - falha com `attempts < 5` → `UPDATE … SET last_error = :err` (**mantém** o lease: backoff de
    30s);
  - falha com `attempts >= 5` → `+ processed_at = :now, claimed_by = NULL` (dead-letter).
  - **Sem ramo de skip:** a lane `integration` não agrupa por owner (o Go também não), então a
    ordenação owner-sequencial e seu skip são exclusivos do dispatcher da lane `api`.
  - **`attempts` é incrementado NO CLAIM aqui também, mais o sweep de poison** (decisão (d),
    subseção "Crash-loop"). Um evento de ingress que mate o processo tem exatamente o mesmo
    modo de falha que um de domínio — e este é o caminho por onde entram os eventos do
    **gateway**, isto é, os que carregam payload que o daemon TS nunca validou. Se algum dos
    dois claimantes fosse ficar sem teto de crash-loop, seria justamente o errado.
- **`publish()` NÃO insere linha.** Eventos de integração TS já viajam na lane `api` via
  `saveIntegrationEvent` (`DrizzleDomainEventRepository.ts:219,231`); uma segunda linha
  entregaria em dobro. `publish()` faz o fan-out in-process e nada mais.
- **Reviver de datas (obrigatório).** Ler `payload` como **TEXT cru** e fazer
  `JSON.parse(raw, reviveIsoDates)`. Reutilizar `ISO_DATETIME_RE` + `reviveIsoDates` de
  `RedisExternalMediator.ts:329-336` (extrair para módulo compartilhado). **Não** confiar no
  `text({ mode: 'json' })` do drizzle: ele faz parse sem reviver e toda entrada `z.date()`
  rejeita a string.
- Manter `adaptWireEnvelope` (pass-through para o shape de outbox) e despachar via
  `handler.execute(envelope)` — o ingress é um `ExternalMediator`, não uma extensão do
  dispatcher.
- **Poll capado em 2s** (espelha `sqlite_wal_polling_strategy.go:28-33`), não os 30s do
  dispatcher de domínio.
- `RedisExternalMediator` permanece no tree por ora (não é escopo desta fase removê-lo), mas
  deixa de ser o binding `real`. Depois de T23 nada mais o referencia — a deleção dele, do
  `ioredis` e do serviço `redis` do compose é o follow-up **nomeado** da questão aberta 10.

##### A carve-out `CODEDM_E2E` MORRE aqui (decisão desta task)

`registry.ts:114` faz
`realExternalMediator = CODEDM_E2E === 'true' ? EventEmitter2Mediator : RedisExternalMediator`,
e o docblock de `:105-113` justifica a exceção com uma razão **exclusivamente de transporte**:
o harness Playwright sobe **só** o daemon TS, então não há gateway Go do outro lado do Redis —
*"no Redis socket, no network beyond localhost"*.

**Essa razão evapora nesta task.** O binding `real` passa a ser `SqlExternalMediator`: dispatch
in-process + polling de um arquivo local. **Zero socket, zero rede, zero gateway necessário** —
exatamente as propriedades que motivavam a carve-out. Mantê-la teria um custo concreto e
silencioso: `bun e2e` (que é AC de T27) continuaria rodando o mediator antigo e **nunca**
tocaria a ingress nova — nem o filtro de lane, nem o reviver de datas, nem o cap de poll de 2s,
que são os três itens de maior risco da decisão (d). O e2e viraria uma cerimônia verde sobre
código que não existe mais.

**Decisão:**
1. **Remover a carve-out.** `realExternalMediator = SqlExternalMediator` em **todos** os
   ambientes, `CODEDM_E2E` incluso. Deletar o ternário de `:114` e reescrever o docblock de
   `:105-113`. Na prática o `const realExternalMediator` deixa de ter razão de existir: o
   binding vira `real: SqlExternalMediator` direto.

##### O modo `integration:` do `ExternalMediator` — DECIDIDO, não deixado ao executor

> **Buraco da iteração 4, fechado na iteração 5.** A task mandava trocar o binding `real` e
> nada dizia sobre `integration:`, que `registry.ts:145` **pina explicitamente** em
> `EventEmitter2Mediator` — com uma justificativa (`:141-144`) que é meio verdade e meio
> obsoleta depois desta task. Sem decisão escrita, o executor adivinha no meio da janela
> vermelha, e as duas escolhas quebram coisas diferentes.

`registry.ts:145` é hoje
`{ token: ExternalMediator, mock: MockExternalMediator, integration: EventEmitter2Mediator, real: realExternalMediator }`,
e o docblock de `:141-144` dá **dois** motivos para o pin: (i) "integration tests must never open
a Redis socket" e (ii) "TestBed swaps in a SpyMediator for both mock and integration anyway — so
this pin only guards a stray non-TestBed resolve".

O motivo (i) **evapora** com o `SqlExternalMediator` (zero socket). O motivo (ii) **continua
inteiro**. E surge um motivo **novo**, específico desta fase: o `SqlExternalMediator` faz
**polling** (cap de 2s). Um resolve fora do TestBed numa suite de integração ligaria um timer de
2s sobre o arquivo temporário do driver, que sobrevive ao `afterAll` da suite e vira ruído
(escritas em banco fechado, logs, flakiness) — exatamente a classe de estrago que o pin existe
para evitar.

**Decisão: o pin FICA, e o docblock é reescrito com o motivo NOVO.**
`integration: EventEmitter2Mediator` permanece; o texto passa a dizer "não é sobre socket — é
sobre não ligar um poller de 2s numa suite" e a citar o TestBed/SpyMediator como a razão de o
pin ser inofensivo. **Consequência direta para o AC:** `EventEmitter2Mediator` **continua no
`registry.ts` por design** — ver o gate reescrito abaixo.
2. **`TestIngressController` sobrevive, com o papel corrigido.** Ele continua sendo o simulador
   do gateway (o harness não sobe o Go), mas deixa de **publicar direto no mediator in-process**
   e passa a **inserir a linha `source='integration'` em `shared_outbox`**, com o envelope
   aninhado do Go e o payload como TEXT — que é literalmente o que o gateway faz. Assim o
   caminho exercitado pelo e2e é o **mesmo** de produção: linha → claim por lane → reviver →
   `handler.execute`. O upsert direto de `channel-connected` (que simula o projector Go, não um
   evento) fica como está.
3. O docblock de `:105-113` e o do controller são reescritos para dizer isso — os dois citam
   "Redis Streams" e `EventEmitter2Mediator` nominalmente, e virariam desinformação.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
F=packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts
grep -q "reviveIsoDates" $F
grep -q "source" $F && grep -q "integration" $F
grep -q "name IN\|inArray" $F
grep -q "2_000\|2000" $F                  # cap de poll
# NENHUM caminho de saída escreve no outbox — o seam real é dispatch() (o que o
# DrizzleOutboxDispatcher:195 chama); publish() é checado junto caso exista como alias.
# NOTA POSIX (iteração 3): `\s` não é ERE; neste macOS o awk NÃO casa e o range nunca abre,
# então `! awk … | grep -q` passa VAZIO — ou seja, o AC "passava" sem inspecionar nada.
# Verificado:  awk '/x\s*\(/,…' → vazio   |   awk '/x[[:space:]]*\(/,…' → casa.
! awk '/dispatch[[:space:]]*\(/,/^\t}/' $F | grep -q "insert("
! awk '/publish[[:space:]]*\(/,/^\t}/'  $F | grep -q "insert("
grep -q "dispatch" $F                     # implementa o método da interface ExternalMediator
# finalize: os três desfechos da decisão (d) existem nesta classe, não só o claim
grep -q "processed_at\|processedAt" $F
grep -q "last_error\|lastError"     $F
grep -qE "attempts *\+ *1|attempts: *[a-z]+ *\+ *1" $F
# --- registry.ts: a carve-out CODEDM_E2E morre, o binding real vira SqlExternalMediator ---
R=packages/api/typescript/src/shared/registry.ts
#
# ⚠️ GATE REESCRITO NA ITERAÇÃO 5. A forma da iteração 4 era `! grep -q "EventEmitter2Mediator" $R`
# e era INSATISFAZÍVEL — mesma classe do `.execute(` que a iteração 3 escopou: nome nu sobre um
# arquivo que LEGITIMAMENTE é dono do nome. RODADO no HEAD:
#   $ grep -n 'EventEmitter2Mediator' packages/api/typescript/src/shared/registry.ts
#   15:  EventEmitter2Mediator,                                                    (import)
#   110: // EventEmitter2Mediator — no Redis socket, no network beyond localhost…   (docblock)
#   114: const realExternalMediator = process.env.CODEDM_E2E === 'true' ? EventEmitter2Mediator : RedisExternalMediator
#   141: // PINNED to the in-process EventEmitter2Mediator (it would otherwise mirror `real`)… (docblock)
#   145: { token: ExternalMediator, mock: MockExternalMediator, integration: EventEmitter2Mediator, real: realExternalMediator }
#   ⇒ 5 hits. `:137` (não listado acima, mesmo arquivo) é
#      { token: InternalMediator, mock: EventEmitter2Mediator, real: EventEmitter2Mediator }
#   — o EventEmitter2Mediator É a implementação do InternalMediator em mock E real. Passar aquele
#   AC significava DELETAR O BARRAMENTO DE EVENTOS INTERNO. T18 só mata o ternário de :114.
#   Escopo correto: asseverar o BINDING, não o nome.
#
# o que MORRE — e note que os três negativos são ESCOPADOS A $R, não repo-wide:
#   `realExternalMediator` → 2 hits no HEAD (:114 decl, :145 uso); ambos morrem.
#   `CODEDM_E2E`           → 2 hits no HEAD (:109 docblock, :114 ternário); ambos morrem AQUI.
#     ⚠️ A FLAG NÃO MORRE NO REPO. RODADO (iteração 6, contagem corrigida e ESCOPADA A `src/`):
#       $ grep -rn CODEDM_E2E packages/api/typescript/src | wc -l   ⇒ 18
#       $ grep -rn CODEDM_E2E packages/api/typescript     | wc -l   ⇒ 23
#     A diferença são **5 hits em `packages/api/typescript/dist/server.js`** — bundle STALE,
#     gitignorado (`.gitignore:37`), que entra na contagem só porque a busca começa ABAIXO do
#     `.gitignore` da raiz (ver a regra de runtime de `grep` em §8). A iteração 5 colou `17`, que
#     não é nenhum dos dois. **O número deste plano é 18 (src/).** Entre elas
#     `src/boot.ts:23` (guard fail-closed sob NODE_ENV=production),
#     `src/shared/index.ts:34` (é o que MONTA o TestIngressController) e
#     `src/terminal/registry.ts:18` (stub do LLM runner). Nenhuma delas é escopo desta task —
#     não "limpar a flag" para satisfazer o gate.
#   `RedisExternalMediator` → 4 hits no HEAD; a CLASSE continua no tree (a deleção dela é o
#     follow-up nomeado da questão aberta 10), só deixa de ser referenciada por este arquivo.
! grep -q "realExternalMediator" $R
! grep -q "CODEDM_E2E" $R
! grep -q "RedisExternalMediator" $R
# o que NASCE: o binding real do ExternalMediator é o SqlExternalMediator
grep -q "SqlExternalMediator" $R
grep -qE "token: ExternalMediator.*real: SqlExternalMediator" $R
# o que FICA POR DESIGN (ver a subseção "O modo integration:" acima) — asseverado POSITIVAMENTE
# para que ninguém "limpe" o EventEmitter2Mediator tentando satisfazer um gate de resíduo:
grep -qE "token: InternalMediator.*EventEmitter2Mediator" $R
grep -qE "token: ExternalMediator.*integration: EventEmitter2Mediator" $R
# e o docblock do pin foi reescrito com o motivo NOVO (poller de 2s), não com o velho (socket)
awk '/token: ExternalMediator/{exit} {print}' $R | tail -20 | grep -qiE 'poll|2s|2_000|timer'
# o simulador de gateway agora ESCREVE NA LANE, em vez de publicar in-process.
# RODADO no HEAD: `.insert(` ⇒ 1 (o upsert de channel-connected que FICA);
# `externalMediator.publish(` ⇒ 1 (`:115`, o que morre); `EventEmitter2` ⇒ 1 (`:24`, docblock que
# o item 3 da decisão manda reescrever). Logo `.insert(` passa a 2 — é este o T18_DELTA=1 que T21
# consome.
I=packages/api/typescript/src/shared/controllers/TestIngressController.ts
grep -q "shared_outbox\|outbox" $I
grep -q "integration" $I
test "$(grep -c '\.insert(' $I | tr -d ' ')" = "2"
! grep -q "externalMediator.publish\|EventEmitter2" $I
( cd packages/api/typescript && bun test core/src/services/Mediator/SqlExternalMediator.test.ts )
```

---

#### T19 — `DrizzleDomainEventRepository` e os pg-ismos de SQL cru

**Arquivos:** `packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.ts`
(11 inserts; `:53` `ON CONFLICT DO NOTHING`; `:88` `count(*)::int`; `:194,206,219,231` os
`toPersistence`/`toOutboxRow`).

**O que muda.**
- `sql<number>\`count(*)::int\`` → `sql<number>\`count(*)\`` (SQLite não tem cast `::`; o
  driver já devolve number).
- `onConflictDoNothing()` existe em sqlite-core com a mesma forma — confirmar, não reescrever
  em SQL cru.
- `source: 'api'` nos 4 sites (`:194,206,219,231`) passa a referenciar a constante gerada de
  T02, não o literal.
- `occurredAt`/`createdAt` agora vêm do `$defaultFn` de T03; **manter** os valores explícitos
  onde já existem (o evento tem hora própria, não hora de insert) — só remover onde o valor
  era gerado pelo banco.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
# RODADO no HEAD: exatamente 1 hit — DrizzleDomainEventRepository.ts:88 (`count(*)::int`), que é
# justamente o que esta task reescreve. O gate vai a zero pelo trabalho dela.
! grep -rn "::int\|::uuid\|::timestamptz\|::text" packages/api/typescript/core/src --include='*.ts' | grep -v node_modules
# ⚠️ ASSERTIVA, não impressão (iteração 5): a forma anterior era `grep -c …`, que IMPRIME a
# contagem — resíduo do "print and look" que a própria § "Higiene de AC" declara eliminado.
# São 4 os sites de `source: 'api'` (`:194,206,219,231`), logo o piso é 4 referências ao enum
# gerado; o `-ge` deixa espaço para o import e para eventuais usos adicionais.
R=packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.ts
test "$(grep -c 'OutboxSource\|outboxSource' "$R" | tr -d ' ')" -ge "4"
# e o literal de lane não sobra neste arquivo (o ponto de T02 item 2, aplicado ao lado TS)
! grep -qE "source: *'api'" "$R"
( cd packages/api/typescript && bun test core/src/repositories/ )
```

---

#### T20 — `GetAttachThreadWizard`: cursor keyset sem casts pg

**Arquivos:** `packages/api/typescript/src/ui/usecases/GetAttachThreadWizard.ts`
(`:2`, `:159`, `:162`, `:164-189`, `:206`),
`packages/api/typescript/src/ui/usecases/GetAttachThreadWizard.test.ts` (**criar se não
existir** — hoje NÃO existe).

> **Iteração 6.** O AC abaixo roda `bun test src/ui/usecases/GetAttachThreadWizard.test.ts` e
> **nenhuma** task do plano criava esse arquivo. MEDIDO no HEAD:
> `$ ls packages/api/typescript/src/ui/usecases/` ⇒ `BffReads.test.ts GetAttachThreadWizard.ts
> GetHomeDashboard.ts GetMyAccount.ts GetSettings.ts GetSetupChecklist.ts GetUserInfo.test.ts
> GetUserInfo.ts index.ts` — sem o `.test.ts` do wizard; e
> `$ ( cd packages/api/typescript && bun test src/ui/usecases/GetAttachThreadWizard.test.ts )` ⇒
> `note: Tests need ".test", "_test_"… / To treat … as a path, run "bun test ./…"`, **`EXIT=1`**.
> O arquivo é agora deliverable declarado da task (mesmo padrão de T14/T15); a lista de casos
> exigidos está logo abaixo do AC.

**O que muda.** O cursor keyset é a única query com pg-ismo pesado. **Cinco** pontos — o
quinto (`ilike`) é o mais perigoso porque **compila**:

0. **`:162` — `ilike()` (SILENT BREAK, prioridade máxima).**
   `filters.push(ilike(remotes.name, '%…%'))`, importado em `:2`. O `ilike` do drizzle-orm é
   declarado no módulo de condições **dialect-neutral**
   (`export declare function ilike(column: Column | SQL.Aliased | SQL, value): SQL`), então
   **compila perfeitamente** contra sqlite-core e emite `ILIKE` — que o SQLite **rejeita em
   runtime**. Resultado: a busca do wizard morre em produção sem nenhum sinal em `tsc`.
   Substituir por `like(lower(remotes.name), '%' + termo.toLowerCase() + '%')` — ou, mais
   simples, `like()` puro, já que **`LIKE` do SQLite é case-insensitive por padrão para ASCII**.
   Escolher explicitamente e comentar a escolha; se o nome puder ter não-ASCII, `lower()` nos
   dois lados é a forma correta. Trocar o import de `ilike` por `like` em `:2`.

   > **Este achado é o sinal de uma varredura incompleta.** A varredura de pg-ismos anterior foi
   > um grep por casts `::` — por isso `now()`, `interval '…'`, `FOR UPDATE` e `ilike` passaram
   > todos batidos. T23 ganha um gate repo-wide para essa classe inteira; ver lá.

1. `:159` — `COALESCE(${remotes.lastMessageAt}, 'epoch'::timestamptz)` →
   `COALESCE(${remotes.lastMessageAt}, 0)`. No `schema-sqlite`, timestamp é
   `integer{timestamp_ms}`, então o sentinela "epoch" é literalmente **`0`**.
2. `:169-171` — remover **todos** os `::timestamptz` e `::uuid`. A comparação passa a ser
   numérica (`sortKey`) e textual (`channelId`, `remoteId`), que é o que SQLite faz
   naturalmente. A tupla de desempate `(sortKey DESC, channelId ASC, remoteId ASC)` **não
   muda**.
3. `decodeCursor`/`encodeCursor` — o campo `sk` deixa de ser string ISO e passa a ser
   **epoch ms (number)**. O cursor é opaco na API, mas **é serializado e devolvido ao
   cliente**: um cursor emitido pelo build antigo não decodifica no novo. Aceitável (cursor é
   por-sessão, sem persistência), mas a decodificação tem que **falhar limpo**
   (`VALIDATION_ERROR`, não crash) num cursor de formato antigo. Adicionar guarda.
4. `:206` — `sql<number>\`count(*)::int\`` → `sql<number>\`count(*)\``.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
F=packages/api/typescript/src/ui/usecases/GetAttachThreadWizard.ts
! grep -q "::timestamptz\|::uuid\|::int" $F
! grep -qw "ilike" $F                     # nem o import de :2, nem o uso de :162
grep -qw "like" $F
grep -q "COALESCE" $F
# ⚠️ arquivo NOVO, deliverable DESTA task (ver Arquivos). No HEAD ele não existe e o comando sai 1.
( cd packages/api/typescript && bun test src/ui/usecases/GetAttachThreadWizard.test.ts )
```
O teste tem que cobrir: página 1 → cursor → página 2 sem sobreposição nem buraco; empate de
`sortKey` desempatado por `(channelId, remoteId)`; `lastMessageAt` nulo ordenando por último;
cursor malformado ⇒ erro tipado; **e a busca por `search` de fato retornando linha, com
diferença de caixa entre o termo e o nome armazenado** (é o único assert que teria pego o
`ilike` — o caminho de busca precisa ser **executado**, não só compilado).

---

#### T21 — AUDITORIA DOS SITES DE INSERT (parte 2: os 14 ids + verificação dos 31 sites)

Esta é a task que o scout chamou de "SILENT BREAKS" e é a de maior densidade de bug: são
falhas de **runtime** (`NOT NULL constraint failed`) sem nenhum erro de tipo, porque hoje o
tipo de insert marca a coluna como opcional por causa do default pg que o `schema-sqlite` não
tem.

**Decisão já tomada em T03** (repetida aqui porque é o coração desta task): os **36
timestamps** são resolvidos no schema via `$defaultFn` (sem migration, sem tocar o Go); os
**14 ids** são resolvidos **no código**, explicitamente, no site de insert. Nunca
`$defaultFn(randomUUID)` num id.

**Procedimento (executar na ordem, é uma auditoria, não um refactor cego):**

1. Gerar a lista canônica das 14 tabelas com id gerado no banco:
   ```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
   grep -rn "defaultRandom()" packages/contracts/db/schema/*.ts
   ```
   → `artifact.ts:18`, `channel.ts:61`, `issue.ts:26,65,91`, `infrastructure.ts:9,43`,
   `terminal.ts:19`, `owner.ts:25`, `workspace.ts:20`, `thread.ts:41,88,130,156`.
2. Gerar a lista canônica dos **31 sites de insert em 20 arquivos**:
   ```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
   grep -rn "\.insert(" packages/api/typescript/src packages/api/typescript/core/src \
     --include='*.ts' | grep -v "\.test\.ts"
   ```
   Distribuição verificada: `DrizzleDomainEventRepository.ts` (11),
   `SqliteCommandQueue.ts` (2), e 1 cada em `DrizzleWorkspaceRepository`,
   `DrizzleTranscriptRepository`, `DrizzleThreadRepository`, `DrizzleConsumedMessageRepository`,
   `DrizzleClarificationRepository`, `DrizzleTerminalLLMSessionRepository`,
   `TestIngressController`, `DrizzleOwnerRepository`, `DrizzleTerminalLineRepository`,
   `DrizzleStopRepository`, `DrizzleStopPolicyConfigRepository`, `DrizzleIssueRepository`,
   `DrizzleUserRepository`, `DrizzleUserProfileRepository`, `DrizzleAccountRepository`,
   `DrizzleArtifactRepository`, `DrizzleIdempotencyGuard`, `saveWithOptimisticLock`.
3. **Cruzar as duas listas.** Para cada site que escreve numa das 14 tabelas, confirmar que o
   objeto de `values()` traz `id` explícito. Onde não trouxer: o id vem do agregado
   (`entity.id.value`) — passar; se não houver agregado (tabela de infra), cunhar com
   `crypto.randomUUID()` **no repositório**, nunca no schema.

   **O cruzamento não fica como "inspeção manual assistida".** O entregável mecânico é uma
   tabela markdown em `.plans/artifacts/2026-07-26-insert-audit.md`, uma linha por site:
   `arquivo:linha | tabela | id explícito? (sim/n/a) | origem do id | veredito`. O AC assevera
   que a tabela tem **exatamente 31 linhas de dados** e **zero** vereditos pendentes — assim a
   completude da varredura é verificável por comando, não por confiança.
4. **Caso confirmado pelo scout, tratar primeiro:** `DrizzleIdempotencyGuard.ts:32` insere sem
   `createdAt` contra `schema-sqlite/infrastructure.ts:69` (`notNull`, sem default). Depois de
   T03 isso é coberto pelo `$defaultFn`; **verificar** e não "consertar duas vezes".
5. Para cada um dos 20 arquivos, rodar o teste de repositório correspondente. Onde não existir
   teste que exercite `save()` de entidade nova, **criar** — este é o único jeito de pegar
   `NOT NULL` de runtime.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5) — o resto do bloco é relativo à raiz
# 1) nenhuma coluna notNull sem default e sem $defaultFn é omitida: prova por execução.
#    NOTA zsh: NÃO usar globs `**` crus no argumento — sem match o shell aborta antes do bun.
#    Passar diretórios (o bun test descobre recursivamente) ou citar o padrão.
#    ⚠️ SUBSHELL (iteração 5): na iteração 4 era `cd X && bun test …` solto, e as linhas
#    seguintes (`packages/contracts/db/schema-sqlite/*.ts` — glob que sob zsh ABORTA sem match —
#    e `.plans/artifacts/…`) rodavam de dentro de packages/api/typescript.
( cd packages/api/typescript && bun test src core/src/repositories )
# 2) nenhum id gerado por $defaultFn (0 linhas)
test "$(grep -rn '\$defaultFn' packages/contracts/db/schema-sqlite/*.ts | grep -icE '\bid\b' | tr -d ' ')" = "0"
# 3) as 14 tabelas: todo insert passa id — ASSERTIVO, e SEM número absoluto de cabeça.
#
# ⚠️ CORREÇÃO DA ITERAÇÃO 3: o AC antigo cravava `= "31"`, e **T18 — que roda ANTES, no mesmo
# bloco 2 — invalida esse número**: ele troca `externalMediator.publish(...)` por um INSERT da
# linha `source='integration'` no `TestIngressController`, ou seja **+1 site**. Um absoluto
# escrito de memória reprova a execução correta.
# Medido no HEAD (o "antes", sem T18):
#   $ grep -rn '\.insert(' packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v '\.test\.ts' | wc -l
#   31
# Portanto o alvo é 31 + o delta de T18. Expresso como delta explícito, não como constante:
INSERTS_AT_HEAD=31            # medido; se o HEAD mudar, re-medir e atualizar ESTA linha
T18_DELTA=1                   # TestIngressController: publish() in-process → INSERT na lane
EXPECTED=$(( INSERTS_AT_HEAD + T18_DELTA ))
ACTUAL="$(grep -rn '\.insert(' packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' \
  | grep -v '\.test\.ts' | wc -l | tr -d ' ')"
test "$ACTUAL" = "$EXPECTED"
#    e a varredura está 100% percorrida e registrada — AUTO-CONSISTENTE: a tabela tem uma linha
#    por site encontrado AGORA, não por um número lembrado. É este assert que sobrevive a
#    qualquer task futura que acrescente um insert.
test -s .plans/artifacts/2026-07-26-insert-audit.md
test "$(grep -cE '^\| [^|]+:[0-9]+ \|' .plans/artifacts/2026-07-26-insert-audit.md | tr -d ' ')" = "$ACTUAL"
! grep -qiE '\bTODO\b|pendente|\?\?' .plans/artifacts/2026-07-26-insert-audit.md
# 4) smoke de NOT NULL: um insert por tabela das 14, só com os campos que o repo passa
( cd packages/api/typescript && bun test tests/kernel/insert-site-audit.test.ts )
```
O teste `insert-site-audit.test.ts` é **novo** e é o entregável mecânico desta task: para cada
uma das 14 tabelas, chama o repositório real com o payload mínimo e assevera que a linha existe
com `id` e `createdAt` não nulos.

---

#### T22 — `PersistenceProbe` para SQLite

**Arquivos:** `packages/api/typescript/tests/support/PersistenceProbe.ts`,
`tests/support/PersistenceProbe.test.ts`, `tests/architecture/probe-discipline.test.ts`,
`tests/architecture/README.md`.

**O que muda.** O `PersistenceProbe` é o registro central de tabelas do harness de teste e é
construído sobre `PgTable` + `getTableConfig(table).schema`. No `schema-sqlite` **não existem
namespaces** — os 9 `pgSchema` viraram prefixo no nome da tabela (`shared_`, `owner_`,
`thread_`, …). Logo:

- `import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'` →
  `import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'`.
- `SchemaOf<T>` (o tipo que lê o `_.schema` fantasma) **some**.
- `ProbeTable` deixa de ser `` `${SchemaOf<T>}.${K}` `` e passa a ser simplesmente `K & string`
  (o nome do export). Manter a natureza de **união literal** — chave errada continua sendo erro
  de compilação, não `undefined` silencioso.
- `PROBE_TABLES` filtra por `is(x, SQLiteTable)` e chaveia pelo nome do export.
- **Atualizar todo call site.** O universo é **conhecido, fechado e mora inteiro nos 2 arquivos
  desta task — RODADO no HEAD, 26 linhas**:
  ```
  $ grep -cnE "'(shared|owner|thread|issue|authentication|billing)\.[a-z_]+'" \
      packages/api/typescript/tests/support/PersistenceProbe.ts \
      packages/api/typescript/tests/support/PersistenceProbe.test.ts
  …/PersistenceProbe.test.ts:18
  …/PersistenceProbe.ts:8
  $ (as chaves distintas, verificadas uma a uma — NENHUMA é nome de evento)
  authentication.users   billing.subscription   shared.events   shared.outbox
  ```
  Três formas sintáticas, todas têm que ser reescritas — não só a chamada:
  - **call site**: `probe.count('shared.events')` → `probe.count('events')`;
    `testBed.probe().snapshot(['shared.events','shared.outbox'] as const)` (`:82 :83 :90 :92
    :101 :112`);
  - **acesso indexado e anotação de tipo** no próprio teste — `after['shared.events']`,
    `const typed: { 'shared.events': number; 'authentication.users': number }`
    (`:94 :95 :104 :106 :107 :114 :115 :116`) — é aqui que a iteração anterior teria deixado
    resíduo, porque um grep pela chamada não os vê;
  - **docblock** (`PersistenceProbe.ts:33 :55 :90 :140 :141 :147`). Uma doc que ainda ensina a
    chave namespaced é desinformação para o próximo leitor; conta como call site.
- O `@ts-expect-error` que provava a exatidão da união tem que continuar existindo e continuar
  falhando para uma chave inválida.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
! grep -q 'pg-core' packages/api/typescript/tests/support/PersistenceProbe.ts
grep -q 'sqlite-core' packages/api/typescript/tests/support/PersistenceProbe.ts
# ⚠️ ESCOPADO (iteração 4). A forma anterior era um gate repo-wide por NOME NU
# (`! grep -rn "'shared\.\|'owner\.\|'thread\.\|'issue\." tests src`) e violava a regra do
# próprio §8. RODADA no HEAD: **41 hits**, dos quais 20 estão nos arquivos do probe e
# **21 NÃO SÃO chave de probe — são NOMES DE DOMAIN EVENT**, em arquivos que T22 nunca toca:
#   src/owner/events/OwnerCreatedEvent.ts:9 ('owner.created'), OwnerDisabledEvent.ts:10,
#   OwnerEnabledEvent.ts:9, OwnerSettingsUpdatedEvent.ts:10,
#   src/issue/events/IssueArchivedEvent.ts:11, IssueStopResolvedEvent.ts:12,
#   src/thread/events/{ThreadAttached:17, MessageIngested:13, MessageClassified:14,
#     ThreadSteered:12, ThreadPaused:7, ThreadDetached:7, ThreadResumed:7,
#     DirectMessageSent:17, ClarificationRequested:18},
#   src/owner/events/index.test.ts:12-15,
#   tests/integration/redis-bridge.integration.test.ts:211,214
#     (`persistedEvents({ name: 'thread.message_classified' })` — filtro por NOME DE EVENTO,
#      não chave de tabela; continua correto depois desta task).
# Passar aquele AC exigiria RENOMEAR TODO EVENTO DE DOMÍNIO DO REPO. Substituído por dois
# gates escopados, ambos RODADOS no HEAD:
#
# (a) nos 2 arquivos que T22 POSSUI, nenhuma chave namespaced sobrevive — em nenhuma das três
#     formas (chamada, índice/tipo, docblock). HEAD: 26 hits; vai a 0 pelo trabalho da task.
! grep -nE "'(shared|owner|thread|issue|authentication|billing)\.[a-z_]+'" \
    packages/api/typescript/tests/support/PersistenceProbe.ts \
    packages/api/typescript/tests/support/PersistenceProbe.test.ts
# (b) e NENHUM outro arquivo do repo passa chave namespaced para a superfície do probe.
#     HEAD: 8 hits, os 8 dentro dos 2 arquivos de (a) — ou seja, este gate já está em 0 fora
#     deles e serve para impedir que um call site novo apareça em outra suíte.
! grep -rnE "\.(count|snapshot)\([[:space:]]*\[?'(shared|owner|thread|issue|authentication|billing)\." \
    packages/api/typescript/tests packages/api/typescript/src --include='*.ts'
( cd packages/api/typescript && bun test tests/support/PersistenceProbe.test.ts tests/architecture/probe-discipline.test.ts )
```

---

#### T23 — GATE VERDE (fecha a janela vermelha)

**Arquivos:** nenhum novo; é o portão.

> **⚠️ LEIA ANTES DE RODAR (iteração 5) — este bloco era o que MAIS dependia do bug que a
> iteração 5 fecha.** Na iteração 4 as duas primeiras linhas eram `cd packages/api/typescript &&
> …` **soltas**. A segunda roda de dentro de `packages/api/typescript`, falha
> (`cd: no such file or directory`), e o `cwd` errado é herdado por **todo o resto do bloco**.
> Consequências medidas: (a) `bun tsc` passaria a rodar o script `"tsc": "bun x tsc --noEmit"` do
> **próprio** `packages/api/typescript/package.json:11` — o `tsc` cru cheio de ruído de arquivo
> de teste que o CLAUDE.md manda evitar — em vez do alvo de workspace; (b) `cd packages/api/go`
> falha ⇒ **`go build`/`go vet`/`go test` nunca rodam**; (c) os greps repo-wide negados **passam
> vazios**. RODADO, de dentro de `packages/api/typescript`:
>
> ```
> $ ! grep -rn "pglite\|PGlite" packages/api/typescript --include='*.ts' | grep -v node_modules ; echo "EXIT=$?"
> grep: warning: packages/api/typescript: No such file or directory
> EXIT=0        # NEGATED GATE PASSED VACUOUSLY
> ```
>
> Isto é o **mesmo modo de falha** que o comentário do gate estrutural abaixo já alertava para
> `$SRC` não citado, reintroduzido por outro mecanismo. **O portão que declara a fase pronta
> fecharia tendo verificado nada.** Daí a âncora + os subshells. O bloco é para ser rodado
> **inteiro, de cima a baixo, num shell só, a partir da raiz do repo.**
>
> **⚠️ E NÃO ACRESCENTE `> /dev/null` PARA "CALAR" UM GATE NEGADO.** Terceira variante do mesmo
> bug, descoberta rodando na iteração 5 e reproduzida 3×: com o `grep` deste host (ugrep 7.5.0,
> o wrapper que o CLI instala), redirecionar a saída do último estágio do pipe para `/dev/null`
> faz o `!` devolver **0** mesmo havendo hits.
>
> ```
> $ ! grep -rn "PGlite" packages/api/typescript --include='*.ts' | grep -v node_modules            ; echo $?
> 1     ✅  (101 hits — gate VERMELHO, correto no HEAD)
> $ ! grep -rn "PGlite" packages/api/typescript --include='*.ts' | grep -v node_modules > /dev/null ; echo $?
> 0     ❌  (mesmos 101 hits — gate VERDE, silenciosamente)
> ```
>
> Os gates deste plano estão escritos **sem redirect** de propósito. Se a saída incomodar, mande
> para um arquivo (`> /tmp/gate.out`, que preserva o exit code — verificado) e inspecione depois.

**AC — todos têm que passar antes de qualquer task do bloco 3:**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA — 1ª linha, obrigatória (iteração 5)
( cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit )
( cd packages/api/typescript && bun test )   # 27 suites de integração incluídas
bun tsc                                      # workspace inteiro (alvo Nx), inclui app/react
bun lint
bun test:tooling                             # union-parity, scripts/desktop, repo-model, detectors
( cd packages/api/go && go build ./... && go vet ./... && go test ./... )
# invariantes estruturais da fase — repo-wide, caminhos relativos À RAIZ (a âncora garante o cwd)
! grep -rn "pglite\|PGlite\|node-postgres\|pg-core" packages/api/typescript --include='*.ts' --include='*.json' | grep -v node_modules
! grep -rn "__drizzle_migrations" packages/ --include='*.ts' --include='*.go' | grep -v node_modules
```

> **Guard contra o gate vazio (obrigatório, roda ANTES dos negados).** Um `! grep -rn` sobre um
> caminho inexistente sai 0 — indistinguível de "não achou". Estas duas linhas provam que o
> `cwd` é o certo, então uma falha de âncora vira **falha vermelha**, não verde silencioso:
> ```bash
> test -d packages/api/typescript && test -d packages/api/go   # o cwd é a raiz do repo
> grep -rq "drizzle" packages/api/typescript --include='*.ts'  # controle POSITIVO: o grep de fato lê o dir
> ```

##### GATE NOVO — a classe de pg-ismo que NENHUM compilador pega

Os greps acima só pegam **imports e nomes de pacote**. Eles não pegariam nada do que quase
passou batido nesta fase: `now()` × 5 e `interval '1 millisecond'` no CommandQueue,
`FOR UPDATE SKIP LOCKED` na CTE do CommandQueue, e `ilike()` no `GetAttachThreadWizard` — que
é *dialect-neutral no tipo do drizzle*, compila contra sqlite-core e só falha quando o SQLite
recusa o `ILIKE` em runtime. A varredura original foi um grep por casts `::`, e essa é
exatamente a razão de todo o resto ter escapado. Este gate fecha a **classe**, não os casos:

```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5) — sem ela, TODO `! grep` abaixo
test -d packages/api/typescript/src && test -d packages/api/typescript/core/src   # …passa vazio.
# ⚠️ NÃO extrair os dois caminhos para uma variável (`SRC="a b"` + `grep … $SRC`): **zsh não faz
# word-splitting de variável não citada**, então os dois caminhos viram UM argumento e o grep
# falha com "No such file or directory" — retornando 0 hits e fazendo todo `! grep` "passar".
# Verificado neste shell. Os caminhos ficam literais abaixo, de propósito.

# (1) SQL-ismos de Postgres em qualquer TS de produção do daemon.
#     A forma de now() é `(^|[^.A-Za-z_])now\(\)` — a MESMA de T16, para que os dois gates
#     concordem (na iteração 2 T16 usava `\bnow\(\)`, que casa `Date.now()` e tornava o AC
#     insatisfazível junto com o `grep -rq 'Date.now()'` da própria T16). Validado:
#       $ printf 'const now = Date.now()\nconst p = performance.now()\n' > /tmp/b3c.ts
#       $ grep -cE '(^|[^.A-Za-z_])now\(\)' /tmp/b3c.ts   → 0
#       $ printf 'SELECT now()\n' > /tmp/b3b.ts
#       $ grep -cE '(^|[^.A-Za-z_])now\(\)' /tmp/b3b.ts   → 1
#     RODADO no HEAD: **20 hits**, todos em arquivos que este bloco reescreve —
#     PostgresCommandQueue (:59 :62 :247 :293 :297 :311 :312 :317 :320 → T16),
#     GetAttachThreadWizard (:2 :159 :162 :169 :170 :171 :206 → T20),
#     drivers/utils.ts (:23 :25 → T15), DrizzleDomainEventRepository (:88 → T19),
#     DrizzleOutboxDispatcher (:128, comentário citando SKIP LOCKED → T17 item 4).
#     Zero falso-positivo: o gate vai a 0 pelo trabalho do bloco, não por isenção.
! grep -rnE "\bilike\b|FOR UPDATE|SKIP LOCKED|interval '|(^|[^.A-Za-z_])now\(\)|::(int|uuid|text|timestamptz|jsonb|numeric)|unixepoch|CURRENT_TIMESTAMP|pg_tables|TRUNCATE" \
    packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v node_modules

# (2) UPDATE … FROM (forma Postgres) em SQL cru.
#     ⚠️ Este gate é LINE-BASED e por isso NÃO pega o caso real deste repo. Rodado no HEAD:
#       $ grep -rnE 'UPDATE[^;]*\bFROM\b' … | grep -vc node_modules
#       0
#     …e no entanto `PostgresCommandQueue.ts:323-325` TEM um `UPDATE … FROM due`, quebrado em
#     três linhas (`UPDATE ${scheduledCommands} sc` / `SET …` / `FROM due`). Fica como rede
#     barata contra a forma de uma linha só; **quem realmente cobre o caso multi-linha é o gate
#     (1) via `FOR UPDATE`/`SKIP LOCKED` na mesma CTE** (a CTE `due` não sobrevive sem eles) e o
#     AC local de T16. Não tratar este item como prova de nada sozinho.
! grep -rnE 'UPDATE[^;]*\bFROM\b' packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v node_modules

# (3) `db.execute` / `result.rows` — a API do cliente drizzle/pg que sqlite-core não tem.
#
#     ⚠️ ESCOPADO NA ITERAÇÃO 3. A forma anterior (`! grep -rn '\.execute(\|\.rows'`) casava
#     **151 linhas** neste checkout, quase todas LEGÍTIMAS — rodado:
#       $ grep -rn '\.execute(\|\.rows' packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -vc node_modules
#       151
#     São `useCase.execute(` (30), `this.useCase.execute(` (13), `this.query.execute(` (13, um
#     por controller de `ui/`), `handler.execute(` (9), `mw.execute(` (8), mais `batch.rows`
#     (o `OwnerBatch` do próprio dispatcher) e `this.rows` dos mocks de repositório. Um gate que
#     proíbe o vocabulário de use case do repo não é um gate — é um bloqueio.
#     O que o gate QUER é o receptor `db`/`tx`/`client` e o `.rows` de um resultado pg.
#     Forma corrigida, rodada no HEAD — 3 hits, e os 3 morrem em T15/T16:
#       core/src/db/drivers/utils.ts:19                       await db.execute(sql`      (T15)
#       core/src/services/CommandQueue/PostgresCommandQueue.ts:291  this.db.execute(sql`  (T16)
#       core/src/services/CommandQueue/PostgresCommandQueue.ts:325  return result.rows    (T16)
! grep -rnE '\b(db|tx|client)\.execute\(|\b(result|res|rs)\.rows\b' packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v node_modules

# (4) o caminho de transação BANIDO pela decisão (a) não voltou por nenhuma porta.
#     Vaza uma conexão nativa por chamada e derruba os pragmas — nenhum tipo e nenhum teste
#     funcional pega. Só o próprio LibsqlDriver define `transaction<T>(`; o resto CHAMA
#     `driver.transaction(` / `uow.transaction(`.
#     RODADO no HEAD — 4 hits, e os 4 são exatamente os arquivos que este bloco mata ou reescreve:
#       core/src/db/drivers/PGliteDriver.ts:20                    (comentário; DELETADO em T11)
#       core/src/services/OutboxDispatcher/DrizzleOutboxDispatcher.ts:134, :226   (T17)
#       core/src/services/UnitOfWork/DrizzleUnitOfWork.ts:14                      (T13)
#     Ou seja: hoje o UoW e o dispatcher SÃO os dois maiores usuários do caminho que vaza.
! grep -rnE '\b(db|client|this\.db|this\.client)\.transaction\(' packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v node_modules
```

Se algum destes casar numa linha que seja **comentário** ou **string de mensagem**, a correção é
reescrever o comentário (T16 item 5 já manda fazer isso) — **não** afrouxar o gate. Um comentário
que ainda diz `FOR UPDATE SKIP LOCKED` num arquivo SQLite é desinformação para o próximo leitor,
que é o custo real desta classe de bug.

> **Regra que a iteração 3 acrescenta, e que vale para o gate inteiro:** um gate repo-wide só
> entra neste plano depois de **rodado no HEAD**, com a contagem de hits colada ao lado. Se ele
> casa dezenas de linhas legítimas, ele está errado — escopar pelo **receptor** ou pelo
> **diretório dono**, nunca pelo nome nu do método. **E medir de novo depois de cada iteração:**
> os números abaixo foram RE-RODADOS no HEAD na iteração 4, e o do gate (4) estava errado
> (dizia `0`, é `4` — a própria nota do gate (4) já listava os 4 arquivos; era o resumo que
> divergia do corpo).
>
> ```
> gate (1)  ilike|FOR UPDATE|SKIP LOCKED|interval '|now()|::cast|…   → 20   (dos quais 5 são now())
> gate (2)  UPDATE … FROM numa linha só                              → 0    (ver ressalva acima)
> gate (3)  (db|tx|client).execute( | (result|res|rs).rows           → 3    (T15 ×1, T16 ×2)
> gate (4)  (db|client|this.db|this.client).transaction(             → 4    (PGliteDriver.ts:20 →T11;
>                                                                            DrizzleOutboxDispatcher.ts:134,:226 →T17;
>                                                                            DrizzleUnitOfWork.ts:14 →T13)
> ```
>
> Os 4 do gate (4) são exatamente os arquivos que este bloco mata ou reescreve — hoje o UoW e o
> dispatcher **são** os dois maiores usuários do caminho que vaza.

> **Nota sobre `bun tsc` do workspace:** a troca de dialeto não muda nenhum contrato HTTP, então
> a SDK **não** precisa ser regenerada e `packages/app/react` não deveria acusar nada. Se acusar,
> é sinal de que algum tipo de banco vazou para o contrato — investigar em vez de regenerar.

---

### BLOCO 3 — Packaging, boot e config (verde entre tasks)

#### T24 — `scripts/build.ts` (alvo node)

**Arquivos:** `packages/api/typescript/scripts/build.ts`.

**O que muda.**
- `--external @electric-sql/pglite` → `--external @libsql/client --external libsql`.
- `resolvePgliteRoot()` → `resolveLibsqlRoots()`, devolvendo os pacotes a copiar:
  `libsql`, `@libsql/client`, e o prebuild do triple do host (`@libsql/darwin-arm64` etc.).
  Copiar todos para `dist/node_modules/<nome>` com `dereference: true` (mesma manobra que já
  era feita para o PGlite — o walk-up do Node a partir de `dist/server.js` os encontra).
- Remover o loop que apagava `pglite-*.wasm/.data` (não há mais asset embutido).
- `contractsMigrations` passa de `../../contracts/db/migrations` para
  `../../contracts/db/schema-sqlite/migrations`.
- Reescrever o docblock inteiro do topo (as duas justificativas citam PGlite nominalmente).

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
# ⚠️ Os asserts de `dist/` são relativos a packages/api/typescript, então build + asserts vão
#    NO MESMO SUBSHELL. Na iteração 4 era `cd X && bun run build` solto seguido de
#    `test -f dist/server.js` a seco — só funcionava pelo vazamento de cwd que fazia o gate de
#    T23 passar vazio (§0e item 1).
(
  cd packages/api/typescript
  bun run build
  test -f dist/server.js
  test -d dist/migrations && test "$(ls dist/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')" = "2"
  test -d dist/node_modules/libsql
  ls dist/node_modules/@libsql | grep -qE 'darwin|linux|win32'
  ! ls dist | grep -q pglite
  # o binário node sobe de verdade
  bun run smoke:node
)
```

---

#### T25 — Sidecar Tauri: staging + `current_dir`

**Arquivos:** `packages/app/tauri/sidecars/build.ts` (~76-98),
`packages/app/tauri/src-tauri/src/sidecars/mod.rs` (~55-56), `template.config.ts` (~185-220).

> **Esta é a task de packaging da qual a fase inteira depende, e ela exige mudar o CONTRATO
> declarativo, não só os scripts.** `template.config.ts` é a fonte de verdade declarada ("um
> literal em qualquer um desses arquivos que exista aqui é bug") e `scripts/desktop/generate.ts`
> é gated por drift (`bun desktop:generate --check` dentro de `test:tooling`). As três mudanças
> abaixo **não têm hoje onde ser declaradas** — abrir o slot faz parte da task.

**Premissa verificada (não presumir de novo).** Um binário `bun build --compile --external X`
resolve `X` a partir do **CWD do processo**, não do diretório do executável: binário em
`/tmp/elsewhere` com `cwd=/tmp/bunext` (onde estão os `node_modules`) funciona; o mesmo binário
com outro cwd falha com `Cannot find package … from '/$bunfs/root/out'`. Daí (1) e (2).

**O que muda.**

1. **`SidecarDecl.build` ganha slot para externals.** Hoje é
   `build: { kind: 'bun-compile' | 'go-build'; entry: string }` (`template.config.ts:255`) e
   `buildCmd` emite `['bun','build','--compile',entry,'--outfile',outfile]` **sem nenhum
   `--external`** (`sidecars/build.ts:37-45`). Sem `--external @libsql/client --external libsql`
   o bun tenta embutir o `require` nativo e o **sidecar morre em runtime**. Mudanças:
   - `template.config.ts`: `build: { kind; entry; external?: readonly string[] }`, e o sidecar
     `daemon` declara `external: ['@libsql/client', 'libsql']`.
   - `sidecars/build.ts::buildCmd`: no caso `bun-compile`, expandir
     `...(sidecar.build.external ?? []).flatMap(m => ['--external', m])`.
2. **`SidecarDecl` ganha slot para node_modules staged + CWD.** O loop de staging materializa
   **apenas** subpaths derivados de entradas de `bootEnv` com `{ from: 'resourceDir' }`
   (`sidecars/build.ts:78-98`) — não existe declaração para "estagie estes pacotes" nem para "o
   sidecar roda com este cwd", então "stagear os pacotes libsql num subpath de resource" não tem
   mecanismo. Mudanças:
   - `template.config.ts`: adicionar ao `SidecarDecl`
     `stageNodeModules?: { subpath: string; packages: readonly string[] }` e
     `cwd?: { from: 'resourceDir'; subpath: string }`. O daemon declara
     `stageNodeModules: { subpath: 'daemon-runtime', packages: ['libsql', '@libsql/client'] }`
     (mais o prebuild do triple do host, resolvido em build time) e
     `cwd: { from: 'resourceDir', subpath: 'daemon-runtime' }`.
   - `sidecars/build.ts`: copiar cada pacote declarado de `node_modules/<pkg>` para
     `binaries/<subpath>/node_modules/<pkg>` com `dereference: true`; falhar alto se faltar.
   - `scripts/desktop/generate.ts`: `cwd.subpath` e `stageNodeModules.subpath` entram em
     `bundle.resources` do `tauri.conf` gerado, e o `cwd` é emitido para o supervisor Rust.
3. **`src-tauri/src/sidecars/mod.rs`:** encadear `.current_dir(<resource_dir>/<cwd.subpath>)` na
   construção do comando — o hook existe (`tauri-plugin-shell-2.3.5 src/process/mod.rs:235`),
   hoje só se encadeia `.envs(...)`. **Gerado a partir do contrato**, não escrito à mão.
4. **Fonte das migrations:** o staging passa a ler
   `contracts/db/schema-sqlite/migrations` (hoje `contracts/db/migrations`, `build.ts:85`).
5. **Resíduo textual de `PGlite` — as TRÊS linhas, tabeladas (iteração 5).** A iteração 4
   nomeava só `:192` e deixava o gate `! grep -rn 'PGlite' …` do AC (5) ir a zero **por
   descoberta na hora de rodar**, que é exatamente o que T11 já não faz (ele tabela os 11
   arquivos órfãos com linha, para o gate fechar **por construção**). RODADO no HEAD —
   `grep -rn 'PGlite' template.config.ts packages/app/tauri/sidecars/build.ts` ⇒ **3 hits**:

   | arquivo:linha | texto | o que fazer |
   |---|---|---|
   | `template.config.ts:192` | `/** Readiness probe — proves PGlite migrations ran and controllers registered. */` | reescrever: "proves SQLite migrations ran…". `healthPath` em si continua `/v1/session`. |
   | `template.config.ts:379` | doc de `CODEDM_DATA_DIR`: `…api-ts still uses it for its embedded PGlite until its own move lands` | **a frase fica FALSA nesta fase** — reescrever para dizer que os **dois** sidecars abrem o mesmo `codedm.db` neste dir. |
   | `packages/app/tauri/sidecars/build.ts:10` | docblock do topo: `PGlite inside a bun single-binary was proven by the D2 spike —` | é a justificativa do staging; reescrever citando o libsql (é o mesmo mecanismo de walk-up, outro pacote). O item "reescrever o docblock inteiro do topo" já pedia isso em prosa; aqui vira linha. |
6. **Regenerar e commitar o gerado.** `bun desktop:generate` **precisa rodar** e a saída precisa
   estar commitada, senão `test:tooling` falha por drift. Isto nunca esteve no plano.
7. **Registrar o gap de cross-triple:** `HOST_TRIPLES` só builda para o host e `bun install`
   baixa só o `optionalDependency` do host. No dia em que a CI fizer cross-build, o sidecar
   builda e **falha em runtime**. Comentário no `build.ts` + follow-up (questão aberta 7).

**AC.** Cobre os três itens de contrato, não só o resultado no disco.
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
T=template.config.ts
# (1) o slot de externals existe no contrato E é usado pelo builder
grep -q "external?: readonly string\[\]" $T
grep -q "'@libsql/client'" $T
grep -q -- "--external" packages/app/tauri/sidecars/build.ts
# (2) slots de staging e cwd existem no contrato E o builder os consome
grep -q "stageNodeModules" $T && grep -q "stageNodeModules" packages/app/tauri/sidecars/build.ts
# ⚠️ VACUAMENTE POSITIVO ATÉ A ITERAÇÃO 6. A forma anterior era `grep -q "cwd" $T`, e a palavra
#    `cwd` JÁ CASA 3 LINHAS PRÉ-EXISTENTES no HEAD — nenhuma delas o slot novo:
#      $ grep -n 'cwd' template.config.ts
#      145: * it for binary names + build cwds. A literal in any of those files that exists here is a
#      248:	/** The workspace this sidecar compiles from (cwd/entry resolve via WORKSPACES). */
#      291:	/** Env override for the monorepo root (graph CLI invoked from arbitrary cwds). */
#    Ou seja: o gate passava com ZERO trabalho feito. Asseverar o SLOT (a declaração do campo e a
#    declaração do sidecar `daemon`), não a palavra. RODADO no HEAD, a forma nova:
#      $ grep -nE "cwd\?:[[:space:]]*\{[[:space:]]*from:[[:space:]]*'resourceDir'" template.config.ts
#      (nenhuma saída)  EXIT=1   ⇒ reprova hoje, CORRETAMENTE, e só passa quando o slot existir.
grep -qE "cwd\?:[[:space:]]*\{[[:space:]]*from:[[:space:]]*'resourceDir'" $T
grep -qE "cwd:[[:space:]]*\{[[:space:]]*from:[[:space:]]*'resourceDir',[[:space:]]*subpath:[[:space:]]*'daemon-runtime'" $T
grep -q "daemon-runtime" $T
# (3) o supervisor Rust encadeia current_dir
grep -q 'current_dir' packages/app/tauri/src-tauri/src/sidecars/mod.rs
# (4) fonte das migrations
grep -q "schema-sqlite" packages/app/tauri/sidecars/build.ts
# (5) sem resíduo de PGlite no contrato — as TRÊS linhas estão TABELADAS no item 5 da task
#     (iteração 5). RODADO no HEAD ⇒ 3 hits: template.config.ts:192, template.config.ts:379,
#     packages/app/tauri/sidecars/build.ts:10. O gate vai a zero POR CONSTRUÇÃO (o padrão de T11),
#     não por descoberta na hora de rodar.
! grep -rn 'PGlite' $T packages/app/tauri/sidecars/build.ts
# (6) build real + artefatos no disco — build + asserts NO MESMO SUBSHELL: `src-tauri/binaries`
#     é relativo a packages/app/tauri (iteração 5, §0e item 1).
(
  cd packages/app/tauri
  bun sidecars/build.ts
  ls src-tauri/binaries | grep -q 'codedm-daemon'
  test "$(ls src-tauri/binaries/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')" = "2"
  test -d src-tauri/binaries/daemon-runtime/node_modules/libsql
  test -d src-tauri/binaries/daemon-runtime/node_modules/@libsql
)
# (7) OS GATES DECLARATIVOS — sem estes a task não fecha (rodam da raiz, pela âncora do topo)
bun desktop:generate && bun desktop:generate --check
bun test:tooling
# o gerado do tauri está commitado. ATENÇÃO: a forma da iteração 1
# (`git status --porcelain … | grep -q . && echo … && false`) FALHAVA SEMPRE — numa árvore limpa
# o `grep -q .` sai 1 e o bloco inteiro sai não-zero, justamente no caso que deveria passar.
test -z "$(git status --porcelain -- packages/app/tauri/src-tauri)"
```
**Prova de runtime, não só de build:** subir o binário compilado a partir de um cwd **diferente**
de `daemon-runtime` e confirmar que ele falha, e a partir de `daemon-runtime` e confirmar que ele
responde `200` em `/v1/session`. É o assert que distingue "compilou" de "resolve o addon nativo".

---

#### T26 — Docker e compose: fora o Postgres

**Arquivos:** `docker/Dockerfile.api` (~64-76), `docker/docker-compose.yml` (~2-15, ~62).

**O que muda.**
- `docker-compose.yml`: remover o serviço `postgres` inteiro (imagem `postgres:17-alpine`,
  env `POSTGRES_*`, port `5432`, healthcheck `pg_isready`) e o volume `postgres_data`. Remover
  `depends_on: postgres` de quem tiver.
- `Dockerfile.api`: os comentários de `:68-74` citam `pg` e
  `dist/node_modules/@electric-sql/pglite` — reescrever para libsql. O `COPY` do `dist/`
  inteiro continua correto (agora traz `dist/node_modules/{libsql,@libsql/*}`).
- O runner distroless `nodejs22-debian12` **permanece** — é justamente o caminho que o
  `better-sqlite3` teria matado e que motiva a decisão (a).
- Declarar um volume para o data dir SQLite se o compose subia o daemon com estado.
- **`DATABASE_URL` morre junto — e isso é uma mudança de CONTRATO, não de compose.**
  `template.config.ts:370` ainda **declara** `DATABASE_URL` em `REPO.env`, e `PROJECT` (`:352`)
  o cita no `doc` ("`DATABASE_URL` db name must match"). Remover o serviço Postgres sem remover
  a declaração deixa um env órfão apontando para um banco que não existe mais, e a paridade
  schema ↔ registry ↔ `.env.example` é gated por
  `packages/api/typescript/tests/architecture/env-model.test.ts`. Passos:
  1. remover a entrada `DATABASE_URL` de `REPO.env`;
  2. corrigir o `doc` de `PROJECT`, que ficou pendurado nela;
  3. remover os **dois** consumidores TS, ambos verificados por nome (não "qualquer consumidor
     restante" — vaguidão aqui vira AC falhando por mistério no bloco 3):
     `core/src/utils/Config.ts:26` (a entrada no schema de env) e
     `core/src/db/config.ts:5,11,29` — este último é deletado inteiro em **T11** (resíduo pg
     morto, `dialect: 'postgresql'` hardcoded, zero consumidores);
  4. **regenerar `.env.example`** (`scripts/env/generate.ts`) e commitar.
- **O último Postgres vivo fora do daemon: o limpador de DBs de teste do e2e.**
  `packages/e2e/scripts/cleanup-stale-dbs.ts` importa `pg` (declarado em
  `packages/e2e/package.json:18,23` como `pg` + `@types/pg`), lê `DATABASE_URL` e dropa bancos
  `e2e_%` de um Postgres — está wired ao script raiz `test:e2e:cleanup` (`package.json:45`) e
  documentado no `CLAUDE.md:108`. Sem Postgres, ele não fica "quebrado": fica **permanentemente
  sem sentido**, e um script sem sentido no README é dívida que o próximo engenheiro vai tentar
  consertar. Deletar: o script, as duas deps de `packages/e2e/package.json`, a entrada
  `cleanup:dbs` do `package.json` do e2e, o script raiz `test:e2e:cleanup`, e a linha
  correspondente do `CLAUDE.md`.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
! grep -qi 'postgres' docker/docker-compose.yml
! grep -qi 'pglite\|"pg"' docker/Dockerfile.api
docker compose -f docker/docker-compose.yml config     # exit 0, YAML válido
docker build -f docker/Dockerfile.api -t codedm-api:sqlite-check .
# contrato de env: a DECLARAÇÃO de DATABASE_URL morre.
# ⚠️ INSATISFAZÍVEL ATÉ A ITERAÇÃO 6. A forma anterior (`! grep -q 'DATABASE_URL' template.config.ts`)
#    proibia a PALAVRA, e o arquivo tem um TOMBSTONE LEGÍTIMO que a contém. RODADO no HEAD:
#      $ grep -n 'DATABASE_URL' template.config.ts
#      352:		PROJECT: { … doc: 'docker-compose prefix + Config.name; DATABASE_URL db name must match' },
#      370:		DATABASE_URL: {                                     ← A DECLARAÇÃO (o alvo desta task)
#      483:		// (WHATSMEOW_DATABASE_URL removed: whatsmeow's session tables now live in the
#    A `:483` documenta uma decisão DESTA fase (o commit 149b6aa3) e §8 já proíbe "AC satisfeito
#    deletando prosa": ela FICA. A `:352` é o `doc` de PROJECT, corrigido pelo passo 2 da task.
#    Simulado o pós-T26 (removendo só o bloco :370-374) e rodadas as duas formas:
#      forma antiga  ⇒ FAIL (o tombstone de :483 ainda casa)
#      forma escopada ⇒ PASS
#    Escopo correto: a DECLARAÇÃO (chave em início de linha), não a palavra.
! grep -qE '^[[:space:]]*DATABASE_URL[[:space:]]*:' template.config.ts
# e o `doc` de PROJECT (:352) não pode ficar pendurado na chave morta
! grep -qE "doc:.*DATABASE_URL" template.config.ts
! grep -rn 'DATABASE_URL' packages/api/typescript --include='*.ts' | grep -v node_modules
# no `.env.example` a forma nua VALE: é arquivo GERADO (renderEnvExample), sem prosa própria.
# RODADO no HEAD ⇒ 2 hits (`:9` comentário de PROJECT, `:15` a chave); os dois somem com a
# regeneração do passo 4.
! grep -q 'DATABASE_URL' .env.example
# o limpador de DBs Postgres do e2e e toda a sua fiação sumiram
! test -e packages/e2e/scripts/cleanup-stale-dbs.ts
! grep -qE '"(pg|@types/pg)":' packages/e2e/package.json
! grep -q 'cleanup:dbs' packages/e2e/package.json
! grep -q 'test:e2e:cleanup' package.json
! grep -q 'test:e2e:cleanup' CLAUDE.md
! grep -rn "from 'pg'\|require('pg')" packages/e2e --include='*.ts' | grep -v node_modules
# e os gates que ESTA task dispara
( cd packages/api/typescript && bun test tests/architecture/env-model.test.ts )
bun test:tooling            # da raiz (âncora do topo do bloco)
# `.env.example` regenerado E commitado. A forma da iteração 1
# (`git status --porcelain … | grep -q . && echo … && false`) falhava SEMPRE, inclusive limpa.
test -z "$(git status --porcelain -- .env.example)"
```

---

#### T27 — Sites de limpeza de lock (os dois no-ops silenciosos)

**Arquivos:** `packages/e2e/scripts/run-e2e.ts` (~125),
`packages/api/typescript/scripts/smoke-node-boot.ts` (~78).

**O que muda.** Os dois removem o lockfile **irmão** por caminho hardcoded
(`` `${dataDir}.lock` `` e `` `${join(dataDir,'data')}.lock` ``). Depois de T10 esses caminhos
não existem mais e as duas chamadas viram no-op **silencioso** — é o tipo de falha que passa
despercebida porque os dois operam em dir de scratch. Retarget para
`join(dataDir, 'daemon.lock')`. Melhor ainda: exportar um helper `lockPathFor` do core e
**importá-lo** nos dois, para que um próximo retarget não precise achar call sites por grep.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
! grep -rn '\.lock`' packages/e2e/scripts/run-e2e.ts packages/api/typescript/scripts/smoke-node-boot.ts
# ⚠️ DUAS chamadas, uma por arquivo (iteração 5). `grep -q PADRÃO f1 f2` sai 0 no PRIMEIRO hit —
#    com só UM dos dois arquivos editado o AC da iteração 4 passava. Demonstrado:
#      $ printf 'lockPathFor\n' > /tmp/a1.txt; printf 'nope\n' > /tmp/a2.txt
#      $ grep -q "lockPathFor" /tmp/a1.txt /tmp/a2.txt ; echo $?   → 0
#    E os DOIS realmente precisam mudar — RODADO no HEAD, os dois sites hardcoded existem:
#      packages/api/typescript/scripts/smoke-node-boot.ts:78:  rmSync(`${join(dataDir, 'data')}.lock`, { force: true })
#      packages/e2e/scripts/run-e2e.ts:125:                    rmSync(`${dataDir}.lock`, { force: true })
grep -q "lockPathFor" packages/e2e/scripts/run-e2e.ts
grep -q "lockPathFor" packages/api/typescript/scripts/smoke-node-boot.ts
# e o helper é EXPORTADO do core (o ponto do "importá-lo", não redigitá-lo nos dois).
# ⚠️ ANCORADO EM `export` (iteração 5): RODADO no HEAD, `grep -rq "lockPathFor" DataDirLock.ts`
#    ⇒ exit 0 — porque `:31` já tem `function lockPathFor(...)`, PRIVADA. O AC nu passaria
#    vazio. T10 é quem exporta (ver o item novo lá).
grep -qE '^export function lockPathFor' packages/api/typescript/core/src/db/drivers/DataDirLock.ts
( cd packages/api/typescript && bun run smoke:node )
bun e2e
```

---
### BLOCO 4 — Verificação e aceite

#### T28 — Teste de boot CONCORRENTE (a prova do TOCTOU de T04)

**Arquivos:** `packages/api/typescript/tests/kernel/concurrent-boot.test.ts` (novo) ou script
sob `scripts/`; `packages/api/go/core/db/sqlite/store_test.go`.

**O que muda.** Um teste sequencial (Go migra, depois TS abre) **não reproduz** o TOCTOU. É
preciso duas execuções **concorrentes** contra um data dir frio:

1. Criar dir temporário vazio.
2. Disparar **simultaneamente** o applier Go e o applier TS (dois processos de verdade, ou
   dois handles em goroutine/worker — o essencial é que ambos vejam a ledger vazia antes de
   qualquer `BEGIN IMMEDIATE`).
3. Assertivas: nenhum dos dois erra; `sqlite_master` tem as 25 tabelas; `_sqlite_migrations`
   tem exatamente **2** linhas (0000 e 0001), **não** 4; `__drizzle_migrations` não existe.
4. Repetir 20× (o TOCTOU é probabilístico).

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
( cd packages/api/typescript && bun test tests/kernel/concurrent-boot.test.ts )
( cd packages/api/go && go test ./core/db/sqlite/... -run ConcurrentBoot -count=20 )
```

---

#### T29 — Teste de partição de lanes + revival de datas

**Arquivos:** `packages/api/typescript/tests/flows/shared-outbox-lanes.test.ts` (novo).

**O que muda.** É o teste que prova que o bug de perda de dados morreu, e o que protege o item
de maior risco da decisão (d).

Casos obrigatórios:

1. **Não-roubo.** Inserir manualmente uma linha `source='gateway'` (nome típico do gateway, ex.
   `channel.message.received`, sem handler TS) + uma linha `source='api'`. Rodar `flush()` do
   `DrizzleOutboxDispatcher`. Assertivas: a linha `api` fica com `processed_at` não nulo; a
   linha `gateway` continua **intocada** (`processed_at IS NULL`, `claimed_by IS NULL`,
   `attempts = 0`) e **ainda existe** (não foi deletada).
2. **Ingress da lane `integration`.** Inserir uma linha `source='integration'` com payload no
   envelope aninhado do Go (`{id, ownerId, time, name, payload}`) contendo um campo RFC3339
   (ex. `receivedAt`). Rodar `drainOnce()` do `SqlExternalMediator` TS. Assertivas: o handler
   externo recebeu o envelope; **`receivedAt` chegou como `Date`**, não string (é o assert que
   impede o modo de falha "console continua DISCONNECTED, agora com outbox cheio"); **e a linha
   terminou — `processed_at` não nulo e `claimed_by IS NULL`**. Sem esse último assert, uma
   ingress bem-sucedida ficaria sendo re-claimada a cada expiração de lease, para sempre, com o
   handler reexecutando — e nada no teste veria.
3. **Filtro por nome.** Uma linha `source='integration'` com nome **sem** handler registrado
   não é claimada.
4. **Tombstone, não delete.** Depois de sucesso na lane `api`, a linha ainda existe com
   `processed_at` preenchido e `claimed_by IS NULL`.
5. **Lease sobrevive a crash.** Claimar, não finalizar, avançar o relógio 31s, claimar de novo
   ⇒ a linha volta.
6. **Retry mantém lease.** Handler falha; assertiva: `attempts = 1`, `last_error` preenchido,
   `lease_until` ainda no futuro, `processed_at IS NULL`.
7. **Dead-letter.** 5ª falha ⇒ `processed_at` preenchido, `claimed_by IS NULL`.
8. **ORDENAÇÃO OWNER-SEQUENCIAL SOB LEASE — o caso que nenhum AC via.** Duas linhas
   `source='api'`, **mesmo `ownerId`**, `created_at` crescente (A antes de B), **no mesmo lote de
   claim** (é o que o teste prova; ver o qualificador abaixo). O handler falha em
   **A**. Assertivas, na ordem:
   - depois do `flush()`: A tem `attempts = 1` e lease **no futuro**; B **não** foi entregue;
   - **B continua leaseada com o MESMO `claimed_by`/`lease_until` de A** (é o núcleo da
     correção: se o skip soltasse o lease, B ficaria elegível já no próximo ciclo);
   - um `flush()` imediato **não entrega B** (nenhum dos dois é claimável);
   - avançando o relógio 31s e refazendo `flush()`: **A é entregue antes de B** — nunca o
     contrário.

   Os casos 6 e 7 cobrem retry e dead-letter isoladamente; **nenhum** deles combina falha e skip
   no mesmo owner, que é exatamente onde a regressão morava.

   > **O teste tem que NOMEAR o que prova (decisão (d), qualificação da iteração 3).** O título do
   > caso é *"preserva a ordem do owner **dentro de um lote de claim**"* — não "preserva a ordem
   > do owner". A garantia é intra-lote; com mais de `BATCH_SIZE` pendentes na lane, ou com B
   > escrito por um handler **durante** o flush, B não carrega o lease de A e pode ser entregue
   > antes do retry dele. Um teste chamado "owner ordering" faria a próxima pessoa acreditar numa
   > garantia global que não existe.

9. **CRASH-LOOP TEM TETO (decisão (d), subseção "Crash-loop").** Sem este caso, a mudança de
   `attempts` para o claim não tem prova e alguém a reverte lendo as iterações 1/2.
   - claimar uma linha e **nunca** finalizar (simula o processo morto); avançar 31s; repetir.
     Assertiva: depois de **5** ciclos a linha **para** de ser claimada — `attempts = 5` — e não
     volta mais, por mais que o relógio avance;
   - rodar mais um ciclo: o **sweep de poison** a marca `processed_at` não nulo, `claimed_by IS
     NULL` e `last_error` contendo `poison`. Assertiva de que ela não fica presa e invisível;
   - **contraste com o retry normal:** uma linha cujo handler **lança** (falha tratada) tem
     `attempts` incrementado **uma vez por ciclo** — não duas. É o assert que pega o bug de
     "incrementar no claim **e** no finalize", que cortaria o orçamento de retry pela metade.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
( cd packages/api/typescript && bun test tests/flows/shared-outbox-lanes.test.ts )
# os 9 casos existem nominalmente (guard contra o arquivo nascer com 8).
# NOTA: `\s` não é ERE POSIX. No `grep -E` deste host ele FUNCIONA (extensão GNU/ugrep) —
# verificado, casa `  it(`. No **awk** ele NÃO funciona (ver a nota em T09/T18). `[[:space:]]`
# funciona nos dois, então é a forma usada em todo o plano.
test "$(grep -cE "^[[:space:]]*(it|test)\(" packages/api/typescript/tests/flows/shared-outbox-lanes.test.ts | tr -d ' ')" -ge "9"
# o caso 8 NOMEIA que a garantia é intra-lote (senão vira promessa global falsa)
grep -qiE 'claim batch|lote de claim|intra-lote' packages/api/typescript/tests/flows/shared-outbox-lanes.test.ts
# o caso 9 (teto de crash-loop + sweep de poison) existe
grep -qi 'poison' packages/api/typescript/tests/flows/shared-outbox-lanes.test.ts
```

---

#### T30 — Job de retenção do outbox

**Arquivos:** `packages/api/typescript/src/shared/usecases/PruneOutbox.ts` (novo, o handler do job),
`packages/api/typescript/src/shared/index.ts` (**o slot `jobs:` do `BoundedContext.create`** — é
AQUI que um job se declara), `packages/api/typescript/src/shared/usecases/PruneOutbox.test.ts`
(novo).

> **Iteração 6 — a Arquivos apontava para o arquivo ERRADO.** Ela dizia
> "`src/shared/registry.ts` (`registerJobs`)". `registerJobs` é **método privado do
> `BoundedContext`** (`core/src/types/BoundedContext.ts:117`), consumido a partir de
> `BoundedContext.create({ …, jobs })` (`:60`). O `registry.ts` não tem — nem pode ter — slot de
> job; ele só liga o token `CommandQueue`. O único precedente do repo confirma o lugar:
> `src/issue/index.ts:16` → `jobs: [{ handler: AutoArchiveCompletedIssues, repeat: { every: 60 * 60 * 1000 } }]`.
> `src/shared/index.ts` hoje chama `BoundedContext.create({ name: 'shared', root: true,
> controllers, registry, setup })` — **sem** `jobs`; abrir esse slot é a task.

**O que muda.** Job diário deletando `shared_outbox` com `processed_at < now - 7d`. Hoje
**nada** poda tombstone em nenhum dos lados, e como T17 troca delete por tombstone, o volume
passa a crescer no disco do usuário.

Escopo desta task: **só `shared_outbox`**. A poda de `shared_events` (o log de auditoria) fica
como questão aberta (ver §7) — é log de auditoria, apagar tem custo diferente.

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA (iteração 5)
# assertivo (o grep anterior só imprimia); e sem glob `**` cru, que o zsh aborta sem match
test "$(grep -rniE 'prune|retention' packages/api/typescript/src/shared --include='*.ts' | grep -c outbox | tr -d ' ')" -ge 1
# ⚠️ VACUAMENTE POSITIVO ATÉ A ITERAÇÃO 6 — e sobre o ARQUIVO ERRADO. A forma anterior era
#    `grep -rq "registerJobs" …/src/shared/registry.ts`, e o nome já casava 3 COMENTÁRIOS
#    pré-existentes naquele arquivo, nenhum deles um job. RODADO no HEAD:
#      $ grep -n "registerJobs" packages/api/typescript/src/shared/registry.ts
#      76:  // AFTER a context whose `registerJobs` already enqueued a repeatable command against a fresh,
#      96:   * before any `registerJobs` enqueue can race it. Idempotent (the drizzle/pglite migrator tracks
#      158:  // Repeatable jobs (BoundedContext.registerJobs) resolve this — an UNBOUND abstract silently
#    ⇒ gate verde com ZERO trabalho feito, apontando para um arquivo que não declara jobs.
#    Asseverar o SLOT REAL, em `src/shared/index.ts` (padrão de `src/issue/index.ts:16`).
#    RODADO no HEAD, com CONTROLE POSITIVO para separar "não achou" de "não olhou":
#      $ grep -qE '^[[:space:]]*jobs:[[:space:]]*\[' packages/api/typescript/src/shared/index.ts ⇒ EXIT=1 (alvo)
#      $ grep -qE '^[[:space:]]*jobs:[[:space:]]*\[' packages/api/typescript/src/issue/index.ts  ⇒ EXIT=0 (controle)
#    ⇒ a FORMA do grep está certa; os dois asserts abaixo reprovam hoje pelo motivo certo.
grep -qE '^[[:space:]]*jobs:[[:space:]]*\[' packages/api/typescript/src/shared/index.ts
grep -q 'PruneOutbox' packages/api/typescript/src/shared/index.ts
# e o handler existe de fato (não só o nome no slot)
test -f packages/api/typescript/src/shared/usecases/PruneOutbox.ts
( cd packages/api/typescript && bun test src/shared )
```
O teste: linha com `processed_at` de 8 dias atrás some; de 6 dias atrás fica; linha com
`processed_at IS NULL` **nunca** some, por mais velha que seja.

---

#### T30B — Seam de ingress do GATEWAY (Go): o pareamento sem telefone

**Arquivos:** `packages/api/go/internal/channel/testseam/test_ingress.go` (novo — **atenção: NÃO
em `controllers/`**; ver "O seam não pode ser EMITIDO no OpenAPI", abaixo),
`packages/api/go/internal/channel/module.go` (montagem condicional do controller),
`packages/api/go/core/config/config.go` (campo `TestIngress`),
`template.config.ts` (declaração de `CODEDM_E2E` com consumer `apiGo`),
`.env.example` (regenerado).

**Por que esta task existe.** A travessia 2 de T31, na sua variante **forte**, precisa que o
**gateway** escreva `CONNECTED` no store
compartilhado, **por conta própria e sem telefone**. Investigado o que existe hoje, e nenhuma das
três opções serve como está:

| opção investigada | veredito |
|---|---|
| endpoint do gateway que transiciona o channel | **não chega a CONNECTED.** `POST /api/channel/channels/whatsapp` grava `CREATED` (`entities/channel.go:44`); `POST /api/channel/channels/{id}/connect` grava `CONNECTING` (`usecases/connect_channel.go:96-102`, `persistConnecting`) e devolve o QR — MEDIDO no HEAD, saída colada em §0f item 2. `restart`/`logout`/`send_*` **exigem** `CONNECTED` como pré-condição. |
| o evento de integração congelado que o gateway emitiria no pareamento | é **egress** (`handlers/channel_connected_handler.go:86` publica `wire.ChannelConnectedEventName` **depois** do commit). Injetá-lo não faz o gateway escrever nada — inverteria a direção da prova. |
| seam de test-ingress equivalente ao do TS | **NÃO EXISTE no Go.** `grep -rn '_test' packages/api/go --include='*.go'` (excluídos `*_test.go`) ⇒ **zero**. O TS tem `src/shared/controllers/TestIngressController.ts` (`path = '/_test/gateway'`, montado só sob `CODEDM_E2E` em `src/shared/index.ts:34`), mas ele é o **daemon** simulando o gateway — o oposto do que T31 precisa. |

⇒ **o Go precisa do equivalente**, e é esta task. Nota de simetria: com o seam do lado Go, o
`TestIngressController` do TS deixa de precisar simular `channel-connected` em e2e — mas
**remover isso não é escopo desta fase** (T18 já fixou o papel dele); fica registrado na §7.

**O que muda.**

1. **`config.go`:** campo `TestIngress bool`, lido como
   `getEnvOrDefault("CODEDM_E2E", "") == "true"`. **Fail-closed**, espelhando `src/boot.ts:23` do
   TS: se `TestIngress` e `Environment == PRODUCTION`, `Load()` devolve erro e o processo **não
   sobe**. Ler em `config.go` é deliberado: o rail ENV-03
   (`tests/architecture/env-model.test.ts:73-80`) só varre **esse** arquivo em busca de
   `getEnvOrDefault|os.Getenv` — ler a flag em qualquer outro lugar **passa por baixo do rail**.
2. **`template.config.ts`:** declarar
   `CODEDM_E2E: { consumers: ['apiGo'], example: '', doc: 'test-only gateway ingress seam; refused under PRODUCTION' }`
   e **regenerar `.env.example`**. Sem `schema:` — ENV-05 exige `schema` **exatamente** quando
   `apiTs` é consumer, e o TS lê a flag via `process.env` cru, fora do `RawEnvSchema`.
   (VERIFICADO no HEAD: `grep -n 'CODEDM_E2E' template.config.ts` ⇒ **nenhuma saída**; a flag é
   hoje 100% não declarada.)
3. **`testseam/test_ingress.go`** (pacote `testseam`, **fora** de `controllers/` — a regra está na
   subseção de emissão abaixo)**:** controller `Context: "channel"`, `Path: "/channels/_test/gateway"`,
   `Method: "POST"`, request `{ ChannelID string \`from:"body" validate:"required,uuid"\`;
   OwnerID string \`from:"header" name:"X-Owner-Id" validate:"required,uuid"\` }` — o `X-Owner-Id`
   entra porque **11 controllers de `internal/channel/` já o exigem** e a simetria evita a
   armadilha de header da §8. O `Handle` faz **uma** coisa:

   ```go
   err := c.mediator.Dispatch(r.Context(),
       ctxevents.NewGatewayConnectedEvent(channelUUID, req.OwnerID, ctxevents.GatewayConnectedPayload{
           ChannelID: channelUUID,
           Platform:  string(enums.PlatformWhatsApp),
           OwnerID:   req.OwnerID,
       }))
   ```

   **`Dispatch`, não `Publish`** — `core/services/mediator/mediator.go:35-37` e
   `internal_mediator.go:67-86`: `Dispatch` roda os handlers **na goroutine do chamador** e
   devolve o primeiro erro, enquanto `Publish` enfileira em canal (`:50-64`). Com `Dispatch`, a
   resposta HTTP só volta **depois** do commit — o AC de T31 não precisa de `sleep` nem de poll,
   e uma falha do handler vira 5xx em vez de verde silencioso.
4. **`module.go`:** montar o controller **só** quando `cfg.TestIngress`. O grupo
   `group:"controllers"` é `fx.Provide`; usar o mesmo padrão de opcionalidade que
   `newAuthMiddleware` usa para o APIKey (`internal/shared/module.go:56-60`: só encadeia o
   middleware quando a chave existe) — provider que devolve `nil`/no-op quando a flag está
   desligada, e o registro de rota não acontece.

**Este seam é o gateway escrevendo pelo SEU caminho de produção — não um `INSERT` do teste.**
A partir do `Dispatch`, quem trabalha é código de produção não modificado:
`handlers/channel_connected_handler.go:47-81` → `uow.Execute` → `repo.Find` →
`inst.SetConnected(ownerRemoteID)` (a **entidade**, `entities/channel.go:104`) →
`repo.Save` → `INSERT INTO gateway_channels … ON CONFLICT` +
`version = gateway_channels.version + 1` (`sqlite_channel_repository.go:191-203`) + append no
`shared_events`/outbox. **Nada disso é conhecimento do teste.** E o handler já tolera registry
sem sessão viva: `:64-71` cai no `OwnerRemoteID` persistido com um `slog.Warn` quando
`registry.Get` erra — que é exatamente o caso desassistido.

##### O seam NÃO PODE ser EMITIDO no OpenAPI (decisão da iteração 7 — era o buraco de T30B)

**O emissor Go é spec-first e ESTÁTICO: ele não lê o grafo fx.** Medido no código:
`pkg/openapi/walker.go:47` faz `packages.Load(cfg, "./internal/...")` e caminha o AST atrás de
`Metadata()` (`metadata.go:38-60`); `controllers.go:13-32` registra **toda** operação descoberta.
⇒ **Gatear a montagem com `cfg.TestIngress` no `module.go` tem efeito ZERO sobre a emissão.** Um
controller test-only dentro de `internal/channel/controllers/` entra no spec do mesmo jeito.

E o dano não para no spec. Medido:

```
$ git ls-files packages/api/go/public                     ⇒ packages/api/go/public/embed.go   (só isso)
$ git check-ignore -v packages/api/go/public/docs/openapi.json
.gitignore:106:packages/api/go/public/docs/    packages/api/go/public/docs/openapi.json
$ git ls-files packages/client/dist/typescript/src | wc -l               ⇒ 815   (a SDK É commitada)
$ git ls-files packages/client/dist/typescript/src | grep -ci channel    ⇒ 265
```

Ou seja: (i) o `openapi.json` do Go **não é commitado** (o diretório é gitignorado) — logo um AC
na forma `test -z "$(git status --porcelain -- …/openapi.json)"` seria **vacuamente positivo**, o
anti-padrão que a §8 proíbe; (ii) mas a **SDK é** commitada, e `packages/client/lib/discover.ts:7-20`
descobre **todo** `packages/api/<service>/public/docs/openapi.json`, com `client:generate`
dependendo de `api-go:emit-openapi` (`packages/client/project.json`) ⇒ uma rota nova no spec do Go
vira **arquivo novo em `packages/client/dist/typescript/src/go/`**, e `scripts/check-generated.ts`
(cujo `GENERATED_ROOTS` inclui `clientTsDist/src`) **falha por drift**.

**DECISÃO: o seam fica FORA do pacote varrido — ele nunca é emitido.** É mais barato que regenerar
e commitar SDK por causa de uma rota de teste, e não deixa superfície test-only vazar para o
cliente público. O filtro do walker é literal e verificado: `walker.go:106`
`strings.Contains(pkg.PkgPath, "/controllers")` e `:109` `HasPrefix(pkg.PkgPath, "template/api-go/")`.
Já a montagem em runtime **não** tem essa restrição: `http_router.go:44-56` registra a partir do
slice `[]types.Controller` que o fx injeta, sem olhar caminho de pacote. Duas formas admissíveis
— **registrar no artefato de aceite qual ficou**:

- **(A1)** o controller vive em `internal/channel/testseam/` (path do pacote **não** contém
  `/controllers`), continua entrando no `group:"controllers"` sob `cfg.TestIngress`, e monta a
  rota normalmente. É a forma assumida pelos **Arquivos** desta task.
- **(A2)** o fallback já autorizado pelo goal (`.specs/codedm/GOAL-agent-abstraction.md:1613-1616`):
  `packages/api/go/cmd/smoke-connect/main.go`, que abre o **mesmo** `CODEDM_DATA_DIR` e faz
  `Find → SetConnected → Save` pelo repositório. Fica fora de `./internal/...`, portanto
  **estruturalmente** inalcançável pelo walker, e não abre superfície HTTP nenhuma.

O que **não** é admissível é a forma da iteração 6 (controller em `controllers/` + flag no
`module.go`) — ela emite, e o único jeito de fechar seria declarar `openapi.json` + SDK como
deliverables desta task e rodar `bun check:generated`, pagando regen de SDK por uma rota de teste.

**Baseline medida no HEAD, para o assert de emissão ter contra-prova:**

```
$ ( cd packages/api/go && go run ./cmd/openapi )        ⇒ openapi: wrote public/docs/openapi.json   (~1.9s)
$ jq -r '.paths | keys | length'                        packages/api/go/public/docs/openapi.json  ⇒ 37
$ jq -r '[.paths | keys[] | select(test("_test"))] | length' packages/api/go/public/docs/openapi.json  ⇒ 0
$ git status --porcelain | head                          ⇒ (só o próprio .plans/ novo — SDK e spec limpos)
```

**AC.**
```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA
G=packages/api/go/internal/channel/testseam/test_ingress.go
test -f $G
# o seam NÃO pode morar num pacote varrido pelo emissor (walker.go:106)
! ls packages/api/go/internal/channel/controllers/test_ingress.go > /tmp/t30b-seam.out 2>&1
grep -q 'NewGatewayConnectedEvent' $G
grep -q 'Dispatch('                  $G     # Dispatch síncrono, NÃO Publish assíncrono
! grep -q 'Publish('                 $G
grep -q '/channels/_test/gateway'    $G
grep -q 'X-Owner-Id'                 $G
# ZERO SQL no seam — se ele escrevesse direto, não provaria nada sobre dois processos
! grep -qiE 'INSERT |UPDATE |sqlite\.|store\.' $G
# a flag existe no config (e portanto no rail ENV-03) e é fail-closed sob PRODUCTION
grep -q 'CODEDM_E2E'  packages/api/go/core/config/config.go
grep -q 'TestIngress' packages/api/go/core/config/config.go
grep -q 'TestIngress' packages/api/go/internal/channel/module.go
awk '/func Load/,/^}/' packages/api/go/core/config/config.go | grep -qiE 'PRODUCTION'
# declarada no contrato de env e o .env.example regenerado E commitado
grep -q 'CODEDM_E2E' template.config.ts
grep -q 'CODEDM_E2E' .env.example
test -z "$(git status --porcelain -- .env.example)"
( cd packages/api/go && go build ./... && go vet ./... )
( cd packages/api/typescript && bun test tests/architecture/env-model.test.ts )
# EMISSÃO — o portão que faltava: o seam não entra no spec, e o assert tem CONTRA-PROVA
# (as 37 rotas legítimas continuam sendo emitidas, senão "0 hits" seria "não olhou").
( cd packages/api/go && go run ./cmd/openapi )
test "$(jq -r '[.paths | keys[] | select(test("_test"))] | length' packages/api/go/public/docs/openapi.json)" = "0"
test "$(jq -r '.paths | keys | length' packages/api/go/public/docs/openapi.json)" -ge "37"
# …e a SDK COMMITADA não se mexeu. É ELA que `scripts/check-generated.ts` vê — o openapi.json do
# Go é gitignorado (.gitignore:106), então um git-status sobre ele seria vacuamente positivo.
test -z "$(git status --porcelain -- packages/client/dist/typescript/src)"
# a rota NÃO existe com a flag desligada (o seam é test-only por construção)
# runnable only after esta task: sobe o gateway sem CODEDM_E2E e confere 404.
```

> O bloco acima pina a forma **(A1)**. Se o executor escolher **(A2)** (`cmd/smoke-connect`), as
> cinco linhas sobre `$G` passam a apontar para `packages/api/go/cmd/smoke-connect/main.go`, os
> asserts de rota (`/channels/_test/gateway`) e de header (`X-Owner-Id`) **saem** (não há HTTP), e
> entra `grep -q 'SetConnected' $G` — o resto do bloco, **inclusive as quatro linhas de emissão**,
> fica idêntico.

**As quatro linhas de emissão foram RODADAS no HEAD** (sem o seam, que é o estado "antes"):
`go run ./cmd/openapi` ⇒ `openapi: wrote public/docs/openapi.json` em ~1.9s; `_test` ⇒ **0**;
`keys|length` ⇒ **37**; `git status --porcelain -- packages/client/dist/typescript/src` ⇒ **vazio**.
Depois do seam elas têm de dar **exatamente o mesmo resultado** — é isso que prova que ele não
vazou para o contrato público.

**Prova de runtime da task** (é a **travessia 2** de T31 na variante forte, antecipada aqui como
teste próprio da task, sem o daemon TS no meio): com o gateway de pé sob `CODEDM_E2E=true` num
data dir frio, `create` → seam → ler a linha de volta e comparar `status` **exatamente** com
`CONNECTED` (nunca `grep` de substring — R1 de T31), com a `version` incrementada (prova de que
passou pelo `ON CONFLICT` do repo, e não por um insert novo). Vale a armadilha **A3** de T31: o
`Dispatch` roda **dois** handlers registrados no mesmo evento, então o veredito é a **linha**,
nunca o `curl -sf`.

---

#### T31 — ACEITE FINAL: um SCRIPT que prova UM arquivo e DOIS processos

**Arquivos:**
- `packages/api/typescript/scripts/smoke-shared-store.ts` (**novo — É O DELIVERABLE**; caminho
  fixado pela AC-0.5 do goal, `.specs/codedm/GOAL-agent-abstraction.md:1623`);
- `.specs/codedm/phase0-smoke/smoke-shared-store.log` (a saída do run **real**, commitada — mesmo
  padrão já usado em `.specs/codedm/phase10-smoke/`, que traz script + `real-smoke-run.log`
  commitados lado a lado);
- `.plans/artifacts/2026-07-26-acceptance.md` (registro do aceite: RSS, variante da prova, sonda
  de T07B).

> **REESCRITA NA ITERAÇÃO 7 — a FORMA desta task era o defeito.** Quatro rodadas de review
> encontraram um blocker **novo** aqui, toda vez, enquanto os ACs simples do resto do plano
> (greps, `bun test`, contagens) passavam. A causa não era falta de rigor — as iterações 3-6
> rodaram cada linha. A causa é que esta task **escrevia código dentro de um documento**: uma
> sequência de 8 passos de `curl` com portas, cabeçalhos, rotas, chaves de API e orquestração de
> shell cravados em markdown. Um script de papel não sobrevive ao contato com a realidade, e a
> correção de cada rodada introduzia o defeito da seguinte ($AUTH_HEADER → $OWNER_HEADER →
> $GLOBAL_API_KEY → …).
>
> A task passa a especificar **(1)** o invariante a provar, **(2)** as restrições que a prova tem
> de honrar, **(3)** o deliverable — um script commitado que sai **0** — e **(4)** as armadilhas
> já medidas. **Quem escreve, RODA e itera a sequência é o executor, dentro do script.** É isso
> que a torna correta: um script que não roda **falha**; um markdown que não roda **passa**.

##### 1. INVARIANTE — a única afirmação que fecha a Fase 0

**O gateway Go e o daemon TS leem e escrevem UM único arquivo SQLite.**

Provado por **DUAS travessias cross-process sobre a MESMA linha** — não uma:

- **Travessia 1 (INSERT).** O **gateway** cria um channel WhatsApp pelo **seu** HTTP. O **daemon**
  — outro processo, que nunca escreveu aquela linha — lê o channel e devolve **exatamente** o
  status que o gateway gravou.
- **Travessia 2 (UPDATE).** O **gateway** transiciona a **mesma** linha (é `UPDATE`, não uma linha
  nova: `sqlite_channel_repository.go:191-203` faz `ON CONFLICT … version = gateway_channels.version + 1`).
  O **daemon** relê e devolve o status **novo**.

Cada travessia leva um **controle negativo antes**: o daemon não pode já estar vendo o estado que
vai atravessar (data dir frio para a 1; status anterior para a 2). Sem isso, um data dir sujo ou
uma corrida de ordem de boot satisfaz o critério sem nada ter atravessado.

**O que esta task NÃO prova, e não deve tentar provar:** que uma conta de WhatsApp foi pareada
(exige QR num telefone — `services/gateway/whatsapp/mapper/connected.go:12-20` é o único produtor
de `channel.gateway_connected` em produção). O literal `CONNECTED` é **força opcional** da prova,
não o invariante: com T30B landed a travessia 2 é `CONNECTING → CONNECTED`; sem T30B ela é
`CREATED → CONNECTING` pelo `/connect`, que o gateway faz desassistido (MEDIDO no HEAD, §0f item
2). **As duas variantes provam o mesmo invariante**; o artefato é obrigado a registrar qual rodou
(`CONNECTED_LITERAL_REACHED=yes|no`), para que a versão fraca nunca passe em silêncio.

##### 2. RESTRIÇÕES — a parte load-bearing (a prova só vale se honrar as seis)

**R1 — Comparação EXATA, nunca substring.** No TS: `if (channel.status !== 'CONNECTED') fail()`.
Em shell: `jq -e '.status == "CONNECTED"'`. RODADO (iteração 7, host do executor):

```
$ printf '{"status":"DISCONNECTED"}' | grep -q CONNECTED                        ⇒ EXIT=0   ⚠️ PASSA no sintoma que a fase existe para matar
$ printf '{"status":"DISCONNECTED"}' | jq -e '.status == "CONNECTED"' >/tmp/x   ⇒ EXIT=1   reprova — correto
$ printf '{"status":"CONNECTED"}'    | jq -e '.status == "CONNECTED"' >/tmp/x   ⇒ EXIT=0
```

`DISCONNECTED` **contém** `CONNECTED`, e `CONNECTED` contém `CONNECT` — o mesmo vale para
`CONNECTING`. Nenhuma assertiva de status neste plano pode voltar a ser `grep` de substring.

**R2 — A escrita é do GATEWAY, pela cadeia de produção DELE.** `INSERT` direto do script provaria
que o `sqlite3` sabe escrever, **não** que dois processos compartilham store. A cadeia obrigatória
é: HTTP do gateway → mediator interno → handler → **método da entidade** (`SetConnected`,
`entities/channel.go:103`, ou o `SetConnecting` chamado por `persistConnecting`,
`usecases/connect_channel.go:99-105`) →
`repo.Save`. O script pode **ler** o arquivo por fora (em WAL, leitor não bloqueia nem é bloqueado
por writer — é por isso que a corroboração no arquivo é legítima); **escrever, nunca**.

**R3 — Um `CODEDM_DATA_DIR` só, e os dois processos vivos durante TODA a sequência.** Os dois
sidecars sobem contra o **mesmo** diretório frio, e nenhum dos dois pode morrer entre a travessia
1 e a 2 (é o par vivo que prova compartilhamento; um processo que sobe, escreve e morre prova
apenas que o arquivo persiste). Ver armadilha 1: o smoke de boot existente **derruba** o filho.

**R4 — Nenhum Postgres/Redis ALCANÇÁVEL pelos dois processos.** ⚠️ **Nenhum check de container
expressa isso neste host** — nem o da iteração 6, nem o "óbvio" que o substituiria. MEDIDO agora:

```
$ docker ps --format '{{.Image}}\t{{.Names}}'
redis:alpine          medscall-monorepo-redis
postgres:17-alpine    medscall-monorepo-postgres
$ ! docker ps --format '{{.Image}}' | grep -qiE 'postgres|redis'   ⇒ EXIT=1   (reprova por causa do VIZINHO)
$ docker compose -f docker/docker-compose.yml ps                   ⇒ lista os DOIS containers do vizinho
$ docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.project.config_files"}}' <id>
docker /Users/work/Desktop/Projetos/medscall/software/monorepo/docker/docker-compose.yml
```

O nome de projeto default do compose é o **basename do diretório do arquivo** — `docker` nos dois
repos — então o CLI **deste** repo enxerga o stack do vizinho e
`docker compose … ps -q` volta **não-vazio** com containers que não são nossos. Os dois gates
reprovariam o critério que fecha a fase por causa de outro projeto: a classe "falha pelo motivo
errado" da §8.

Forma correta, e é o que o script assevera — **alcançabilidade, não inventário**: (i) o script
monta o `env` dos dois filhos e nele **não existe** `DATABASE_URL` nem `REDIS_URL` (assert dentro
do script, sobre o objeto que ele passa ao `spawn` — imprime `NO_POSTGRES_REACHABLE=ok`); (ii) o
bundle do daemon não carrega driver pg — é o gate de resíduo de T23, já existente; (iii) o data
dir é frio e o único caminho de dado é `$CODEDM_DATA_DIR/codedm.db`. Se ainda assim se quiser um
check de container, ele tem de casar o rótulo `com.docker.compose.project.config_files` com o
`docker/docker-compose.yml` **deste** repo — nunca o nome de imagem nu.

**R5 — O deliverable é executável, commitado, e a saída do run real também.** Script em
`packages/api/typescript/scripts/smoke-shared-store.ts`, exit **0**; log do run em
`.specs/codedm/phase0-smoke/`. Aceite sem log commitado não é aceite.

**R6 — Nenhuma sequência de shell nova entra NESTE documento.** Se a prova precisar de mais um
passo, ele nasce **no script** — versionado, executado, iterado contra a realidade. Foi a
ausência dessa regra que produziu as quatro rodadas anteriores.

##### 3. DELIVERABLE — o que o script faz

`packages/api/typescript/scripts/smoke-shared-store.ts`, Bun, um arquivo, sem dependência nova:

1. cria um data dir **frio** e sobe os **dois** sidecars contra ele (decidir **como** subir o
   daemon lendo a armadilha **A1** antes de escrever a primeira linha);
2. espera prontidão dos dois por **poll** (nada de `sleep` fixo como sinal de vida): daemon
   `GET /v1/session` ⇒ 200; gateway `GET /api/openapi.json` ⇒ 200;
3. controle negativo → travessia 1 → controle negativo → travessia 2, cada leitura com comparação
   **exata** (R1) e cada escrita pelo HTTP do gateway (R2);
4. corrobora cada travessia **no arquivo** (`SELECT id,status,version FROM gateway_channels WHERE id=?`),
   casando o `id` — a leitura do daemon (`/v1/ui/home`) devolve só `{kind,status}`, sem `id`;
5. imprime linhas-chave **estáveis e greppáveis**, uma por linha:
   `CROSSING_1=ok|fail`, `CROSSING_2=ok|fail`, `STATUS_1=<literal>`, `STATUS_2=<literal>`,
   `CONNECTED_LITERAL_REACHED=yes|no`, `DAEMON_LAUNCH=<bundle|smoke-script>`, `DATA_DIR=<path>`;
6. assevera o **env que ele mesmo monta** para os filhos (R4) e imprime `NO_POSTGRES_REACHABLE=ok`;
7. derruba os dois processos **sempre** (`finally`), e sai **0** somente se tudo passou;
8. escreve tudo em **stdout** — o log commitado é a **redireção** do run aceito
   (`bun … > .specs/codedm/phase0-smoke/smoke-shared-store.log`; **não** `| tee`, que mascara o
   exit code — RODADO: `sai-3 | tee f` ⇒ EXIT=0, `sai-3 > f` ⇒ EXIT=3). O script **não** reescreve
   o arquivo commitado a cada execução: um log com data dir e timestamps novos sujaria a árvore e
   faria o próprio AC de git-limpo falhar.

O script é a documentação executável do aceite. O que estiver **nele** vale mais do que qualquer
parágrafo desta task — porque ele roda.

##### 4. ARMADILHAS MEDIDAS — o executor não redescobre nenhuma

**A1 — `scripts/smoke-node-boot.ts` NÃO serve como está.** Ele é uma **sonda de boot**, não um
supervisor. Medido no arquivo: `:44` faz `mkdtempSync` do **próprio** dir; `:48-52` faz `spawn`
com `env: { ...process.env, CODEDM_DATA_DIR: join(dataDir, 'data'), … }` — a chave **explícita**
(`:50`) **vence** o spread, então um `CODEDM_DATA_DIR` exportado por fora é **silenciosamente
descartado** e o daemon abre outro arquivo (o modo de falha exato que esta fase existe para
matar, e ele passaria verde); `:73-81` faz `SIGTERM`, espera 1500 ms, `SIGKILL` e `rmSync` do dir.
Duas saídas admissíveis, **e o script declara qual usou** (`DAEMON_LAUNCH=`):
- **(a)** subir o bundle direto — `"$NODE_BIN" dist/server.js` depois de `bun run build`
  (verificado: `scripts/build.ts` emite `dist/server.js`, `package.json` tem `build` e
  `smoke:node`) — com poll de prontidão em `/v1/session`;
- **(b)** ensinar `smoke-node-boot.ts` a honrar um data dir externo **e** a ficar vivo (vira
  supervisor, com flag), reusando-o.

**A2 — `node` não está no PATH nu deste host.** MEDIDO: `command -v node` ⇒ **not found**
(§8 já registra). O binário existe sob `~/.nvm/versions/node`, mas nenhum script pode presumir
shell com nvm carregado. Resolver como o smoke já resolve: `CODEDM_NODE_BIN` → maior versão sob
`~/.nvm/versions/node` → PATH (`smoke-node-boot.ts:21-32`). Binários que **podem** ser presumidos:
`bun`, `jq`, `sqlite3`, `lsof`, `awk`, `grep`, `git`, `go`, `docker`, `curl`.

**A3 — O `Dispatch` do evento de conexão faz fan-out para DOIS handlers; um 2xx/não-2xx do gateway
não é sinal sobre a linha.** MEDIDO: `EventName()` devolve `GatewayConnectedEventName` em
`handlers/channel_connected_handler.go:42` **e** em `handlers/channel_sync_handler.go:46`; o
registro é `m.Register(NewChannelConnectedHandler(...))` em `internal/channel/module.go:337` e
`m.Register(NewSyncStartedHandler(...))` em `:346` (`Register` faz `append`,
`internal_mediator.go:38-42`, logo a ordem de execução é a ordem de registro); e
`internal_mediator.go:69-79` **retorna no primeiro erro**, com `safeHandle` (`:133-145`)
convertendo pânico em erro. As duas direções de erro produzem **o mesmo não-2xx** e significam
coisas opostas: hoje o handler de **sync** roda **depois** do de conexão, então uma falha dele dá
não-2xx **com a linha JÁ escrita** (`curl -sf` reprovaria um sucesso); se a ordem de registro
mudar — ou se um handler novo entrar antes —, a falha aborta o `Dispatch` **antes** de
`SetConnected`/`Save`, e o mesmo não-2xx significa "não escreveu". O HTTP **não distingue** os dois.
⇒ **A porta é a LINHA: ler o registro de volta e comparar o status.** Nunca `curl -sf` sozinho.

**A4 — "zero linhas claimadas" é sensível a tempo contra um dispatcher vivo.** Um snapshot
instantâneo pode pegar uma linha legitimamente em voo. A forma correta é asseverar **claim
preso**: `claimed_by IS NOT NULL AND processed_at IS NULL AND lease_until < <agora>` ⇒ 0. Zero
global e instantâneo, não.

**A5 — Toda variável ligada, e o `addr=:3132` some.** O `$AUTH_HEADER` não ligado (iteração 2)
transformou o critério que fecha a fase num 401; `$OWNER_HEADER` ausente (iteração 3) e
`GLOBAL_API_KEY` não ligado (iteração 6) foram as reincidências. No script isso vira código —
sem `env` implícito, sem variável herdada do shell do executor. E o log colado na iteração 6
mostrava `http server started addr=:3132` enquanto o default de config e o `.env` dizem
`CHANNEL_PORT=3032`: MEDIDO agora, `grep -rn '3132'` no repo ⇒ **nenhuma saída**, e
`.env.example:40` + `template.config.ts:385` dizem `3032`. Aquele paste era de um run ad-hoc noutra
porta, não é reproduzível a partir do repo — **removido** desta task em vez de explicado.

**A6 — A lane `api` SAI do critério que fecha a fase (decisão desta iteração).** O AC da iteração
6 tinha um `SELECT count(*) … WHERE source='api' AND processed_at IS NOT NULL >= 1` **sem nenhum
comando que causasse a linha** — um AC insatisfazível por construção. Decisão: **dropar a perna**.
A partição de lanes já é provada por **teste executável** em **T29**, caso 1 ("não-roubo": insere
uma linha `source='api'` e uma `source='gateway'`, roda `flush()`, assevera que a `api` fica com
`processed_at` não nulo e a `gateway` continua **intocada**) — e é lá que ela pertence, porque é
determinística e roda em CI. (O goal e a §0f falam de "T18" para esta prova; T18 entrega o
`SqlExternalMediator`, **não** um arquivo de teste — o arquivo é `tests/flows/shared-outbox-lanes.test.ts`,
de T29. Corrigido aqui.) O que **fica** em T31, porque é sobre o arquivo compartilhado e não sobre
semântica de lane: **não-interferência**, na forma de A4 — nenhuma linha `source='gateway'` com
claim **preso** durante o run. Se algum dia se quiser a perna forte de volta, o caminho verificado
é `POST /v1/owners` no daemon (`src/owner/controllers/CreateOwner.ts:34-37`, body
`{name, kind?, timezone?}` — `kind` tem default; `CreateOwner.ts:47-56` levanta `OwnerCreatedEvent`,
que vira linha de outbox) — **mas só depois de rodar**, não como AC de papel.

**A7 — Postgres do vizinho responde pelo `docker compose` DESTE repo.** Ver R4: medido, os dois
containers de `medscall-monorepo` aparecem em `docker compose -f docker/docker-compose.yml ps`
porque o projeto default dos dois repos é o mesmo (`docker`, basename do diretório). Qualquer
gate de "sem Postgres" baseado em inventário de container reprova o aceite por causa do vizinho.

##### 5. Fatos que o script precisa ligar (todos com procedência verificada)

Estes são os fatos que as iterações 2-6 pagaram caro para descobrir. Eles não formam uma
sequência — são o **conhecimento** que o script codifica.

| o que ligar | valor | procedência (verificada no checkout) |
|---|---|---|
| data dir | UM só, exportado para os dois filhos | R3 + armadilha A1 |
| portas | `API_PORT=3030`, `CHANNEL_PORT=3032` | `template.config.ts:362,385`; `.env.example:40` |
| chaves de API do gateway | **as DUAS** vazias: `CHANNEL_GLOBAL_API_KEY` **e** `GLOBAL_API_KEY` | `core/config/config.go:48` é `getEnvOrDefault("CHANNEL_GLOBAL_API_KEY", os.Getenv("GLOBAL_API_KEY"))`; o `godotenv` do `.env` raiz não tira comentário inline de valor vazio ⇒ guard liga com chave-lixo e todo curl volta 401 (§0f item 4) |
| header do gateway | `X-Owner-Id: <OPERATOR_ID>` | `create_whatsapp_channel.go:15` (`from:"header"`, `validate:"required,uuid"`); mais 10 controllers de `internal/channel/` exigem o mesmo; `session.go:20-67` só estampa com cookie de sessão, que um cliente de smoke não tem |
| `OPERATOR_ID` | ler do arquivo, não digitar | `src/auth/operator.ts:15` ⇒ `00000000-0000-4000-8000-000000000001` |
| header do daemon | **nenhum de auth** — só `Origin` | `src/auth/middlewares/OperatorMiddleware.ts:17-24` estampa a identidade incondicionalmente; `packages/e2e/utils/given/api.ts:36-44` confirma |
| rotas do gateway | `POST /api/channel/channels/whatsapp`; `POST /api/channel/channels/{id}/connect` | `core/services/httprouter/http_router.go:44-56` compõe `/api/{context}{path}` |
| seam de T30B (variante forte) | rota test-only montada só sob `CODEDM_E2E=true`, **literal exato** | T30B; `src/boot.ts:23` recusa a flag sob `NODE_ENV=production` ⇒ ela vai **só** no processo Go |
| leitura do daemon | `GET /v1/ui/home` ⇒ `{ channels: [{ kind, status }] }` (sem `id`) | `src/ui/controllers/GetHomeDashboard.ts:16-17`; `src/ui/usecases/GetHomeDashboard.ts:26,90,98` |
| tabela física | `gateway_channels` — o `channels` do TS é a MESMA tabela | `packages/contracts/db/schema-sqlite/channel.ts:13-14`; `sqlite_channel_repository.go:191` |
| não recriar o channel | reusar o id da travessia 1 | nome é único por owner (`create_channel.go`); `connect` duas vezes cai no ramo "already connected or connecting" (`connect_channel.go:64-70`) e **não escreve** |

##### 6. O que o run também registra (e o que disso já está MEDIDO no HEAD)

Fatos de arquivo, asseverados pelo script ou anotados no artefato — **não** são a prova do
invariante, são o contexto que impede um verde vazio:

- **um arquivo só:** `codedm.db`, `codedm.db-wal`, `codedm.db-shm`, `codedm.db.lock`,
  `daemon.lock` (este nasce em T10) e **nenhum subdiretório** estilo PGlite;
- **ledger única:** `_sqlite_migrations` com **2** linhas; `__drizzle_migrations` inexistente;
- **25 tabelas drizzle** (`name NOT LIKE 'whatsmeow_%'`) **e** co-tenância **positiva** com o
  whatsmeow no mesmo arquivo — que é deliverable do commit `149b6aa3`, não ruído a filtrar
  (`internal/channel/module.go:37` provê o store; `whatsmeow_store.go:46-67` roda o `Upgrade`);
- `PRAGMA journal_mode` ⇒ `wal`;
- **RSS delta:** repetir a medição de T01 (30s de regime, 3 leituras de `ps -o rss=` a cada 10s,
  mediana) e registrar `RSS_MEDIAN_KB_AFTER` + delta absoluto/percentual contra `RSS_MEDIAN_KB`,
  mais `du -sk` do data dir. Expectativa (sanity, não gate): queda grande — o PGlite carrega um
  Postgres em WASM, o libsql não;
- **sonda de interop de T07B re-rodada neste host**, anexada ao artefato.

> **MEDIDO na iteração 6** — gateway Go do HEAD, sozinho, data dir frio, depois de `create` +
> `connect` por HTTP (é esse caminho que constrói o store do whatsmeow):
> ```
> $ sqlite3 $DATA_DIR/codedm.db "SELECT count(*) FROM _sqlite_migrations;"                          ⇒ 2
> $ sqlite3 … "… type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'whatsmeow_%'
>              AND name <> '_sqlite_migrations';"                                                   ⇒ 25
> $ sqlite3 … "… type='table' AND name LIKE 'whatsmeow_%';"                                         ⇒ 16
> $ sqlite3 … "PRAGMA journal_mode;"                                                                ⇒ wal
> $ ls $DATA_DIR   ⇒ codedm.db  codedm.db-shm  codedm.db-wal  codedm.db.lock   (nenhum subdiretório)
> ```
> O **25** é o número drizzle, verificado: `grep -c 'CREATE TABLE'` ⇒ 25 no `0000_*.sql` e 0 no
> `0001_*.sql`, com `grep -c 'IF NOT EXISTS'` ⇒ 0. (O `= "25"` de **T28** continua correto: lá só
> rodam os dois appliers, sem gateway e sem whatsmeow.)

> **MEDIDO na iteração 6** — as duas transições que o gateway faz **desassistido**, e a lane
> `integration` nascendo de um HTTP, sem telefone:
> ```
> POST …/api/channel/channels/whatsapp  -H "X-Owner-Id: $OPERATOR_ID"  -d '{"name":"acceptance-probe"}'
>   ⇒ HTTP 201  {"id":"2b3a4b6c-…","platform":"WHATSAPP","status":"CREATED", …}
> POST …/api/channel/channels/$CH_ID/connect -H "X-Owner-Id: $OPERATOR_ID"
>   ⇒ {"id":"2b3a4b6c-…","state":"CONNECTING","qrCode":"2@lSwDQNDAxXk0knj1…"}     (row: CONNECTING, version=2)
>
> $ sqlite3 -header $DATA_DIR/codedm.db "SELECT source,name,claimed_by IS NOT NULL AS claimed,
>     processed_at IS NOT NULL AS done FROM shared_outbox ORDER BY created_at;"
> gateway|channel.channel_created|0|1
> gateway|channel.gateway_platform_event|0|1
> gateway|channel.channel_connecting|0|1
> integration|integration.channel_special_platform_event.received|0|0
> ```
> `done=0` na lane `integration` é o esperado **hoje**: quem a consome é o `SqlExternalMediator`
> do TS (T18), que ainda não existe. As três `gateway` já saem processadas pelo dispatcher Go.
> ⇒ `create` ⇒ `CREATED`/version 1 e `connect` ⇒ `CONNECTING`/version 2 são **as duas travessias**
> da variante sem T30B; com T30B, o seam leva a `CONNECTED`/version 3.

##### AC

```bash
cd "$(git rev-parse --show-toplevel)"   # ÂNCORA
# --- runnable only after T31 (o script é o deliverable desta task) ---
test -f packages/api/typescript/scripts/smoke-shared-store.ts
# "commitado" = TRACKED (o arquivo nasce nesta task; `git status --porcelain` diria `??`
# e reprovaria o próprio deliverable antes do commit).
git ls-files --error-unmatch packages/api/typescript/scripts/smoke-shared-store.ts > /tmp/acc-tracked-script.out
# ⚠️ REDIRECT, NUNCA `| tee`: pipeline devolve o exit code do ÚLTIMO comando. RODADO —
#    `script-que-sai-3 | tee f` ⇒ EXIT=0 (mascara), `script-que-sai-3 > f` ⇒ EXIT=3.
bun packages/api/typescript/scripts/smoke-shared-store.ts > /tmp/acc-smoke.out       # exit 0 — É O CRITÉRIO
grep -q 'CROSSING_1=ok' /tmp/acc-smoke.out
grep -q 'CROSSING_2=ok' /tmp/acc-smoke.out
grep -qE '^DAEMON_LAUNCH=(bundle|smoke-script)' /tmp/acc-smoke.out   # armadilha A1: declarar qual saída foi usada
grep -q 'NO_POSTGRES_REACHABLE=ok' /tmp/acc-smoke.out               # R4: env dos filhos, não inventário de container
# o log do run ACEITO está commitado (tracked). `git status --porcelain` NÃO serve aqui: o run do
# próprio AC gera timestamps/data dir novos, então a árvore ficaria suja por construção.
test -s .specs/codedm/phase0-smoke/smoke-shared-store.log
git ls-files --error-unmatch .specs/codedm/phase0-smoke/smoke-shared-store.log > /tmp/acc-tracked.out
grep -qE '^CONNECTED_LITERAL_REACHED=(yes|no)' .specs/codedm/phase0-smoke/smoke-shared-store.log
# --- gates de FORMA sobre o script (rodados contra fixtures na iteração 7, tabela abaixo) ---
! grep -nE "grep -q ['\"]?CONNECTED" packages/api/typescript/scripts/smoke-shared-store.ts > /tmp/acc-g1.out
! grep -niE '(INSERT|UPDATE|DELETE)[[:space:]]+(INTO|FROM|gateway_channels)' packages/api/typescript/scripts/smoke-shared-store.ts > /tmp/acc-g2.out
# --- artefato de aceite: RSS + sonda de T07B (runnable only after T01/T07B) ---
grep -qE 'RSS_MEDIAN_KB_AFTER=[0-9]+' .plans/artifacts/2026-07-26-acceptance.md
grep -qE 'RSS_DELTA_KB=-?[0-9]+'      .plans/artifacts/2026-07-26-acceptance.md
bun scripts/probe-sqlite-interop.ts > /tmp/acc-probe.out    # idem: redirect, não `| tee -a`
cat /tmp/acc-probe.out >> .plans/artifacts/2026-07-26-acceptance.md
grep -q 'WAL_INTEROP=ok'                      /tmp/acc-probe.out
grep -q 'READ_AFTER_COMMIT_CROSS_PROCESS=yes' /tmp/acc-probe.out
grep -q 'READ_AFTER_COMMIT_SAME_PROCESS=yes'  /tmp/acc-probe.out
```

**Formas RODADAS na iteração 7** (os dois gates negados, contra fixtures sintéticos — é assim que
se prova que um `! grep` discrimina em vez de passar vazio):

```
fixture                                                            no-substring-gate   no-write-sql-gate
if (grep -q "CONNECTED") {}                                        EXIT=1 (reprova)    EXIT=0
if (channel.status !== 'CONNECTED') fail()                         EXIT=0              EXIT=0
await db.execute("INSERT INTO gateway_channels VALUES (1)")         EXIT=0              EXIT=1 (reprova)
```

E as formas de `jq` de igualdade exata, RODADAS (mesma tabela da iteração 6, revalidada):

```
entrada                                                  jq -e '.status == "CONNECTED"'
{"status":"DISCONNECTED"}                                EXIT=1 (false)
{"status":"CONNECTED"}                                   EXIT=0 (true)
```

E o gate de "está commitado", RODADO — é a forma que substitui o `git status --porcelain` num
arquivo que o próprio AC regenera:

```
$ git ls-files --error-unmatch template.config.ts                          ⇒ EXIT=0  (tracked)
$ git ls-files --error-unmatch .plans/2026-07-26-daemon-sqlite-migration.md ⇒ EXIT=1  (untracked)
```

E o motivo de **nenhuma** linha deste bloco usar `| tee`, RODADO:

```
$ /tmp/failing.sh | tee /tmp/tee.out > /dev/null ; echo EXIT=$?   ⇒ EXIT=0   (mascara o 3 do script)
$ /tmp/failing.sh > /tmp/red.out                 ; echo EXIT=$?   ⇒ EXIT=3   (preserva)
```

Se **qualquer** linha do bloco falhar, a fase não está pronta — reportar a linha, não seguir.

##### Estado por item (o que já foi executado no HEAD, e o que espera código)

| item | estado |
|---|---|
| R1 (exato vs substring), gates de forma, tabela de `jq` | **RODADOS** (iteração 7 e 6) |
| R4 — `docker ps` e `docker compose ps` deste repo listam o stack do VIZINHO | **MEDIDO** (iteração 7, com o rótulo `config_files` colado) |
| A1 (`smoke-node-boot.ts` descarta data dir externo e mata o filho) | **MEDIDO no arquivo** (`:44`, `:48-52`, `:73-81`) |
| A2 (`node` fora do PATH) | **MEDIDO** — `command -v node` ⇒ not found |
| A3 (fan-out de 2 handlers, retorno no 1º erro, ordem de registro) | **MEDIDO no código** (`:42`, `:46`, `module.go:337,346`, `internal_mediator.go:38-42,69-79`) |
| A5 (`3132` não existe no repo) | **MEDIDO** — `grep -rn '3132'` ⇒ nenhuma saída |
| gateway sobe em data dir frio; `create` ⇒ CREATED; `connect` ⇒ CONNECTING/version 2 | **RODADO** (iteração 6) |
| ledger=2, 25 drizzle, 16 whatsmeow, `wal`, sem subdiretório | **RODADO** (iteração 6, metade Go) |
| daemon TS sobre libsql (boot, `/v1/session`, `/v1/ui/home`) | **espera T08–T24** |
| `daemon.lock` | **espera T10** |
| travessia 2 no literal `CONNECTED` | **espera T30B**; a variante `CONNECTING` já está RODADA |
| lane `integration` com `processed_at` não nulo | **espera T18** (fora do AC desta task — ver A6) |
| RSS/`du` e sonda de interop | **espera T01/T07B** |

---

## 6. Resumo mecânico de deleções e reescritas

**Deletados:** `PGliteDriver.ts`, `NodePgDriver.ts` (já morto), `core/src/db/types/jsonb.ts`
(`customType` de pg-core, zero consumidores fora do barrel), **`core/src/db/config.ts`**
(`createDrizzleConfig` com `dialect: 'postgresql'` hardcoded, zero consumidores, exportado pelo
barrel), os dois `bun-file-assets.d.ts`, o staging de PGlite em `scripts/build.ts`, o serviço
`postgres` + volume `postgres_data` do `docker-compose.yml`,
**`packages/e2e/scripts/cleanup-stale-dbs.ts` + as deps `pg`/`@types/pg` do e2e + o script raiz
`test:e2e:cleanup` + a linha do `CLAUDE.md`**, as deps `@electric-sql/pglite` e `pg`, o bloco
PL/pgSQL de `truncateAllTables`, `.for('update', { skipLocked })`, o `tx.delete(outbox)` do
dispatcher, **a carve-out `CODEDM_E2E` do `ExternalMediator` (`registry.ts:114`)**.

**Reescritos:** `DrizzleOutboxDispatcher` (lease + lane, T17), `PostgresCommandQueue` →
`SqliteCommandQueue` (**reescrita de SQL, não de transporte** — T16), `saveWithOptimisticLock`
(genéricos sqlite-core, T14), `GetAttachThreadWizard` (cursor keyset sem casts **+ `ilike`→
`like`**, T20), `PersistenceProbe` (sem namespaces, T22), `truncateAllTables` →
`resetAllTables` (T15), `DataDirLock` (por papel, T10), `client.ts` (dialeto, T08), applier de
migrations dos **dois** lados (T04 + T09), `SidecarDecl` + `buildCmd` + `mod.rs` (contrato de
packaging, T25), `tx-discipline.test.ts` (escopo ampliado, T13B),
`TestIngressController` (passa a **escrever a linha `source='integration'`** em vez de publicar
in-process, T18).

**Novos, nascidos da iteração 2:** o **`TxGate`** dentro do `LibsqlDriver` (T09); as sondas extra
de T07B; e **T07C**, o gate que lê essas sondas e libera (ou barra) a entrada na janela vermelha.

**Novos / invertidos na iteração 3 (o que a medição mudou):**
- **`LibsqlDriver` abre DOIS clients de regime** (escrita + leitura) e dirige `BEGIN IMMEDIATE`
  **à mão**; **`client.transaction()`/`db.transaction()` estão PROIBIDOS** no repo — vazam uma
  conexão nativa por chamada (500 tx ⇒ +1000 fds, linear) e derrubam `busy_timeout`/`foreign_keys`
  silenciosamente. Gate repo-wide em T23 item (4). O membro abstrato `db` passa a ser o handle de
  **leitura**, o que mantém os **58** arquivos que injetam `DrizzleClient` intocados.
- **`DrizzleUnitOfWork` DEIXA de ser "porta sem mudança" (T13).** Ele é hoje o principal
  consumidor do caminho banido (`:16` é literalmente `this.db.transaction(...)`); passa a chamar
  `driver.transaction(fn)`, e `DrizzleTransaction` deixa de ser tipo derivado.
- **`DrizzleDatabaseDriver` ganha um 8º membro abstrato:** `transaction<T>(fn)`.
- **`attempts` volta ao claim do outbox e é incrementado lá**, mais um **sweep de poison** —
  invertendo o que as iterações 1 e 2 mandavam. Sem isso, um evento que mate o processo é
  redelivery infinita a cada 30s (T17 item 0/1, T29 caso 9).
- **A ordenação owner-sequencial fica QUALIFICADA como intra-lote** — e o docblock e o nome do
  teste passam a dizer isso (T17 item 4, T29 caso 8).

**Portados sem mudança (verificado, não presumido):** os **repositórios** — recebem o `tx` e
fazem `select/insert/update`, superfície idêntica; e **não existe nenhum `tx.rollback()`** no
repo (`grep -rn "\.rollback()" packages/api/typescript` → vazio), que era o único consumidor que
o `BEGIN` manual quebraria. **Mas a semântica muda mesmo assim**: a transação deixa de ser falsa
(`PGliteUnitOfWork` chamava `fn(this.db)` sem `BEGIN`) e passa a ser real. Isso não é "portar sem
mudança" para quem *usa* o UoW — T13B audita, e o universo da classe 1 é de **4 linhas medidas**.

**Inventário dos pg-ismos que NÃO dão erro de compilação** (a classe que quase escapou inteira;
o gate repo-wide está em T23):

| pg-ismo | onde | task |
|---|---|---|
| `now()` × 5 | `PostgresCommandQueue.ts:293,297,311,312,320` | T16 |
| `interval '1 millisecond'` | `PostgresCommandQueue.ts:320` | T16 |
| `FOR UPDATE SKIP LOCKED` | `PostgresCommandQueue.ts:317` **e** `DrizzleOutboxDispatcher.ts:141` | T16, T17 |
| `UPDATE … FROM` | `PostgresCommandQueue.ts:323-325` | T16 |
| `ilike()` (dialect-neutral no tipo → **compila**) | `GetAttachThreadWizard.ts:2,162` | T20 |
| casts `::int` / `::uuid` / `::timestamptz` | `DrizzleDomainEventRepository.ts:88`, `GetAttachThreadWizard.ts:159,169-171,206` | T19, T20 |
| `DO $$ … pg_tables … TRUNCATE CASCADE` | `drivers/utils.ts:19-28` | T15 |
| 50 defaults db-side ausentes (36 ts + 14 ids) | `schema-sqlite/*.ts` | T03, T21 |

---

## 7. Questões abertas (não bloqueiam a execução; decidir antes de fechar a fase)

1. **Assimetria de auditoria.** O `SqlExternalMediator.Publish` do Go escreve **só** em
   `shared_outbox` (`sql_external_mediator.go:123-133`), enquanto o `saveIntegrationEvent` do
   TS escreve nas **duas** (`shared_events` + `shared_outbox`). Num arquivo compartilhado isso
   significa que evento de integração publicado pelo Go **não tem linha de auditoria**.
   Recomendação: fechar (adicionar o insert em `shared_events` ao `Publish` do Go), porque o
   log de auditoria vira o único registro durável depois que os tombstones forem podados.
2. **Janela de retenção.** Os 7 dias de T30 são placeholder. Medir linhas/dia no smoke de T31
   antes de congelar. E decidir se `shared_events` é podado ou cresce para sempre no disco do
   usuário.
3. **Ingress TS→Go.** Nenhum evento de integração TS é consumido pelo Go hoje, então a lane
   `integration:gateway` foi **deferida**. Se algo de curto prazo (o trabalho de agent context)
   precisar que o Go reaja a um fato TS, o split de lane deve entrar **agora**, enquanto o
   protocolo está sendo escrito.
4. **Embed das migrations.** T25 mantém o resource staged + `CODEDM_MIGRATIONS_DIR`. Gerar um
   `migrations.embedded.ts` de `import … with { type: 'file' }` faria o sidecar compilado
   carregar o SQL como o `//go:embed` do Go faz, removendo **uma das três cópias em disco** e
   toda a superfície de `CODEDM_MIGRATIONS_DIR`. Vale considerar já que o sidecar está sendo
   mexido de qualquer forma.
5. ~~**`busy_timeout` dividido.**~~ **FECHADA na iteração 2** — virou decisão (c)(6), com
   mecanismo escrito nos dois lados: handle **curto e dedicado** para migration (Go: segundo
   `sql.Open` com `busy_timeout(30000)` + `defer Close`; TS: segundo client libsql com
   `applyPragmas(..., { busyTimeoutMs: 30000 })` + `finally close`), handle de regime intocado
   em 5000. ACs em T04 e T09. Não era admissível ficar como "questão aberta" **e** como AC duro
   ao mesmo tempo.
6. **Interop em linux/win32.** O trio libsql ↔ modernc ↔ WAL foi provado em `darwin-arm64`
   **apenas**. Agora isso é **acionável**: rodar `bun scripts/probe-sqlite-interop.ts` (T07B) em
   `linux-x64` e `win32-x64` e commitar a saída em
   `.plans/artifacts/2026-07-26-probe-<os>-<arch>.txt` **antes** de shippar esses alvos do
   Tauri. A questão fecha quando os três hosts têm artefato com `WAL_INTEROP=ok` e
   `SQLITE_BUSY=0`.
7. **Prebuilds cross-triple.** `bun install` baixa só o `optionalDependency` do host e
   `HOST_TRIPLES` só builda para o host. Latente até a CI fazer cross-build, quando o sidecar
   builda e falha em **runtime**. Precisa de dono.
8. **Auditoria de `process.cwd()`.** T25 muda o CWD do sidecar. `core/src/utils/paths.ts` deriva
   `API_ROOT` do bundle (cwd-independente), mas a varredura por outros resolvedores relativos
   não foi concluída.
9. ~~**Pool de clients libsql (o escape hatch do `TxGate`).**~~ **RETIRADA na iteração 3 — o pool
   é PIOR, não melhor.** A iteração 2 nomeava "N `createClient` sobre o mesmo `file:`, checkout
   por transação" como saída caso o `TxGate` doesse. As medições derrubam isso por dois motivos
   independentes: (a) o driver local do libsql é **síncrono**, então N clients multiplicam o
   número de threads capazes de congelar o event loop, sem aumentar a vazão de escrita (o SQLite
   admite **um** writer, ponto); (b) se qualquer client do pool usar `client.transaction()`, o
   vazamento de fd volta **multiplicado por N**. **Não implementar pool.** Se o `TxGate` doer em
   regime, as saídas admissíveis são, nesta ordem: encurtar as transações (T13B classe 2),
   baixar o `busy_timeout` com retry no nível do use case, e só então reabrir a **escolha de
   adapter** pela regra do §8. Se T07C devolver `GATE=FAIL`, é a decisão (a) inteira que reabre —
   não esta questão.
10. **A sobra de Redis (deliberadamente deferida, mas com dono).** Depois de T18 o binding real
    é `SqlExternalMediator` e **nada** referencia `RedisExternalMediator`; ainda assim
    permanecem no tree: a classe, a dep `ioredis` (`core/package.json:38`), e o serviço `redis`
    + volume `redis_data` no `docker/docker-compose.yml:45-63`. Esta fase **não** os remove — o
    escopo é substrato de persistência, e arrancar transporte no mesmo commit misturaria dois
    riscos. Mas isto fica registrado como follow-up explícito, com AC próprio numa fase
    seguinte, em vez de virar código órfão que ninguém sabe se é intencional. Nota: `reviveIsoDates`
    e `ISO_DATETIME_RE` são extraídos de `RedisExternalMediator` em T18 — a deleção futura tem
    que checar que o módulo compartilhado sobreviveu.
11. **Alinhar o `attempts` do dispatcher Go (nasceu na iteração 3).** A decisão (d) passou a
    incrementar `attempts` **no claim** no lado TS (anti-crash-loop, com o precedente documentado
    em `PostgresCommandQueue.ts:301-306`). `sqlite_outbox_dispatcher.go:249` ainda incrementa em
    `finalizeFailure`, ou seja o **gateway Go continua com o crash-loop ilimitado** na lane
    `gateway`. Não foi corrigido nesta fase de propósito: o escopo é o substrato do daemon TS, e
    mexer na semântica de retry de um dispatcher já testado é mudança de comportamento que merece
    fase própria. Precisa de dono, e o comentário do claim TS tem que dizer que a divergência é
    conhecida — senão alguém "harmoniza" o TS para baixo.
12. **A duplicação de simuladores de gateway (nasceu na iteração 6, com T30B).** Depois de T30B
    existem **dois** seams test-only que produzem "channel CONNECTED": o do TS
    (`src/shared/controllers/TestIngressController.ts`, ramo `channel-connected`, um upsert
    direto em `channels`) e o do Go (`internal/channel/controllers/test_ingress.go`, que dispara
    o evento real pela cadeia de produção do gateway). Eles **não** são redundantes hoje: o
    harness Playwright sobe **só** o daemon TS (`packages/e2e/scripts/run-e2e.ts`), então sem o
    Go de pé o ramo TS continua sendo a única forma de ter um channel conectado num spec. Mas
    manter dois simuladores da mesma coisa é dívida com prazo: **decidir, na fase que subir o
    gateway dentro do harness e2e, se o ramo `channel-connected` do TS morre em favor do seam
    Go.** Não fazer isso nesta fase — T18 acabou de fixar o papel do controller TS, e trocar o
    harness no meio da janela vermelha é exatamente o tipo de escopo que §"Scope discipline"
    proíbe.

---

## 8. Regras de execução

- Não reabrir as decisões (a)–(d). Contradição medida ⇒ parar e reportar. **A medição é T07B e o
  veredito é T07C** — rodá-los é o que dá ao executor o direito de invocar esta regra. E os dois
  ficam **antes** de T08 de propósito: dentro do commit único, "parar" custa reverter 16 tasks.
- **T08 não começa com `GATE=FAIL` em T07C.** É o único ponto do plano onde uma medição pode
  reabrir uma decisão fechada; ignorá-lo é entrar na janela vermelha com o adapter em dúvida.
- Um commit por task, exceto o bloco 2 (**T08–T23**, e só ele) que é **um** commit. T07, T07B e
  T07C têm commit próprio. Stage por arquivo, nunca `git add -A`.
- T07, T07B e T07C rodam **no checkout principal** (lockfile compartilhado). T07 quebra o daemon
  das demais branches até esta mergear — ver §4.
- Nunca `git stash` atravessando regen de contracts/SDK.
- Nada do bloco 3 começa antes de T23 passar por inteiro — **incluindo o gate repo-wide de
  pg-ismos e `bun test:tooling`**, que são novos.
- **REGRA MESTRA (iteração 5): AC se roda em BLOCO, do topo ao fim, num shell só, a partir da
  raiz do repo.** Rodar linha a linha esconde a classe inteira de defeitos que a iteração 5
  encontrou. Três regras derivadas, todas obrigatórias ao **escrever** um bloco:
  1. **A 1ª linha de todo bloco de AC é `cd "$(git rev-parse --show-toplevel)"`.** Todo caminho
     depois dela é relativo à raiz.
  2. **`cd` diferente ⇒ SUBSHELL: `( cd packages/api/go && … )`.** `cd X && cmd` solto **vaza o
     cwd** para todas as linhas seguintes; a segunda `cd X` falha ("no such file or directory")
     e o resto do bloco roda no lugar errado. Se várias linhas seguidas dependem do mesmo cwd
     (asserts sobre `dist/`, sobre `src-tauri/binaries/`), elas vão **dentro do mesmo**
     subshell. Consequência medida no T23 da iteração 4: `go build`/`go vet`/`go test` **não
     rodavam**, `bun tsc` virava o script cru do subpacote, e os quatro `! grep` repo-wide
     **passavam vazios** — o portão que fecha a janela vermelha fechava tendo verificado nada.
  3. **Bloco com `! grep` repo-wide leva GUARD DE ÂNCORA** — um `test -d <dir>` e um controle
     positivo (`grep -rq <termo-que-existe> <dir>`) antes dos negados. Sem isso, "não achou" e
     "não olhou" são o mesmo exit code.
- **O `grep` deste plano NÃO é o `grep` do sistema — e é isso que as contagens assumem.** Neste
  host `grep` é uma **função de shell** (definida no snapshot do CLI) que reexecuta o binário do
  Claude Code como **ugrep**:
  ```
  $ type grep
  grep is a shell function from /Users/work/.claude/shell-snapshots/snapshot-zsh-….sh
        ARGV0=ugrep "$_cc_bin" -G --ignore-files --hidden -I --exclude-dir=.git … "$@"
  $ grep --version
  ugrep 7.5.0 aarch64-apple-macosx +neon/AArch64; -P:pcre2jit; -z:…
  ```
  Três consequências **medidas**, todas com efeito direto em número de hit e em exit code:
  1. **`--ignore-files` honra `.gitignore` — mas só os que estão AO/ABAIXO da raiz da busca.**
     Buscar a partir de um subdiretório **não** enxerga o `.gitignore` da raiz do repo, então
     artefato ignorado (`dist/`) **entra na contagem**. RODADO:
     `grep -rn CODEDM_E2E packages/api/typescript | wc -l` ⇒ **23**;
     `grep -rn CODEDM_E2E packages/api/typescript/src | wc -l` ⇒ **18**; a diferença são 5 hits
     em `packages/api/typescript/dist/server.js`, gitignorado em `.gitignore:37`. Já a mesma
     busca a partir da raiz (`grep -rln CODEDM_E2E .`) **não** lista `dist/`. Foi exatamente
     assim que a iteração 5 publicou "17 CODEDM_E2E" (corrigido em T18 para **18, src/**).
     **Regra:** toda contagem deste plano é declarada **com o diretório de busca**, e contagem
     sobre `packages/api/typescript` sem `src/` é suspeita até prova em contrário.
  2. `-G` (BRE por padrão) + `-I` (pula binário) + `--hidden`: um `grep -rn` daqui **não** é
     equivalente ao `grep -rn` do BSD/GNU numa máquina de CI. Para reproduzir o número exato do
     plano, use o mesmo escopo de diretório; para reproduzir o número do sistema, `command grep`
     (RODADO: `command grep -rn CODEDM_E2E packages/api/typescript | wc -l` ⇒ **23**, igual —
     a divergência vem do `.gitignore`, não do motor).
  3. O `\s` funciona nos greps daqui (extensão ugrep/GNU) e **não** no `awk` — ver a regra
     dedicada mais abaixo; por isso o plano usa `[[:space:]]` nos dois.
- **`| tee` num AC MASCARA o exit code — e o critério que fecha a fase é um exit code.** RODADO
  (iteração 7, zsh deste host): um script que sai **3** vira `EXIT=0` sob `script | tee f`, e
  continua `EXIT=3` sob `script > f`. Pipeline devolve o status do **último** comando, e `tee`
  sempre sai 0. Toda vez que um AC quiser "rodar e guardar a saída", a forma é **redirect para
  arquivo** (que também é o que a regra do `> /dev/null` já exige); para anexar num artefato,
  `cmd > /tmp/x.out` seguido de `cat /tmp/x.out >> <artefato>`.
- **`> /dev/null` num gate negado INVERTE o gate neste host.** Com o `grep` do CLI (ugrep 7.5.0),
  `! grep … | grep -v node_modules > /dev/null` devolve **0** com 101 hits, enquanto a mesma
  linha sem redirect devolve **1**. Reproduzido 3×. Nenhum gate deste plano usa `> /dev/null`;
  para silenciar, redirecione para arquivo (`> /tmp/gate.out`), que preserva o exit code.
- **REGRA MESTRA (iteração 3): AC não rodado não é AC.** Todo grep, todo comando e toda contagem
  deste plano foi **executado contra o checkout** antes de virar critério, com a saída colada ao
  lado. Ao editar este plano, a mesma regra vale: rode primeiro, cole a saída, depois escreva.
  Se o comando só puder rodar depois de uma task criar o arquivo, escreva
  **`runnable only after Tnn`** e exprima o que dá para checar **agora** (T02 valida a forma do
  grep contra um enum-proxy já commitado; T21 exprime delta em vez de absoluto). As três classes
  de defeito que essa regra teria evitado sozinha, todas presentes até a iteração 2: **forma
  emitida afirmada sem ler o emissor** (T02), **gate repo-wide que casa 151 linhas legítimas**
  (T23/T15), e **dois ACs da mesma task mutuamente insatisfazíveis** (T16).
- **Gate repo-wide se escopa pelo RECEPTOR ou pelo DIRETÓRIO DONO, nunca pelo nome nu do método.**
  `.execute(` é o vocabulário de use case deste repo (`useCase.execute`, `handler.execute`,
  `mw.execute`, `this.query.execute`); `.rows` é propriedade de domínio (`batch.rows`). Proibir o
  nome nu proíbe o repo. Use `\b(db|tx|client)\.execute\(`, `\b(result|res|rs)\.rows\b`.
  **A mesma regra vale para gate de RESÍDUO sobre nome de CLASSE** (iteração 5): `! grep -q
  "EventEmitter2Mediator" src/shared/registry.ts` era insatisfazível porque aquela classe **é**
  a implementação do `InternalMediator` em `mock` e `real` (`registry.ts:137`) — passar o gate
  significava deletar o barramento de eventos interno. Quando o alvo é uma **troca de binding**,
  assevere o binding: `! grep -q realExternalMediator` + `grep -qE 'token: ExternalMediator.*real:
  SqlExternalMediator'`, mais um assert **positivo** do que fica por design, para que ninguém
  "limpe" o que devia sobreviver. Antes de escrever `! grep -q <Nome>` num arquivo: rode
  `grep -n <Nome> <arquivo>` e pergunte de cada hit **"esta linha morre nesta task?"**.
- **AC com contagem de tabelas/linhas em banco declara QUEM MAIS escreve no banco.** T31 cravava
  25 tabelas num arquivo que, no momento do aceite, tem também as do `whatsmeow` — o gateway Go
  abre o **mesmo** `codedm.db` com um handle dedicado e roda o `Upgrade` do seu próprio esquema
  (`whatsmeow_store.go:46-67`, provido por `internal/channel/module.go:37`). E essa co-tenância
  é **deliverable**, não ruído: o filtro (`AND name NOT LIKE 'whatsmeow_%'`) vem sempre
  acompanhado de um assert **positivo** de que o outro esquema está lá.
- **Contagem absoluta em AC só vale com a task que a invalida NOMEADA.** Se uma task anterior do
  mesmo bloco muda o número (T18 → T21), exprima **delta** (`EXPECTED=$((HEAD + DELTA))`) ou
  **auto-consistência** (o artefato tem uma linha por hit encontrado **agora**). Número absoluto
  de memória é a forma mais barata de reprovar a execução correta.
- **REGRA IRMÃ (iteração 4): um AC também não pode exigir trabalho de uma task POSTERIOR.** A
  regra acima cobre "task anterior invalidou o número"; o buraco simétrico é o AC de Tnn que
  exige zero de algo que só morre em Tmm, com `mm > nn` — ele reprova **quando roda**, com a
  árvore correta. Três ocorrências corrigidas na iteração 4: **T09-a1** (dependia de T11 e T13),
  **T10** (dependia de T11), **T15** (dependia de T16). As saídas admissíveis, nesta ordem:
  (1) **escopar o AC ao diretório/arquivo que a task POSSUI** (foi o caso de T15: `core/src` →
  `core/src/db`, com a forma ampla mantida em T23, que roda depois de todo mundo);
  (2) excluir explicitamente o arquivo que morre depois, **nomeando a task que o mata**
  (`grep -v PGliteDriver` em T10, com o gate de T11/T23 garantindo que a exclusão não esconde
  nada); (3) marcar o item **`runnable only after Tmm`** e deixar ao lado um AC file-local que a
  task consegue provar sozinha (T09). **Ao escrever um AC negativo, rode-o no HEAD e pergunte de
  cada hit: "quem mata esta linha, e essa task roda antes ou depois desta?"**
- **AC não pode depender de binário que não está no PATH.** `node` **não existe** neste host
  (`which node` ⇒ not found; há `node` sob `~/.nvm/versions/node`, mas um AC não pode presumir
  shell com nvm carregado). Use `bun --print` / `bun -e` — e **verifique o índice de `argv`**:
  sob `bun -e "…" X`, `process.argv` é `[bun, "X"]`, logo o argumento é **`argv[1]`**. Binários
  confirmados presentes e utilizáveis em AC: `bun`, `jq`, `sqlite3`, `lsof`, `awk`, `grep`,
  `git`, `go`, `docker`, `curl`. `scripts/smoke-node-boot.ts` resolve o `node` sozinho
  (`CODEDM_NODE_BIN` → nvm → PATH) — é por isso que T31 pode chamá-lo.
- **AC de contrato HTTP se escreve LENDO o contrato, não a rota.** Ligar `$VAR` no bloco de
  setup não basta: é preciso abrir o controller e ligar **todo** campo `validate:"required"` que
  ele declara. `create_whatsapp_channel.go:15` exige `X-Owner-Id` (`from:"header"`,
  `validate:"required,uuid"`) — 11 controllers de `internal/channel/` exigem o mesmo — e o
  `session.go` do gateway só estampa esse header quando há **cookie de sessão**, que um `curl`
  de aceite não tem. Um header faltando não dá "erro de header": dá 4xx → `curl -sf` != 0 →
  variável vazia → **cascata** de ACs falhando longe da causa. Antes de escrever um `curl` num
  AC: `grep -n 'from:"header"\|from:"query"\|validate:"required' <controller>`.
- **…e ler o CARREGADOR DE CONFIG, não só o controller.** Ler o contrato do endpoint ainda deixa
  passar o guard que nem aparece no controller. `internal/shared/module.go:56-60` só encadeia o
  middleware de `apikey` quando `cfg.GlobalAPIKey != ""`, e `core/config/config.go:48` é
  `getEnvOrDefault("CHANNEL_GLOBAL_API_KEY", os.Getenv("GLOBAL_API_KEY"))` — **variável vazia cai
  no fallback**. Somado a isso, o `godotenv` do `.env` raiz **não** remove comentário inline de
  valor vazio (medido: `CHANNEL_GLOBAL_API_KEY` vira a string
  `"# gateway HTTP apikey guard (…)"`), de modo que exportar só a primeira **não** desliga o
  guard: todo `curl` volta 401. **Regra: para cada variável que um AC liga, procurar a cadeia de
  fallback dela no carregador de config e ligar a cadeia inteira.**
- **Assertiva sobre estado com nome de enum é IGUALDADE EXATA sobre campo parseado, nunca
  substring.** `printf '{"status":"DISCONNECTED"}' | grep -q 'CONNECTED'` sai **0** — RODADO. O
  literal errado é subcadeia do certo em `CONNECTED`/`DISCONNECTED`, e o mesmo vale para
  `CONNECTING`/`CONNECTED` sob `grep -q 'CONNECT'`. A forma canônica do plano é
  `jq -e '[.channels[] | select(.status == "CONNECTED")] | length == 1' <arquivo> > /tmp/x`
  (redirect para **arquivo**, nunca `/dev/null`). Rodada contra os quatro payloads possíveis, com
  a tabela de exit codes colada na **restrição R1 de T31**.
- **AC de aceite não pode depender de um estado que exige INTERVENÇÃO HUMANA.** O aceite de T31
  pedia `CONNECTED`, que só nasce do `events.Connected` do whatsmeow (QR escaneado num telefone —
  `services/gateway/whatsapp/mapper/connected.go:12-20`, único produtor). Um gate assim não
  "falha": ele **trava a fase**. As saídas admissíveis, nesta ordem: (1) abrir uma **seam de
  ingress no processo dono do estado**, que dispare o evento pela cadeia de produção dele (é o
  que T30B faz, e é por isso que ela usa `Dispatch` e **não** escreve SQL); (2) provar a mesma
  afirmação sobre a transição que o processo **consegue** fazer desassistido, registrando no
  artefato de aceite **qual** variante rodou e **por quê** (`CONNECTED_LITERAL_REACHED=yes|no`).
  O que não é admissível é deixar o executor com um portão inalcançável e nenhuma alternativa.
- **`\b` não isola sufixo de propriedade.** `\bnow\(\)` casa `Date.now()` porque há fronteira de
  palavra entre o `.` e o `n`. Para "a função SQL `now()`, não o método JS", a forma é
  `(^|[^.A-Za-z_])now\(\)` — usada de forma **idêntica** em T16 e T23, de propósito, para que os
  dois gates nunca discordem.
- **`awk` não entende `\s` — mesmo que o `grep` deste host entenda.** `\s` é extensão
  GNU/ugrep: no `grep -E` daqui funciona, **no awk não**. `awk '/x\s*\(/,/^\t}/'` trata `\s` como
  `s` literal, o range **não abre**, o `grep` a jusante recebe entrada vazia — e o AC "passa" sem
  inspecionar nada (ou falha sempre, conforme a polaridade). Verificado. Use `[[:space:]]*`, que
  funciona nos dois, em **todo** o plano — inclusive nos greps, para não depender de qual `grep`
  está no PATH da máquina do executor.
- **Shell é zsh:** glob não citado sem match **aborta o comando antes do `grep`**. Todo padrão
  em AC vai entre aspas (`--include='*.ts'`). E `wc -l` do BSD emite espaço à esquerda: sempre
  `| tr -d ' '` antes de comparar. **E zsh NÃO faz word-splitting de variável não citada:**
  `SRC="dir1 dir2"; grep … $SRC` passa **um** argumento, o grep erra "No such file or directory"
  e devolve 0 hits — fazendo todo `! grep` "passar". Caminhos múltiplos vão **literais**.
- **Toda variável usada num AC é ligada no mesmo bloco.** `$AUTH_HEADER` não ligada (T31,
  iteração 2) transformava o critério que **fecha a fase** num 401. Se o AC precisa de um valor
  do repo (rota, header, porta), o bloco de setup o deriva ou o fixa **com a linha do arquivo
  que o comprova** — nunca "conferir/escolher na hora".
- **AC que só imprime não é AC.** Todo critério compara valor, usa `grep -q`, ou falha por exit
  code. "Inspeção manual" só é aceitável com artefato em `.plans/artifacts/` cuja completude
  seja verificável por comando (T13B, T21, T07C) — e o artefato tem que ser checado por
  **coerência** (o veredito bate com os números transcritos), não só por presença de campo.
- **AC de git-drift tem UMA forma canônica: `test -z "$(git status --porcelain -- <path>)"`.**
  Não usar `git diff --quiet … || echo OK` (sai **0** quando **não** há diff ⇒ o "OK" imprime
  no caso errado e nada falha) nem `git status --porcelain … | grep -q . && echo … && false`
  (numa árvore limpa o `grep -q` sai 1 e o bloco inteiro sai não-zero ⇒ **falha sempre**). As
  três ocorrências desses anti-padrões (T02, T25, T26) foram corrigidas na iteração 2; não
  reintroduzir.
- **AC nunca pode ser satisfeito deletando prosa.** Se um grep de "resíduo" casa um comentário
  que **documenta** uma decisão desta fase (o caso dos dois comentários de lane em `module.go` e
  `outbox.go`), a correção é escopar o grep para linhas de código, não apagar a explicação. O
  inverso vale para T23: comentário que ficou **desinformativo** (ainda diz `FOR UPDATE SKIP
  LOCKED` num arquivo SQLite) é reescrito, não isentado.
- **Caminho gerado citado em AC é verificado no checkout antes de virar AC.** Os enums vivem em
  `packages/contracts/generated/typescript/src/wire/enums/<kebab>.ts` (um arquivo por enum,
  aspas simples) e em `packages/contracts/generated/go/wire/enums.go` (**arquivo único**, aspas
  duplas). Glob que não casa **aborta o comando** sob zsh — um AC apontando para caminho
  inexistente não "falha", ele **desaparece**.
- **REGRA MESTRA (iteração 7): prova de comportamento CROSS-PROCESS se entrega como SCRIPT
  COMMITADO, não como sequência de comandos num documento.** Quatro rodadas de review bateram em
  blocker novo dentro de T31 — e em nenhuma outra task — porque só T31 tentava fixar em markdown
  uma orquestração de dois processos, com portas, cabeçalhos, rotas e chaves. Um documento não
  roda: cada correção só era testada pela **próxima** revisão. O critério de decisão: se o AC
  precisa de **mais de um processo vivo ao mesmo tempo**, ou de **estado que atravessa um
  binário**, então a task especifica **(1) o invariante, (2) as restrições, (3) o deliverable
  executável e (4) as armadilhas medidas** — e o executor escreve, **roda** e itera o script. Greps,
  `bun test`, contagens e asserts de arquivo continuam inline: esses o documento consegue fixar
  porque são de um passo só.
- **"Sem serviço X no ar" se assevera por ALCANÇABILIDADE, nunca por inventário de container.**
  MEDIDO (iteração 7): `docker ps` deste host mostra `postgres:17-alpine`/`redis:alpine` de um
  **repo vizinho**, e `docker compose -f docker/docker-compose.yml ps` **deste** repo lista os
  containers **dele** — o nome de projeto default do compose é o basename do diretório (`docker`
  nos dois). Os dois gates reprovam por causa de outro projeto: "falha pelo motivo errado". A forma
  correta assevera o que o processo **consegue alcançar** (o `env` que o script monta para os
  filhos não tem `DATABASE_URL`/`REDIS_URL`; o bundle não tem driver; o data dir é o único caminho
  de dado). Um check por container, se houver, casa
  `com.docker.compose.project.config_files` com o arquivo **deste** repo.
- **Gatear em RUNTIME não gateia a GERAÇÃO.** O emissor de OpenAPI do Go é spec-first e estático
  (`pkg/openapi/walker.go:47` `packages.Load(cfg, "./internal/...")`, `controllers.go:11-32`): ele
  não lê o grafo fx, então `if cfg.Flag` no `module.go` não impede a rota de entrar no spec — e,
  daí, na SDK **commitada** (`packages/client/dist/typescript/src`, no `GENERATED_ROOTS` de
  `scripts/check-generated.ts`). Ao adicionar qualquer superfície test-only num backend com
  codegen: ou ela nasce **fora** do escopo varrido pelo gerador, ou a task **declara** o artefato
  regenerado como deliverable e roda o gate de drift. E o assert de "não emitiu" leva
  **contra-prova** (as rotas legítimas continuam sendo emitidas), senão "0 hits" e "não olhou" são
  o mesmo exit code.
- **AC de git-limpo não pode incidir sobre arquivo que o PRÓPRIO AC regenera.** O log de um smoke
  carrega data dir e timestamps novos a cada run: `test -z "$(git status --porcelain -- <log>)"`
  falharia por construção. Para "está commitado" sem exigir estabilidade byte-a-byte, a forma é
  `git ls-files --error-unmatch <path>` — RODADO: **0** em arquivo tracked, **1** em untracked. E
  git-drift sobre caminho **gitignorado** é vacuamente positivo (o `openapi.json` do Go,
  `.gitignore:106`): asseverar o conteúdo emitido, ou o artefato commitado a jusante.
- A fase só fecha quando **todo o bloco de AC de T31 passa junto**, no mesmo run — e o run é o
  script commitado saindo **0**, não uma leitura de comandos.

