# Extração do sistema de UI Fidelity (bk-products → codm)

**Status:** Approved (founder, 2026-08-24 — "Prossiga" após validação com o Pen aberto)

## Context

O bk-products (repo irmão) construiu um sistema de fidelidade de UI (.pen → app) com duas
pistas: gates determinísticos G1–G4 e a régua analítica `bun fidelity` (pixel-diff de stories
contra PNGs do Pencil). O codm tem Storybook maduro, 39 telas no `codm.pen` e nenhum
mecanismo de medição. A análise completa está nas seções abaixo (§1–§6).

## Problem

O codm implementa design "de olho": não há como medir a distância entre o app e o `codm.pen`,
nem gates que impeçam regressão de fidelidade. O conhecimento (motor de score calibrado,
cânon de 39 armadilhas) já existe no bk-products e se perde se não for portado.

## Goal

**F0 (este plano): o motor offline da régua portado, parametrizado e inerte-mas-verde** — sem
Pen aberto, sem targets. `bun fidelity` roda ponta-a-ponta e sai 0 com scoreboard vazio;
motor de score passa os casos de calibração; `bun probe` e `bun design:lint` operacionais;
decorator `fidelity.kind` no preview; target nx `storybook-build`. F1–F3 (produzir a verdade
com o Pen, gates, waves) ficam fora deste plano.

## Decisions

1. Scripts moram em `packages/app/react/scripts/` — sem workspace `packages/app/ui` (§4.1).
2. Carrier gerado sai em `packages/app/styles/tokens.generated.css` (§4.2); em F0 o
   compilador só é portado com teste de fixture — nada muda no `tokens.css` atual.
3. Allowlists saem do motor para arquivo de dados irmão, nascendo VAZIAS (§4.3).
4. Discovery de stories: só `packages/app/react/src/**` (codm não tem extensão/catálogo).
5. Target nx `app-react:storybook-build` com inputs corretos (sem `--skip-nx-cache`).
6. Alvo MCP canônico é o Pen.app desktop (§5.1) — irrelevante em F0 (tudo offline).
7. `docs/UI-FIDELITY.md` portado adaptado, com o cânon de armadilhas íntegro (§4.5).

## User Stories

- Como engenheiro do codm, rodo `bun fidelity` e recebo scoreboard/report (vazios até F1)
  sem precisar do Pencil aberto.
- Como engenheiro, rodo `bun probe <storyId>` para medir geometria real de uma story.
- Como orquestrador futuro (F3), herdo o motor JÁ calibrado (testes de calibração verdes).

## Acceptance Criteria

- AC-1: `bun test` no pacote app-react passa incluindo os testes de calibração do motor de
  score (tolerância ±1px, lane de tile/cor, shift-annotation) copiados do bk-products.
- AC-2: `bun fidelity` (raiz) executa ponta-a-ponta com 0 stories marcadas: builda o
  storybook via nx, escreve `design/fidelity/scoreboard.json` vazio + `report.html` e sai 0.
- AC-3: story com `parameters.fidelity` kind `components` renderiza CRUA (sem wrapper, body
  transparente) e kind `screens` sem `min-h-screen p-6`; stories sem o parâmetro mantêm o
  wrapper atual (rail `stories-smoke` continua verde).
- AC-4: `bun design:lint` sai 0 (inerte sem `design/system/pen/`) e seus falsificadores
  sintéticos passam no `bun test`.
- AC-5: `bun probe <storyId>` imprime geometria de nós contra o `storybook-static`.
- AC-6: `generate-tokens` compila uma fixture sintética de tokens.json para CSS `@theme
  inline` de forma idempotente (teste), sem tocar `packages/app/styles/tokens.css`.
- AC-7: artefatos regeneráveis (`design/fidelity/{current,deltas,scoreboard.json,report.html}`)
  estão gitignored; `bun tsc` e `bun lint` limpos.

---

> Análise de 2026-08-24. Fonte: `~/Projetos/bk-products`
> (`docs/UI-FIDELITY.md` + maquinaria em `packages/app/ui/`). Genealogia verificada: o
> bk-products é fork de `gabriellst/template-fullstack`; o codm (`gabriellst/codm`) é um
> repo-raiz IRMÃO, sem `sync.yaml` — a extração é um transplante manual, no molde do
> precedente `docs/UPSTREAM.md` do bk-products (regra de ouro: o repo receptor evoluído
> vence; recusa medida > port forçado; rail que reprova conserta na causa).

## 1. O que o sistema é (resumo operacional)

Duas pistas complementares:

- **Pista determinística — gates G1–G4** (rails em `tests/architecture/`):
  G1 cascade (o `tokens.css` do app é SÓ o `@import` do carrier gerado do .pen);
  G2 catálogo (todo componente com spec no .pen tem export + story);
  G3 consumo (telas usam o catálogo replicado — allowlist ratchet);
  G4 telas (toda tela do fluxo tem story). Dizem "completo/incompleto", nunca "parecido".
- **Pista analítica — `bun fidelity`** (runner de 1027 linhas): storybook build → serve
  estático (`Bun.serve`) → screenshot por story marcada com `parameters.fidelity`
  ({slug, kind, viewport}) via Playwright → pixel-diff (pixelmatch) contra PNGs alvo
  exportados do Pencil → `scoreboard.json` + `report.html` com trio target|atual|delta.
  Três lanes por tela: score global ≥ threshold, tiles de 60px (estrutura ≥0.6 + cor
  redmean ΔE ≤12 + cluster), e auditoria DOM (nenhum interativo cru sem `data-slot`).
  Allowlists são ratchet com `why`; thresholds 0.90 componente / 0.85 tela.

Fontes de verdade: `design/system/pen/tokens.json` (extraído do .pen) →
`generate-tokens.ts` compila o carrier CSS; `design/system/pen/{components,screens}/*.json`
(specs de nó extraídos via MCP — o estilo vem do DADO, nunca do olho); `design/fidelity/
targets/**.png` (alvos exportados do Pencil, commitados). `current/`, `deltas/`,
`scoreboard.json`, `report.html` são gitignored (regeneráveis offline).

Satélites: `design-lint.ts` (lint do design contra si mesmo, 5 regras, offline),
`probe-geometry.ts` (sonda `getBoundingClientRect` por story — a técnica que mais rendeu
para delta-de-offset), `generate-tokens.test.ts` (golden), `fidelity.test.ts` (casos de
calibração como testes).

**Fronteira do MCP**: o Pencil MCP (Pen aberto) só é necessário para PRODUZIR a verdade
(extrair tokens/specs, exportar targets). Todo o loop medir→corrigir→re-medir é offline e
CI-ável. ⚠️ Gap herdado: os scripts de exportação (`pencil-export.mjs`, band-scan) nunca
foram commitados no bk-products — são procedimento oral. A extração deve fechá-lo
escrevendo um `pencil-export.ts` versionado.

## 2. Estado do receptor (codm)

| Peça | Estado |
|---|---|
| `.pen` versionado | ✅ `design/codm.pen` (com nós `reusable`) + MCP pencil configurado |
| Storybook + harness | ✅ maduro: `.storybook/{main,preview}`, `@/storybook` (`connected()`, `withConnected` com `router.load()`, mocks MSW tipados), 52 stories (37 de primitivos), rail `stories-smoke` |
| Primitivos | ✅ ~41 em `packages/app/react/src/components/ui/` — **não há** workspace `packages/app/ui` |
| Carrier de tokens | ⚠️ `packages/app/styles/tokens.css` é 100% escrito à mão (401 linhas, Tailwind v4 `@theme`), consumido por react E astro — não há gerador nem `design/system/` |
| Infra de rails | ✅ 2 dirs `tests/architecture/` (10 react + 25 api) + `scripts/detectors/` com baselines e gate-vacuity |
| Playwright | ✅ na raiz e no e2e |
| pixelmatch/pngjs | ❌ ausentes (dep nova) |
| Target nx `storybook:build` | ❌ só script no package.json do react |
| Targets/specs/scoreboard | ❌ tudo ausente — greenfield |

## 3. O que é portável como está vs o que é do produto

**Porta quase intacto (genérico):**
- Motor de score: `computeScore`/`computeTiles`/`redmeanDistance` + `fidelity.test.ts`
  (puros; os casos de calibração viajam como testes — é o conhecimento da fase).
- `probe-geometry.ts` (só o path do `storybook-static` é fixo).
- `design-lint.ts` (5 regras de doutrina; `runDesignLint(designRoot)` já parametrizado).
- `generate-tokens.ts` menos o `LEGACY_VAR_MAP` (histórico de vars do bk).
- Mecanismo `fidelity.kind` no `preview.tsx` (decorator que serve story crua/transparente
  para componente e sem chrome para tela — é o contrato do runner).
- Rails `token-parity` e `cascade-authority` (trocando a lista de fontes banidas).

**Precisa parametrizar/reescrever com dados do codm (hard-coded do produto no bk):**
- `fidelity.ts`: roots de discovery (`ui/components` + `extension/popup` do bk → aqui
  `packages/app/react/src/**`), nome do projeto nx (`app-react:storybook-build`), e as
  TRÊS allowlists inline (`ITEM_THRESHOLD_OVERRIDES`, `ITEM_TILE_ALLOWLIST`,
  `ITEM_REGION_LANE_ACCEPTED`) — aqui nascem VAZIAS e, na extração, saem do script para
  arquivo de dados (doutrina "o baseline é do filho"; no bk ficaram inline, defeito
  conhecido).
- Rails G2 (`SLUG_TO_EXPORT`, 53 slugs do bk), G3 (allowlist de dívida do bk), G4
  (`SCREEN_MAP` onboarding/dashboard/import/... do bk), `semantic-component-names`
  (`/^(Ext|Onb|Web)\d{2}/` são as lanes do .pen do bk), `catalog-owns-surfaces` (literal
  do gradiente do bk). Todos renascem com dados extraídos do `codm.pen`.

**Não sobe:** `AppScreenFrame` (chrome do bk), symlink `design/Projetos`, cópias unwired
em `design/system/` do bk, prosa com waves/datas/founder nos `why`.

## 4. Decisões de desenho da extração (recomendações)

1. **Sem workspace novo.** O bk criou `packages/app/ui` porque o catálogo é compartilhado
   com o workspace da extensão Chrome. O codm não tem essa necessidade: primitivos ficam
   em `packages/app/react/src/components/ui/`, e a maquinaria (`fidelity.ts`, `design-lint.ts`,
   `generate-tokens.ts`, `probe-geometry.ts` + tests) mora em `packages/app/react/scripts/`
   (ou `scripts/fidelity/` na raiz — decidir na implementação; o runner só precisa de
   globs de stories e do `storybook-static`).
2. **Carrier no lugar certo desde o dia 1.** No bk o carrier gerado vive em
   `app/ui/styles/`; no codm o lar natural é `packages/app/styles/` — que JÁ é o carrier
   compartilhado react+astro. Forma alvo: `tokens.generated.css` (saída do compilador,
   golden-tested) + `tokens.css` vira casca de `@import` (+fontes). G1 passa a vigiar isso.
   Migração: extrair tokens do `codm.pen` → mapear as vars atuais (o equivalente ao
   `LEGACY_VAR_MAP` do bk, derivado das 401 linhas hard-written) → gerar → diff visual.
3. **Contrato antes de implementação (regra 5 do CLAUDE.md).** Roots de discovery e nome
   do projeto nx vêm de declaração (`template.config.ts` / config tipada do runner), não
   de constantes soltas; allowlists/ratchets em arquivos de dados com `why`, separados do
   motor. Isso também deixa o pacote pronto para um futuro upstream ao template-fullstack
   (onde ele serviria todos os filhos — candidato natural, fora do escopo desta extração).
4. **Fechar o gap do MCP com código.** Escrever `scripts/design/pencil-export.ts`
   versionado: `PEN_FILE` explícito, extrai tokens.json + specs de components/screens +
   exporta targets PNG, termina com verificação de contagem (`ok=N fail=0`) — armadilha 38
   do cânon. É a peça que o bk nunca commitou.
5. **Portar o conhecimento junto com o código:** `docs/UI-FIDELITY.md` adaptado (o cânon
   de 39 armadilhas e as técnicas provadas são o ativo mais caro da fase — vêm inteiros,
   com os itens específicos do bk marcados como exemplos), e os casos de calibração como
   testes.

## 5. Fases propostas

- **F0 — motor offline (sem Pen):** deps (`pixelmatch`, `pngjs`, types), port do motor de
  score + tests + probe + design-lint + generate-tokens parametrizados, target nx
  `storybook:build` no app-react (com inputs corretos — o bk precisa de `--skip-nx-cache`
  por não ter declarado; aqui declara-se certo), decorator `fidelity.kind` no preview,
  scripts raiz `fidelity` / `design:lint` / `probe`. Gitignore de `design/fidelity/
  {current,deltas,scoreboard.json,report.html}`.
- **F1 — produzir a verdade (Pen aberto, 1 sessão):** `pencil-export.ts`; extrair de
  `design/codm.pen`: `design/system/pen/tokens.json`, specs dos componentes reusable e
  das telas, targets PNG para `design/fidelity/targets/`. Pré-condição a validar ANTES:
  o `codm.pen` documenta componentes/telas com a maturidade que a régua pressupõe
  (tokens nomeados, componentes `reusable`, artboards de tela)? Se não, há uma etapa de
  design-ops antes (normalizar o .pen — o bk pagou 485 strokes + colapso de 4 dialetos).
- **F2 — gates:** gerar o carrier e reestruturar `packages/app/styles` (G1 + golden),
  rails G2/G3/G4 + `semantic-component-names` + `token-parity` com os dados do codm,
  allowlists vazias.
- **F3 — o loop em waves:** orquestrador + workers de contexto fresco, medição SERIAL,
  batches por família, conforme a seção "Operação em waves" do UI-FIDELITY.md. É aqui que
  a dívida real do codm aparece e se paga por item até o threshold.

## 5.1 Auditoria do `codm.pen` (2026-08-24, Pen aberto — pré-condição da F1 medida)

Veredito: **a pista de TELAS está pronta; a pista de COMPONENTES não existe ainda no design.**

- ✅ **Bridge MCP validada** — mas com pegadinha de config: o `~/.claude.json` registra o
  servidor pencil com `--app visual_studio_code`, que conecta no socket do VS Code
  (`~/.pencil/socket/pencil-visual_studio_code.sock`); o Pen.app standalone escuta em
  `pencil-desktop.sock`. Com `--app desktop` o mesmo binário conecta e enxerga o arquivo.
  É a armadilha 38 do cânon em versão nova (o bridge liga no HOST errado, não no arquivo
  errado). O `pencil-export.ts` deve falar com o socket/app explícito. **Decisão do founder
  (2026-08-24): o alvo canônico é o Pen.app desktop** — `~/.claude.json` atualizado para
  `--app desktop` (vale a partir da próxima sessão; backup em `~/.claude.json.bak-pencil-app`).
- ✅ **39 artboards de tela** organizados em 7 áreas (`Mesclado / {Início, Conversa,
  Tarefa & Config, Projetos & Canais, Tarefas/Config/Conta, Onboarding/Login/Attach,
  Site público}` → frame `Screens` → artboards nomeados). Mais telas que o bk (22).
- ✅ **43 variáveis** com nomes semânticos (`bg`, `card`, `primary`, `radius-*`,
  `status-*`, `font-sans/mono/script`, `shadow`…). Fills 86% tokenizados
  (2210 `$token` vs 362 literais em 3572 nós).
- ✅ **Export PNG funciona**: `Export([id],'png',dir,{scale:1})` → PNG 1440×931 correto.
  Nota: o artboard exportado inclui a legenda de código de tela ("01 · Início — cheio")
  e o chrome de janela — o export script precisa exportar o nó interno certo ou fazer o
  passo de "achatamento" que o bk fez nos 75 targets.
- ⚠️ **1 único componente `reusable`** (Rail). Não há catálogo de componentes no .pen —
  G2/pen-catalog e a lane de componentes da régua nascem sem fonte. Caminho: começar o
  processo **só com a pista de telas** (G1/G4 + régua de screens) e componentizar o .pen
  via design-ops conforme a demanda (o inverso do bk, que tinha 53 specs desde o início).
- ⚠️ **Tipografia/espaçamento não tokenizados**: 0/1075 textos usam `$token` em fontSize;
  não há escala `text-*`/`space-*`/`weight-*` nas variáveis. O `generate-tokens` cobre as
  43 atuais; tokenizar a escala tipográfica no design é dívida de design-ops (opcional
  para começar — a régua mede pixel, não token).

## 5.2 F1 — produzir a verdade (adendo aprovado 2026-08-24, "Sim" do founder)

**Goal (F1):** a verdade do design extraída do `codm.pen` e commitada — `pencil-export.ts`
versionado, `design/system/pen/{tokens.json,screens/*.json}` + manifesto de telas,
`design/fidelity/targets/screens/*.png` (39), e UM piloto de medição provando o pipe
(uma story de tela marcada, score real no scoreboard).

**Decisions (F1):**
1. O bridge é código versionado: `packages/app/react/scripts/pencil-export.ts`, falando
   JSON-RPC via stdio com o binário MCP do Pencil (`--app desktop`), alvo SEMPRE explícito
   (`PEN_FILE` default `<repo>/design/codm.pen` passado como `filePath` em todo execute —
   armadilha 38). Binário parametrizado por `PENCIL_MCP_BIN` (default
   `~/.pencil/mcp/visual_studio_code/out/mcp-server-darwin-arm64`).
2. Slugs de tela são DERIVADOS e registrados num manifesto commitado
   (`design/system/pen/screens.manifest.json`: nodeId, slug, área, dimensões, e
   `exportNodeId` opcional para recorte) — stories referenciam o slug, nunca o nodeId.
3. Fato medido: `Export(nodeIds,'png',outputPath)` trata `outputPath` como DIRETÓRIO e
   nomeia `<nodeId>.png` — o script exporta em staging e renomeia para `<slug>.png`.
4. O artboard de tela pode conter moldura/caption além do conteúdo do app (medido:
   "01 · Início — cheio" + chrome de janela no export de LqqKM). A política de recorte é
   decidida POR MEDIÇÃO na sessão de extração (inspecionar a árvore; se o frame compõe
   [caption, janela], o `exportNodeId` do manifesto aponta o nó interno) — nunca a olho.
5. Toda operação em lote termina com verificação de contagem (`ok=N fail=0`) lida de
   verdade; specs re-extraíveis são idempotentes (mesmo .pen → mesmos bytes).
6. `generate-tokens` NÃO roda em F1 (o carrier é F2); `design:lint` roda sobre os specs
   extraídos e seus findings viram BACKLOG de design-ops reportado (cânon 37), não gate.
7. Piloto: UMA story de tela (Início) marcada com `parameters.fidelity`
   `{slug, kind:'screens', viewport}` — score baixo é resultado esperado e honesto.

**Acceptance Criteria (F1):**
- AC-F1-1: `bun design:export --tokens --specs` (Pen aberto) escreve `tokens.json` (43 vars),
  `screens/*.json` e o manifesto, com `ok=N fail=0` impresso e verificado.
- AC-F1-2: `bun design:export --targets` escreve 39 PNGs em `targets/screens/<slug>.png`
  com dimensões > 0 registradas no manifesto.
- AC-F1-3: partes puras do bridge (slugify, dedup, montagem de manifesto, parser de
  respostas) cobertas por teste offline em `pencil-export.test.ts`.
- AC-F1-4: `bun design:lint` roda sobre os specs reais; findings reportados como backlog.
- AC-F1-5: piloto — `bun fidelity` mede a story marcada, scoreboard ganha a entrada com
  score real e o report mostra o trio target|atual|delta.
- AC-F1-6: `bun tsc`/`bun lint`/suíte do pacote verdes; nada fora de
  `design/**`, `packages/app/react/scripts/**` e a story do piloto.

**Precondição de execução:** Pen.app aberto com o `codm.pen` ATIVO (ação do founder na
hora da sessão de extração — T2/T3 param com instrução clara se o bridge não alcançar).

## 6. Riscos e pontos de atenção

- **Maturidade do `codm.pen`** é a incógnita nº 1 (ver F1). A régua mede distância a um
  alvo; sem alvos exportáveis não há pista analítica — só os gates.
- **Tokens hard-written → gerados** é a mudança mais invasiva (react E astro consomem o
  mesmo arquivo). Fazer com golden + diff visual das telas existentes antes de apertar G1.
- **Medição é serial** (storybook build + `current/` compartilhados) — nunca paralelizar
  `bun fidelity` entre workers.
- Scripts de fidelity NÃO entram na bateria de commit (no bk são comandos de orquestrador,
  manuais); os rails G1–G4 sim, via `bun test` normal.
- `boxBlur3` no motor está morto (resultado negativo registrado) — decidir manter como
  documentação ou cortar no port.
