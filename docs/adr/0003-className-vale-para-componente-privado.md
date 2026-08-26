# ADR 0003 — `className` vale também para componente module-private

- **Status:** aceito
- **Data:** 2026-08-14
- **Decidido em:** sessão de grill (founder + orquestrador)
- **Reverte:** a exceção de população ratificada na migração de 31/07 ("todos os 161 componentes exportados")

## Contexto

A doutrina `CP-04` diz que **`className` é UNIVERSAL**: todo componente que renderiza um root
aceita `className` e faz o merge nesse root. A regra que a aplica
(`scripts/eslint-rules/component-props.ts`) só olhava, porém, componentes que **outro módulo pode
renderizar** — export nomeado, barrel no fim do arquivo, `export default`.

O argumento da exceção estava escrito no próprio docblock, e era razoável:

> *"the harm the doctrine names — a caller that cannot compose, so it copies — needs a caller
> OUTSIDE the file. A module-private helper's only caller is its own file, which owns both sides of
> the edit."*

O founder encontrou o buraco na prática: `ArtifactCard`, em
`routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx`, renderiza um `<div>` com
`className` fixo, não aceita `className` e não espalha props — e passava no lint. Não porque a
regra falhou, mas porque `ArtifactCard` não é exportado.

## A medição que derrubou a exceção

Alargando a população e rodando o lint de verdade:

- **36 componentes module-private** retornavam um host root sem `className`.
- Eles **não estavam espalhados**: 25 dos 36 em quatro arquivos.
  `HomeDashboard/index.tsx` sozinho tinha **8** (`DecorativeBlob`, `NeedsYouCallout`, `TodayStats`,
  `StatTile`, `ActiveSessionsSection`, `ActiveSessionRow`, `LatestActivitySection`, `ActivityRow`);
  `LoopsSection.tsx` e `ArtifactPreview/index.tsx` 6 cada; `DataTableContent.tsx` 5.
- E não eram "helpers com um chamador local": eram **`WorkspaceCard`, `NavItem`, `StatTile`,
  `ActivityRow`** — cards e rows, exatamente a forma que mais tarde é promovida a componente
  compartilhado, e que chegaria lá já fora do padrão.

Também apareceu um custo que a exceção escondia: um agente (ou pessoa) que lê `ArtifactCard`
aprende a forma não-conforme e a copia. Esse é **o mesmo dano que a doutrina nomeia**, só que um
arquivo antes de haver chamador externo.

## Decisão

**A população da regra passa a ser todo componente que retorna um host root — exportado ou
module-private.** Uma exceção baseada na forma do export não é "universal"; a regra passa a
coincidir com a doutrina que ela aplica.

Implementação: uma linha em `component-props.ts` (`if (!exported.has(name) && !isDefaultExported(node)) return`).
Os helpers `exportedNames` e `isDefaultExported` ficaram sem uso e foram removidos junto — 32
linhas de código morto.

**Os 36 achados foram corrigidos, não baselinados.** eslint não tem mecanismo de baseline, e a
severidade `error` desta regra é justificada em `eslint.config.ts` por *"there IS no backlog"* —
deixar 36 findings mataria essa justificativa.

**A testemunha.** O caso de teste que codificava a doutrina antiga (`"a module-private helper has
no caller outside its own file"`, em `valid`) migrou para `invalid`, renomeado para *"a
module-private helper owes className too — export shape is not an exemption"*, com um comentário
dizendo que devolvê-lo a `valid` desliga o alargamento em silêncio. Um gate que nunca reprovou não
é gate; este agora tem um caso que reprova exatamente a mudança.

Um segundo teste falhou junto e também estava certo: o fixture da exemption (b) tinha um
`function Inner({ className }: ComponentProps<'div'>)` que aceitava `className` mas **não
espalhava** `{...props}` tendo vocabulário completo de root. Era invisível por ser privado. O
fixture foi corrigido, não a regra.

## Alternativa mais barata, considerada e não tomada

**Dividir os quatro arquivos.** Oito componentes privados dentro de um `HomeDashboard/index.tsx` já
contraria a estrutura que o `CLAUDE.md` descreve (cada componente em `-components/`, folha recebe
item por prop). Ao virarem arquivos próprios eles seriam exportados, e a **população antiga já os
cobriria** — o buraco fecharia sem mudar doutrina nenhuma.

Não foi tomada porque é refatoração de código de produto, arquivo a arquivo, enquanto a mudança de
regra é uma linha. **Mas o diagnóstico continua de pé**: a concentração 25-em-4-arquivos é sintoma
de arquivos que deveriam ter sido divididos, e essa dívida não foi paga aqui — só deixou de ser
invisível.

## Emenda — root controlado herda o tipo, mas não recebe spread

Ao corrigir os 36, três componentes têm `Link` do TanStack como root (`NavItem`, `ActiveSessionRow`,
`ActivityRow`). A primeira tentativa os tipou como `ComponentProps<'a'>`, por dois sintomas
medidos: `ComponentProps<typeof Link>` produziu `TS2353` (`'threadId' does not exist in type
'ParamsReducerFn<…>'`) e quebrou 3 stories do `FullDiskAccessCard` — que passam isoladas e falham
na suíte inteira, porque `Navbar` monta no shell.

**Isso estava errado, e o founder pegou.** `ComponentProps<'a'>` **mente sobre o root**: `Link`
aceita `to`, `params`, `search`, `activeProps` — nada disso é vocabulário de âncora, e um chamador
não conseguiria passar. A própria mensagem da regra manda o contrário: *"Type the props from the
root (`ComponentProps<typeof TableHeader>`)"*. Herdar de um componente pronto não é inconsistência,
é a herança certa.

Medido depois: **o tipo nunca foi o problema — o spread era.** Com
`ComponentProps<typeof Link>` e **sem** `{...props}`, `tsc` fecha em 0, o lint aceita, e as 3
stories voltam a passar. O `TS2353` era o spread alargando `to`/`params`, não a anotação.

E isso já estava na doutrina, no docblock da própria regra:

> *"The BLIND SPREAD (`{...props}`) is the separate, **CONDITIONAL** half: it is owed only on a DOM
> root, because on a **controlled root** an arbitrary spread fights the controlled contract."*

O `Link` do TanStack, genérico sobre a rota, é precisamente um root controlado. **Regra que fica:
root controlado herda o tipo do root e faz merge de `className`; não recebe spread cego.** Os três
call sites carregam a justificativa em comentário para ninguém "consertar" de volta.

Nenhuma exceção nova precisou ser criada na regra — ela já distinguia as duas metades. O erro foi
meu, ao ler "não deu certo com o tipo" como "o tipo está errado".

## Consequências

- 36 componentes de produto passam a aceitar e mesclar `className` e, quando o root é DOM com
  vocabulário completo, a espalhar `{...props}`.
- Alguns ganham uma API que ninguém usa hoje (`DecorativeBlob` é o caso mais claro). É o preço
  aceito de "universal" ser universal: a alternativa é uma exceção por julgamento caso a caso, que
  não é cobrável por regra.
- A contagem citada no docblock da regra e em `eslint.config.ts` ("337 componentes, 283 em `ui/`")
  já estava **velha e subestimada** antes desta mudança — medido hoje, ~403 e ~304, porque
  `components/ui/icons/` cresceu 126 arquivos depois. Número em comentário envelhece; fica o
  registro de que aquele par de números não é fonte de verdade.
