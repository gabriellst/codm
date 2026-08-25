# UI-FIDELITY — o processo de fidelidade ao design (.pen → app)

> Por que existe: implementar UI "de olho" contra um `.pen` não deixa rastro de quão longe o app
> está do design, nem impede regressão. Este doc define o processo — uma pista DETERMINÍSTICA
> (gates binários) e uma ANALÍTICA (métrica de distância com loop até o alvo) — portado do
> `bk-products` (repo irmão que rodou o processo por 3 fases contra 22 telas + 53 componentes) para
> o codm. O CONHECIMENTO vem íntegro (motor de score calibrado, cânon de 39 armadilhas medidas,
> técnicas provadas); o ESTADO do bk (dívida medida, waves fechadas, allowlists preenchidas) não —
> o codm começa do motor inerte. Ver `.specs/2026-08-24-extracao-ui-fidelity.md` para a análise
> completa da extração.

**Fontes de verdade do codm:**
- `design/codm.pen` — o arquivo de design, 39 telas (mais que o bk, que tinha 22), 1 componente
  `reusable` hoje (Rail) — o catálogo de componentes ainda não existe no design.
- `design/system/pen/{tokens.json,components/*.json,screens/*.json}` — specs extraídos do MCP do
  Pencil. **F1, ainda não existem neste repo.**
- `design/fidelity/targets/{components,screens}/*.png` — PNGs alvo exportados do Pencil. **F1,
  ainda não existem.**
- `packages/app/ui/styles/tokens.generated.css` — o carrier de tokens CSS gerado a partir de
  `tokens.json`. **F2, ainda não existe** — hoje `tokens.css` é 100% escrito à mão.

---

## Pista 1 — Determinística (gates binários, rodam na bateria)

**F2, ainda não implementados aqui.** No bk-products rodam como rails em `tests/architecture/`:

| Gate | Pergunta | Mecanismo |
|---|---|---|
| **G1 cascade** | Os tokens GERADOS do .pen são o cascade vencedor? | `packages/app/ui/styles/tokens.css` contém APENAS o `@import` do carrier gerado (+fontes); rail golden falha em qualquer declaração de cor/token fora dele |
| **G2 catálogo** | Todo componente documentado no .pen existe e tem story? | Manifesto = basenames de `design/system/pen/components/*.json`; rail exige, por item: export do componente **e** `*.stories.tsx`; falha NOMEANDO os ausentes |
| **G3 consumo** | As telas usam os componentes replicados? | Rail: import de um primitivo hand-rolled em `packages/app/react/src` falha quando o equivalente existe no catálogo; allowlist de pendentes é RATCHET (só encolhe) |
| **G4 telas** | Toda tela do design tem story de rota/section? | Rail sobre o mapa de telas do `.pen` × `*.stories.tsx` das rotas |

Gates são pré-condição de commit (bateria) — dizem "completo/incompleto", nunca "parecido".

## Pista 2 — Analítica (metrificar a distância, loop até o alvo)

Motor portado e operacional (F0): `bun fidelity`, `bun design:lint`, `bun probe <storyId>`.

1. **Targets**: PNG por componente e por tela, exportados do Pencil (`Export(nodeIds, 'png')`)
   para `design/fidelity/targets/{components,screens}/<slug>.png`. Regenerados só quando o design
   muda (o Pen precisa estar aberto/visível — cap de 60s do transporte MCP).
2. **Medida**: screenshot da story (`app-react:storybook-build` via nx + Playwright, viewport fixo
   por item) → pixel-diff (`pixelmatch`) contra o target → `score = 1 − pixelsDiferentes/total`.
3. **Scoreboard**: `design/fidelity/scoreboard.json` — por item: `{slug, kind, score, threshold,
   status, deltaPng}`. `design/fidelity/report.html` renderiza o trio lado-a-lado (target | atual |
   delta) por item — a comparação "fácil de olhar" que o processo exige.
4. **Loop**: `bun fidelity` roda tudo e ordena pelos piores; itera-se por item até
   `score ≥ threshold` (default **0.90** por componente, **0.85** por tela — telas carregam dados
   dinâmicos). Delta legítimo (dado dinâmico, timestamp, cursor) entra numa allowlist POR ITEM com
   `why` — allowlist é ratchet, nunca válvula. Acima dela existe um degrau excepcional:
   `ITEM_REGION_LANE_ACCEPTED` — aceite INTEGRAL da pista de região de uma tela por decisão
   explícita do founder ("bom o suficiente"), com why datado; os tiles continuam medidos e
   listados no scoreboard/report (nada some), e a entrada sai quando o débito for retomado. No
   codm as três listas nascem VAZIAS em `packages/app/react/scripts/fidelity-allowlists.ts`
   (F0) — a primeira entrada real só existe depois de uma wave de F3 iterar de verdade sobre um
   item.
5. **Honestidade da métrica**: pixel-diff contra um render de OUTRO motor (Pencil) carrega ruído
   de fonte/anti-aliasing — o score é métrica de PROGRESSO por item + o trio visual é o juiz
   humano; o gate duro de "igual" são os TOKENS (G1) e a ESTRUTURA (G2/G3/G4). Subir o threshold
   de um item já verde é permitido; baixar exige why no scoreboard.
6. **Calibração por região e cor** *(medido no bk-products)*: a média global DILUI — telas
   visivelmente diferentes (badge, tom de fundo, radius, inputs crus, larguras) passavam a 0.85+.
   Telas passam por TRÊS lanes, todas obrigatórias:
   - **global** ≥ threshold (como antes);
   - **região**: tiles de 60px — falha se QUALQUER tile tem score < 0.6 (estrutura) OU desvio de
     cor média redmean ΔE > 12 (a lane de COR pega shift de tom que fica abaixo do threshold
     por-pixel do pixelmatch e nem conta como diff). A pior região manda, como o olho humano; o
     delta contorna os tiles falhos em azul (o report APONTA onde olhar). Pixels transparentes do
     alvo são mascarados (fora do artboard não é design).
   - **auditoria DOM**: nenhum input/button/select/textarea CRU (sem `[data-slot]` próprio ou
     ancestral) — toda superfície interativa vem do catálogo replicado; estrutural, não dilui.
   Components seguem só na global (medem a 0.05 sobre tight-crop — o item inteiro É a região); as
   lanes ficam registradas no scoreboard para eles também.

## O loop operacional

```
targets (Pencil, 1×) ──► bun fidelity ──► scoreboard + trios lado-a-lado
        ▲                                       │ piores N
        │                                       ▼
   design mudou                    corrigir componente/tela (story-first)
                                                │
                                                └──► re-medir → repete até alvo
```

Stories são a UNIDADE de comparação: componente (args), section (SDK mockada via padrão
`@/storybook` do template), rota (composição). Sem story, o item nem entra na régua — G2/G4 (F2)
garantem que tudo entra. Decorator: `parameters.fidelity = { slug, kind, viewport? }` em
`.storybook/preview.tsx` — story `kind: 'components'` renderiza crua/sem wrapper (body
transparente), `kind: 'screens'` sem chrome de preview (`min-h-screen p-6`); story sem o parâmetro
mantém o wrapper atual.

### Operação em waves (orquestrador + workers de contexto fresco)

O processo (F3) é executado por um ORQUESTRADOR + workers de contexto fresco, um batch por vez
(batches concorrentes disputam o storybook build e o scoreboard — **medição é SERIAL**: `bun
fidelity` NUNCA roda em paralelo entre workers; um worker chegou a ver o próprio PNG de referência
truncado no meio da investigação por causa disso):

1. **Batches por família** (~10-17 slugs por batch). Cada worker recebe um handoff que carrega:
   escopo exato (slugs→exports), fontes por slug (spec JSON + PNG alvo), o cânon de armadilhas
   abaixo (cada omissão custou uma iteração real em batch anterior), ratchets a encolher NO MESMO
   diff, os gates, e a doutrina **"o padrão vence o pixel"** (seção acima): valor fora da
   escala/token para fechar tile é PARADA-E-REPORTE, nunca ajuste. **Workers NUNCA comitam** — o
   orquestrador revisa e comita em fatias atômicas.
2. **O loop do worker**: implementar do spec → story → `bun fidelity` em FOREGROUND (não há
   monitor que notifique; nunca "esperar") → ler scoreboard → Read do trio target/current/delta
   dos itens <threshold → diagnosticar → corrigir → repetir. `bun probe <storyId>` é a ferramenta
   PARALELIZÁVEL dos workers (sobe um servidor efêmero, lê uma story só, não toca o scoreboard nem
   `current/`) — usar para falsear a própria hipótese antes de reportar. Estacionou por ruído
   legítimo após iterar de verdade: reporta score+why; a decisão de allowlist é do orquestrador.
3. **Revisão do orquestrador**: além dos gates, revisão VISUAL por amostragem dos trios (Read dos
   PNGs) — score alto não substitui olho.
4. **Regra de bug de infra**: worker corrige minimamente e DESTACA no relatório; o orquestrador
   decide se vira commit separado (sempre que for régua/tooling, vira).

## Nomeação semântica: papel, nunca código de tela

Componentes e seções são nomeados pelo PAPEL que cumprem (`LoginForm`, `OtpVerificationForm`),
nunca pelo código da tela no `.pen`. O código de tela é rastreabilidade de DESIGN — vive em
comentário/docblock e nos slugs de target (`targets/screens/<slug>.png`), não em identificador de
código: identificador nomeado por posição quebra quando o fluxo reordena e não diz o que o
componente faz.

## Fonte de estilo: o DADO do Pencil, nunca o olho

A implementação de um componente parte do **spec extraído do MCP do Pencil**
(`design/system/pen/components/<slug>.json` — árvore de nós completa: fills com gradientes exatos
[tipo/rotação/posições/center], stroke+strokeWidth+alignment, cornerRadius, padding, gap, layout,
tipografia, tudo em `$token`). O PNG alvo é **verificação**, não fonte: quem implementa "olhando o
desenho" aproxima (ex.: stroke em gradiente virando borda sólida) e a aproximação congela como se
fosse fiel. Regras:

1. Todo valor de estilo vem do spec; `$token` → `var(--token)` do carrier gerado
   (`tokens.generated.css`).
2. Propriedade presente no spec não pode ser aproximada em silêncio — se a técnica CSS exige
   equivalência (ex.: gradiente de stroke via border-image/pseudo-elemento), a equivalência é com
   os MESMOS valores do spec, e o desvio técnico é documentado no docblock do componente.
3. Propriedade AUSENTE do spec → re-extrair do `.pen` via MCP (Pen aberto/visível), nunca chutar.
   A re-extração atualiza o JSON commitado — o spec é o contrato, o código o segue.
4. Telas: mesmo princípio — layout/espaçamentos das telas saem do `.pen` via MCP quando o PNG não
   bastar para decidir.

**Hierarquia de verdade: spec JSON > PNG alvo > olho.** *(medido no bk-products)* Toda
"aproximação de olho" auditada estava errada (stroke sólido no lugar de gradiente, base opaca
inventada, ícone de outra biblioteca, tokens inexistentes caindo em herança). O PNG desempata o
spec; o olho só confirma.

---

## O padrão vence o pixel (doutrina do founder, 2026-08-24)

A régua otimiza distância — e por isso ela carrega um incentivo perverso: sob pressão de score,
quem corrige tende a fechar tiles com ajustes PONTUAIS fora do padrão (uma altura mágica
`h-[37px]`, um padding avulso, um font-size fora da escala tipográfica) até o erro de comparação
mínimo. **Isso é proibido.** O design system — tokens, escalas, primitivos do catálogo — tem
precedência sobre o score: um tile verde comprado com valor fora da escala é uma REGRESSÃO
disfarçada de progresso, porque a configuração passa a morar no ponto de uso e diverge na
mudança seguinte.

Quando o alvo pede um valor que o padrão não tem, isso é um **evento de avaliação**, nunca um
ajuste. As três saídas legítimas:

1. **O alvo carrega falha mínima de autoria** (o design escorregou 1-2px da própria escala —
   acontece, e o próprio design pode conter falhas nesse sentido) → corrige-se **no design**
   (normaliza à escala), re-exporta, e o código segue (mesma direção do cânon 37: nunca
   "acertar" o código contra um alvo defeituoso).
2. **A divergência é decisão intencional de design** → o PADRÃO ganha o degrau: token novo na
   escala, variante nomeada no primitivo — no design primeiro, depois no catálogo — nunca um
   literal na tela (mesma direção do "a fidelidade manda nos primitivos": estende-se o sistema,
   não se contorna).
3. **Resíduo imperceptível a olho** → allowlist/threshold-override com `why` (ratchet), nunca
   um valor mágico que "conserta" a métrica.

**Quem decide:** o worker NUNCA decide sozinho quebrar o padrão. Ele reporta a divergência
(valor do spec × valor da escala, com evidência) e para; o orquestrador tria pelas três saídas;
mudança de linguagem visual ou degrau novo de escala é decisão do founder. Score 100% **não é o
objetivo** — o objetivo é o sistema correto medido perto do alvo; os thresholds e as lanes
existem exatamente para absorver o resíduo que não vale um degrau de escala.

**Assinatura do desvio (para detectar):** arbitrary values (`h-[Npx]`, `p-[Npx]`,
`text-[length:...]`) em código de tela/componente cujo valor não resolve a token do carrier. A
varredura por literal acha em segundos; candidato a rail-ratchet quando os gates (F2) entrarem.

### PASS até segunda ordem (congelamento do founder)

Uma tela pode ser CONGELADA: `ITEM_PASS[slug]` (`fidelity-allowlists.ts`) marca uma decisão
explícita do founder de que ninguém mexe nela — nem story, nem estilo — até segunda ordem. A tela
continua sendo MEDIDA a cada `bun fidelity` (score, tiles e rawInteractive seguem no
scoreboard/report normalmente — mesma filosofia do `ITEM_REGION_LANE_ACCEPTED`: nada some do
radar); o que muda é o gate, que passa (`passing: true`, `frozen: true`) e o `report.html` exibe o
selo "PASS — congelada (founder)" com o `why` datado. Só o founder adiciona/remove a entrada;
removê-la descongela a tela na medição seguinte. **Fence de wave:** todo handoff de worker DEVE
excluir os slugs presentes em `ITEM_PASS` do escopo — congelada não entra em nenhum batch.

## Cânon de armadilhas medidas

Cada item abaixo foi um defeito real que a régua ou o olho pegou no `bk-products`. Handoffs de
batch novos DEVEM carregar esta lista; item novo descoberto no codm = adicionar aqui no mesmo PR,
numeração contínua a partir de 40. Onde o item cita artefato específico do produto irmão, a
marcação `(medido no bk-products)` sinaliza que o exemplo concreto é deles — a regra vale igual
aqui.

| # | Armadilha | Regra |
|---|---|---|
| 1 | Classe Tailwind montada em runtime nunca compila (scanner lê texto-fonte) | Arbitrary values SEMPRE literais; preset novo = const literal em lib/utils.ts, nunca interpolação |
| 2 | Shorthand `mask` reseta `mask-composite` (ordem interna do Tailwind) | Só longhands mask-image/mask-clip/mask-composite — é o que faz hairlineRing funcionar |
| 3 | `size` de gradiente radial do Pencil é DIÂMETRO relativo ao frame | Dividir por 2 antes de virar raio % no CSS |
| 4 | Fill de spec sem base opaca ≠ fill + cinza por baixo | Não adicionar camada que o spec não declara; em dúvida, medir o pixel do alvo |
| 5 | `--border-hair` (0.5px) arredonda p/ 1px em DPR1 e infla frames auto | Altura explícita, ou `shadow-[inset_0_0_0_var(--border-hair)_...]` para borda flat |
| 6 | `text-[var(--text-N)]` é lido como COR | Sempre `text-[length:var(--text-N)]` |
| 7 | `span{line-height:1}` global não-layered vence utilities | `leading-[Npx]!` (important) em spans com leading de spec |
| 8 | Line-height default do browser infla título de 1 linha em 5-8px | Leading explícito em headings de painel |
| 9 | Ícone "parecido" de outra biblioteca | `library:"lucide"` do spec é literal — lucide-react, nome exato; GradientIcon paint='stroke' p/ ícones de linha |
| 10 | Remap legado de `--radius-*` no app vencia a escala do pen | Escala de radius é do carrier gerado; nunca redeclarar `--font-*`/`--radius-*` no app css (rail G1) |
| 11 | Overlay portalizado não cabe no contrato de screenshot | Duas camadas: componente interativo Base UI p/ app + painel estático (XxxPanel) com as MESMAS classes p/ story; Title/Description de Base UI crasham fora de Root — painel usa h2/p |
| 12 | Story block de largura cheia screenshota o viewport | `inline-flex w-fit` no wrapper quando o componente não ocupa a largura toda; UM filho no root |
| 13 | Mismatch de ±1px (floor/ceil do Playwright, export do Pencil) zerava score | Régua pontua no overlap com melhor alinhamento dentro de ±1px; >1px continua 0 (é layout errado) |
| 14 | pixelmatch 0.1 perdoava hairline/gradiente sutil em fundo escuro | Components medem a 0.05; screens a 0.1 |
| 15 | Cobertura de lint/tsc pode ser VÁCUA para um workspace novo | Conferir biome/eslint includes e `@source` do Tailwind ao criar workspace *(medido no bk-products: biome não cobria app-ui; `@source` não cruzava p/ ui/)* |
| 16 | JSDoc imediatamente acima do `const meta` faz o docgen do Storybook DESCARTAR chaves não-literais de `meta.parameters` (o retorno de `connected()` some, o decorator cai no fallback sem router) | Comentários de story vão acima do `export const Default`, nunca do meta (documentado em `src/storybook/types.ts`) |
| 17 | `RouterProvider` monta com `router.state.matches` vazio até `router.load()` resolver — story com `useSearch`/`useNavigate` crasha | `withConnected` aguarda `router.load()` antes de montar |
| 18 | `layout: 'padded'` default do Storybook rouba 28px de largura do screenshot de tela; o wrapper dark full-screen do preview quebra o tight-crop | Story de tela: `layout: 'fullscreen'`; o preview bypassa o wrapper para `fidelity.kind` definido |
| 19 | Glob literal (`**/*.x`) dentro de comentário CSS fecha o comentário no `*/` e derruba o build inteiro do Tailwind ("Missing opening") | Prosa em comentário CSS, nunca glob literal — a armadilha morde até quem escreveu o aviso |
| 20 | Alias `@` herdado do vite.config vence qualquer plugin `resolveId` (mesmo `enforce: 'pre'`) — imports `@/` de outro workspace quebram no storybook | `@` resolve pelo diretório do importador no `.storybook/main.ts`; nunca alias fixo |
| 21 | `getByRole('row')`/landmarks somem quando um redesign troca `<table>`/seção por grid hand-rolled | Telas novas são a VERDADE; specs e2e seguem via `data-slot` + chaves i18n novas — asserção quebrada é SUBSTITUÍDA por equivalente, nunca deletada |
| 22 | Primitivo montado NA MÃO em tela (span com ícone virando badge artesanal, caixa de alerta hand-rolled, botão cru) | Todo interativo E todo shape que o catálogo já modela vem do design system do app. Mecânico: auditoria DOM (rawInteractive gateia) + rail catalog-primitives-only (ratchet decrescente); shape não-interativo: lane de região + revisão pega, worker substitui |
| 23 | Mover um `.pen` sem o CONJUNTO (lib + assets) quebra refs relativas — e o editor AUTO-SALVA o estado quebrado por cima (dados perdidos) *(medido no bk-products: 60KB de edições)* | `.pen` viaja como conjunto (pen+lib+symlink de assets), abertura VALIDADA antes de declarar movido, e o arquivo é VERSIONADO no git (todo save de design commit-ável). Backup do Pencil não cobre esse caso |
| 24 | Mudança de LINGUAGEM visual implementada no código antes do design decidir = retrabalho em série *(medido no bk-products: bordas — mask-ring → classes de carrier → flat, 3 implementações)* | Linguagem visual muda PRIMEIRO no design (tokens/lib via MCP), re-exporta, e o código segue a régua. Nunca o inverso |
| 25 | Border real soma ao tamanho intrínseco de caixa auto-dimensionada; o stroke do pen é `strokeAlignment:inner` *(medido no bk-products: +2px, 22 componentes zerados)* | Equivalência exata: border + padding compensado (padding do spec − border-width). Dimensão fixa não compensa (border-box absorve) |
| 26 | Artefato buildado consumido por teste FORA do grafo de dependências = quebra silenciosa por staleness *(medido no bk-products: bundle da extensão no e2e)* | Todo artefato buildado que um teste consome declara `dependsOn` no nx |
| 27 | Superfície IMPERATIVA de runtime (toast, dialog de confirmação) escapa da régua — as stories medem componentes/telas, não o caminho vivo | Todo UI imperativo passa por wrapper do catálogo (motor headless + render do componente medido); import direto do motor fora do wrapper é violação |
| 28 | Intenção documentada mas nunca LIGADA (feature existia, nada a chamava) — e o e2e carregava um workaround que MASCARAVA o bug | Workaround em spec e2e é bug report: exige comentário FIXME + item de backlog vinculado, nunca compensação muda. Código morto de rota idem — reachability importa |
| 29 | Opacidade que o design aplica no NÓ (`opacity: 0.6/0.3`) e não no alpha do fill: o código replica o gradiente "cheio" e a lane de cor acusa *(medido no bk-products: tile onde o alvo pinta 26 e o código 33; o mesmo fundo acumulou QUATRO dialetos)* | UMA forma por família, com o alpha PRÉ-MULTIPLICADO no fill e o nó opaco. Normaliza no design (componente na lib + instâncias + frames), varre até sobrar zero fill com `opacity`, re-exporta, e o código consome de UM lugar |
| 30 | Consumidor que não PODE usar o primitivo (Base UI exige `Root` ancestral) copia as classes inteiras — a configuração passa a morar no className da tela e diverge na mudança seguinte | O catálogo exporta a CASCA (ex.: `fieldSurface`) e o `cn`; o consumidor COMPÕE `cn(fieldSurface, …)`. Literal de gradiente fora do catálogo é violação — varredura por literal acha em segundos |
| 31 | `tailwind-merge` trata QUALQUER `text-[length:…]` como font-size que conflita com `leading-*` ANTERIOR — um override de tamanho passado depois DROPA silenciosamente o `leading-none` do default | Em componente com override de fonte: `cn(override ?? default, 'leading-… resto')` — a classe de tamanho entra UMA vez e o leading vem depois. Nunca `cn('text-X leading-none …', overrideDeTamanho)` |
| 32 | Encolher um elemento para o tamanho do spec sem olhar QUEM mandava na altura da linha *(medido no bk-products: um avatar de 40px era o filho mais alto de um top bar; a 24px, correto, a linha colapsou e subiu o corpo inteiro 12px em 6 telas)* | Ao corrigir o tamanho de um filho, medir a linha ANTES e DEPOIS. Se o filho corrigido era o que ditava a altura, a linha ganha altura explícita derivada do spec, não se deixa colapsar |
| 33 | Altura FIXA herdada do primitivo (a medida do componente isolado) vence o `padding` que a INSTÂNCIA declara *(medido no bk-products: um campo media 45px onde o alvo media 38, empurrando a coluna vizinha)* | Instância com padding próprio no spec usa `h-auto` + o padding; a altura fixa do primitivo descreve o componente isolado do catálogo, não toda aparição dele |
| 34 | Fixture recortada do alvo (canon "foto-fixture") fica STALE quando o alvo é re-exportado — as coordenadas de recorte deslocam alguns px e o mock passa a capturar fundo/borda | Toda re-exportação de alvo obriga a revalidar as fixtures que recortam dele. O docblock já carrega a receita: re-rodar o band-scan e reencodar no mesmo diff |
| 35 | Ler o spec do NÓ ISOLADO e concluir sobre a PILHA *(medido no bk-products: "coluna não declara padding" levou a remover um `p-2` legítimo e uma tela foi de 2 para 12 tiles de débito)* | O spec descreve o nó; a tela é a composição. Mudança de inset derivada de leitura isolada só entra com a régua confirmando — e o falseador fica registrado no docblock para não se tentar de novo |
| 36 | Remover código (rota, componente) deixa FÓSSEIS nos ratchets: allowlist do G3 apontando módulo que já não é importado, mapa de telas citando pasta que não existe, contador de pendentes alto demais | Remoção de superfície fecha os ratchets no MESMO diff — os rails que checam "toda entrada ainda descreve violação real" são o detector, e ficam vermelhos até o ajuste |
| 37 | A régua acha defeitos de AUTORIA do próprio design, não só do código *(medido no bk-products: item de nav sobrevivente num artboard, ícone renomeado pelo pack lucide exportando um "?", checkbox marcado só habilitando o glifo escuro — invisível, linha de tabela contradizendo a própria legenda)* | Divergência sistemática cujo lado ERRADO é o alvo se corrige NO DESIGN e re-exporta — nunca se "acerta" o código contra um alvo defeituoso. O código só segue depois que o design está certo |
| 38 | Bridge de automação com `filePath`/socket implícito edita/lê o DOCUMENTO ou APP ERRADO quando há mais de um `.pen`/servidor aberto *(medido no bk-products: dump falhou 8/8 silenciosamente; medido no codm: `~/.claude.json` apontava `--app visual_studio_code` em vez de `--app desktop`, ligando no socket errado até o founder corrigir em 2026-08-24)* | Todo script do MCP passa `filePath`/alvo EXPLÍCITO (parametrizado por env), e toda operação em lote termina com verificação de contagem (`ok=N fail=0`) lida de verdade, não presumida |
| 39 | Rail que só entra no `nx affected` sob um escopo raro (arquivo de RAIZ) fica VERMELHO e invisível por vários commits *(medido no bk-products: rail de env-pinning quebrou com um comentário JSONC legítimo num `project.json` e só apareceu commits depois)* | Rail com escopo estreito precisa de uma passagem periódica fora do `affected` (a bateria de pre-push/CI já roda tudo — o que falta é ALGUÉM ler o vermelho). E premissa de formato é premissa: se a ferramenta aceita JSONC, o rail que lê o mesmo arquivo aceita também |
| 40 | Element-screenshot do Playwright espera ESTABILIDADE visual; re-render contínuo dirigido por JS (retry de SSE/EventSource no harness, timers) nunca estabiliza — 17/35 timeouts na estreia; `animations:'disabled'` só cobre CSS | Captura de tela usa `page.screenshot({clip: boundingBox})` (não espera estabilidade); goto com `networkidle` ganha try/catch + settle fixo (mock loadingQuery eterno nunca fica idle) |
| 41 | Reimplementar o `toId` do Storybook sem o split de camelCase do `storyNameFromExport` gera ids inexistentes (`OnboardingBoasVindas`→`onboardingboasvindas`) — e exports de 1 palavra MASCARAM o bug (19/35 passavam) | `storyId()` divide fronteiras camelCase/dígito como o Storybook real, E todo id computado é VALIDADO contra o `index.json` do build — id ausente falha nomeando os near-miss, nunca screenshot de root vazio |
| 42 | `NoStoryMatchError` no browser real com smoke test VERDE (happy-dom/composeStories não passa pelo roteamento de id do Storybook) | O smoke prova que a story MONTA; só a validação contra o index.json prova que ela é ENDEREÇÁVEL — as duas verificações são complementares, nenhuma substitui a outra |

## Técnicas provadas (usar antes de inventar outra)

- **Band-scan do alvo**: medir posições Y/X das transições de cor no PNG alvo (linha a linha) para
  extrair ritmo vertical, insets e alturas de banda — foi o que colapsou o "ghosting" (conteúdo
  duplicado com offset no delta = paddings errados, não conteúdo errado) *(medido no
  bk-products)*. Variante: amostragem de alpha nos cantos para descobrir o tamanho real do
  artboard.
- **Foto-fixture recortada do alvo**: asset real que o design mostra e o app não tem (foto de
  produto) vira recorte do próprio PNG alvo embutido como data-URI no mock da story, com
  proveniência + receita de regeneração no docblock. Chrome vivo que o componente renderiza por
  cima (badges, handles) é apagado do recorte por flood-fill da cor amostrada. É o mesmo princípio
  de copiar o TEXTO do design — conteúdo reproduzido, nunca fabricado.
- **Medir o pixel, não discutir**: dúvida de tom/base/curva de gradiente se resolve amostrando o
  pixel do alvo *(medido no bk-products: provou que o fill de um input era só gradiente ~9% alpha,
  e que o `size` radial do Pencil é diâmetro — a curva de decaimento do alpha bateu após dividir
  por 2)*.
- **Override de threshold por item**: só após esgotar as alavancas legítimas, com `why` gravado
  verbatim no scoreboard (mecânica em `ITEM_THRESHOLD_OVERRIDES`, `fidelity.ts`) — é ratchet,
  entra raro e sai quando o resíduo sumir.
- **Sonda de geometria no DOM** — `bun probe <storyId>` aqui —, a mais nova e a que mais rendeu:
  servir o `storybook-static` com Playwright e MEDIR o retângulo real de cada nó
  (`getBoundingClientRect`) em vez de deduzir do CSS. Regra prática: quando o delta é OFFSET
  (mesmo conteúdo, deslocado), a resposta está na ALTURA de um ancestral — a sonda diz qual, o
  crop só diz que existe.
- **Bisseção por `git checkout` para atribuir regressão**: com vários workers no mesmo checkout,
  "quem piorou isto?" se responde revertendo UM conjunto de arquivos (backup em `/tmp`), medindo, e
  restaurando — não lendo diffs.
- **Varredura por literal como detector de duplicação**: `grep` do literal exato de um
  gradiente/sombra pelo repo acha em segundos toda cópia de uma configuração que devia morar no
  catálogo. Rodar ANTES de mudar a configuração — o número de ocorrências é a dimensão real do
  trabalho.
- **Vídeo de demo**: gravar o webm real da jornada via Playwright (opt-in por env, nunca default)
  para casos onde o delta estático não conta a história (drag, animação, sequência).

---

## O critério de RELEVÂNCIA (a régua serve ao que o olho vê)

Medir é barato, e é aí que mora a armadilha: toda métrica nova consegue produzir uma lista, e uma
lista tem cara de rigor. O caso que fixou a regra *(medido no bk-products, 2026-08-22)*:
investigando a sensibilidade da régua, ficou provado que as lanes de estrutura e cor só acusam
deslocamento a partir de ~16px. A correção "óbvia" — uma lane de deslocamento própria — foi
implementada, mediu, e acendeu **105 tiles de 3 a 8px em 18 telas**, derrubando o gate de 13 telas
verdes para 2.

O founder cortou na hora, e o argumento é o que fica: *4px numa tela de 1040 é 0,4% —
imperceptível, e uma lista que ninguém vai pagar é burocracia com aparência de rigor.* A cegueira
não era defeito; era calibração.

As três perguntas que toda métrica nova responde ANTES de entrar:

1. **O olho vê?** Se a diferença não é perceptível em escala real, medir é ruído. A régua serve à
   percepção, não à aritmética.
2. **Gera trabalho ou dirige trabalho?** Sinal que cria débito novo precisa de barra alta. Sinal
   que EXPLICA débito existente é quase de graça — e costuma ser a versão certa da mesma ideia.
3. **Alguém vai pagar?** Débito que ninguém vai fechar não é débito nomeado, é dívida fantasma — e
   polui o scoreboard onde mora o débito real.

O deslocamento sobreviveu na forma da pergunta 2: **anotação** nos tiles que já falham, em vez de
lane própria. Não cria tile, não mexe no gate, e separa duas investigações que antes exigiam um
crop cada — "conteúdo no lugar errado" (causa: altura de um ancestral, medível com `bun probe`) de
"conteúdo errado" (causa: propriedade do spec).

## Quando o alvo pede um dado que o contrato não tem (o débito que NÃO é CSS)

Depois que a fidelidade de estilo converge, o débito que sobra muda de natureza: o alvo mostra uma
informação que o wire não carrega. É a classe mais fácil de "fechar" errado — basta fabricar um
valor e o tile fica verde. As três respostas legítimas, em ordem de preferência:

1. **O dado JÁ existe em outro endpoint** → ligar os dois lados com um casamento DETERMINÍSTICO e
   explícito, nunca por posição implícita (assumir "a primeira linha" assume uma ordenação que a
   API não promete). Sem match, ninguém é destacado.
2. **O dado existe na PERSISTÊNCIA mas não no DTO** → expor no DTO é a correção certa. Fidelidade
   dirige o backend.
3. **O dado não existe em lugar nenhum, ou exigiria migração/coluna nova** → NÃO se decide sozinho
   numa wave de fidelidade: vira gap reportado com o caminho de correção nomeado, e o tile fica no
   débito com a causa registrada — decisão de produto, não de estilo.

E o caso vizinho, que NÃO é gap: **o mock do design pré-truncado**. Nós do `.pen` podem carregar
texto já cortado ("…-inox…") porque o designer digitou assim; o componente renderiza a string
real, que cabe inteira. Reproduzir o corte seria fabricar. Fica no débito com a classe anotada.

## Armadilhas de processo (commit/orquestração)

- Medição é SERIAL e do orquestrador: workers rodando `bun fidelity` em paralelo disputam o build
  do storybook e a pasta `current/` compartilhada — handoff proíbe explicitamente; evidência de
  worker vira crop estático em `/tmp` antes de qualquer análise.
- Worker acerta o spec e MESMO ASSIM piora a régua (efeito colateral em outro nó). Relatório de
  worker é hipótese com evidência, não veredito: a fatia só entra depois de medir, e reverter a
  parte que regrediu é parte normal do fechamento da wave — com o falseador anotado no código.
- Pre-commit recusado MANTÉM o index staged — o próximo commit engole os arquivos do anterior.
  Depois de recusa: `git reset` e re-staging fatia a fatia.
- Worker que usa `git mv` deixa renames semi-staged e o lint-staged conflita no stash-restore.
  Workers NUNCA tocam o git; o orquestrador desfaz com `git reset` antes de commitar.
- Lote grande de arquivos no eslint do lint-staged pode morrer por SIGKILL (memória) — commitar em
  fatias menores.

---

## Estado no codm

- **2026-08-24 — F0 concluída**: motor de score portado e inerte (calibrado — testes de
  calibração copiados do bk-products passam), allowlists nascem VAZIAS em
  `packages/app/react/scripts/fidelity-allowlists.ts`, decorator `parameters.fidelity` operacional
  em `.storybook/preview.tsx`, `bun fidelity`/`bun design:lint`/`bun probe` rodam ponta-a-ponta sem
  Pen aberto (scoreboard vazio, saem 0), target nx `app-react:storybook-build` declarado com
  inputs corretos. Nenhum target/spec existe ainda — greenfield de dívida medida.
- **F1 — extrair a verdade do `codm.pen`** (Pen aberto, 1 sessão): tokens/specs/targets via MCP.
  Alvo canônico é o **Pen.app desktop** (`--app desktop`, não `visual_studio_code` — armadilha 38
  em versão nova: o bridge liga no HOST errado, não só no arquivo errado). Todo script de bridge
  passa `filePath`/alvo EXPLÍCITO. Pré-condição já auditada (2026-08-24, Pen aberto): 39 artboards
  de tela prontos (mais telas que o bk, que tinha 22) em 43 variáveis semânticas, export PNG
  funcional; **mas só 1 componente `reusable` (Rail)** — a pista de componentes espera
  componentização do `codm.pen` via design-ops antes de existir (o inverso do bk, que já tinha 53
  specs de componente desde o início). F1 arranca pela pista de TELAS (G1/G4 + régua de screens).
- **F2** — carrier gerado (`tokens.generated.css`) substituindo o `tokens.css` hand-written atual,
  gates G1–G4 com dados do codm.
- **F3** — waves de correção (orquestrador + workers), conforme "Operação em waves" acima.

Detalhes completos da extração (estado do receptor, mapeamento portável vs. reescrito, riscos):
`.specs/2026-08-24-extracao-ui-fidelity.md`.

- **Wave A concluída (2026-08-24)**: 35/35 telas react medidas (0.854–0.990 global, todas ≥
  threshold; lane de região com ~4.400 tiles de dívida nomeada; 3 telas com `rawInteractive=1`).
  "Configuração inicial" identificada como design sem implementação (i18n órfão
  `onboarding.step*`); 3 telas do site público aguardam lane Astro; 3 fixes de instrumento na régua
  no caminho (armadilhas 40–42).
