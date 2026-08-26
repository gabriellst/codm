# Teste de frontend consolidado — story como fixture executável, harness de integração como padrão — Design Spec

**Date:** 2026-08-10
**Status:** Approved
**Bounded Context:** cross-context: console react (testes + stories), core do backend (1 costura de seleção de ambiente), governança (.claude/skills, registry, docs)
**Kind:** chore
**Story Points:** 13 — harness cruzando workspaces (backend em processo no teste do console) + migração de 15 arquivos para stories com play + varredura por falseamento de 36 + reescrita de skill/registry/docs/rail. Sem contrato de fio e sem migração de banco, o que segura abaixo de 21. Ver "Isto pode ser dividido?" ao final.

## Context

O console react tem hoje **duas populações de artefatos de teste que não se conhecem**, e a
governança delas está invertida. De um lado, 38 stories governadas — skill
`.claude/skills/storybook/`, classificação em `.claude/registry.yaml` (linha 229), um framework de
mocks tipados contra a SDK em `packages/app/react/src/storybook/{index,mock,types}.ts`
(`mockQuery`, `mockMutation`, `mockMutationError`, `loadingQuery`, `errorQuery`, `mockSession`,
sobre `msw` + `msw-storybook-addon`) — que **não podem falhar**: não há `play`, não há test-runner,
e `storybook:build` não roda em gate nenhum; uma story pode quebrar de vez e ninguém fica sabendo.
De outro, 36 arquivos `*.test.ts(x)` em `packages/app/react/src` (226 asserções, ~8s) que **barram
todo commit e push** via `nx run-many -t test` — e são órfãos: sem variante react na skill `/test`
(só `go` e `typescript`), sem classificação no registry global, pulados pelo `/review`, sem seção em
`docs/FRONTEND.md`.

O custo dessa orfandade foi pago em 10/08: quatro testes com `RouterProvider` passavam **por
acidente**. O build de produção do React descarrega o render sem honrar `act()`; só o build de
desenvolvimento — que o `nx` ativa ao carregar `NODE_ENV=development` do `.env` — o honra. Faltava
`await router.load()` antes do render, e o `ThreadSettingsDialog/index.test.tsx` **já documentava a
armadilha** ("foi assim que este arquivo passava sozinho e falhava sob nx") — conhecimento preso num
docblock que ninguém era levado a ler.

O recorte medido dos 36: **15 têm componente irmão** (`index.tsx` na mesma pasta) e **21 não têm
tela possível** — hooks (`useThreadRealtime`, `useDeepLinkAuth`, `useSystemPreconditionProbe`,
`useAnalyticsConsent`/`Identity`), módulos puros (`steps.ts`, `lib/format`, `lib/enums`,
`lib/errors`, `locales/parity`, `taxonomy-doc`), infra de DI (`container`, `ServicesProvider`),
gates de composição que não renderizam nada (`SupervisionGate`, `OnboardingGate`) e a porta
`BrowserSystemPreconditionsService`. O valor central desses testes, nas palavras da sessão: provam
**ausência** — "nenhuma requisição saiu", "a query não foi invalidada". Os três bugs relatados pelo
founder nesta semana tinham essa forma, e nenhum tinha assinatura visual.

Do lado do backend, o `TestBed` (`packages/api/typescript/tests/support/TestBed.ts`) já oferece o
ambiente `integration` — bindings reais sobre banco em processo, migrações reais aplicadas no boot —
mas só para testes do próprio backend: o boot do servidor em
`packages/api/typescript/core/src/types/BoundedContext.ts:60` faz
`registerAll(..., options.registry.real)` **hardcoded**. Há precedente para costura guardada: o
`CODM_E2E=true` monta um `TestIngressController` no servidor real, recusado sob
`NODE_ENV=production` pelo `boot.ts`. O Storybook é o 10 (`^10.4.2`), o que torna `composeStories`
um caminho de primeira classe.

## Problem

1. **A governança está invertida.** O que é governado (stories) não pode falhar; o que barra todo
   commit (testes) é ingovernado. Consequência medida: 4 testes passando por acidente, e uma
   armadilha já documentada num arquivo vizinho que nada obrigava a ler.
2. **Dois mecanismos de mock para a mesma fronteira.** `@/storybook` tem mocks tipados contra a SDK;
   os testes fazem stub manual de `globalThis.fetch` — não checado pelo `tsc`, pode divergir do
   contrato em silêncio.
3. **Mock, mesmo tipado, só prova por procuração.** O bug "concluir só pegava na segunda vez" era
   uma corrida entre mutation, cache e leitura. O teste de regressão com stub o cobriu contando
   requisições — a ASSINATURA da invalidação, um proxy —, não o comportamento em si (o gate lendo
   `completedAt` fresco depois de concluir). Com o backend real computando a resposta, a asserção
   vira o comportamento, e a classe inteira de "o mock devolve o que semeei, o backend devolveria
   outra coisa" deixa de existir.
4. **Story quebrada é invisível.** `storybook:build` não roda em gate nenhum.
5. **Não existe regra de fronteira.** Ninguém sabe dizer, sem julgamento, onde um caso novo deve ser
   escrito — story, teste ou e2e.

## Goal

Quem escreve uma peça de frontend passa a ter **um lugar por pergunta, com regra que dispensa
julgamento**: a story é a fixture única — o Storybook a mostra, o `bun test` a executa com `play` —
e os testes de comportamento batem por padrão num **backend real em processo** (ambiente
`integration`), de modo que o mock não pode divergir do contrato porque não há mock. Stories passam
a poder falhar no gate que já existe, os testes órfãos ganham canon, skill, classificação e revisão,
e a armadilha do `router.load()` vira impossível de reencontrar — por helper e por rail, não por
memória.

## Decisions

### A regra de fronteira

1. **Três lugares, uma regra sem julgamento.** Tem tela? **story** (variantes visuais + `play` de
   comportamento). É ausência ou decisão sem tela (hook, gate, módulo puro, porta)? **teste
   colocado**. Atravessa a pilha com browser e processos reais? **e2e**. A regra entra em
   `docs/FRONTEND.md` como seção de camadas de teste, com o que cada camada garante e o que
   honestamente não garante.

### Execução — story como fixture única

2. **`composeStories` no `bun test`.** A story alimenta o Storybook (visual) e os testes (execução
   com `play`), no happy-dom e nos gates que já existem. Zero runner novo: `@storybook/addon-vitest`
   (browser real por story) fica registrado como evolução possível, não como parte disto;
   `@storybook/test-runner` (jest) é descartado por ser a geração anterior.
3. **Smoke test que compõe e renderiza TODAS as stories** dentro do `bun test`. É o que mata a
   invisibilidade do Problem 4 pelo runner que já roda: story que não compila ou não renderiza falha
   o gate de commit, sem depender de `storybook:build`.
4. **Os 15 testes com componente irmão migram para as stories** com `play`; os `.test.tsx` deles
   morrem (ou encolhem a um import de `composeStories` quando houver asserção que não caiba no
   `play`). Story vira a casa de tudo que tem tela.

### Fidelidade — o harness de integração

5. **Testes de comportamento batem por PADRÃO num backend real em processo.** Um harness de teste do
   console faz boot da composition root do backend com `ALL_REGISTRIES.integration` (driver em
   processo, `EventEmitter2Mediator`, migrações reais no boot), sobe o `MainRouter` em **porta
   efêmera**, e aponta `configureClient` para ela. Os hooks da SDK exercitam controllers reais,
   middleware real, use cases reais. Seeding é **estado, não resposta**: mesmo processo → o teste
   resolve repositórios/`given` helpers direto do container do backend. Racional: mock, mesmo
   tipado, devolve o que foi semeado e obriga o teste a asseverar por procuração (contagens,
   assinaturas); o backend computando permite asseverar o comportamento em si — o gate lendo o
   `completedAt` que a mutation acabou de gravar, não um refetch contado.
6. **A costura de seleção de ambiente é UMA e é guardada.** `BoundedContext.create` deixa de
   hardcodear `registry.real` (linha 60) e passa a aceitar o ambiente por opção explícita do
   chamador — com o boot de produção inalterado e a seleção de `integration` recusada sob
   `NODE_ENV=production`, no mesmo padrão do `CODM_E2E` em `boot.ts`.
7. **Exceção RATIFICADA à regra "frontend só consome backend pela SDK"**: o harness de teste do
   console importa o **test support** do backend (TestBed, givens, registries). Vale só para código
   de teste — nunca para código de produto. Registrada aqui para o reviewer não derrubar.
8. **MSW não morre; encolhe para o que só ele faz**: estados que o backend real não produz (erro
   forçado, loading eterno) e o contexto visual do Storybook no browser (onde não há como subir
   backend). Todo stub manual de `globalThis.fetch` morre.
9. **O e2e permanece `real`, intocado.** O valor dele é o caminho de verdade — arquivo, migrações em
   disco, bundle node, browser. Trocá-lo por `integration` esvaziaria o que ele prova.

### O canon do teste colocado

10. **Extraído dos docblocks que já o praticam** (`ThreadSettingsDialog`, `SupervisionGate`,
    `useThreadRealtime`, `virtual-list`): montar o real contra o Container real; asseverar na
    fronteira que responde à pergunta (a rede, não o hook); `await router.load()` antes do primeiro
    render; esperar por condição, nunca por `sleep`; happy-dom não mede layout — asserção de medida
    é mentira nessa camada e pertence ao browser.
11. **Helper `mountRouter` compartilhado** em `packages/app/react/tests/support/` — router de
    memória + `load()` + render em `act` + assentamento por condição. Quem monta rota em teste não
    consegue esquecer o `load()` porque não escreve essa parte.
12. **Rail de arquitetura** no padrão de `packages/api/typescript/tests/architecture/`: varre
    `*.test.tsx` do console, e `RouterProvider` sem `router.load()` falha nomeando o arquivo.

### Migração e limpeza

13. **Varredura por falseamento dos 36.** Para cada teste: quebra-se a implementação, roda-se; o que
    continuar verde não prova nada e é descartado. Um descarte já está medido:
    `steps.test.ts :: "tem exatamente uma entrada por StepId conhecido"` duplica o que o `tsc` já
    rejeita (`TS2741` para chave faltando, `TS2353` para chave extra). Os sobreviventes sem tela
    ganham o canon e migram para o harness onde couber.

### Governança

14. **Tudo na skill `/storybook`, com escopo ampliado** (decisão do founder): ela deixa de ser
    "skill de stories" e vira a skill de teste de frontend — stories, `play`, testes colocados, o
    canon e o harness. `*.test.ts(x)` de `packages/app/react/` é classificado no
    `.claude/registry.yaml` apontando para ela, e o `/review` passa a enxergar os testes.

### Entrega

15. **O tooling inteiro é UM commit atômico, portável; as aplicações ao produto vêm em commits
    separados** (decisão do founder). Este repo é o template — um fork (fork clínico, the e-commerce fork) deve
    conseguir fazer cherry-pick do commit de tooling sem arrastar nada do CODM. Dentro do commit
    atômico: a costura de ambiente no `BoundedContext`, o harness de integração, o `mountRouter`, a
    infra de `composeStories` + o smoke test (que compõe stories dinamicamente — é tooling mesmo
    rodando sobre stories do produto), o rail de `RouterProvider`, o banimento do stub manual de
    `fetch`, a skill `/storybook` reescrita, a classificação no registry e a seção de
    `docs/FRONTEND.md`. Fora dele, em commits próprios: a migração dos 15, a varredura dos 36 e
    qualquer `given` específico do produto.
    **Consequência de ordem**: o hook de commit roda a suíte inteira, então o commit de tooling tem
    de sair verde sozinho — se o smoke test revelar story do produto já quebrada hoje (nada a
    verifica), o conserto dela vem num commit de produto ANTES do commit de tooling.

16. **Herança, nunca redeclaração** (correção do founder em 10/08, durante a execução): o servidor
    de integração HERDA tudo que o backend já define — a montagem do servidor é extraída para o
    próprio backend (`src/server.ts`, usada pelo boot de produção E pelo harness), e o front consome
    por FRONTEIRA DE CONTRATO: um arquivo de contrato do lado do api sem nenhum alias interno
    (`testing-contract`), importado estaticamente pelo react só em tipo, com a implementação vindo
    por import dinâmico computado. Espelhar os aliases do backend no tsconfig do react (a opção (a)
    discutida no plano) fica REVOGADO — seria redeclarar a estrutura do backend no front, o que o
    não-negociável nº 5 do CLAUDE.md proíbe, além de colidir (`@/*` × `@*`). Consequência: o `tsc`
    do react nunca desce nos internos do backend, e o custo de tsc da aposta (1) dos Risks deixa de
    existir.

## User Stories

- **Story 1:** Como desenvolvedor criando um componente novo, quero um lugar único e uma regra
  pronta, para não decidir caso a caso onde escrever o quê.
  - Given um componente com tela, when escrevo suas variantes e seu comportamento, then tudo vive na
    story — o Storybook mostra, o `bun test` executa o `play`; um `.test.tsx` irmão só existe como
    import de `composeStories` para asserção que o `play` não expresse (Decision 4), nunca como
    montagem independente.
  - Given um hook sem tela, when escrevo seu teste, then ele é colocado, usa o canon, e o `/review`
    o enxerga.

- **Story 2:** Como desenvolvedor testando comportamento, quero que a resposta venha do backend de
  verdade, para um mock nunca mentir sobre o contrato.
  - Given o harness de integração, when o componente dispara um hook da SDK, then a requisição
    atravessa controller, middleware e use case reais sobre banco em processo.
  - Given um estado que o backend real não produz (erro forçado), when a story precisa mostrá-lo,
    then MSW o simula — e esse é o único papel que resta ao mock de rede.

- **Story 3:** Como founder, quero que story quebrada falhe o commit, para o Storybook nunca mais
  apodrecer em silêncio.
  - Given qualquer story que não compila ou não renderiza, when o `bun test` roda no gate, then o
    smoke test falha nomeando a story.

- **Story 4:** Como agente escrevendo teste de rota, quero que a armadilha do `router.load()` seja
  impossível, para não repetir os 4 arquivos que passavam por acidente.
  - Given o helper `mountRouter`, when monto uma rota em teste, then o `load()` já aconteceu.
  - Given um teste que monte `RouterProvider` na mão sem `load()`, when a suíte roda, then o rail
    falha nomeando o arquivo.

## Acceptance Criteria

- [ ] AC-1: Toda story do console é composta e renderizada por um smoke test dentro do `bun test`;
      quebrar uma story qualquer falha o gate nomeando-a.
- [ ] AC-2: Os 15 testes com componente irmão não existem mais como `.test.tsx` independentes; seu
      comportamento vive nas stories (`play`) e roda via `composeStories` no `bun test`.
- [ ] AC-3: Existe o harness de integração: backend composto com `ALL_REGISTRIES.integration` em
      porta efêmera dentro do processo de teste do console, `configureClient` apontado para ele, e o
      **container exposto** para o teste resolver o que precisar. O harness em si não conhece nenhum
      `given` — semear com os givens do produto é papel do teste que o consome (é essa a linha que o
      mantém no commit portável da Decision 15).
- [ ] AC-4: A seleção de ambiente no `BoundedContext.create` é opção explícita do chamador; o boot de
      produção segue em `real`, e `integration` é recusado sob `NODE_ENV=production` — provado por
      teste.
- [ ] AC-5: Nenhum teste do console fora do inventário faz stub manual de `globalThis.fetch`; a
      fronteira de rede é o harness (padrão) ou MSW (estados improduzíveis + Storybook) — provado
      por RAIL com inventário explícito dos ofensores atuais (o padrão da varredura de rename): o
      rail nasce no commit de tooling listando os 36 de hoje, a onda B esvazia a lista, e ao final
      dela o inventário é vazio. Sem isso o commit de tooling nunca sairia verde sozinho, violando
      a AC-11.
- [ ] AC-6: `mountRouter` existe em `tests/support/` e os testes de rota o usam; o rail de
      arquitetura falha `RouterProvider` sem `router.load()` nomeando o arquivo — falseado
      removendo o `load()` de um uso.
- [ ] AC-7: A varredura por falseamento dos 36 está registrada (tabela teste → veredito), os
      descartados foram removidos, e o descarte já medido de `steps.test.ts` executado.
- [ ] AC-8: A skill `/storybook` cobre stories + testes colocados + canon + harness;
      `packages/app/react/**/*.test.ts(x)` está classificado no `.claude/registry.yaml` apontando
      para ela; `bun review` de um teste do console devolve checklist dela.
- [ ] AC-9: `docs/FRONTEND.md` tem a seção de camadas de teste com a regra de fronteira e o que cada
      camada garante e não garante.
- [ ] AC-10: O tempo da suíte do console foi medido antes e depois e está registrado; o e2e permanece
      bootando `real` (diff vazio em `packages/e2e/playwright.config.ts` quanto a ambiente).
- [ ] AC-11: Existe UM commit contendo todo o tooling (costura, harness, `mountRouter`,
      `composeStories` + smoke, rails, skill, registry, docs) cuja lista de arquivos não toca
      nenhum componente, story ou teste específico do produto — verificável por
      `git show --stat` desse commit; migração dos 15 e varredura dos 36 estão em commits distintos.

## Caminhos descartados — medidos, não opinados

- **`NODE_ENV` no preload (`tests/setup.ts`)** — testado em 10/08: o teste sem `router.load()`
  continuou verde. O preload roda depois de o Bun já ter resolvido qual build do React carregar.
- **`[test.env]` no `bunfig.toml`** — mesmo teste, mesmo resultado. Não alcança o momento da
  resolução do módulo.
- **`@storybook/test-runner`** — geração anterior (jest) à do Storybook 10 instalado.
- **e2e sob `integration`** — descartado por design, não por medição: esvaziaria o que o e2e existe
  para provar (Decision 9).

## Risks & Migration

**Duas apostas técnicas a validar ANTES da massa — o `/plan` deve abri-las como spike na primeira
onda.** (1) O tempo: a estimativa 15–25s (contra 8s atuais) é chute educado ancorado nos 13s/1363 do
backend; se o medido passar disso, a válvula é reduzir o escopo do padrão (harness só onde há
mutação/corrida; MSW no resto) — ajuste que o founder decide com o número na mão. (2) MSW sob bun:
**RESOLVIDA em 10/08, com o spike na mão.** Veredito medido: NÃO INTERCEPTA — nem o worker de
browser (sem Service Worker no happy-dom) nem o `setupServer` de `msw/node` (o
`ClientRequestInterceptor` não engancha a camada node:http do bun; reproduzido em isolamento).
Decisão do founder: estados improduzíveis ficam SÓ-VISUAIS (story com MSW no browser do Storybook,
onde ele funciona) — sem dublê sancionado, sem asserção automatizada desses estados no bun. O
comportamento no bun bate exclusivamente no harness, e o rail de fetch-stub termina em inventário
VAZIO, sem lista branca. Um canário (`storybook.spike.test.tsx`) fica vermelho no dia em que
msw-sob-bun for consertado, forçando a revisita da unificação.

**A costura no `BoundedContext` toca o boot de produção.** A mudança é seleção explícita com default
`real` e recusa guardada — mas é o coração do DI, e o teste da AC-4 existe exatamente porque um erro
ali é catastrófico e silencioso.

**Cross-workspace de test support cria acoplamento de compilação**: quebra no backend passa a quebrar
a suíte do console. Aceito deliberadamente — o contrato é compartilhado, e a quebra ser ruidosa dos
dois lados é o comportamento honesto.

**A migração dos 15 é a maior massa mecânica** e pode revelar `play` que não expressa asserções dos
testes atuais (ex.: contagem de requisições). O escape é o AC-2: `composeStories` importado num
teste mínimo quando o `play` não bastar — a story continua sendo a fixture.

## Isto pode ser dividido?

Sim — e a Decision 15 já fixa o corte pelo eixo que importa, o de **portabilidade**, não o de fase:
**(0)** conserto de stories do produto hoje quebradas, se o smoke revelar — o smoke é ESCRITO na
onda A mas RODA localmente já na onda 0, como sonda, antes de qualquer commit (commits de produto);
**(A)** o commit atômico de tooling — costura, harness, `mountRouter`, `composeStories` + smoke,
rails, skill, registry, docs — cherry-pickável por um fork sem arrastar CODM; **(B)** os commits de
produto — migração dos 15, varredura dos 36, givens específicos. Uma spec só, com o `/plan`
produzindo as ondas nessa ordem: 0 deixa o repo componível, A é o artefato portável, B aplica.
Dividir em specs separadas deixaria B aprovável sem A existir, que é a ordem errada.

## Open Questions

Nenhuma. Runner, papel do harness, destino dos 36, migração dos 15, casa da governança e
permanência do e2e em `real` foram decididos pelo founder neste brainstorm.
