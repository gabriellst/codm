# ADR 0002 — A tabela de alocação é por contexto, e aberta a critérios

- **Status:** aceito
- **Data:** 2026-08-14
- **Decidido em:** sessão de grill (founder + orquestrador)
- **Depende de:** [ADR 0001](0001-identidade-vem-da-nuvem.md)

## Contexto

A composição precisa saber, para cada bounded context, **se ele monta** e **com qual família de
banco**. A primeira forma construída foi uma tabela por deployment:

```ts
const PLANS = {
  cloud: { auth: …, owner: …, shared: … },              // Partial
  local: { …os 10… },                                    // EXAUSTIVO, de propósito
} as const satisfies { cloud: Partial<Record<ContextModule, InfraChoices>>
                       local: Record<ContextModule, InfraChoices> }
```

A exaustividade de `local` era a propriedade mais valiosa da tabela: criar um contexto novo e
esquecer de planejá-lo **quebra o `tsc` na linha do plano**, antes do commit. Isso foi medido — ver
o falseador (a) em `.specs/2026-08-14-relatorio-t1-linha-eixos.md`.

O ADR 0001 quebrou a premissa que sustentava essa forma. Com `auth` e `owner` indo 100% para a
nuvem, **o perfil local não monta mais todos os contextos** — e a exaustividade estava presa
justamente a "local tem todos".

Duas armadilhas apareceram ao redesenhar:

1. Simplesmente tornar `local` parcial **perde o falseador (a)** — a exata proteção que a decisão 8
   existia para dar.
2. Inverter para `contexto → deployment → escolhas` **crava `deployment` como o eixo**, que é o que
   a decisão 6 proíbe ("assumir que 'perfil' é sempre a decisão"). Um critério novo obrigaria a
   reestruturar a tabela inteira — exatamente o que o seam `planFor` foi desenhado para evitar.

## Decisão

**A tabela passa a ser indexada por CONTEXTO, não por deployment**, e continua exaustiva sobre
`ContextModule`. Cada contexto declara **sob quais critérios** monta — não "em qual perfil":

```ts
// forma; não é o código final
const PLACEMENT = {
  auth:   [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],
  owner:  [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } }],
  shared: [{ when: { deployment: 'cloud' }, infra: { db: 'pg' } },
           { when: { deployment: 'local' }, infra: { db: 'libsql' } }],
  agent:  [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],
  // …os demais
} satisfies Record<ContextModule, Placement[]>   // EXAUSTIVO sobre os contextos
```

Três propriedades, e cada uma responde a uma das armadilhas:

- **Exaustivo sobre `ContextModule`** → o falseador (a) sobrevive. Contexto novo continua quebrando
  o `tsc` até alguém dizer onde ele mora. E agora ele cobra uma pergunta melhor — *"onde isto
  roda?"* — em vez de só *"qual banco?"*.
- **`when` é um `Partial<Criteria>`, não uma chave de deployment** → um critério novo (`region`,
  `releaseTrack`) entra como mais uma chave dentro do `when`. A tabela não muda de forma, e nenhum
  call site aprende que existe um critério a mais.
- **Um contexto pode aparecer sob nenhum, um ou vários critérios** → cloud-only, local-only e dual
  são todos exprimíveis sem caso especial. `shared` é dual e isso agora se **declara**, em vez de
  ser um caso à parte.

`PLANS` por deployment deixa de ser declarado e passa a ser **derivado** desta tabela.

### O que NÃO é construído agora

**Nenhuma máquina de matching.** Medido no grill: hoje o único critério real de composição é
`deployment`. `releaseTrack` (stable/beta) existe no produto mas decide qual **binário** a máquina
baixa, não o que monta no container — é distribuição, não composição. Sistema operacional foi
verificado e **não** é critério: zero ramificação por `process.platform` no backend TS.

Então o `planFor` continua uma **consulta simples**, exatamente como a spec autoriza — *"hoje uma
consulta; amanhã combina critérios sem tocar em nenhum call site"*. A forma fica aberta; a
maquinaria só nasce quando houver um segundo critério real. Construí-la antes seria a cerimônia que
o próprio briefing manda evitar.

## Alternativas descartadas

- **`local` vira `Partial`.** Mudança de uma linha, e perde o falseador (a) por inteiro: criar um
  contexto e esquecer de planejá-lo passa a compilar em silêncio.
- **Dois `Record`s exaustivos** (`cloud` e `local` ambos completos, com um valor `'não-monta'`).
  Preserva a cobrança, mas obriga 10 linhas por deployment — 20 hoje — e a maioria é ruído. Cada
  deployment novo dobra o custo.
- **Predicado como função** (`when: c => c.deployment === 'cloud'`). Máximo de flexibilidade e
  perda total de análise estática: o compilador não consegue mais dizer o que monta onde, e volta o
  "helper de dispatch em runtime" que o briefing já havia cortado.

## Consequências

- A tabela responde *"onde este contexto vive?"*, que é a pergunta que um humano faz. A anterior
  respondia *"o que este perfil monta?"*, que é a pergunta que a máquina faz.
- `shared` ser dual deixa de ser exceção e vira uma linha com duas entradas.
- Um defeito conhecido continua **aberto** e é herdado desta forma: `external` não tem binding
  algum dependente de família (`expandBindings([])`), mas `InfraChoices` exige `db`. Ou `InfraChoices`
  passa a admitir eixos ausentes, ou `external` declara uma família que não usa. Registrado em
  `.specs/2026-08-14-relatorio-t1-linha-eixos.md` §4.2; não resolvido aqui.
- `src/shared/deployment.ts`, como está commitado hoje (`PLANS.local` exaustivo sobre os 10),
  **fica desatualizado por este ADR** e precisa ser reescrito nesta forma quando a implementação
  começar. O falseador (a) tem de ser re-executado contra a forma nova — a propriedade só vale se
  for medida de novo.
