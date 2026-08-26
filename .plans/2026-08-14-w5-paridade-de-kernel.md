# W5 — paridade de kernel: o que o kernel do template ganhou que este aqui não tem

> **Para workers agênticos:** passos com checkbox (`- [ ]`). Onda **acrescentada em 2026-08-14**, a
> pedido do founder, porque o programa não tinha nenhuma fase que fizesse esta pergunta.

**Goal:** Inventariar, item a item, a divergência entre os dois kernels (TS **e** Go) e decidir o
que entra — com gate para o que entrar não voltar a divergir em silêncio.

**Architecture:** Porte template → codm, como W1/W2. Mas as ondas anteriores partiam de um item que
alguém já tinha NOMEADO; esta parte da varredura. O `codm` é o repo editado; o template é só-leitura.

**Spec:** este arquivo · `scripts/kernel-parity.ts` (o inventário determinístico)

## Por que esta onda existe — a lacuna que o founder achou

As quatro ondas olham para **gates** (W1), **runners** (W2), **composição** (W3) e para a **volta**
(W4). Todas começam de um item já nomeado. Nenhuma pergunta *"o que o kernel de lá ganhou?"*.

O caso que prova: **`core/src/injection/`**. Existe no template, é exportado pelo `core/src/index.ts`
de lá, e resolve exatamente o problema que esta árvore ainda paga em espécie —
**34 `container.resolve(X as any) as X`**. O template tem, além do módulo, um rail
(`scripts/injection-cast.test.ts`) que torna a regra enunciável em uma frase: *`as any` junto de uma
chamada do tsyringe é ilegal em toda a árvore, exceto dentro de `core/src/injection/`.*

Ninguém tinha percebido porque ninguém tinha olhado. Uma divergência de kernel é a que MENOS se
percebe: nada no produto quebra quando o kernel de lá ganha um módulo.

## O inventário, medido em 2026-08-14

`bun scripts/kernel-parity.ts` — determinístico, dois runs sobre o mesmo par de árvores dão o mesmo
texto. Ele INVENTARIA; **o que entra é decisão, item a item**, e uma ferramenta que a tomasse estaria
adivinhando.

| kernel | só no template | só aqui | iguais | divergentes |
|---|---|---|---|---|
| `typescript` (`core/src`) | 46 | 29 | 65 | **61** |
| `go` (`api/go/core`) | 50 | 19 | 17 | **19** |

**178 itens a classificar.** Que 61 dos 126 arquivos compartilhados do core TS já divirjam em
conteúdo é o número que justifica a onda sozinho.

## A rubrica — cada item cai em exatamente um balde

Sem rubrica, "o que entra" vira gosto. Cada item recebe UM veredito, com a razão:

- **ENTRA** — o kernel de lá tem uma capacidade que este quer e não tem. Porta com adaptação de
  forma de módulo (as cinco armadilhas da condição 0) e com testemunha se for gate.
- **NÃO ENTRA — família** — pertence a `pg`/libsql como famílias de banco. Isso é a **W3 Task 5**,
  não esta onda. Nomeie e siga.
- **NÃO ENTRA — o produto foi à frente** — o codm divergiu DE PROPÓSITO e o template é que está
  atrás. Vira candidato da **W4** (a rodada de volta), não porte.
- **NÃO ENTRA — não se aplica** — capacidade de um produto que este não é (multi-tenancy de nuvem,
  billing, notificações). Diga por quê; um "não se aplica" sem razão é o mesmo que não ter olhado.

**Regra dura:** um item sem veredito não é "pendente", é **não medido**, e a onda não fecha com
nenhum.

---

## Task 1 — `injection`: o exemplar, e o que ele custa hoje

O item que o founder nomeou. Entra primeiro porque é o que tem o melhor par medição→cura.

- [ ] **Step 1: colar o RED antes do fix.** Contar os casts, e mostrar que nada os proíbe hoje:

```bash
C=/Users/work/Desktop/Projetos/pessoal/codm; cd $C
grep -rn "resolve(.* as any)" packages/api/typescript/src packages/api/typescript/core/src packages/api/typescript/tests | wc -l
ls scripts/injection-cast.test.ts 2>&1     # esperado: não existe
```

- [ ] **Step 2: portar `core/src/injection/index.ts`** e exportá-lo de `core/src/index.ts`.
      **Atenção à forma de módulo:** o `RegistryToken` de lá foi MOVIDO de `types/Registry.ts` para
      dentro do `injection`. Confira onde o `RegistryToken` daqui mora antes de criar um segundo.

- [ ] **Step 3: migrar as 34 chamadas.** `container.resolve(X as any) as X` → `resolve(container, X)`.
      Mecânico, mas confira cada `biome-ignore` que sobra: um ignore órfão é ruído que ensina que
      ignores são normais.

- [ ] **Step 4: portar o RAIL** (`scripts/injection-cast.test.ts`) e registrar em `test:tooling`.
      **TESTEMUNHA:** plante um `resolve(Foo as any)` fora do módulo e prove EXIT=1 nomeando o
      arquivo; restaure.

- [ ] **Step 5: bateria + commit.**

---

## Task 2 — classificar os 178, com workflow

O volume é o que justifica o fan-out: 178 itens, cada um pedindo leitura dos dois lados.

- [ ] **Step 1:** `bun scripts/kernel-parity.ts --json` alimenta o fan-out.
- [ ] **Step 2:** um agente por LOTE (agrupado por diretório do kernel, não por arquivo solto — um
      `db/pg/*` é uma decisão só). Cada lote devolve, por item: veredito da rubrica + razão medida.
- [ ] **Step 3:** os vereditos entram NESTE arquivo, em tabela. É o entregável da task.
- [ ] **Step 4:** grep final provando que nenhum item ficou sem veredito (condição 2 do contrato).

---

## Task 3 — o gate que impede a divergência de voltar em silêncio

Inventariar uma vez conserta o passado. Sem gate, a divergência volta.

- [ ] **Step 1:** `scripts/kernel-parity.test.ts` — ratchet sobre a contagem de itens NÃO
      classificados. Zero é a meta; crescer exige editar o número no MESMO diff.
- [ ] **Step 2: TESTEMUNHA** — acrescente um arquivo ao kernel de lá (ou remova a classificação de
      um item) e prove RED nomeando-o.
- [ ] **Step 3:** registrar em `test:tooling`.

**Nuance de forma de módulo:** este gate compara com uma árvore que pode não existir na máquina de
quem roda. O `kernel-parity.ts` já falha ALTO nesse caso (`exit 2`) em vez de reportar "nada falta" —
mas o TESTE precisa decidir o que fazer sem o template, e **pular em silêncio é a resposta proibida**.
As opções honestas: falhar, ou pular com ruído (`skipWithNoise`, o molde que o `sqlc-parity` já usa).

## Condição (3) GO-SHARING

O `injection` é TypeScript puro (o problema é do tsyringe). Se algum item classificado como ENTRA
for regra **language-agnostic**, ela entra nas DUAS variantes de skill com exemplo real do lado Go —
e o kernel Go tem 50 arquivos só no template, então a chance de haver um é alta. Se ao fim nenhum
for, **diga por quê**.

## O que esta onda deliberadamente NÃO faz

- **Não porta a família `pg`.** É a W3 Task 5, com decisão de propriedade de dado que a precede.
- **Não iguala os kernels.** O codm tem 29 arquivos TS e 19 Go que o template não tem, e vários são
  o produto tendo ido à frente — igualar por igualar apagaria trabalho.

---

## Task 2 — os 178 vereditos, classificados 2026-08-14

Fan-out determinístico: `bun scripts/kernel-parity.ts --json` alimentou 9 agentes (um por grupo de
diretório de kernel), cada um lendo **os dois lados** antes de decidir, mais uma síntese.
**178 de 178 itens receberam veredito** — zero "não medido", que era a regra dura da rubrica.

Detalhe por item (razão medida, arquivo a arquivo) no journal do run:
`subagents/workflows/wf_3450752b-f6b/journal.jsonl`.

| veredito | itens | % |
|---|---:|---:|
| **ENTRA** | 56 | 31% |
| NÃO_ENTRA — o produto foi à frente | 54 | 30% |
| NÃO_ENTRA — família (W3 Task 5) | 50 | 28% |
| NÃO_ENTRA — não se aplica | 18 | 10% |

**Leitura curta: 40% do delta é o codm na frente ou fora de escopo.** Só 31% é dívida real — o
inventário bruto de "46 + 50 arquivos só no template" superdimensionava o problema por um fator de 3.

### O que o codm ganha, por CAPACIDADE (não por arquivo)

E o achado que justifica a onda: várias dessas capacidades curam **bug vivo**, não ausência teórica.

| # | capacidade | arqs | o defeito que ela cura AQUI |
|---|---|---:|---|
| C1 | OpenAPI Go: `x-tpl-sse`, `x-error-codes`, `oneOf` | 10 | `/events` sai no spec como JSON one-shot → a SDK gera cliente errado, violando a própria R-10 |
| C2 | OpenAPI TS: `nullable` sobrevive ao `$ref`, `mkdir` antes do write | 4 | dois bugs vivos, mais 10 goldens |
| C3 | boot-assert do trem de eventos (Go) | 4 | outbox com ZERO handlers marca `processed_at` e **deleta o evento** |
| C4 | RateLimitStore lazy + `close()` | 4 | abre TCP para Redis no boot do daemon e nunca fecha — ver §duvidosos |
| C5 | CORS numa fonte só | 4 | o Go trata `*` como origem literal, o que **quebra o `.env.example` deste repo**; ninguém emite `Vary: Origin` |
| C6 | vocabulário de erros no fio (Go) | 3 | erro do gateway chega ao app como chave crua |
| C8 | idempotência transacional | 3 | a tabela existe e **ninguém escreve nela** |
| C9 | fail-fast de wiring/DI (TS) | 3 | `Mediator.register` só `console.warn`: handler que não resolve = handler que não existe |
| C11 | identidade de evento preservada | 2 | `new Match(input)` inventa `id`/`time` novos no caminho multi-evento |
| C12 | `entityId` no envelope de integração | 2 | o contrato `.tsp` exige, o runtime grava `undefined`, e o Go faz `uuid.Parse("")` |
| C13 | SSE por dono (Go) | 2 | o broadcast vai para **todos os clientes, sem filtro de owner** |
| C14 | `GetOccurredAt()` (Go) | 2 | `typed.Time` é zero em **toda** entrega vinda do outbox |
| C17 | env normalizado | 1 | `KEY=` vazio mata o `.default()` |
| C19 | fail-closed de config (Go) | 1 | o gate existe e **nada o cobre** |
| C20 | trilho de vocabulário falseável | 1 | o "este teste fica vermelho" é prosa, não código |

(C7 storage, C10 start/shutdown, C15 UnitOfWorkFactory, C16 kernel sem broker, C18 tracing — sem bug
vivo associado; melhoria estrutural.)

### A regra que a síntese impôs, e que vale mais que a lista

**~20 dos 56 ENTRA são portes PARCIAIS. Nenhum deles pode ser feito por cópia de arquivo.**
Dois exemplos medidos, onde copiar o arquivo é regressão garantida:

- `utils/Config.ts` — entra pela metade; o `NO_PLACEHOLDER_IN_PROD` **re-quebra o app empacotado**.
- `utils/OpenAPI.ts` — entra pela metade; `fileName` e `promoteDiscriminantEnums` são o **codm à
  frente** e seriam perdidos.

### Ordem de porte, por arrasto (resumo)

**Onda 0 — zero arrasto, mérito próprio (7 arquivos):** `Tracing.ts`, `Config.ts`,
`vocabulary_test.go`, `config/config_test.go`, `unitofwork/unit_of_work.go`, `middleware/cors.go`
+ `cors_test.go`. **É por aqui que se começa.**

Depois: erros Go (destrava o resto do Go) → OpenAPI Go → trem de eventos Go → TS de baixo custo →
idempotência → OpenAPI TS → CommandQueue → RateLimitStore → CORS TS → e por último os caros, um por
vez (`BoundedContext.ts`, `types/events.go`, `storage/*`, `sse/broadcaster.go`,
`BaseIntegrationEvent.ts`).

### Classificações duvidosas — declaradas, não escondidas

- **`RedisRateLimitStore` + 3 arquivos:** se a decisão for **não ligar Redis num produto desktop**,
  o conserto é UMA LINHA em `auth/registry.ts:73` e os 4 viram NÃO_SE_APLICA. **Decisão de produto
  pendente — não portar antes dela.**
- **`oneof.go`:** capacidade DORMENTE — `grep @oneof` nos contratos gerados do codm dá **zero**. O
  valor é preventivo, não bug vivo.
- **`storage/*`:** sem consumidor hoje, e arrasta um código de erro cuja ordem de declaração é
  **wire-visível** (mexe no golden do spec).
- **`sse/broadcaster.go`:** portar inteiro muda a forma do frame de `/events` e obriga regen de SDK
  + ajuste do react. A alternativa (só o índice por owner) é quase certamente a escolha certa.
- **`unions_test.go`:** as asserções usam `x-tpl-*` e o codm usa `x-*` — **nasce vermelho** se o
  rename não vier antes.
- **`EventEmitter2Mediator.ts`:** o falseador dele ficou fora do lote; entraria código sem teste que
  o exercite, contra a doutrina do repo.
