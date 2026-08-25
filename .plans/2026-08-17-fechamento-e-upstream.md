# Fechamento do goal da W1 e upstream para o template

**Status:** Aprovado (2026-08-17, ao colar o goal). Execução na worktree `declaracao-de-contexto`, na ordem F1 → F6.
**Antecedente:** `.plans/2026-08-15-declaracao-de-contexto.md` — a W1 fechou (11 tarefas + o ADR 0007 que nasceu no meio), e a `main` está unida em `5b637a7d`. Este plano cobre **o que sobrou**, medido numa revisita ao goal anterior.
**Irmãos:** `.plans/2026-08-17-workspace-vira-project.md` (rename, adiado por decisão do founder) · `.plans/2026-08-15-upstream-reconciliacao.md` (dossiê) · `.plans/2026-08-11-upstream-prep.md` (as 8 tasks de portabilidade).

---

## 1. A lição que dá forma a este plano

O defeito mais caro da W1 não foi de código — foi **um gate que virou ruído**.

O `check:generated` começou a falhar cedo, por uma razão real mas lateral: o gerador embute **caminho absoluto** nos três `.mcp.json`, então toda cópia que não seja a original produz drift falso. Registrei como achado e segui. A partir dali, **as falhas dele não carregavam informação** — e foi exatamente atrás delas que o `bun sdk` ficou quebrado por dias, com o `emit-openapi.ts` importando um `manifest.ts` que a DC2 tinha apagado.

Dois corolários, e eles são regra deste plano:

1. **Nenhum gate fica "quebrado conhecido".** Ou conserta, ou sai da lista. Um gate permanentemente vermelho é pior que nenhum: tem autoridade e não tem sinal.
2. **Cobertura de gate é declarada, não presumida.** O `emit-openapi.ts` passou porque `packages/api/typescript/scripts/` não está em tsconfig nenhum — o `tsc` ficou verde nos 7 projetos com um import morto dentro.

---

## 2. Estado medido

| | |
|---|---|
| `main` | `5b637a7d` — W1 + ADR 0007 + merge das duas linhas |
| gates verdes | tsc 0 · api 1467/0 · core 268/0 · tooling 726/0 · contracts 102/0 · Go ok · lint ok · `db:check-go` byte-idêntico · `dump-sqlite-schema --check` ok · `bun sdk` ok |
| gate NÃO verificado | **e2e** — não completa; o Vite não fica pronto em 120s nesta worktree |
| ACs do goal anterior | 5 atendidas · 6 parciais · 0 bloqueadas |
| `main` × `origin/main` | **185+ commits só nesta máquina** |

---

## 3. As pendências, e onde cada uma vive

### F1 — Fechar as frestas que a revisita achou (no `codm`, barato)

| # | tarefa | por quê |
|---|---|---|
| F1.1 | pôr `packages/*/typescript/scripts/**` sob typecheck | é a fresta pela qual o import morto passou |
| F1.2 | tirar o caminho ABSOLUTO dos `.mcp.json` gerados — relativo ou resolvido em runtime | é o que tornou o `check:generated` ruído, e ele só volta a ser gate depois disto |
| F1.3 | fazer o e2e completar, ou declarar por que não completa e o que o substitui | hoje é o único gate da lista sem resposta |

#### Fechamento da F1 — **F1.1 e F1.2 verdes, F1.3 ABERTA**

Registro um erro meu de ordem antes de qualquer outra coisa: a condição (1) diz *"cada frente só
começa com a anterior 100% verde"*, e eu iniciei a F3 com a F1.3 aberta. A F1.3 é justamente a que
aplica a regra do §1 ao e2e, então furá-la foi furar a lição que dá nome ao plano.

| | estado | evidência |
|---|---|---|
| **F1.1** — `scripts/**` sob typecheck | ✅ | `tsconfig.build.json` ganhou `scripts/**/*.ts` no `include`; os dois smokes congelados saíram por `exclude` DECLARADO. Falsificador: import morto em `scripts/` → typecheck vermelho. |
| **F1.2** — caminho absoluto fora dos `.mcp.json` | ✅ | fixup (d) em `packages/client/generators/typescript.ts`. Falsificador decisivo: `check:generated` verde de uma cópia NÃO-original. |
| **F1.3** — o e2e completa, ou se declara o substituto | ❌ | ver abaixo |

##### F1.3 — a declaração que a regra exige, e por que ela NÃO libera a saída do gate

A F1.3 oferece dois caminhos: *"fazer o e2e completar, **ou** declarar por que não completa e o que o
substitui"*. A primeira metade está paga — a causa foi medida spec a spec e está em §F7: o
`packages/e2e` nunca ganhou a metade cloud que o ADR 0001 criou, e faltam três peças
(`CODM_CLOUD_URL` não chega ao processo · nada escuta na 3033 · nenhum given chama
`POST /v1/session/cloud-token`).

A segunda metade é onde a regra morde, e a resposta honesta é **não existe substituto**:

| cobertura | quem cobre hoje |
|---|---|
| entidades, use cases, handlers, projeções, rails | `bun test` — 1.467 em 204 arquivos |
| tooling, geradores, manifesto | `bun run test:tooling` — 726 em 57 |
| TS ↔ Go sobre HTTP real + o MESMO arquivo SQLite | `test:cross-service` — 3 |
| **browser → daemon → gateway, a jornada do operador** | **ninguém** |

O `test:cross-service` é o mais próximo, e ele para na fronteira do backend: não sobe Vite, não abre
página, não exercita rota do console nem o `CloudSessionGate`. As 11 specs vencidas são a ÚNICA
cobertura dessa faixa — e a prova de que a faixa importa é que foi exatamente lá que o defeito de
produto se escondeu (`OnboardingGate` falhando aberto), invisível para os 2.196 testes das outras
linhas.

**Conclusão, e ela é vinculante pelo §1:** o e2e não pode "sair da lista", porque sair exige nomear o
substituto e não há um. Logo *"ou conserta"* é o único ramo aberto — a **F7 deixa de ser frente
opcional e vira dependência da F1**, que por sua vez trava F2 e F3 pela condição (1).

Isto reordena o plano, e o registro é este: **F1.3 → F7 → (F2, F3) → F4/F5 → F6.**

---

#### Planos por frente (condição 2), com a decisão pendente nomeada como BIFURCAÇÃO

Outro erro meu registrado: a condição (2) pede `/plan` antes de implementar cada frente, e eu
implementei F3/T1-T3-T6-T7 e a primeira leva da T8 sem um. É a mesma condição que o goal anterior
violou. Os planos abaixo são a reparação, e nenhum passo é executado antes do gate humano que o
precede.

##### Plano F7 — o e2e volta a ser gate

**Bifurcação (decisão do founder).** As três opções deixaram de ser equivalentes depois da medição:
(a) subir a contraparte cloud · (b) mover as specs para suíte cloud separada · (c) stub local. As
duas últimas removeriam o portão que `shared/registry.ts:314-316` declara, por escrito, que o e2e
existe para exercitar — comprar verde desligando o que se queria testar. **Recomendação: (a).**

| passo | conteúdo | gate |
|---|---|---|
| F7.1 | 4º `webServer` no `playwright.config.ts`: o MESMO `dist/server.js`, com `CODM_PROFILE=cloud`, porta e `CODM_DATA_DIR` de rascunho próprios, sondado em `/v1/health` | o boot dos 4 converge |
| F7.2 | `run-e2e.ts` exporta `CODM_CLOUD_URL` apontando para essa porta — **explicitamente no `childEnv`, nunca por `--env-file`** (ver nota abaixo) | `CLOUD_CONFIGURED` verdadeiro no daemon local |
| F7.3 | um given faz o handshake real: obtém device token da instância cloud e o empurra por `POST /v1/session/cloud-token` | grupo 2 (10 specs) sai do vermelho |
| F7.4 | `03-owner-create` reaponta para o daemon cloud, que é onde `POST /v1/owners` monta | grupo 1 sai |
| F7.5 | `given/api.ts` e `given/user.ts` perdem os docblocks pré-ADR-0001 (`OperatorMiddleware`, que não existe mais no código) | prosa bate com o código |
| F7.6 | **item de produto próprio**: `OnboardingGate` distingue `CLOUD_UNREACHABLE` de `ONBOARDING_NOT_COMPLETED` | ⛔ decisão: o que a UI mostra em falha de infra |

**Nota anti-atalho, medida:** propagar o env por `--env-file=../../.env` (espelhando o `migrate:dev`)
parece a correção barata e **não é**. O `run-e2e.ts` monta `childEnv` explicitamente de propósito, e
carregar o `.env` do desenvolvedor numa suíte hermética é o caminho pelo qual um teste acaba
escrevendo no data dir do daemon VIVO — risco contra o qual `tests/support/testing.ts:128-137` já
guarda com erro dedicado. Além disso seria **regressão de diagnóstico**: a mensagem atual nomeia a
causa exata, e trocá-la por um `ECONNREFUSED` na 3033 informa menos.

##### ⛔ ACHADO que trava a F7.1 — a coluna `e2e` da família `pg` nunca foi exercitada

Fui implementar a F7.1 e bati num pressuposto que o plano acima assume e o código não sustenta.
Registro em vez de improvisar.

**O que o código diz.** `shared/deployment.ts:143-148` — `auth`, `owner` e `shared` sob
`{ deployment: 'cloud' }` declaram `infra: { db: 'pg' }`. E `shared/registry.ts:216` liga a família
assim:

```
{ token: PgDatabaseDriver, mock: pgTestDriver, integration: pgTestDriver, real: PgDriver, e2e: PgDriver }
```

Ou seja, sob `e2e` o Postgres é o **driver de produção** — o que, pelo docblock imediatamente acima
(`:210-212`), *"CONFERE E RECUSA"* migrações em vez de aplicá-las, ao contrário do `PGliteDriver` das
colunas de teste, que *"APLICA"*.

**O que isso custaria.** Subir o 4º `webServer` em `CODM_PROFILE=cloud` sob `CODM_ENV=e2e` exigiria
(i) um Postgres real alcançável e (ii) migrações **já implantadas**, porque o driver se recusa a
aplicá-las. Não é um container a mais: é um passo de deploy dentro do runner.

**E o stack não tem Postgres.** Medido: `docker/docker-compose.yml` sobe **só** redis (+ lgtm), como
o `CLAUDE.md` afirma (*"NÃO há Postgres: a persistência é um único arquivo SQLite"*). O
`playwright.config.ts` e o `run-e2e.ts` não declaram `DATABASE_URL` nem `CODM_PROFILE` em lugar nenhum.

**A consequência que fecha o raciocínio:** a família `pg` só monta sob `cloud`, e nenhum e2e jamais
subiu perfil cloud — portanto **a ligação `e2e: PgDriver` nunca rodou**. Ela foi escrita por analogia
com a coluna `real`, não por medição. É uma declaração que nunca foi confrontada com um boot.

**A bifurcação, e ela é do founder:**

- **(a1) Postgres de verdade no e2e** — container + passo de migração no runner. Caro, e contradiz a
  afirmação do `CLAUDE.md` sobre o stack local não ter Postgres.
- **(a2) `e2e: pgTestDriver`** (PGlite, em-processo, aplica a própria migração). Barato, e é **mudar
  uma ligação declarada** — então precisa de argumento, não de analogia.

**O argumento, e ele vem da coluna irmã lida de perto.** A família libsql declara `e2e:
FileLibsqlDriver` com uma razão MEDIDA e específica (`registry.ts:179-188`): herdar o driver de
arquivo temporário *"moveria o banco do daemon PARA FORA do dir de rascunho travado (…) e deixaria a
suíte e2e com ZERO evidência do caminho arquivo-compartilhado/WAL que ela existe para exercitar"*. Ou
seja: aquela coluna é REAL porque **o compartilhamento do arquivo É a propriedade sob teste**.

A família `pg` não tem propriedade análoga. Nenhuma spec do e2e assere coisa alguma sobre Postgres — o
daemon cloud entraria na topologia para **responder quem é o operador**, e o que está sob teste é o
handshake de login (`CloudSession`), não o substrato de armazenamento. Logo o mesmo raciocínio que
torna `FileLibsqlDriver` obrigatório ali torna `PgDriver` **desnecessário** aqui: não há evidência
que se perca.

**Recomendação: (a2)**, e a assimetria acima é a justificativa — não "é mais barato", mas *"a razão
que sustenta a coluna irmã não existe nesta"*. Preserva o portão que o `registry.ts:314-316` diz que
o e2e existe para exercitar, sem arrastar infraestrutura que o repo declarou não ter. O que se perde
é a prova de que a migração de nuvem foi implantada — e essa prova nunca foi do e2e, é do deploy.

**Falsificador da F7:** derrubar o daemon cloud → as 10 specs do grupo 2 voltam ao vermelho com a
mensagem de identidade. Se ficarem verdes sem a nuvem, o handshake virou stub e o portão morreu — que
é precisamente o que (b)/(c) fariam de propósito.

##### Plano F2 — `CONTEXT_REGISTRIES` gerado

Desenho medido e registrado em §F2.1/§F2.2. **Bloqueado no gate humano 8a**, e o bloqueio é
estrutural, não de conveniência: a geração e a decisão do rail são **atômicas**. O mapa precisa sair
de `shared/registry.ts` (o re-export de compatibilidade foi medido e *crasha* com
`ReferenceError: Cannot access 'KERNEL' before initialization`), e no instante em que sai, a perna
`!alias` do `slice-closure` vira 9 erros falsos que travam o gate. Gerar sem decidir o rail deixa o
detector vermelho — ou seja, cria um gate quebrado conhecido, que é o que o §1 proíbe.

| passo | conteúdo |
|---|---|
| F2.1 | `renderRegistries()` em `scripts/contexts/aggregate.ts`, emitindo `src/registries.generated.ts` em `BOOT_ORDER` |
| F2.2 | `ALL_REGISTRIES` muda de casa; os dois consumidores (`TestBed.ts`, `real-di-resolution.test.ts`) repontam |
| F2.3 | ⛔ **gate 8a** — a perna `!alias` do `slice-closure` é aposentada; a perna 2 já é vacuosa por construção (medido: 0 findings de SCW-03 sobre o repo real) |
| F2.4 | `contexts:check` passa a cobrir o terceiro derivado |

**Falsificador:** `CONTEXT_REGISTRIES` editado à mão → `contexts:check` vermelho.

##### Plano T5 — `givens` vira campo de `ContextDecl`

⛔ **gate 8b.** A medição não confirmou obsolescência — confirmou **redirecionamento**, que é uma
terceira resposta e melhor que as duas que o gate oferecia. O problema (givens redeclarados à mão em
4 lugares, a poda cega) está intacto; o mecanismo prescrito (`REPO.contexts` no `template.config.ts`)
ressuscitaria a lista central que a DC2 apagou.

| passo | conteúdo |
|---|---|
| T5.1 | `ContextDecl` ganha `givens?: readonly string[]` |
| T5.2 | os contextos que têm givens os declaram no próprio `context.ts` |
| T5.3 | o agregador emite `CONTEXT_GIVENS`, como já emite `reads` |
| T5.4 | a poda passa a derivar do agregado |

##### Plano T8 (o que resta) — 4 decisões de declaração

A leva mecânica está em `7377d64e`. O que sobra exige declaração nova, e o cabeçalho do
`template.config.ts` **já lista duas delas** entre as quatro dívidas conhecidas de um rebrand.

| bloco | resíduos | decisão |
|---|---|---|
| **(A)** `dbFileName` | 10 | ⛔ o mais barato e o mais perigoso: 2 dos 10 estão em linguagens diferentes que têm de casar byte a byte (`FileLibsqlDriver.ts:37` × `go/core/db/sqlite/store.go:44`). Num rebrand pela metade o TS abre um banco e o Go abre outro. Go não importa o manifesto → precisa de espelho + rail de drift |
| **(B)** marca no runtime | 9 | ⛔ design: `docker/Dockerfile.api` e `cloud.Dockerfile` **não copiam** `template.config.ts` (verificado), então `src/` e `core/` não podem importá-lo. Caminho: `bun contracts` emitir constante de marca em 3 linguagens |
| **(C)** `brandDisplay` | 3 | ⛔ campo novo no manifesto; corrige o drift `CODM`/`CoDM` já existente |
| **(D)** marca no `src/` dos frontends | 5 | ⛔ muda chave de storage/cookie → exige nota de migração para instalações existentes |

### F2 — `CONTEXT_REGISTRIES` gerado (no `codm`, fecha a AC-6)

A última lista central derivável: 9 entradas à mão, mesmo shape do `MANIFEST`, zero decisões. **Vem com uma decisão junto:** gerá-lo torna sempre-verde a checagem do `slice-closure` sobre chave de registry. O goal anterior exigia **provar a vacuidade antes de aposentar** — aqui a prova é que o gerador não pode errar a chave. Decidir se o rail sai ou fica como guarda para forks que ainda escrevem o mapa à mão.

#### F2.1 — o desenho, medido por dois scouts (2026-08-17)

**Onde emitir: um TERCEIRO arquivo, `src/registries.generated.ts`.** Os dois lugares óbvios foram descartados com número:

- **não** em `contexts.generated.ts` — ele é INERTE por contrato (**0** módulos de runtime alcançáveis, só `import type`). `CONTEXT_REGISTRIES` é valor de runtime; pô-lo ali destrói a única propriedade que aquele arquivo tem.
- **não** em `composition.generated.ts`, apesar de ele já ter os 10 imports. Peso: **428** módulos de runtime contra **343** de um arquivo que importe só os 10 `registry.ts`. E o delta de **86** não é só peso — inclui `shared/controllers/index.ts:40` e `agent/controllers/index.ts:61,64`, que avaliam `byEnvironment(...)` e `Config.env.EMIT_OPENAPI` **no escopo de módulo**. É por isso que o `server.ts:93` importa a composição com `await import()`, depois do `setBoundedContextEnvironment`. O `TestBed.ts` é import ESTÁTICO de quase toda a suíte: rotear o `ALL_REGISTRIES` por ali **congelaria a coluna de ambiente no load do módulo de teste, em silêncio**.

**Ciclo, medido e reproduzido.** Não há ciclo hoje: o grafo é árvore, com uma única aresta entrando em `shared/registry.ts` vinda do gerado. Mas se `shared/registry.ts` mantiver um `export { ALL_REGISTRIES } from '<gerado>'` por compatibilidade, fecha ciclo de 2 nós — e **não é aviso, é crash**: `ReferenceError: Cannot access 'KERNEL' before initialization`, porque o merge é computado no eval do módulo. Logo o `ALL_REGISTRIES` **muda de casa**, e os dois consumidores (`TestBed.ts` e `real-di-resolution.test.ts` — os únicos, ambos fora de `src/`) repontam.

**Ordem das chaves é SEMÂNTICA.** O comentário de `shared/registry.ts:367` (*"shared (core) first so context bindings may override kernel defaults"*) depende da ordem de inserção. O único token declarado em mais de um contexto é `HEALTH_CHECKS` (`shared` + `agent`), multi-inject. Emitir em **`BOOT_ORDER`** preserva a sequência byte-a-byte (shared antes de agent); alfabético **inverteria a ordem dos checks no `/v1/health`**.

#### F2.2 — o rail, e por que a decisão é atômica com a geração

A checagem tem DUAS pernas no mesmo laço (`slice-closure.ts:944-975`): a **perna 1** (`!alias`) cobra que `shared/registry.ts` importe o registry de cada contexto; a **perna 2** cobra que ele seja mapeado sob a chave certa (`auth: billingRegistry` compila — é o buraco residual que o `satisfies` não fecha).

**Perna 2: vacuosa POR CONSTRUÇÃO.** Em `renderComposition` (`aggregate.ts:152-206`), a chave do mapa, o alias e o especificador de módulo interpolam o **mesmo binding `id`, na mesma iteração** — não há segunda lista, lookup nem pareamento por índice que possa dessincronizar, e `id` é o nome do diretório lido por `loadContexts`. O defeito que ela procura deixa de **poder existir**: sobe do rung *detect* para o rung *eliminate*. Medido: no HEAD ela já dá **0 findings** sobre o repo real (34 no total, nenhum SCW-03).

**Perna 1: vira 9 FALSOS-POSITIVOS gating** se o mapa sair de `shared/registry.ts` — medido em probe. Por isso a edição é **atômica**: gerar o mapa sem tocar o rail deixa o detector vermelho.

**O template não é argumento para manter aqui.** Ele tem cópia própria e independente do detector (bloco byte-idêntico em `slice-closure.ts:1084-1105` lá) e escreve o mapa **à mão**, sem gerador. Lá a checagem segue viva e deve ficar. Não há ref-pinning entre os repos — as menções a *"ref-pinned"* são prosa vestigial.

### F3 — `upstream-prep`: o que sobrou (no `codm`, gate da W2)

Medido em 2026-08-17. T2 e T4 já pagas por outros caminhos.

| task | veredicto medido | entregue |
|---|---|---|
| T1 · `CODM_AGENT_INACTIVITY_MS` sai do kernel | viva | ✅ `2cd2745a` |
| T3 · identidade declarada pelo produto | viva | ✅ `2cd2745a` |
| T5 · `REPO.contexts` tipado | **PARCIAL** — problema vivo, mecanismo obsoleto | ⛔ gate 8b |
| T6 · spikes saem do diretório portável | viva | ✅ `2cd2745a` |
| T7 · `marca-legada` fecha | viva | ✅ `2cd2745a` |
| T8 · a marca sai dos mecanismos | **PARCIAL** — 124 brutas viram **34 reais** | ⛔ decisão de escopo |

#### O que a medição corrigiu no próprio plano

Três das seis tasks estavam escritas contra um repositório que já não existe — e duas delas teriam
passado por **falso-verde** se executadas ao pé da letra:

- **T1** mandava criar `src/agent/config/ProductEnvSchema.ts`. Isso inventaria um SEGUNDO mecanismo
  de env ao lado do `src/shared/config/ProductConfig.ts` que já está lá — exatamente o que o
  CLAUDE.md §5 proíbe, e o que a própria T1.2 do plano dizia para não fazer. Usamos o que existe.
- **T3** citava `OPERATOR_ID`, constante que não existe mais. Seu RED (`grep "?? OPERATOR_ID" | wc -l`
  → esperado 7) dá **0** no HEAD: o gate teria aberto verde sobre um defeito intacto. O alvo real é
  `MOCK_CLOUD_OWNER_ID`, em 6 givens + `testing.ts` + `TestBed.ts:172` — 8 arquivos.
- **T7** só listava `(regex do detector de resíduo)`. A grafia que sobrevive em constantes é a SNAKE, e era
  justamente a que o detector não via.

Isto é a mesma lição do §1 numa terceira instância: **um gate que não roda contra o estado atual não
informa**. A diferença é que aqui ele não estava vermelho — estava verde pelo motivo errado.

#### T5 — o problema está vivo, o mecanismo prescrito nasceu morto

Medido: os `givens` seguem redeclarados à mão em **4 lugares**, e o stamp não consegue podá-los.
Problema 100% intacto.

Mas o mecanismo que a T5 prescreve — `REPO.contexts.<ctx>.givens` em `template.config.ts` — é
**obsoleto por construção**: ele ressuscita, em outro arquivo, exatamente a lista central que a DC2
apagou para fazer a pasta virar o spine. Executar a T5 como escrita seria desfazer a reforma que a
motivou.

O problema continua merecendo cura; o endereço é outro. `givens` vira **campo de `ContextDecl`**,
emitido pelo agregador como `reads` já é. Aí a informação mora junto do contexto que a possui, e a
poda deriva em vez de consultar uma lista paralela.

**Gate 8b**: o plano previa "se a medição confirmar obsolescência, aval para descartar". A medição
não confirmou descarte — confirmou **redirecionamento**. É uma terceira resposta, e melhor que as
duas que o gate oferecia.

#### T8 — 2.074 ocorrências, **65 resíduos**, e uma estimativa minha errada por 8×

**Correção registrada.** Eu tinha escrito aqui que o alvo real da T8 era *"~8 pontos de mecanismo"* e
recomendado descartar metade da task. Errado, e por um método ruim: contei por `grep` de arquivo e
subtraí categorias inteiras (`@codm/`, `CODM_*`) sem abrir as linhas. Uma varredura de 7 agentes
lendo linha a linha, com verificação adversarial depois, dá outro número.

| classe | ocorrências |
|---|---|
| **A** — auto-nomeação legítima (escopo de pacote, nome de env, binário, crate) | 1.690 |
| **B** — prosa, docblock, mensagem humana, fixture | 314 |
| **C** — **resíduo de mecanismo** | **70 achados → 65 verificados** |

Um foi reclassificado na verificação (`tauri/config/app.ts:17`, `DISPLAY_NAME = 'CoDM'`): não é
resíduo, é a **declaração** da grafia cased — o defeito não é o literal, é ele morar ali em vez do
manifesto.

##### Dois defeitos VIVOS, achados de passagem

Não são hipóteses sobre um fork futuro; estão quebrados agora, neste repo:

1. **O link script→artefato está rompido.** `api/typescript/scripts/phase3-smoke.ts:56` e
   `phase6-mcp-smoke.ts:77` escrevem em `.specs/codm/`, diretório que **não existe** — os artefatos
   reais vivem em `.specs/codedm/phase3-smoke/` e `.specs/codedm/phase6-mcp-smoke/`. O codemod de um
   rebrand anterior reescreveu o script e não a pasta.
2. **Drift de grafia entre dois espelhos.** `tauri/config/window.ts:58` diz `CODM`;
   `tauri/config/app.ts:17` diz `CoDM`. Isto encerra, com evidência, a discussão sobre "literal
   espelhado se mantém sozinho": não se mantém.

##### Dois rails que, num fork, ficariam VERDES POR VACUIDADE

Esta é a classe do §1 numa forma pior — o §1 fala de um gate que fica vermelho e para de informar;
estes ficariam **verdes** e continuariam parecendo que informam:

- `tests/architecture/context-map.test.ts:266` monta o regex com `@codm/contracts/db` cravado. Num
  fork (`@fork-clinico/contracts/db`) ele casa **zero** linhas, e todo o rail cross-schema
  (`TABLE_READ_EDGES`) passa vazio. O manifesto **já declara** o campo certo:
  `REPO.dbOrmSchemaSpecifier`, descrito como *"import-specifier marker for DB-ORM schema imports"*.
- `tests/architecture/union-parity.test.ts:302` é asserção **negativa** contra
  `"from '@codm/client-typescript"`. Num fork o controller pode voltar a importar a SDK e o rail segue
  verde, porque a string procurada não existe mais no repo. O arquivo **já** importa o manifesto na
  linha 45 — só usa o campo errado.

##### Repartição do trabalho, medida

| bloco | resíduos | natureza |
|---|---|---|
| **mecânico** — o valor já é declarado em lugar alcançável | **39** | edição de baixo risco |
| **(A)** `dbFileName` derivado de `brand` | 10 | 1 linha no manifesto desamarra os 10 |
| **(B)** a marca chegando ao código de RUNTIME | 9 | ★ decisão de desenho |
| **(C)** `brandDisplay` (grafia cased) no manifesto | 2 + a reclassificada | decisão de contrato |
| **(D)** a marca alcançando o `src/` dos frontends | 5 | muda chave de storage/cookie |

**Por que (B) é decisão e não edição** — verificado, não presumido: `docker/Dockerfile.api` e
`cloud.Dockerfile` copiam `packages/contracts` e `packages/api/typescript`, e **nunca**
`template.config.ts`. Ou seja, o argumento do docblock de `src/agent/mcp/wire.ts:27` é real — `src/` e
`core/` não podem importar o manifesto em runtime. O caminho seria o `bun contracts` emitir uma
constante de marca em `@codm/contracts-typescript` (+ gêmeas Go e Rust), o que é design de verdade em
três linguagens. Agrava: o gêmeo `MCP_RUN_TOKEN_HEADER` do lado SDK **não é gerado** — é arquivo
escrito à mão commitado dentro de `dist/`, e o rail `mcp-exposure.test.ts:187` pina o par.

**Por que (A) vale sozinha**: o nome do arquivo de banco está literalizado em **10 lugares
independentes**, dois deles em **linguagens diferentes que têm de casar byte a byte**
(`src/shared/db/FileLibsqlDriver.ts:37` e `go/core/db/sqlite/store.go:44` — os comentários dos dois
admitem serem espelhos um do outro). Num rebrand pela metade, o TS abre um banco e o Go abre outro.

**Veredicto**: não cabe numa sessão como varredura única, mas parte limpo — os 39 mecânicos + (A) +
(D) = 54 dos 65; (B) + (C) = 11, e é lá que mora a pergunta de desenho.



**Correção de escopo, registrada:** eu vinha tratando a T8 como bloqueador da W2. Medi os artefatos que a W2 de fato leva — `ContextDecl.ts` tem **0** ocorrências, `BoundedContext.ts` tem **2**. A T8 não trava a W2; ela trava a extração *completa* do core, que é outra coisa e vem depois.

### Aferição da lista fechada de gates (condição 4), medida em `c019968d`

A condição (4) fecha a lista em treze. Rodei os treze. **Doze verdes, um vermelho.**

| gate | resultado |
|---|---|
| `bun tsc` | ✅ 7 projetos |
| `bun run test:tooling` | ✅ 726/726 em 57 arquivos |
| `bun run test` | ✅ 1467/1467 em 204 arquivos |
| `packages/api/typescript` → `tsc -p tsconfig.build.json` | ✅ limpo |
| `packages/contracts` → `bun run test` | ✅ |
| `packages/api/go` → `go build ./... && go test ./...` | ✅ |
| `bun lint` | ✅ 9 projetos |
| `bun run contexts:check` | ✅ 3 derivados em dia |
| `db:check-go` | ✅ byte-idêntico |
| `dump-sqlite-schema.ts --check` | ✅ schema bate com as migrações |
| `bun sdk` | ✅ roda e **não produz diff** |
| `bun run check:generated` | ✅ *generated output in sync* |
| `packages/e2e` → `bun run test` | ❌ **11 failed, 2 skipped, 0 passed** |

Os dois gates que a condição (4) nomeou explicitamente *"porque foi por baixo deles que o defeito
passou"* são justamente os dois que mais informam agora: o `bun sdk` roda limpo (estava quebrado
desde a DC2) e o `check:generated` passa de uma cópia que não é a original (era o falsificador
decisivo da F1).

**O e2e agora é um gate quebrado conhecido — e é exatamente o que o §1 proíbe.** A regra é dura e
vale sobre as outras: *ou conserta, ou sai da lista, e sair exige dizer o que o substitui*. Enquanto
ele ficar vermelho por um motivo aceito, toda falha futura dele deixa de carregar informação — que é
literalmente como o `bun sdk` ficou quebrado por dias. Logo a **F7 deixa de ser opcional**: ela é
pré-condição para a lista de gates voltar a significar alguma coisa.

Registro honesto de uma conclusão que herdei sem medir: a F7 acima diz *"causa única —
`Route POST:/v1/owners not found`"*. Aferindo agora, só **uma** das 11 specs
(`tests/03-owner-create.spec.ts:21`) chama `createOwner`, e ela importa do subpath **cloud** da SDK
(`@codm/client-typescript/typescript-cloud`) contra o daemon **local** (`localhost:3130`). As outras
dez precisam de outra explicação, e "causa única" era otimismo, não medição.

Sinal adicional de defasagem, no maquinário e não nas specs: `packages/e2e/utils/given/api.ts:11-14`
e `:35-36` ainda descrevem o mundo **anterior** ao ADR 0001 — *"After the operator collapse there is
a single operator"*, *"the API stamps the operator identity server-side via OperatorMiddleware"*. O
ADR 0001 substituiu isso pelo split cloud/local. O harness do e2e está falando de uma arquitetura
que saiu de cena.

### F7 — as specs do e2e estão defasadas contra o ADR 0001 (DESCOBERTA pela F1.3, não prevista)

Consertar a sonda destravou a suíte, e ela revelou o defeito que estava escondido atrás: **11 specs falham, zero passam**, com causa única — `Route POST:/v1/owners not found`.

`owner` e `auth` são **cloud-only** desde o ADR 0001. O `bun sdk` confirma os dois conjuntos: local monta `shared, agent, artifact, issue, thread, workspace, ui, external`; nuvem monta `shared, auth, owner`. O e2e sobe o daemon **local** e as specs chamam rotas que deixaram de existir ali.

**Um defeito escondia o outro**, e nenhum dos dois é regressão desta branch: a sonda quebrada impedia a suíte de chegar a rodar e dizer que as specs tinham vencido. É a mesma lição do §1 numa segunda instância — enquanto um gate não roda, ele não informa.

#### Triagem medida (2026-08-17) — são TRÊS causas, e a hipótese de causa única estava errada

Rodei a suíte e classifiquei as 11 por mensagem raiz. Não é uma causa, são três — e a maior não é
defasagem de spec nenhuma:

| grupo | specs | causa raiz |
|---|---|---|
| **1** | 1 — `03-owner-create` | `Route POST:/v1/owners not found` — rota cloud-only chamada contra o daemon local |
| **2** | 10 (12 casos) | a identidade nunca resolve: `CloudSessionMiddleware` → `FileCloudSession` → `CODM_CLOUD_URL` ausente |

**Correção de uma classificação minha.** Eu tinha escrito TRÊS grupos, separando as duas falhas de UI
(`06:60` `toHaveURL(/\/onboarding/)` e `12-channel-qr` `'Aguardando você escanear o código…'`) num
grupo próprio. São **dois**: essas duas são o grupo 2 se manifestando por outro **modo de falha**, não
por outra causa. O grupo 2 falha de duas maneiras:

- **2a — throw do SDK** (8 casos): o erro literal `CODM_CLOUD_URL não está configurada` sobe de
  `FileCloudSession.ts:106-111`, através do `CloudSessionMiddleware` que praticamente todo controller
  local declara. Cinco delas morrem dentro do mesmo given (`utils/given/thread.ts:33` →
  `gateway.ts:12` → `POST /v1/_test/gateway`).
- **2b — fail-open / timeout no frontend** (2 casos): o mesmo `CLOUD_UNREACHABLE`, mas absorvido pela
  UI antes de virar erro visível. Ver o defeito de produto abaixo — é aqui que ele mora.

**Só o grupo 1 é "spec defasada".** O grupo 2, a maioria esmagadora, é outra coisa.

#### O achado: o e2e nunca ganhou a metade cloud que o ADR 0001 criou

As três peças estão no repo e concordam entre si:

1. `src/shared/registry.ts:317` liga `e2e: FileCloudSession` — **de propósito**, e o docblock
   (`:314-316`) explica: *"e2e = REAL: o harness sobe o próprio portão de login do daemon sobre seu
   data dir de rascunho, igual a um install de desktop; declarado porque a cadeia herdaria
   MockCloudSession e removeria em silêncio o portão que o e2e existe para exercitar."*
2. `template.config.ts:479-483` declara `CODM_CLOUD_URL` apontando para **:3033**, com o comentário
   *"NÃO :3030. O daemon local não monta `auth`, então apontar para si mesmo é o beco sem saída"*.
3. `packages/api/typescript/project.json:102-113` já implementa esse segundo processo:
   `dev:cloud` = `CODM_PROFILE=cloud`, `API_PORT=3033`, data dir próprio.

E `packages/e2e/scripts/run-e2e.ts` **não exporta `CODM_CLOUD_URL` nem sobe perfil cloud** — zero
ocorrências. O `playwright.config.ts` sobe três servidores (daemon local, Vite, gateway Go) e nenhum
deles é a nuvem.

Ou seja: o ADR 0001 partiu o daemon em dois deployments, o `dev` ganhou o processo cloud, o registry
declarou que o e2e exercita o portão REAL — **e o `packages/e2e` ficou para trás, com metade da
topologia faltando.** A sonda quebrada escondeu isso por completo: a suíte nunca chegava longe o
bastante para dizer.

#### A camada mecânica que faltava no diagnóstico

`CODM_CLOUD_URL` **existe** — `.env:59` declara `http://localhost:3033`. O que falta é ela CHEGAR ao
processo: `packages/e2e/package.json:6` roda `bun scripts/run-e2e.ts` **sem `--env-file`**, enquanto o
`migrate:dev` da raiz (`package.json:54`) usa `bun --env-file=../../.env`. O
`run-e2e.ts:132-165` monta o env do filho por spread do `process.env` — que nunca teve a var — e não
há `.env` dentro de `packages/e2e/`.

Corrigir isso é **necessário e insuficiente**: sem a contraparte cloud de pé na 3033, o erro só migra
de *"não configurada"* para *"conexão recusada"*.

Falta ainda uma terceira peça, que nenhum given tem: `POST /v1/session/cloud-token`
(`src/shared/controllers/SetCloudToken.ts`) é o endpoint por onde um token real entra no daemon local
— e **nenhum given o chama**. O `given/cloud.ts:24-28` só semeia `localStorage` no browser, o que
satisfaz o `CloudSessionGate` do frontend e não tem efeito nenhum sobre o `CloudSession` do backend.
Os docblocks de `given/api.ts:38-44` e `given/user.ts:23-27` ainda descrevem o mundo pré-ADR 0001
(*"OperatorMiddleware stamps a CONSTANT session"*) — e `OperatorMiddleware` não existe mais no código.

#### ★ SIM, havia um defeito de produto escondido — e eu tinha dito que não

Registro a correção porque a afirmação anterior era minha e estava errada: escrevi que o gate parado
*"não escondia regressão de produto, só uma metade ausente da topologia"*. Medindo spec a spec, ele
escondia **um defeito real**.

**`OnboardingGate` falha ABERTO em erro de infraestrutura**
(`packages/app/react/src/components/console/OnboardingGate.tsx:50-54`).

O gate distingue mal dois estados que não são o mesmo: *"onboarding pendente"* (código
`ONBOARDING_NOT_COMPLETED`, que seta `required=true` via `lib/errors.ts:141,155`) e *"não consegui nem
perguntar"* (`CLOUD_UNREACHABLE`, que não seta nada). Com `data === undefined` ele executa
`return <>{children}</>` — ou seja, **renderiza o console**. Foi assim que a `06-onboarding-attach.spec.ts:74`
recebeu `/dashboard` onde esperava `/onboarding`.

Isso quebra a invariante que o ADR 0001 promete por escrito — `CloudSessionMiddleware.ts:24-32`:
*"sem identidade o middleware RECUSA... não existe identidade de consolação"*, e o ADR (linha 140):
*"sem sessão não funciona nada além de logar"*. O backend cumpre à risca; o gate do frontend não.

O comentário no próprio arquivo (`:50-52`) mostra que o fail-open foi decisão **consciente para o caso
de onboarding** (*"sem isto o gate renderizava o app — o operador via o toast e não saía do lugar"*).
Cobrir também erro de infraestrutura genuíno parece efeito colateral não intencional — e não foi
testado porque a suíte que provaria isso estava quebrada.

Gravidade honesta: não é falha de segurança isolada — toda leitura protegida sob o shell falha com o
mesmo `CLOUD_UNREACHABLE`, então o operador não *opera* nada. Mas é quebra real e mensurável de uma
invariante declarada, e é exatamente a classe de regressão que um gate morto esconde. **Vira item de
produto próprio**: o gate passa a distinguir erro de infraestrutura de onboarding incompleto, e nesse
caso mostra estado de erro/retry em vez de renderizar o shell.

Fora esse ponto, as outras 9 falhas não revelaram defeito: todas pararam antes de qualquer asserção de
comportamento (o SDK lançou antes, ou a rota 404 antes).

Dois skips são honestos e pré-existentes (`08-stop-resolve`, `09-sse-pill`): `test.skip` explícito e
documentado, por limitação conhecida do `E2eStubAgentRunner`. Sem relação com isto.

#### Consequência para as três opções registradas abaixo

Elas deixam de ser equivalentes. A **(a)** é o que a arquitetura já implica em três lugares
independentes; a **(b)** e a **(c)** removeriam justamente o portão que `registry.ts:314-316` diz, por
escrito, que o e2e existe para exercitar — comprar verde desligando o que se queria testar.

Custo estimado da (a): um quarto `webServer` no `playwright.config.ts` (mesmo `dist/server.js`, com
`CODM_PROFILE=cloud` + porta + data dir de rascunho próprios, sondado em `/v1/health`), o
`run-e2e.ts` exportando `CODM_CLOUD_URL` para o daemon local, e uma credencial de device semeada no
data dir local para o `FileCloudSession` ter o que apresentar. O grupo B (`03`) reaponta para o
daemon cloud, que é de onde `POST /v1/owners` de fato monta. O grupo C se re-mede depois de A e B —
provavelmente cai junto.

**Pendente de decisão** (condição 2 do goal: `/plan` antes de implementar cada frente — a F7 nasceu
descoberta, não planejada, e ainda não tem plano próprio).

**Não é conserto, é decisão de desenho**, e por isso vira frente própria em vez de caber na F1.3:

- (a) o e2e sobe um SEGUNDO daemon com `CODM_PROFILE=cloud` e as specs de owner/auth apontam para ele;
- (b) essas specs saem para uma suíte cloud separada, que só roda quando há nuvem;
- (c) stub/seed local.

**Bloqueada em aval do founder.** Enquanto não decide, o gate `cd packages/e2e && bun run test` fica com resposta parcial: a suíte SOBE (a sonda foi consertada e isso está provado), e falha por defeito conhecido e nomeado — o que é diferente de "quebrado conhecido" do §1, porque tem causa medida e frente aberta.

### Fechamento medido da F7, e o que sobra vermelho na lista de gates

#### O e2e fechou VERDE — 10 passando, 3 skips declarados, 0 falhas

Era **0 passando / 11 falhando** quando esta frente começou. O caminho e os três defeitos de
PRODUTO que a suíte morta escondia estão nos commits `6388c654` → `767ccaa8`.

| defeito | onde estava | como se manifestava |
|---|---|---|
| a imagem Docker de nuvem não bootava | `scripts/build.ts` estagiava só o tronco SQLite | `ENOENT: dist/migrations/meta/_journal.json` antes de escutar |
| o console abria sem identidade verificada | `CLOUD_UNREACHABLE` não mapeado em `lib/errors.ts` | `OnboardingGate` caía no `!data` e renderizava os filhos |
| o áudio sumiu do catálogo | `MEDIA_KINDS` sem `AUDIO` (68bf10ee) | card caía no ícone genérico ANTES de tentar decodificar |

Os três estavam atrás do mesmo gate morto. É o §1 com três instâncias medidas em vez de uma.

#### ⚠️ O QUE SOBRA VERMELHO — e por que NÃO é "aceitar um gate quebrado"

Duas coisas seguem vermelhas no `bun run test`, e o §1 é incondicionado, então elas ficam nomeadas
aqui com o que as substitui e o que custaria fechá-las.

**(i) Quatro `.services.test.tsx` do react** — `UserProfile`, `ContactStep`, `SetupChecklist`,
`SessionChatSection`. Falham com `CODM_CLOUD_URL não está configurada`.

MESMA RAIZ do grupo 2 do e2e, e isso é diagnóstico, não desculpa: o modo `services` sobe a coluna
`e2e`, que liga a `CloudSession` REAL — porque aquela coluna foi declarada para o Playwright, onde
exercitar o portão de login é o ponto. O harness de COMPONENTE do react herda esse portão e não tem
como satisfazê-lo. É a mesma espécie do `e2e: PgDriver` que a F7 já corrigiu: uma declaração certa
para um consumidor, herdada por outro que ela nunca considerou.

*O que substitui, hoje:* a dimensão CROSS-SERVICE desses quatro está coberta — e melhor — pela suíte
e2e, que agora tem nuvem de verdade e está verde. O que NÃO está substituído são as asserções de
COMPONENTE (o que a tela renderiza dado aquele estado), e isso é exposição real, não zero.

*O que custaria fechar:* declarar o daemon de nuvem como CO-TENANT BOOTÁVEL no manifesto. Hoje só o
`apiGo` tem `testBoot` (medido: `REPO.workspaces` tem uma única recipe), e o e2e sobe a nuvem à mão
no `playwright.config.ts`. Declará-la faria os DOIS consumidores pedirem a mesma coisa —
`services: ['apiGo', 'apiTsCloud']` — em vez de um deles a escrever à mão e o outro não poder pedir.
É a mesma reforma que este plano fez com contextos e registries, aplicada a co-tenants. **Contrato de
manifesto, não conserto pontual** — por isso está registrado e não improvisado.

**(ii) `app-tauri:test`** — falha no build Rust: `packages/app/tauri/src-tauri/binaries/` não existe
nesta worktree. O sidecar não foi compilado aqui. Ambiental, não de código; some quando o binário é
buildado.

#### Regressão minha, achada rodando a lista fechada

A T3 fez `startIntegrationBackend` exigir `ownerId` declarado. Consertei o spike do lado TS e não
varri o react, que boota pelo mesmo caminho — cinco call sites com `services` ficaram sem declarar, e
a mensagem de erro que eu mesmo escrevi os nomeava. Corrigido em `767ccaa8` com `HARNESS_OWNER_ID`
declarado uma vez.

Registro junto um erro de método: o primeiro patch usou substituição da PRIMEIRA ocorrência num
arquivo onde ela estava no docblock, não na chamada — editei o comentário e não o código, e só
percebi porque o teste continuou vermelho com a mesma mensagem. Varredura por `grep` do call site,
não por `replace` cego, quando o mesmo texto aparece em prosa e em código.

## ✅ FECHAMENTO DAS FRENTES DO `codm` — F1, F2, F3 e F7

Marco formal, com evidência por frente. Tudo local, nada empurrado (a `main` segue 185+ commits à
frente da `origin/main`, e isso é decisão do founder).

| frente | estado | commits | evidência |
|---|---|---|---|
| **F1** | ✅ fechada | `167709e2`, `6388c654` | F1.1 typecheck cobre `scripts/**` · F1.2 caminho absoluto morto (falsificador: `check:generated` verde de cópia não-original) · F1.3 fechada PELA F7 |
| **F7** | ✅ fechada | `6388c654` → `cfe5072e` | e2e **11 passando / 2 skips / 0 falhas** (era 0/11) |
| **F2** | ✅ fechada | `e02b6935`, `1fe9793b` | `registries.generated.ts` derivado · rail aposentado com prova de vacuidade · falsificadores: pareamento por índice → 3 fail, ordem alfabética → 2 fail, edição à mão → gate vermelho |
| **F3** | ✅ fechada | `2cd2745a`, `d2f1ebbe`, `03343ce8`, `7377d64e` | T1/T3/T6/T7 entregues · T5 redirecionada (gate 8b) · T8(A) como env de produto · T8 mecânico parcial |

**Gates ao fechar** (lista da condição 4): `bun tsc` 7/7 · `test:tooling` 726/726 · api-typescript
1474/1474 · cross-service TS 3/3 · cross-service react 5 arquivos/0 falhas · contracts ok · Go
build+test ok · `lint` 9/9 · `contexts:check` 4 derivados · `db:check-go` byte-idêntico ·
`dump-sqlite-schema --check` ok · `bun sdk` ok · `check:generated` em sinc · **e2e 11/0/2**.

`git status` limpo ao fechar. Staging sempre por caminho explícito; nenhum `git add -A`.

### Os quatro defeitos de PRODUTO que a suíte morta escondia

Este é o resultado que importa, e ele valida o §1 com quatro instâncias medidas:

| # | defeito | como se manifestava |
|---|---|---|
| 1 | a imagem Docker de nuvem **não bootava** | `build.ts` estagiava só o tronco SQLite; `PgDriver` lê o de nuvem no boot → `ENOENT` antes de escutar |
| 2 | o console abria **sem identidade verificada** | `CLOUD_UNREACHABLE` não mapeado; `OnboardingGate` caía no `!data` e renderizava os filhos |
| 3 | o áudio sumiu do catálogo | `MEDIA_KINDS` sem `AUDIO`; o card caía no ícone genérico ANTES de tentar decodificar |
| 4 | as rotas de owner eram **inalcançáveis** | `mcpScopes` anexava o `AgentIdentityMiddleware`, e agentes só rodam no local enquanto `owner` monta só na nuvem |

Nenhum deles é de teste. Os quatro estavam atrás do mesmo gate morto.

### ⛔ PARADA NA F4 — sessão própria, como a condição (7) manda

A F4 e a F5 escrevem no `template-fullstack`. O repositório EXISTE
(`/Users/work/Desktop/Projetos/pessoal/template-fullstack`), mas esta sessão está isolada na worktree
`declaracao-de-contexto` do `codm` — que é precisamente o cenário que a condição (7) antecipou:
*"F4 e F5 escrevem no template-fullstack e não são alcançáveis de uma worktree do codm: quando
chegar nelas, PARE e peça sessão própria."*

Chegou o momento. **Parando aqui.**

A F6 (poda da W3) toca os DOIS repositórios e vem por último, num passe só — depois da F4/F5, não
antes.

### O que a próxima sessão precisa saber

1. **O que já subiu de contrato neste repo** e a W2 leva adiante: `ContextDecl` ganhou `givens`;
   `registries.generated.ts` é o terceiro derivado; `BoundedContext.bindAll` + `bindContexts` são a
   fase A do ADR 0007; `IntegrationBackendOptions` ganhou `identity`.
2. **O que ficou medido e NÃO feito**, com número: a T8 tem 65 resíduos verificados, dos quais o
   bloco mecânico foi parcialmente pago (`7377d64e`) e sobram as decisões (B) marca no runtime — o
   Dockerfile não copia o manifesto —, (C) `brandDisplay`, (D) marca no `src/` dos frontends.
3. **Uma flakiness pré-existente**, para não ser confundida com regressão: a suíte default do react é
   instável sob o `nx` (medido 261/6 e 264/3 em execuções consecutivas) enquanto `bun test` puro dá
   267/0 três vezes. Os alvos são testes de story e do `OnboardingFlow`, sensíveis a tempo.

### F4 — W0-template (no `template-fullstack`, mecânico)

T0.6–T0.10 do plano anterior mais os 7 itens do Tier 0/1 do dossiê. Sem aval de doutrina. Fecha o buraco da família libsql lá — o `saveWithOptimisticLock` do libsql **não existe** no template.

### F5 — W2, o upstream da reforma (no `template-fullstack`)

Leva `ContextDecl` + o gerador + `lifecycle.ts` + o par `bindContexts`/`composeContexts`. **Três insumos que o plano original não tinha:**

1. As colisões que a DC2 revelou — o alias × a declaração do kernel (colidem em `shared`), os dois nomes de registry, e o vocabulário OpenAPI que não pertencia ao `shared`.
2. O **ADR 0007**: a janela existe no template (`BoundedContext.ts:184-197`, `Router.ts:68-69`), **neutralizada só por convenção de ordem de import** (`routers.ts` importa `shared` primeiro). O par que a W2 leva tem de mecanizar as duas fases **desde o dia 1**.
3. O achado do `CONTEXT_REGISTRIES` — o template tem o mesmo padrão.

**NÃO leva** a `PLACEMENT` nem o eixo `deployment`: o template não tem segundo deployment, e a tabela viraria decoração.

### F6 — W3, poda (nos dois)

Rails vacuosos **por construção**: WIRE-01/02, as pernas do `slice-closure` sobre chave de registry e `import './errors'`, a paridade do barril de schema. O **WIRE-03 não sai** — o barril de controllers continua autorado (Decisão 10). Cada aposentadoria precisa da prova de vacuidade, não da alegação de inconveniência.

---

### T8 — o estado depois de (A) e (C), e por que (B) trava

| bloco | resíduos | estado |
|---|---|---|
| mecânico | 39 | ✅ parcial — a leva de rails/scratch está paga (`7377d64e`) |
| **(A)** `dbFileName` | 10 | ✅ **fechado** como env de produto (`03343ce8`), com rail cross-linguagem |
| **(B)** marca no runtime | 9 | ⚠️ **1 feito** (tag de menção, `4ecf7ac6`) · **8 travados** |
| **(C)** `brandDisplay` | 3 | ✅ **fechado** (`38784dbf`), e corrigiu drift visível ao operador |
| **(D)** marca no `src/` dos frontends | 5 | ⛔ muda chave de storage/cookie |

#### A premissa do (B) NÃO fecha — medido em 2026-08-17

O caminho que eu mesmo propus era o `bun contracts` emitir uma constante de marca em
`packages/contracts`, porque o Docker **copia** esse pacote e **não copia** o `template.config.ts`.
Verificado: a premissa do Docker está certa, e mesmo assim o caminho não serve para metade dos
resíduos.

**Dois dos oito vivem no CORE PORTÁVEL** — `core/src/utils/Config.ts:31` (o default `~/.codm/data`) e
`core/src/types/AgentIdentity.ts:97` (o header `x-codm-run-token`). O core declara `@codm/contracts`
como dependência mas só a importa em TESTES; o próprio `core/src/index.ts:51` diz *"no schema
definitions — those live in @codm/contracts"*. Ler a marca dali criaria dependência de **produção**
core → contracts, no kernel que a W2 extrai — o oposto do que esta frente persegue.

**Dois estão nominalmente listados como dívida** no cabeçalho do `template.config.ts`:
`MCP_SERVER_KEY` (declaradamente leaf e import-free) e `AGENT_RUN_TOKEN_HEADER` (cujo gêmeo no SDK é
arquivo ESCRITO À MÃO dentro de `dist/`, não gerado — então "emitir da mesma fonte" é parte da
decisão, não consequência dela).

**Os 3 do Go e os 2 do Rust** dependem da mesma escolha.

#### As três saídas, e o precedente que esta frente criou

1. **O core deixa de ter default; o produto declara.** É o padrão que T1, T3 e T8(A) já usaram —
   `CODM_AGENT_INACTIVITY_MS` saiu do kernel, `TestBed.ownerId` passou a lançar, o nome do banco virou
   env de produto. Custo: um install sem a env não sobe, o que é uma mudança de comportamento para
   quem hoje depende do default.
2. **Constante gerada em três linguagens**, emitida por `bun contracts` para dentro de
   `packages/contracts` (que o Docker copia). Resolve Go e Rust de uma vez, mas não resolve o core sem
   criar a dependência acima.
3. **Env, como (A).** Os dois runtimes leem env nativamente e o Docker passa env — é o único canal que
   já provou alcançar TS, Go e o core sem espelho nem import novo.

**(3) é a que tem precedente medido nesta frente** e a que não mexe na portabilidade do kernel. Mas é
decisão do founder, porque muda o contrato de boot: o kernel passaria a exigir declaração onde hoje
tem default.

### Planos de implementação — F4, F5, F6 (para a sessão do `template-fullstack`)

> **COMECE POR `.plans/2026-08-17-handoff-template-fullstack.md`.** As seções abaixo são o registro de
> COMO cada conclusão foi alcançada, e várias delas foram CORRIGIDAS por seções posteriores deste mesmo
> arquivo (o placar da poda, o falseador da fase A, o Passo 0 medido). Lidas em ordem, entregam
> primeiro as versões superadas. O handoff é a versão consolidada e atual.

Escritos AQUI, antes de a sessão existir, porque a condição (2) pede plano antes de implementação e
porque o `codm` acabou de medir coisas que mudam o conteúdo dessas frentes. Quem abrir a sessão lá
começa daqui, não do zero.

#### Passo 0 da sessão do template — o estado de partida, MEDIDO em 2026-08-17

Medido de fora (leitura funciona da worktree do `codm`; escrita é que é bloqueada):

- **HEAD:** `95b713e50` — *"feat(lint): component-quality ganha as duas regras que o codm provou"*.
- **A árvore NÃO está limpa:** dois arquivos não rastreados, `.specs/2026-08-15-contexto-em-um-arquivo-design.md`
  e `.specs/2026-08-15-manifesto-de-contexto-design.md`.

Isso importa antes da primeira linha: a condição (6) pede `git status` limpo ao fechar cada frente, e
quem começar sem saber que esses dois já estavam lá vai ou atribuí-los a si mesmo ou varrê-los junto.
**São de outra sessão — decida o que fazer com eles ANTES da F4.1, não no commit.**

E o Passo 0 do CLAUDE.md vale literalmente aqui: confirme `tsc` + testes verdes no HEAD antes de
portar qualquer coisa. O achado 2 da F5 logo abaixo é exatamente o motivo — se o `exclude` de
typecheck do template esconder testes como escondia no `codm` (68 e 13 erros em dois workspaces), o
"verde" do Passo 0 é o mesmo verde-vendo-nada que esta sessão encontrou três vezes.

#### Plano F4 — W0-template (mecânico, sem aval de doutrina)

| passo | conteúdo | gate |
|---|---|---|
| F4.1 | T0.6–T0.10 do plano anterior | os testes do template seguem verdes |
| F4.2 | os 7 itens do Tier 0/1 do dossiê | idem |
| F4.3 | `saveWithOptimisticLock` da família libsql — **não existe** no template | um teste que exercite conflito otimista sobre libsql |

**Ordem interna:** F4.3 por último; os dois primeiros são consertos isolados, e o terceiro adiciona
superfície nova que os outros podem tocar.

#### Plano F5 — W2, o upstream da reforma

O que a W2 leva MUDOU nesta sessão, e o plano tem de refletir o estado real do `codm`:

| leva | estado atual no `codm` | nota para o porte |
|---|---|---|
| `ContextDecl` | ganhou `givens` (T5) | o campo vai junto; sem ele o stamp do template não poda givens |
| o gerador | emite **4** derivados, não 2 | `context-ids`, `contexts.generated`, `composition.generated`, `registries.generated` |
| `bindContexts`/`composeContexts` | ADR 0007, fase A separada | **mecanizar desde o dia 1** — ver abaixo |
| `lifecycle.ts` | `setup` foi DELETADO | o pin de driver morreu junto com a fase A; não porte o `setup` |

**A janela do ADR 0007 existe no template e está neutralizada só por CONVENÇÃO** — `routers.ts`
importa `shared` primeiro. É a mesma classe de defeito que o `codm` tinha: funciona por acidente de
ordem, e a primeira reordenação de import a quebra em silêncio. O falsificador que a condição (5)
pede para esta frente é exatamente esse: *resolver um token antes da fase A tem de falhar ALTO
nomeando o controller*.

**NÃO leva** a `PLACEMENT` nem o eixo `deployment`: o template não tem segundo deployment, e a tabela
viraria decoração — uma declaração que não decide nada é pior que ausência, porque parece cobertura.

**Três achados desta sessão que a F5 herda como trabalho, não como informação:**

1. **O `CONTEXT_REGISTRIES` do template é escrito à mão.** O `codm` o gerou (F2) e por isso aposentou a
   perna de chave do `slice-closure`. **No template a checagem FICA** — lá o defeito ainda pode
   existir. Se a F5 gerar o mapa lá também, aí sim a checagem sai, e com a mesma prova de vacuidade.
2. **A fresta de typecheck.** O `codm` tinha `src/**/*.test.ts` e `tests/**/*.test.ts` no `exclude` de
   DOIS workspaces, escondendo 68 e 13 erros. **Meça o template antes de portar qualquer coisa** — o
   padrão é do template, e um porte sobre testes não-checados carrega o defeito junto.
3. **O `check:generated` é de mão única.** O template usa o mesmo gerador com `clean: false`, então
   tem o mesmo buraco: saída obsoleta nunca sai e nenhum gate acusa. O rail
   `mcp-tool-orphans.test.ts` do `codm` porta direto.

#### Plano F6 — W3, poda (nos DOIS repos, num passe só)

> **MEDIDO em 2026-08-17, e a premissa desta tabela caiu.** Ver "O placar real da poda" logo abaixo:
> WIRE-01 e WIRE-02 **não eram vacuosos — eram cegos**, e viraram conserto (`36918696`, `94e53f67`).

| rail | sai? | prova exigida |
|---|---|---|
| ~~WIRE-01 / WIRE-02~~ | **não — FICAM** | mediu-se o oposto: guardavam zero arquivos |
| `slice-closure` — chave de registry | **só onde o mapa for gerado** | já pago no `codm` (F2); no template depende da F5 |
| `slice-closure` — `import './errors'` | avaliar | medir se o barril ainda pode faltar |
| paridade do barril de schema | avaliar | idem |
| **WIRE-03** | **NÃO** | o barril de controllers continua autorado (Decisão 10) |

A regra que a condição (5) fixa, e que esta sessão exercitou uma vez: **cada aposentadoria precisa da
prova de que o defeito não pode mais existir — não da alegação de que o rail ficou inconveniente.** No
`codm` isso significou mostrar que chave, alias e especificador saem do MESMO binding na mesma
iteração do gerador, e mover a prova para dois testes novos (CTX-06/CTX-07) em vez de a deixar sumir.

Por último, e num passe só: fazê-lo antes obriga a repetir no outro repo.

#### O placar real da poda — medido no `codm` em 2026-08-17

A frente supunha "estes rails ficaram vacuosos, retire-os". Medidos um a um, **quatro dos cinco não
eram vacuosos**, e dois estavam num estado que ninguém tinha motivo para suspeitar: **verdes vendo
zero arquivos.**

| candidato | veredicto medido | número |
|---|---|---|
| `slice-closure` — chave de registry | ✅ **aposentado com prova** (F2) | as duas pernas morreram por razões diferentes; 9 falsos positivos na perna 1 |
| **WIRE-01** | ❌ **estava CEGO** → conserto, e fica | filtrava `*Handler.ts`; arquivos com esse nome: **0**. Os 11 handlers reais são nomeados por intenção |
| **WIRE-02** | ❌ **passava por ausência do assunto** → reancorado, e fica | cobrava `*Job.ts` em `<ctx>/jobs/`: **0** arquivos, **0** `index.ts` (a DC2 apagou), **3** `jobs.ts` reais desguardados |
| `slice-closure` — `import './errors'` | ❌ **não é vacuoso** — fica | o gerador emite o MAPA; cada contexto escreve seu `registry.ts` à mão |
| **WIRE-03** | ❌ não sai (já era a decisão) | barril de controllers segue autorado (Decisão 10) |

**1 poda em 5.** A lição é a mesma do §1, num terceiro disfarce: o §1 descreve um gate **vermelho**
que para de informar; estes eram gates **verdes** que nunca informaram. "Passa" e "guarda" não são a
mesma coisa, e um rail verde não é evidência de que o sujeito dele existe.

Consequência operacional para a sessão do `template-fullstack`: **antes de retirar qualquer rail lá,
falsifique-o na árvore real** (não só na fixture em tmpdir — foi exatamente aí que o WIRE-01 se
enganava: a fixture passava, o repo não era visto). Um rail que não consegue ficar vermelho sobre um
defeito plantado não está vacuoso; está cego, e retirá-lo esconde o buraco em vez de fechá-lo.

Reancoragem que os dois consertos usaram, e que vale como regra: **case o MARCADOR ESTRUTURAL que o
runtime lê, nunca a convenção de nome de arquivo.** Foi a convenção de nome que apodreceu nos dois
casos — o WIRE-02 novo casa `static readonly repeat`, que é o campo que o `resolveJobCadence`
realmente consulta, e por isso não pode dessincronizar de uma renomeação de pasta.

## 3.9 Os falseadores da condição (5) — plantados e medidos em 2026-08-17

Plantados de fato, não alegados por precedente. Cada um foi posto na árvore real, medido, e removido.

| # | falseador | resultado medido |
|---|---|---|
| 1 | import morto em `packages/api/typescript/scripts/__falsifier-probe.ts` | `bun tsc` **VERMELHO**: `error TS2307` nomeando arquivo e coluna. Removido → verde de novo |
| 2 | linha escrita à mão em `src/registries.generated.ts` | `contexts:check` **VERMELHO**, nomeando o arquivo e mandando *"edite a FONTE"*. Restaurado → "4 derivados em dia" |
| 3 | `check:generated` numa cópia que não é a original | **VERDE com zero diff** — e a não-vacuidade foi provada antes (abaixo) |
| 4 | resolver token sem binding na montagem (fase A) | **VERMELHO** nomeando controller, router e a fase — e agora é RAIL, não medição avulsa (ver abaixo) |

O (1) só é significativo por causa da F1: antes dela `packages/api/typescript/scripts/` não estava em
tsconfig nenhum, e este mesmo arquivo teria passado invisível. É o falseador que mostra a fresta
fechada, não só o typecheck funcionando.

**O (3) exigiu cuidado extra, porque a forma óbvia dele é vacuosa.** "Rodei numa cópia e deu verde"
não prova nada se o gerador não for dono dos arquivos em questão — seria mais um gate verde vendo
nada, a doença que esta sessão encontrou três vezes. Então a posse foi medida primeiro: corrompi
`packages/client/dist/typescript/src/typescript/mcp/scopes/system/.mcp.json` para
`{"corrompido":"falseador"}` e a regeneração o **restaurou byte a byte** ao commitado.

Com a posse provada, o argumento fecha: esta worktree tem caminho absoluto diferente do checkout
original (`/…/codm/.claude/worktrees/declaracao-de-contexto` vs `/…/codm`). Se o gerador emitisse
caminho absoluto, regenerar aqui produziria ESTE caminho e divergiria do commitado, que foi gerado
lá. Produziu **zero diff**. O caminho absoluto que quebrou o goal anterior está morto — por
mecanismo, não por inspeção.

Nota de leitura, porque erra fácil: durante a medição o `check:generated` fica verde sobre o arquivo
corrompido. Isso **não** é buraco de cobertura. Ele regenera antes de comparar, então a pergunta que
responde é *"a saída do gerador bate com o commitado?"* — e responde certo. Um arquivo sujo na árvore
que a regeneração sobrescreve nunca foi a pergunta dele.

### O (4) não era do template — era um sujeito sem gate aqui

Eu o havia classificado como "roda na sessão do `template-fullstack`". Errado, e o erro tem a mesma
forma dos outros desta sessão. O `codm` **já separou a fase A** (ADR 0007) e a falha alta **já está
implementada** em `core/src/types/Router.ts`. Medido: **nenhum** teste do repo referenciava
`bindContexts`/`composeContexts`. Invariante implementada e desguardada.

É o inverso exato dos rails WIRE: lá o gate existia sem sujeito; aqui o sujeito existe sem gate. As
duas metades do mesmo engano — **presumir que "está lá" e "está guardado" são a mesma coisa.**

Virou rail: `tests/architecture/phase-a-loud-failure.test.ts` (PH-A). Falsificado revertendo o `throw`
do `Router` para o `console.warn` que ele um dia foi — a regressão exata que guarda — e o rail ficou
**vermelho** dizendo *"a montagem passou em silêncio — o controller sumiria da rota e o boot ficaria
verde"* (**1 fail / 1 pass**). Restaurado o `throw`, 2 pass. Traz contraprova: com o token ligado, a
mesma montagem passa, então ele não reprova por qualquer motivo.

Detalhe de construção que quase o tornou vacuoso, e que a sessão do template precisa herdar: o
colaborador ausente tem de ser um **token sem binding**, não uma classe abstrata. `abstract` é apagado
na compilação, então o tsyringe **instancia** uma classe abstrata sem reclamar e o defeito só aparece
depois, quando falta o método — que é o *outro* meio-mecanismo do 500 do callback do Google, não o
que este rail exercita.

**Consequência para a F5:** o rail mora no core PORTÁVEL. Quando a W2 subir o `Router`, ele sobe
junto, e a F5 herda o falseador da condição (5) **já provado** em vez de o autorar lá — que é
precisamente a doutrina de handoff do CLAUDE.md: entregue o artefato provado, não a instrução de
construí-lo.

## 3.95 Termination check: is there a seventh blind rail? — swept 2026-08-17

*(This section is in English at the user's explicit request mid-session; the rest of the plan predates
that instruction and is left as written.)*

Six defects of one family were found this session, **one per cycle, always reactively**: two typecheck
`exclude` gaps (68 and 13 hidden errors), WIRE-01 blind on a dead filename convention, WIRE-02 blind on
a directory the DC2 deleted, `check:generated` one-way by `clean: false`, and phase A implemented but
unguarded. Finding them one at a time never answered the real question: **is there a seventh?**

Swept with a workflow (condition 3 — orchestration for termination checks): 7 agents over 32 of the 33
architecture rails (`wiring-completeness` excluded, already fixed), each measuring on the real tree how
many subjects its scan actually matches, with an adversarial refuter on every suspicion.

**Result: 32 rails measured, ZERO blind.** Every rail's scan matches >0 real subjects.

### Two honest caveats on that number

**The refuter never fired.** Zero suspects means zero adversarial verifications ran, so this rests on 7
first-pass self-reports. I spot-checked the two thinnest claims by hand — `lifecycle` (claimed 2,
verified 2: `agent/lifecycle.ts`, `shared/lifecycle.ts`) and `build-output` (claimed 2, verified 2 at
1597 and 1790 bytes). Both exact. The reports cite commands and outputs rather than assertions.

**The workflow's own return value was misleading, and it is worth recording why.** It returned
`{confirmados: [], total: 0}`. `total: 0` is a bug in *my* script — the pipeline's second stage returns
`[]` when a batch has no suspects, so the flattened count discards all stage-1 data. Read alone, it
looks exactly like "nothing was measured". The journal shows 32 rails measured across 7 agents, 634k
tokens, 254 tool calls. **A workflow result that reads as empty deserves the same suspicion as a green
gate** — that is the same lesson one layer up, and I nearly filed the sweep as inconclusive.

### The follow-up question, and why it closes too

"No rail is blind today" is weaker than "no rail can go blind tomorrow". Measured: **11 of 33 rails
carry a non-vacuity guard** (`toBeGreaterThan(0)`); 22 do not, and 14 of those scan by name/directory
convention — the exact pattern that failed twice.

But the risk concentrates only where a scanned universe could *silently* empty, and it does not:

- The large scanners (`i18n-coherence` 647, `process-env`/`console-discipline`/`event-name-discipline`
  467, `probe-discipline` 170) walk every `.ts`. They cannot empty without the repo vanishing.
- The small ones are not file scans at all. `cloud-identity`, `real-di-resolution`, `union-narrowing`
  and `phase-a-loud-failure` instantiate or call their subject **directly** — if the symbol disappeared
  the import breaks and the file fails loudly, which is a stronger guard than any count.
- `brand-display` scans a fixed `as const` list; a renamed entry makes `readFileSync` throw. Loud.

I first flagged three of these as at-risk and was wrong — reading each scan showed none can go vacuous
silently. Recorded because the wrong first read is instructive: *"lacks a non-vacuity guard"* and
*"can go blind"* are not the same predicate, and conflating them manufactures work.

**Conclusion: the defect class closes at six.** The one structural change that came out of the sweep is
already applied — the three WIRE rails now assert their own non-vacuity (`945d0721`), so the family
cannot silently reopen where it twice did.

## 4. Ordem, e por quê

**F1 → F2 → F3 → F4 → F5 → F6.**

- F1 primeiro porque são as frestas que deixam defeito passar; enquanto elas existem, todo gate seguinte vale menos.
- F2 e F3 são `codm` e destravam a extração.
- F4 antes de F5 porque o plano original o recomenda e a razão vale: consertos mecânicos antes de reforma.
- F6 por último, num passe só sobre os dois repos — fazê-lo antes obriga a repetir no outro.

**O rename fica fora**, por decisão do founder, com plano próprio.

## 5. Condições de término

1. `packages/*/typescript/scripts/**` sob typecheck, com falseador (import morto ali fica vermelho).
2. `check:generated` verde numa cópia que **não** seja a original — é o teste de que o caminho absoluto morreu.
3. e2e completa. **Parcial, com causa medida:** a sonda foi consertada (F1.3) e a suíte agora SOBE; as 11 specs que falham são a F7, defasagem contra o ADR 0001, bloqueada em aval.
4. `CONTEXT_REGISTRIES` derivado, e o destino do rail do `slice-closure` decidido com prova.
5. As tasks vivas da `upstream-prep` fechadas ou declaradas obsoletas com medição.
6. Template com o par manifest/compose em **duas fases**, e um falseador provando que resolver antes de compor falha.
7. Rails aposentados: cada um com a prova de vacuidade **por construção**.
8. Bateria completa verde nos dois repos.

## 6. Gates humanos

1. **F2** — aposentar ou manter a checagem do `slice-closure`.
2. **F3/T5** — se a medição confirmar obsolescência, aval para descartar a task em vez de executá-la.
3. **push** — a `main` está 185+ commits à frente da `origin/main`. É decisão do founder, e este plano não a assume.
4. **F7** — como o e2e trata contextos cloud-only: segundo daemon em perfil de nuvem, suíte cloud separada, ou stub local.

## 7. Fora de escopo

- O rename `workspace → project` (plano próprio, adiado).
- A "terceira família" do `new.target` que a sessão irmã argumentou — o argumento está registrado no dossiê §8; entra se o founder destravar.
- Mudança na `CROSS_CONTEXT_POLICY` ou na granularidade das arestas.
