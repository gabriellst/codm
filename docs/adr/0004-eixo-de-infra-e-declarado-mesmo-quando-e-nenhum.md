# ADR 0004 — Um eixo de infra é declarado mesmo quando é `none`

- **Status:** aceito
- **Data:** 2026-08-14
- **Decidido em:** sessão de readequação (founder + orquestrador), W3 · 1º ato
- **Depende de:** [ADR 0002](0002-tabela-de-alocacao-por-contexto.md)

## Contexto

A tabela de alocação é exaustiva sobre `ContextModule` **de propósito**: acrescentar um contexto
quebra o `tsc` na linha da tabela até alguém dizer onde ele mora. Esse é o falseador (a) do
contrato, e ele funciona.

O que ninguém tinha medido é que a exaustividade tem **duas dimensões**, não uma. A forma de hoje
(`src/shared/deployment.ts`) é:

```ts
export interface InfraChoices {
	db: DatabaseFamily
	// cache: CacheKind        ← um eixo novo é UMA linha aqui
}

local: Record<ContextModule, InfraChoices>   // EXAUSTIVO
```

`db` é obrigatório, então:

- **contexto novo** → o `tsc` quebra, porque falta a chave; e
- **eixo novo** → o `tsc` quebra nas **dez** linhas, porque falta o campo.

A segunda propriedade é a que o comentário do próprio arquivo promete — *"um eixo novo é UMA linha
aqui, e propaga sozinho para `InfraModules`, para `PLANS` e para a amarra de boot"*.

**O defeito.** Nove dos dez contextos têm bindings de família; o `external` tem **zero**. Contagem
medida em 2026-08-14: `thread` 17, `shared` 13, `auth` 8, `agent` 8, `owner` 4, `workspace` 4,
`issue` 4, `artifact` 2, `ui` 2, **`external` 0**. Como `db` é obrigatório, a tabela força um banco
num contexto que não persiste nada, e no dia em que o laço de composição consumir a tabela esse
contexto não monta.

**Precisão que a verificação de coerência impôs:** isto é **prospectivo**, não um crash de hoje.
`InfraModules` não tem consumidor nenhum além da própria declaração — a amarra bidirecional ainda
não existe em código, então nada lança no boot atual. É exatamente por ser prospectivo que dá para
resolver **antes** de escrever o laço, em vez de descobrir depois.

## Decisão

**Todo contexto declara todo eixo, e `'none'` é um valor legítimo do eixo.**

```ts
/** Um eixo declarado: a família escolhida, ou a afirmação de que este contexto não usa o eixo. */
type Axis<T> = T | 'none'

/** DERIVADO de InfraChoices: para cada eixo, a escolha OU `none`. Nenhum campo é opcional. */
export type ContextInfra = { [K in keyof InfraChoices]: Axis<InfraChoices[K]> }

// …
external: { db: 'none' }    // declarado, nunca omitido
```

As duas exaustividades sobrevivem juntas:

| | forma nova |
|---|---|
| contexto novo | `tsc` quebra — falta a chave |
| eixo novo | `tsc` quebra nas dez linhas — falta o campo |
| "este contexto não persiste" | `db: 'none'` — impossível esquecer |

E a propriedade que decidiu: **`'none'` é uma afirmação, não uma omissão.** Um campo ausente não se
distingue de esquecimento; um campo escrito `'none'` diz que alguém olhou. Com um eixo só a
diferença é sutil; com três, é a diferença entre "este contexto não usa cache" e "ninguém pensou
sobre o cache deste contexto".

## Alternativas descartadas

**`Partial<InfraChoices>` como valor, com `{}` para "nenhum eixo"** — a proposta original do
relatório T1 (§4.2). Descartada por medição: `Partial` torna **todo** campo opcional, então
acrescentar `cache` a `InfraChoices` deixa de quebrar qualquer linha e o eixo novo passa a valer
para ninguém, em silêncio. Seria trocar o falseador (a) por um buraco no lugar do falseador que ele
mesmo protege — resolver o `external` destruindo a razão de a tabela ser exaustiva.

**Tirar `external` da tabela** (`Record<Exclude<ContextModule, 'external'>, InfraChoices>`) —
preserva as duas exaustividades para quem está na tabela, mas cria uma **segunda lista**: "quem não
persiste" passa a morar no `Exclude<>`, sem gate próprio, e some da tabela justamente o contexto
sobre o qual a pergunta interessante é feita. A doutrina do repo é o oposto: informação estrutural é
**declarada**, e "proibido `if` de edge-case sobre convenção" vale igualmente para um `Exclude` de
edge-case sobre um tipo.

**Tornar `db` opcional no próprio `InfraChoices`** — move a opcionalidade para o contrato do eixo em
vez da tabela. Pior que a primeira: `db?` passa a ser opcional em **todo** lugar que consome
`InfraChoices`, inclusive onde a escolha é obrigatória.

## Consequências

- `InfraChoices` continua sendo **a lista dos eixos que existem**; `ContextInfra` passa a ser **a
  escolha de um contexto sobre cada eixo**. São duas perguntas diferentes, e agora têm dois tipos.
- O laço de composição ganha um caso a tratar — `'none'` significa *não resolva módulo de família
  para este eixo*. É um valor do domínio, não um `if` de caso especial: a alternativa (`undefined`)
  seria indistinguível de "não declarado".
- `InfraModules` continua derivado de `InfraChoices` por mapped type e **não** ganha `'none'`: não
  existe módulo de bindings para "nenhum banco". É o `ContextInfra` que fala em `'none'`, e o laço
  não consulta `InfraModules` quando a escolha é essa.
- A amarra bidirecional da decisão 12 fica **exprimível pela primeira vez**: eixo declarado sem
  escolha e escolha sem eixo continuam lançando, e `'none'` deixa de ser confundido com nenhum dos
  dois.
