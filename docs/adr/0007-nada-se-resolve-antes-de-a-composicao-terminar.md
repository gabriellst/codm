# ADR 0007 — nada se resolve antes de a composição terminar

- **Status:** aceito
- **Data:** 2026-08-17
- **Decisor:** founder (aprovou os três degraus da escada; a sessão irmã propôs, esta executou)
- **Origem:** um **500 em produção** no callback do Google, medido pela sessão de reconciliação em
  2026-08-17. Não é um defeito hipotético que um rail pegou — é um incidente que um operador viu.
- **Depende de:** a composição explícita (`compose.ts`), que a DC2 tornou a única porta de montagem.
  Sem ela, esta decisão não teria onde aterrissar.

## Contexto — três coisas conspiram, e o silêncio é a pior delas

`BoundedContext.create` fazia duas coisas numa chamada só: registrava o registry **daquele** contexto
e, na sequência, construía o `Router` — que resolve todo controller **sincronamente**. Enquanto o
contexto N montava, os registries de N+1..10 ainda não existiam.

Uma cadeia cross-context alcançada nesse meio resolvia um token sem binding. E aí:

1. **o tsyringe constrói a classe ABSTRATA sem reclamar.** Um port abstrato sem `@injectable()` e sem
   parâmetro de construtor é simplesmente instanciado; como os métodos são abstratos, o protótipo
   está vazio. O objeto existe e parece plausível.
2. **o `Router.registerControllers` ENGOLIA a falha** com `console.warn` — um controller que não
   resolve some da rota, e o boot termina verde.
3. **o sintoma aparece na primeira CHAMADA**, não no boot.

Medido em produção: `AuthPassthroughController → BetterAuth → IdentityAuthHooks → OwnerDirectory`,
resolvido enquanto `auth` montava, antes de o registry de `owner` existir. Sintoma:
`this.owners.ensureOwnerFor is not a function` — 500 no callback do Google, **depois** de o operador
já ter autorizado.

É uma instância de uma classe maior, que a sessão irmã nomeou: **"retrato tirado cedo demais"** — um
valor lido na construção (ou no import) que descreve algo cuja identidade ou existência muda depois.
Outras duas ocorrências medidas na mesma linha: um health check que guardava a instância do
dispatcher na construção (o app não abria), e o client do better-auth capturando `globalThis.fetch`
no import (o spy do teste era ignorado e o POST saía de verdade contra o daemon de dev).

## Decisão

1. **Composição em DUAS FASES.** `bindContexts` liga os bindings de **todos** os contextos montados;
   só depois `composeContexts` monta qualquer um. `BoundedContext.create` **deixa de registrar** —
   quem liga é `BoundedContext.bindAll`. Depois da fase A, nenhum token pode ser resolvido antes de
   existir: a classe de defeito morre **por construção**, não por um guard que alguém precisa lembrar
   de manter.

2. **Falha de resolução de controller derruba o boot**, nunca `console.warn`. As duas fases matam a
   *causa*; esta decisão mata o *silêncio*, que é o que fez a causa sobreviver tanto tempo sem ser
   vista. Um controller que não resolve passa a ser erro de boot com o nome do controller e do router.

3. **Colaborador cuja identidade pode mudar depois da construção é resolvido NA CHAMADA** — thunk ou
   lazy, nunca capturado no construtor. Vale para health checks, clients de rede e pontes de ciclo de
   vida. Depois da decisão 1 o thunk da sessão irmã (`auth/registry.ts`, `27728dfb`) fica redundante
   para o caso dela; a regra permanece porque a decisão 1 não cobre captura de `globalThis`.

## Consequências

**Um hack morreu junto, e isso é o melhor sinal de que o corte foi no lugar certo.** Registrar
contexto a contexto significava re-registrar tokens no container raiz **depois** de a migração já ter
resolvido o driver — e re-registrar um singleton descarta a instância em cache. Daí vinha o
`registerInstance` do `DatabaseDriver` em `shared/lifecycle.ts` (o "pin"), e daí vinha o
`mailboxDispatcher` reportando `down` para sempre. Com uma passada só de registro, **o pin foi
apagado**: não há mais cache para descartar.

Também morreu o `withInfraModules` — ele injetava o módulo da família no registry do descritor pouco
antes de `create` registrá-lo, e `create` não registra mais. O mesmo conjunto de bindings entra pelo
`infraRegistryFor` da fase A. Duas passagens pelo mesmo conjunto viraram uma.

**A ordem do boot ficou explícita em três etapas**, e cada uma existe por uma regressão medida:
ligar → migrar → montar. Migrar depois de montar dá `no such table` (o `registerJobs` escreve);
migrar antes de ligar resolve um token que ainda não existe.

**O que esta decisão NÃO cobre:** um binding genuinamente ausente de todos os registries. A fase A
garante ordem, não completude. A decisão 2 converte isso em falha alta de boot em vez de rota
sumida, que é o degrau "detectar" — mas a eliminação vale para a ordem, não para a ausência.

## Falseadores

| # | Falseador | Resultado |
|---|---|---|
| PHS-01 | resolver um port abstrato sem binding | o tsyringe **devolve** objeto sem método; `lookup()` estoura `is not a function` — o mecanismo do 500, provado |
| PHS-02 | `bindAll` com dois descritores, resolver o port do segundo | resolve a implementação real e ela é **usável**, não apenas construível |
| PHS-03 | passar um `registry` para `create` e conferir o container | o token **não** fica ligado — devolver o `registerAll` para dentro do `create` deixa este teste vermelho |
| Router | um controller com dependência não-bindada | o boot falha alto nomeando controller e router, em vez de a rota sumir |

## Para o template (W2)

A janela estrutural **existe** lá (`core/src/types/BoundedContext.ts:184-197`; `Router.ts:68-69`),
mas está neutralizada por **convenção de ordem de import**: `routers.ts` importa `shared` primeiro e a
raiz aplica `ALL_REGISTRIES`. Proteção documentada, não mecanizada — um `import '@<ctx>/index'` fora
do `routers.ts` reproduz o 500. O par manifest/compose que a W2 leva **tem de mecanizar as duas fases
desde o dia 1**, em vez de reproduzir a proteção frágil.

O template também tem o padrão do singleton descartado (cada child re-registra o próprio registry no
rootContainer) e já **documenta o hazard em prosa** (`shared/registry.ts:232-234`: *"an UNBOUND
abstract silently constructs a method-less instance and crashes boot"*) — sabe do risco, não tem o
mecanismo.
