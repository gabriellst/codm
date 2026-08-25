# Conflitos de utilitário Tailwind fora do alcance do `twMerge` — Design Spec

**Date:** 2026-08-07
**Status:** Draft — aberto a partir de um defeito medido; execução não autorizada ainda
**Bounded Context:** app-react (transversal — atinge qualquer componente que componha classes)
**Kind:** rail / correctness
**Story Points:** 3 — uma regra de lint tipada + inventário dos casos existentes; sem contrato de fio, sem migração.

## Context

O `font-bold` do item ativo da sidebar não aplicava. A causa não era o `font-bold`: era um par de
classes conflitantes chegando ao mesmo elemento **sem que o `twMerge` visse as duas juntas**, e a
cascata do CSS resolvendo o empate de um jeito que ninguém previu.

O caso pontual já foi corrigido em `packages/app/react/src/components/Navbar/index.tsx`. Esta spec
existe porque o **mecanismo** é geral e vai reaparecer.

### Mecanismo 1 — `cn()` só resolve o que enxerga numa única chamada

`cn = twMerge(clsx(...))` desambigua utilitários que competem pela mesma propriedade CSS, mas
apenas dentro de **uma** invocação. Duas chamadas separadas cujos resultados são concatenados por
terceiros produzem um `class` com ambos os utilitários — o `twMerge` nunca teve a chance.

No caso medido, quem concatena é o `Link` do TanStack Router (`@tanstack/react-router/dist/esm/link.js`):

```js
if (baseClassName) out = baseClassName;
if (activeClassName) out = out ? `${out} ${activeClassName}` : activeClassName;
if (inactiveClassName) out = out ? `${out} ${inactiveClassName}` : inactiveClassName;
```

`activeProps.className` **soma** ao `className`, não substitui. Um `font-medium` no className base
sobrevive ao estado ativo e disputa com o `font-bold` do `activeProps`.

### Mecanismo 2 — a ordem do stylesheet no Tailwind 4 é ALFABÉTICA

Com os dois utilitários presentes e mesma especificidade, decide a ordem de emissão no CSS.
Compilamos o Tailwind 4.3.3 deste repo para medir, em vez de supor:

```
1. font-black   2. font-bold   3. font-light   4. font-medium
5. font-normal  6. font-semibold  7. font-thin
```

Ordem **alfabética pelo nome**, não por peso. Consequências que contrariam a intuição de todo mundo:

- `font-medium` (500) vence `font-bold` (700) — o defeito observado.
- `font-semibold` venceria `font-bold`.
- `font-normal` venceria `font-medium`.

A regra a internalizar: **nunca conte com a cascata para resolver conflito entre utilitários do
Tailwind.** Ou o `twMerge` vê o par, ou o resultado é arbitrário.

## Inventário — onde o padrão existe hoje

Medido em `packages/app/react/src` nesta data:

| Padrão | Ocorrências | Risco |
|---|---|---|
| `activeProps` do Router | 2 (ambas em `Navbar/index.tsx`) | **corrigido** nesta data |
| `inactiveProps` | 0 | estilos de idle iam no className base |
| `className={\`...\`}` (template literal) | 3 | 1 com conflito real |
| `className` com `+` | 0 | — |
| Composição Base UI `render={<X className=…>}` | 3 | a auditar |

O conflito real remanescente está em
`routes/(app)/settings/-components/GeneralSection/index.tsx:40` — `text-sm` e `text-xs` no mesmo
`class`, resolvidos hoje por acidente alfabético (`sm` < `xs`, então `text-xs` vence, que por sorte
é a intenção). Funciona, mas por motivo errado.

## Proposta

Três camadas, da mais barata à mais cara. A recomendação é fazer as duas primeiras.

### 1. Convenção escrita (obrigatória)

Entra em `packages/app/react/CLAUDE.md`, na seção de componentes:

> **Nenhuma propriedade CSS pode ser endereçada em dois grupos de classe que serão concatenados
> por terceiros.** Se `base`, `idle` e `active` são strings separadas, cada propriedade mora em
> exatamente um deles. Estilos de estado usam o slot do próprio consumidor (`inactiveProps` no
> `Link`), nunca o className base.

### 2. Rail de lint tipado (recomendado)

Uma regra em `scripts/eslint-rules/`, no mesmo molde de `local/no-hardcoded-jsx-text` e
`local/button-needs-handler`:

- **`local/no-conflicting-class-groups`** — em um JSX element que receba `className` **e**
  `activeProps`/`inactiveProps` (ou qualquer prop cujo valor seja objeto com `className`), resolve
  os identificadores para as constantes literais do módulo e erra se dois grupos tocarem o mesmo
  grupo de utilitário do Tailwind.
- A classificação de "mesmo grupo" não precisa ser reimplementada: `tailwind-merge` exporta
  `getDefaultConfig()`, cujo mapa de `classGroups` é exatamente a tabela de equivalência. Reusar
  isso mantém a regra em lockstep com o `cn()` de produção.
- Fixture negativa obrigatória (padrão dos outros rails): um caso `base` com `font-medium` +
  `active` com `font-bold` tem de ficar vermelho.

### 3. Alternativa descartada — `cn()` no ponto de junção

Seria possível envolver a concatenação final num `twMerge`, mas o ponto de junção é código de
biblioteca (o `Link`), fora do nosso alcance sem wrapper. Um `<AppLink>` próprio que resolvesse
isso é uma indireção nova em todo o app para um problema que a convenção já elimina — não
compensa. Registrado para não ser redescoberto.

## Critérios de aceitação

1. A convenção está em `packages/app/react/CLAUDE.md` e é citada pela skill `component/react`.
2. `local/no-conflicting-class-groups` existe, roda no `bun lint`, e tem fixture negativa.
3. As 3 ocorrências de template literal e as 3 de composição Base UI foram auditadas — cada uma
   corrigida ou marcada como intencional com comentário.
4. `GeneralSection/index.tsx:40` deixa de depender de acidente alfabético.

## Fora de escopo

- O `text-md` morto em `Navbar/index.tsx` (não existe na escala do Tailwind e este repo não define
  token `--text-*`, então não gera CSS). É um defeito adjacente, não deste mecanismo — corrigir
  junto na auditoria do item 3.
- Qualquer mudança no `app-astro`, que não usa `cn()` nem o Router.
